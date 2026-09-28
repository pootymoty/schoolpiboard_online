using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;
using SchoolPiBoard.Web.Hubs;

namespace SchoolPiBoard.Web.Services;

/// <summary>
/// Запись без ведущего.
///
/// Ушёл со страницы доски внутри сайта — запись останавливает сам клиент.
/// Но вкладку можно просто закрыть, и тогда сказать серверу «стоп» уже
/// некому. Эта служба раз в полминуты смотрит на незавершённые записи:
/// если того, кто начал запись, на доске нет, запись встаёт на паузу, а
/// если он не вернулся и через <see cref="Grace"/> — останавливается и
/// сохраняется.
///
/// Сразу не останавливаем намеренно: перезагрузка страницы — тоже уход
/// с доски на пару секунд, и после неё запись должна ждать на паузе, а
/// не оказаться законченной.
/// </summary>
public sealed class RecordingWatchdog : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(30);

    /// <summary>Сколько ждать ведущего, прежде чем закончить запись за него.</summary>
    private static readonly TimeSpan Grace = TimeSpan.FromMinutes(3);

    private readonly IServiceScopeFactory _scopes;
    private readonly BoardPresence _presence;
    private readonly IHubContext<BoardHub> _hub;
    private readonly ILogger<RecordingWatchdog> _logger;

    /// <summary>С какого момента ведущего нет — по номеру записи.</summary>
    private readonly ConcurrentDictionary<long, DateTime> _absentSince = new();

    public RecordingWatchdog(
        IServiceScopeFactory scopes,
        BoardPresence presence,
        IHubContext<BoardHub> hub,
        ILogger<RecordingWatchdog> logger)
    {
        _scopes = scopes;
        _presence = presence;
        _hub = hub;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            await RunOnceAsync(stoppingToken);
        }
    }

    private async Task RunOnceAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = _scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var recordings = scope.ServiceProvider.GetRequiredService<BoardRecordingService>();

            var active = await db.BoardRecordings
                .Where(x => x.Status == BoardRecording.StatusRecording || x.Status == BoardRecording.StatusPaused)
                .Select(x => new { x.Id, x.BoardId, x.StartedByUserId, x.Status })
                .ToListAsync(cancellationToken);

            // Закончившиеся записи больше не отслеживаем.
            var ids = active.Select(x => x.Id).ToHashSet();
            foreach (var id in _absentSince.Keys)
            {
                if (!ids.Contains(id)) _absentSince.TryRemove(id, out _);
            }

            var now = DateTime.UtcNow;

            foreach (var recording in active)
            {
                var present = _presence.ConnectionsOf(recording.BoardId, recording.StartedByUserId, null).Count > 0;

                if (present)
                {
                    _absentSince.TryRemove(recording.Id, out _);
                    continue;
                }

                var since = _absentSince.GetOrAdd(recording.Id, now);

                if (now - since >= Grace)
                {
                    if (await recordings.StopAsync(recording.BoardId, cancellationToken) == RecordingOutcome.Ok)
                    {
                        await _hub.Clients.Group(BoardHub.GroupOf(recording.BoardId))
                            .SendAsync("RecordingStopped", cancellationToken);
                    }

                    _absentSince.TryRemove(recording.Id, out _);
                    continue;
                }

                // Ведущего нет — запись не идёт вхолостую: паузу он снимет
                // сам, когда вернётся, а пустые минуты в неё не попадут.
                if (recording.Status == BoardRecording.StatusRecording
                    && await recordings.PauseAsync(recording.BoardId, cancellationToken) == RecordingOutcome.Ok)
                {
                    await _hub.Clients.Group(BoardHub.GroupOf(recording.BoardId))
                        .SendAsync("RecordingPaused", cancellationToken);
                }
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Одна неудачная проверка не должна останавливать службу —
            // следующая через полминуты.
            _logger.LogWarning(ex, "Проверка записей без ведущего не удалась.");
        }
    }
}
