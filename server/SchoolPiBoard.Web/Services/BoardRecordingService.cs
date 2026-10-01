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
    // SignalR отдаёт живым подключениям те же payload в camelCase — это
    // умеет сам протокол хаба. JsonSerializer.Serialize по умолчанию
    // пишет как в C# (PascalCase), и без этой настройки шаг записи не
    // совпадал бы по именам полей с тем, что читает фронтенд.
    private static readonly JsonSerializerOptions PayloadOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly SubscriptionService _subscriptions;

    public BoardRecordingService(AppDbContext db, SubscriptionService subscriptions)
    {
        _db = db;
        _subscriptions = subscriptions;
    }

    /// <summary>
    /// Заводит запись — если на доске нет уже одной и лимит тарифа не
    /// исчерпан.
    ///
    /// Запись создаётся на паузе: пока у ведущего идёт отсчёт «3, 2, 1»,
    /// время не идёт и ничего не пишется; снимает паузу сам клиент по
    /// концу отсчёта (<see cref="ResumeAsync"/>). <paramref name="seed"/> —
    /// стартовое состояние (вид ведущего, фон, уже нарисованное): оно
    /// кладётся одним разом в нулевую миллисекунду, а не шагами по одному
    /// с растущей отметкой — иначе при просмотре оно «дорисовывалось» в
    /// первые секунды, пока вид ещё не встал на место.
    /// </summary>
    public async Task<(RecordingOutcome Outcome, BoardRecording? Recording)> StartAsync(
        long boardId, long userId, string? title,
        IReadOnlyList<(string Name, object Payload)> seed, CancellationToken cancellationToken)
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
            Status = BoardRecording.StatusPaused,
            StartedAt = now,
            LastResumedAt = null,
            MaxDurationMs = maxDurationMs,
        };

        _db.BoardRecordings.Add(recording);

        foreach (var (name, payload) in seed)
        {
            _db.BoardRecordingSteps.Add(new BoardRecordingStep
            {
                Recording = recording,
                OffsetMs = 0,
                Name = name,
                Payload = JsonSerializer.Serialize(payload, PayloadOptions),
            });
        }

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
    /// События «в процессе» — штрих рисуется, но ещё не закреплён. На
    /// паузе они не пишутся: показывать, как рисовали на паузе, незачем,
    /// в запись попадает только результат.
    /// </summary>
    private static readonly HashSet<string> LiveSteps = new() { "ItemBegan", "ItemPoints", "ItemCancelled" };

    /// <summary>
    /// Дописывает шаг в незавершённую запись — молча, если её нет.
    ///
    /// Пауза — только вырезка времени, а не «не смотреть»: то, что сделали
    /// на паузе (нарисовали, сдвинули, стёрли, сменили фон или вид),
    /// попадает в запись в ту же отметку, на которой она встала, — при
    /// просмотре появляется разом в момент продолжения. Без этого после
    /// паузы запись расходилась бы с доской: нарисованное на паузе в ней
    /// просто отсутствовало бы.
    /// </summary>
    public async Task AppendStepAsync(long boardId, string name, object payload, CancellationToken cancellationToken)
    {
        var recording = await _db.BoardRecordings.FirstOrDefaultAsync(
            x => x.BoardId == boardId
                && (x.Status == BoardRecording.StatusRecording || x.Status == BoardRecording.StatusPaused),
            cancellationToken);

        if (recording is null) return;

        var paused = recording.Status == BoardRecording.StatusPaused;
        if (paused && LiveSteps.Contains(name)) return;

        // На паузе время стоит: DurationMs — ровно та отметка, где запись
        // встала (ElapsedSinceResume на паузе — ноль).
        var offsetMs = recording.DurationMs + ElapsedSinceResume(recording);

        // Потолок тарифа достигнут — записи не сохраняем, а запись
        // останавливаем: платить за лишние минуты не должен никто.
        if (!paused && offsetMs >= recording.MaxDurationMs)
        {
            await FinishAsync(recording, cancellationToken);
            return;
        }

        _db.BoardRecordingSteps.Add(new BoardRecordingStep
        {
            RecordingId = recording.Id,
            OffsetMs = offsetMs,
            Name = name,
            Payload = JsonSerializer.Serialize(payload, PayloadOptions),
        });

        await _db.SaveChangesAsync(cancellationToken);
    }

    public Task<List<BoardRecording>> ListAsync(long boardId, CancellationToken cancellationToken)
        => _db.BoardRecordings
            .Where(x => x.BoardId == boardId)
            .OrderByDescending(x => x.StartedAt)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// Готовые записи сразу по нескольким досками — для «Мои записи»:
    /// там смотрят по всем доскам сразу, а не по одной.
    /// </summary>
    public Task<List<BoardRecording>> ListStoppedAsync(IReadOnlyCollection<long> boardIds, CancellationToken cancellationToken)
        => _db.BoardRecordings
            .Where(x => boardIds.Contains(x.BoardId) && x.Status == BoardRecording.StatusStopped)
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

    /// <summary>Переименовывает запись — на любой стадии, идущую в том числе.</summary>
    public async Task<RecordingOutcome> RenameAsync(
        long boardId, long recordingId, string? title, CancellationToken cancellationToken)
    {
        var recording = await FindAsync(boardId, recordingId, cancellationToken);
        if (recording is null) return RecordingOutcome.NotFound;

        recording.Title = string.IsNullOrWhiteSpace(title) ? null : title.Trim();
        await _db.SaveChangesAsync(cancellationToken);
        return RecordingOutcome.Ok;
    }

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
