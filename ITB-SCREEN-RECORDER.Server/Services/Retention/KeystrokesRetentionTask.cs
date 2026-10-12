// ==========================================
// File: Server/Services/Retention/KeystrokesRetentionTask.cs
// ==========================================
using System.Threading;
using System.Threading.Tasks;
using ITB_SCREEN_RECORDER.Server.Data.Repositories;
using Microsoft.Extensions.Logging;

namespace ITB_SCREEN_RECORDER.Server.Services.Retention
{
    public class KeystrokesRetentionTask : IRetentionTask
    {
        private readonly ICatalogRepository _repository;
        private readonly ILogger<KeystrokesRetentionTask> _logger;

        public string TaskName => "Database Keystroke Events";

        public KeystrokesRetentionTask(ICatalogRepository repository, ILogger<KeystrokesRetentionTask> logger)
        {
            _repository = repository;
            _logger = logger;
        }

        public async Task<int> ExecuteRetentionAsync(long cutoffEpochMs, CancellationToken ct)
        {
            int deletedCount = await _repository.PurgeExpiredKeystrokesAsync(cutoffEpochMs);
            if (deletedCount > 0)
            {
                _logger.LogInformation("[RETENTION] Purged {Count} expired keystroke telemetry records from catalog.", deletedCount);
            }
            return deletedCount;
        }
    }
}