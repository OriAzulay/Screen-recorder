// ==========================================
// File: Features/Extractor/Services/IBridgeVideoGenerator.cs
// ==========================================
using System.Threading;
using System.Threading.Tasks;
using ITB_SCREEN_RECORDER.Features.Extractor.Models;

namespace ITB_SCREEN_RECORDER.Features.Extractor.Services
{
    public interface IBridgeVideoGenerator
    {
        Task<string> GenerateMatchedBridgeVideoAsync(
            double durationSeconds,
            ProbedStationMetadata probe,
            string tempDir,
            bool forceIncludeAudio,
            CancellationToken ct = default);
    }
}