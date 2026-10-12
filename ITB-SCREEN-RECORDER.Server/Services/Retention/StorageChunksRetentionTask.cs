// ==========================================
// File: Server/Services/Retention/StorageChunksRetentionTask.cs
// ==========================================
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using ITB_SCREEN_RECORDER.Core.Plugins;
using ITB_SCREEN_RECORDER.Server.Data.Repositories;
using Microsoft.Extensions.Logging;

namespace ITB_SCREEN_RECORDER.Server.Services.Retention
{
    public class StorageChunksRetentionTask : IRetentionTask
    {
        private readonly ICatalogRepository _repository;
        private readonly IEnumerable<IRetentionShieldProvider> _shieldProviders;
        private readonly ILogger<StorageChunksRetentionTask> _logger;

        public string TaskName => "Storage Video Chunks & Index";

        public StorageChunksRetentionTask(
            ICatalogRepository repository,
            IEnumerable<IRetentionShieldProvider> shieldProviders,
            ILogger<StorageChunksRetentionTask> logger)
        {
            _repository = repository;
            _shieldProviders = shieldProviders;
            _logger = logger;
        }

        public async Task<int> ExecuteRetentionAsync(long cutoffEpochMs, CancellationToken ct)
        {
            var candidates = await _repository.GetExpiredCandidateChunksAsync(cutoffEpochMs, batchLimit: 200);
            if (candidates.Count == 0) return 0;

            var filesToDelete = new List<string>();

            foreach (var chunk in candidates)
            {
                if (ct.IsCancellationRequested) break;

                bool isShielded = false;
                foreach (var provider in _shieldProviders)
                {
                    if (await provider.IsRangeShieldedAsync(chunk.StationId, chunk.StartEpochMs, chunk.EndEpochMs))
                    {
                        isShielded = true;
                        break;
                    }
                }

                if (!isShielded)
                {
                    try
                    {
                        if (File.Exists(chunk.FilePath))
                        {
                            File.Delete(chunk.FilePath);
                        }
                        filesToDelete.Add(chunk.FilePath);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "[RETENTION] Could not delete physical chunk '{Path}'. Will retry next cycle.", chunk.FilePath);
                    }
                }
            }

            if (filesToDelete.Count > 0)
            {
                await _repository.RemoveChunksAsync(filesToDelete);
                _logger.LogInformation("[RETENTION] Purged {Count} physical chunk files and catalog entries.", filesToDelete.Count);
            }

            return filesToDelete.Count;
        }
    }
}