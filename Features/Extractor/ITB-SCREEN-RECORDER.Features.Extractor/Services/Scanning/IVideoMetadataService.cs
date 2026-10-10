// ==========================================
// File: Features/Extractor/Services/Scanning/IVideoMetadataService.cs
// ==========================================
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ITB_SCREEN_RECORDER.Features.Extractor.Models;

namespace ITB_SCREEN_RECORDER.Features.Extractor.Services
{
    public interface IVideoMetadataService
    {
        Task<StreamMetadataDto> GetStreamMetadataAsync(string hostname, long epochMs, string ffprobePath, CancellationToken ct = default);
        Task<double> GetAccurateVideoDurationSecondsAsync(string filePath, string ffprobePath, CancellationToken ct = default);
        Task AdjustChunksToAccuratePtsAsync<T>(IEnumerable<T> chunks, string ffprobePath, CancellationToken ct = default) where T : class;
    }
}