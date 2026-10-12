// ==========================================
// File: Features/Extractor/Services/Jobs/IDummyVideoGenerator.cs
// ==========================================
using System.Threading;
using System.Threading.Tasks;

namespace ITB_SCREEN_RECORDER.Features.Extractor.Services
{
    public interface IDummyVideoGenerator
    {
        // 💡 חתימה חדשה שתומכת בהעברת קובץ דגימה ישירות מ-StorageScannerService
        Task<string> GetOrGenerateDummyVideoAsync(string sampleFilePath, double durationSeconds = 3600, CancellationToken ct = default);

        Task<string> GetOrCreateDummyVideoAsync(double durationSeconds, int width, int height, double fps, bool hasAudio = true, CancellationToken ct = default);
        Task<string> GetOrGenerateDummyVideoAsync(double durationSeconds, int width, int height, double fps, bool hasAudio = true, CancellationToken ct = default);
        Task<string> GetOrCreateDummyVideoAsync(double durationSeconds, CancellationToken ct = default);
        Task GenerateDummyVideoAsync(string outputPath, string width, string height, string fps);
    }
}