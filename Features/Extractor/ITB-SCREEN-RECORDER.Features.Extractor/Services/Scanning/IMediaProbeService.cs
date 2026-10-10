// ==========================================
// File: Features/Extractor/Services/IMediaProbeService.cs
// ==========================================
using System;
using System.Threading;
using System.Threading.Tasks;
using ITB_SCREEN_RECORDER.Features.Extractor.Models;

namespace ITB_SCREEN_RECORDER.Features.Extractor.Services
{
    public interface IMediaProbeService
    {
        Task<ProbedStationMetadata> GetOrProbeStationMetadataAsync(
            string hostname,
            DateTime startUtc,
            DateTime endUtc,
            CancellationToken ct = default);

        Task<ProbedStationMetadata> ProbeMediaFileDirectlyAsync(
            string filePath,
            string stationId,
            CancellationToken ct = default);
    }
}