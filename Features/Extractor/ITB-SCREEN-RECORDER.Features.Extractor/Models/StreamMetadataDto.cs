// ==========================================
// File: Features/Extractor/Models/StreamMetadataDto.cs
// ==========================================
namespace ITB_SCREEN_RECORDER.Features.Extractor.Models
{
    public class StreamMetadataDto
    {
        public double Fps { get; set; } = 30.0;
        public double FrameDurationMs { get; set; } = 33.333;
        public int Width { get; set; } = 1920;
        public int Height { get; set; } = 1080;
    }
}