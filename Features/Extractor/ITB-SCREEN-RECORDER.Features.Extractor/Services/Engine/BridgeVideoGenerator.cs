// ==========================================
// File: Features/Extractor/Services/BridgeVideoGenerator.cs
// ==========================================
using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using ITB_SCREEN_RECORDER.Features.Extractor.Models;
using Microsoft.Extensions.Logging;

namespace ITB_SCREEN_RECORDER.Features.Extractor.Services
{
    public class BridgeVideoGenerator : IBridgeVideoGenerator
    {
        private readonly IFfmpegBinaryResolver _binaryResolver;
        private readonly INoSignalPatternService _patternService;
        private readonly ILogger<BridgeVideoGenerator> _logger;

        public BridgeVideoGenerator(
            IFfmpegBinaryResolver binaryResolver,
            INoSignalPatternService patternService,
            ILogger<BridgeVideoGenerator> logger)
        {
            _binaryResolver = binaryResolver;
            _patternService = patternService;
            _logger = logger;
        }

        public async Task<string> GenerateMatchedBridgeVideoAsync(
            double durationSeconds,
            ProbedStationMetadata probe,
            string tempDir,
            bool forceIncludeAudio,
            CancellationToken ct = default)
        {
            string bridgePath = Path.Combine(tempDir, $"bridge_{Guid.NewGuid():N}.mp4");
            string ffmpegPath = _binaryResolver.ResolveFfmpeg();
            string durStr = durationSeconds.ToString("0.000", CultureInfo.InvariantCulture);
            string fpsStr = Math.Clamp(probe.Fps, 10, 120).ToString("0.00", CultureInfo.InvariantCulture);
            int width = probe.Width > 0 ? probe.Width : 1920;
            int height = probe.Height > 0 ? probe.Height : 1080;

            string? tempNoSignalImg = null;

            try
            {
                // 1. שימוש בשקופית הגרפית במקום במסך שחור
                byte[] noSignalBytes = await _patternService.GetOrCreateNoSignalFrameAsync(ffmpegPath, ct);

                string videoInputArgs;
                string videoFilter;

                if (noSignalBytes != null && noSignalBytes.Length > 0)
                {
                    tempNoSignalImg = Path.Combine(tempDir, $"nosignal_{Guid.NewGuid():N}.jpg");
                    await File.WriteAllBytesAsync(tempNoSignalImg, noSignalBytes, ct);

                    videoInputArgs = $"-loop 1 -i \"{tempNoSignalImg.Replace('\\', '/')}\"";
                    videoFilter = $"-vf \"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,fps={fpsStr},format=yuv420p\"";
                }
                else
                {
                    videoInputArgs = $"-f lavfi -i color=c=black:s={width}x{height}:r={fpsStr}";
                    videoFilter = "-pix_fmt yuv420p";
                }

                // 2. הפקת וידאו עם שקט אודיו מסונכרן
                string args;
                if (forceIncludeAudio)
                {
                    int sampleRate = probe.AudioSampleRate > 0 ? probe.AudioSampleRate : 48000;
                    int channels = probe.AudioChannels > 0 ? probe.AudioChannels : 2;
                    string channelLayout = channels == 1 ? "mono" : "stereo";

                    args = $"-nostdin -loglevel error -y " +
                           $"{videoInputArgs} " +
                           $"-f lavfi -i anullsrc=r={sampleRate}:cl={channelLayout} " +
                           $"-t {durStr} " +
                           $"{videoFilter} " +
                           $"-c:v libx264 -preset ultrafast " +
                           $"-c:a aac -b:a 128k -ar {sampleRate} -ac {channels} " +
                           $"\"{bridgePath.Replace('\\', '/')}\"";
                }
                else
                {
                    args = $"-nostdin -loglevel error -y " +
                           $"{videoInputArgs} " +
                           $"-t {durStr} " +
                           $"{videoFilter} " +
                           $"-c:v libx264 -preset ultrafast " +
                           $"-an \"{bridgePath.Replace('\\', '/')}\"";
                }

                var psi = new ProcessStartInfo
                {
                    FileName = ffmpegPath,
                    Arguments = args,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using var proc = Process.Start(psi);
                if (proc != null)
                {
                    await proc.WaitForExitAsync(ct);
                }

                return bridgePath;
            }
            finally
            {
                if (tempNoSignalImg != null && File.Exists(tempNoSignalImg))
                {
                    try { File.Delete(tempNoSignalImg); } catch { }
                }
            }
        }
    }
}