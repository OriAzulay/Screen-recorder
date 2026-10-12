// ==========================================
// File: Server/Services/Retention/IRetentionTask.cs
// ==========================================
using System.Threading;
using System.Threading.Tasks;

namespace ITB_SCREEN_RECORDER.Server.Services.Retention
{
    public interface IRetentionTask
    {
        string TaskName { get; }
        Task<int> ExecuteRetentionAsync(long cutoffEpochMs, CancellationToken ct);
    }
}