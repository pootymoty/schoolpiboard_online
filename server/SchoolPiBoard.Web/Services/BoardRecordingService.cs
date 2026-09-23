using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;

namespace SchoolPiBoard.Web.Services;

public enum RecordingOutcome
{
    Ok,
    AlreadyActive,
    TooMany,
    NotFound,
    StillActive,
}

/// <summary>
/// Запись занятия — последовательность действий на доске со своим
/// таймингом, а не видео. Управляет только владелец (проверяется в
/// <see cref="Hubs.BoardHub"/>); события, которые доска уже рассылает,
/// сюда только дописываются с меткой времени, пока запись идёт.
///
/// Пауза не оставляет разрыва в кадре при воспроизведении: смещение
/// нового шага считается от накопленного времени плюс то, что прошло с
/// последнего возобновления, — сама пауза в тайминг просто не попадает,
/// без вставки снимка состояния, который заново рисовал бы штрихи на
/// том же месте.
/// </summary>
public sealed class BoardRecordingService
{
    private readonly AppDbContext _db;
    private readonly SubscriptionService _subscriptions;

    public BoardRecordingService(AppDbContext db, SubscriptionService subscriptions)
    {
        _db = db;
        _subscriptions = subscriptions;
    }

    /// <summary>Начинает запись — если на доске уже нет одной и лимит тарифа не исчерпан.</summary>
    public async Task<(RecordingOutcome Outcome, BoardRecording? Recording)> StartAsync(
        long boardId, long userId, string? title, CancellationToken cancellationToken)
    {
        if (await ActiveAsync(boardId, cancellationToken) is not null)
            return (RecordingOutcome.AlreadyActive, null);

        var ownerId = await _db.Boards
            .Where(x => x.Id == boardId)
            .Select(x => (long?)x.OwnerId)
            .FirstOrDefaultAsync(cancellationToken);

        var plan = ownerId is null ? null : (await _subscriptions.AccessAsync(ownerId.Value, cancellationToken)).Plan;

        var limit = plan?.MaxRecordingsPerBoard ?? 1;
        var maxDurationMs = (plan?.MaxRecordingMinutes ?? 30) * 60_000L;

        var count = await _db.BoardRecordings.CountAsync(x => x.BoardId == boardId, cancellationToken);
        if (count >= limit) return (RecordingOutcome.TooMany, null);

        var now = DateTime.UtcNow;

        var recording = new BoardRecording
        {
            BoardId = boardId,
            StartedByUserId = userId,
            Title = string.IsNullOrWhiteSpace(title) ? null : title.Trim(),
            Status = BoardRecording.StatusRecording,
            StartedAt = now,
            LastResumedAt = now,
            MaxDurationMs = maxDurationMs,
        };

        _db.BoardRecordings.Add(recording);
        await _db.SaveChangesAsync(cancellationToken);

        return (RecordingOutcome.Ok, recording);
    }

    public async Task<RecordingOutcome> PauseAsync(long boardId, CancellationToken cancellationToken)
    {
        var recording = await ActiveAsync(boardId, cancellationToken);
        if (recording is null || recording.Status != BoardRecording.StatusRecording)
            return RecordingOutcome.NotFound;

        recording.DurationMs += ElapsedSinceResume(recording);
        recording.Status = BoardRecording.StatusPaused;
        recording.LastResumedAt = null;

        await _db.SaveChangesAsync(cancellationToken);
        return RecordingOutcome.Ok;
    }

    public async Task<RecordingOutcome> ResumeAsync(long boardId, CancellationToken cancellationToken)
    {
        var recording = await ActiveAsync(boardId, cancellationToken);
        if (recording is null || recording.Status != BoardRecording.StatusPaused)
            return RecordingOutcome.NotFound;

        recording.Status = BoardRecording.StatusRecording;
        recording.LastResumedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(cancellationToken);
        return RecordingOutcome.Ok;
    }

