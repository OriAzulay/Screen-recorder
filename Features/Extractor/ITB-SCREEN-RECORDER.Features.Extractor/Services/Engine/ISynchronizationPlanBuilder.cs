// ==========================================
// File: Features/Extractor/Services/Engine/ISynchronizationPlanBuilder.cs
// ==========================================
using System;
using System.Collections.Generic;
using ITB_SCREEN_RECORDER.Features.Extractor.Models;

namespace ITB_SCREEN_RECORDER.Features.Extractor.Services
{
    public interface ISynchronizationPlanBuilder
    {
        SynchronizationPlan BuildSynchronizationPlan(
            List<string> stationIds,
            DateTime startUtc,
            DateTime endUtc,
            Dictionary<string, List<RecordingChunkMetadata>> stationChunks);
    }
}