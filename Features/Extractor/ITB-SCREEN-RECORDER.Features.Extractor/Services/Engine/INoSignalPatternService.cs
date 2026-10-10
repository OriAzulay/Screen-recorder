// ==========================================
// File: Features/Extractor/Services/Engine/INoSignalPatternService.cs
// ==========================================
using System.Threading;
using System.Threading.Tasks;

namespace ITB_SCREEN_RECORDER.Features.Extractor.Services
{
    public interface INoSignalPatternService
    {
        Task<byte[]> GetOrCreateNoSignalFrameAsync(string ffmpegPath, CancellationToken ct = default);
        Task<byte[]> GetOrCreateBlackTileAsync(string ffmpegPath, int width, int height, int frameCount, CancellationToken ct = default);
    }
}