    public async Task<RecordingOutcome> StopAsync(long boardId, CancellationToken cancellationToken)
    {
        var recording = await ActiveAsync(boardId, cancellationToken);
        if (recording is null) return RecordingOutcome.NotFound;

        await FinishAsync(recording, cancellationToken);
        return RecordingOutcome.Ok;
    }

    /// <summary>
    /// Дописывает шаг в идущую запись — молча, если её нет или она на
    /// паузе: не у всякого события есть что записывать.
    /// </summary>
    public async Task AppendStepAsync(long boardId, string name, object payload, CancellationToken cancellationToken)
    {
        var recording = await _db.BoardRecordings.FirstOrDefaultAsync(
            x => x.BoardId == boardId && x.Status == BoardRecording.StatusRecording, cancellationToken);

        if (recording is null) return;

        var offsetMs = recording.DurationMs + ElapsedSinceResume(recording);

        // Потолок тарифа достигнут — записи не сохраняем, а запись
        // останавливаем: платить за лишние минуты не должен никто.
        if (offsetMs >= recording.MaxDurationMs)
        {
            await FinishAsync(recording, cancellationToken);
            return;
        }

        _db.BoardRecordingSteps.Add(new BoardRecordingStep
        {
            RecordingId = recording.Id,
            OffsetMs = offsetMs,
            Name = name,
            Payload = JsonSerializer.Serialize(payload),
        });

        await _db.SaveChangesAsync(cancellationToken);
    }

    public Task<List<BoardRecording>> ListAsync(long boardId, CancellationToken cancellationToken)
        => _db.BoardRecordings
            .Where(x => x.BoardId == boardId)
            .OrderByDescending(x => x.StartedAt)
            .ToListAsync(cancellationToken);

    public Task<BoardRecording?> FindAsync(long boardId, long recordingId, CancellationToken cancellationToken)
        => _db.BoardRecordings
            .FirstOrDefaultAsync(x => x.Id == recordingId && x.BoardId == boardId, cancellationToken);

    public Task<List<BoardRecordingStep>> StepsAsync(long recordingId, CancellationToken cancellationToken)
        => _db.BoardRecordingSteps
            .Where(x => x.RecordingId == recordingId)
            .OrderBy(x => x.Id)
            .ToListAsync(cancellationToken);

    /// <summary>Удаляет запись — только уже остановленную: идущую нужно сперва прекратить.</summary>
    public async Task<RecordingOutcome> DeleteAsync(long boardId, long recordingId, CancellationToken cancellationToken)
    {
        var recording = await FindAsync(boardId, recordingId, cancellationToken);
        if (recording is null) return RecordingOutcome.NotFound;

        if (recording.Status != BoardRecording.StatusStopped) return RecordingOutcome.StillActive;

        _db.BoardRecordings.Remove(recording);
        await _db.SaveChangesAsync(cancellationToken);
        return RecordingOutcome.Ok;
    }

    /// <summary>Текущая незавершённая запись доски — идущая или на паузе. Их не бывает две сразу.</summary>
    public Task<BoardRecording?> ActiveAsync(long boardId, CancellationToken cancellationToken)
        => _db.BoardRecordings.FirstOrDefaultAsync(
            x => x.BoardId == boardId
                && (x.Status == BoardRecording.StatusRecording || x.Status == BoardRecording.StatusPaused),
            cancellationToken);

    private async Task FinishAsync(BoardRecording recording, CancellationToken cancellationToken)
    {
        if (recording.Status == BoardRecording.StatusRecording)
            recording.DurationMs += ElapsedSinceResume(recording);

        recording.Status = BoardRecording.StatusStopped;
        recording.EndedAt = DateTime.UtcNow;
        recording.LastResumedAt = null;

        await _db.SaveChangesAsync(cancellationToken);
    }

    private static long ElapsedSinceResume(BoardRecording recording)
        => recording.LastResumedAt is null
            ? 0
            : Math.Max(0, (long)(DateTime.UtcNow - recording.LastResumedAt.Value).TotalMilliseconds);
}
