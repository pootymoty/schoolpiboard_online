using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using SchoolPiBoard.Web.Hubs;

namespace SchoolPiBoard.Web.Services;

/// <summary>Позиция одного курсора в кадре.</summary>
public sealed record CursorPosition(string Id, string Name, double X, double Y);

/// <summary>
/// Курсоры участников, сведённые в кадры.
///
/// При двадцати участниках курсоры дают около четырёхсот входящих
/// сообщений в секунду, а рассылка каждого каждому — около семи с
/// половиной тысяч исходящих: больше, чем даёт само рисование.
///
/// Поэтому позиции копятся здесь и уходят одним кадром десять раз в
/// секунду — двести сообщений вместо семи с половиной тысяч. Троттлинг
/// на клиенте этого не заменяет: он уменьшает входящий поток, но не
/// исходящий (раздел 7.1).
/// </summary>
public sealed class CursorRelay : BackgroundService
{
    /// <summary>Десять кадров в секунду — предел из раздела 7.1.</summary>
    private static readonly TimeSpan FrameInterval = TimeSpan.FromMilliseconds(100);

    private readonly ConcurrentDictionary<long, ConcurrentDictionary<string, CursorPosition>> _pending = new();
    private readonly IHubContext<BoardHub> _hub;
    private readonly ILogger<CursorRelay> _logger;

    public CursorRelay(IHubContext<BoardHub> hub, ILogger<CursorRelay> logger)
    {
        _hub = hub;
        _logger = logger;
    }

    /// <summary>Запомнить позицию. Отправится со следующим кадром.</summary>
    public void Report(long boardId, string connectionId, string name, double x, double y)
    {
        _pending.GetOrAdd(boardId, _ => new ConcurrentDictionary<string, CursorPosition>())
            [connectionId] = new CursorPosition(connectionId, name, x, y);
    }

    /// <summary>Убрать курсор ушедшего, чтобы он не завис в последнем кадре.</summary>
    public void Forget(long boardId, string connectionId)
    {
        if (_pending.TryGetValue(boardId, out var cursors))
            cursors.TryRemove(connectionId, out _);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(FrameInterval);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            foreach (var (boardId, cursors) in _pending)
            {
                if (cursors.IsEmpty)
                {
                    _pending.TryRemove(boardId, out _);
                    continue;
                }

                // Снимок и очистка: кадр отправляем один раз, а не повторяем
                // последнюю позицию, пока указатель стоит на месте.
                var frame = cursors.Values.ToArray();
                cursors.Clear();

                try
                {
                    await _hub.Clients.Group(BoardHub.GroupOf(boardId))
                        .SendAsync("Cursors", frame, stoppingToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    // Кадр курсоров — не та потеря, ради которой стоит ронять
                    // рассылку: следующий уйдёт через сотую долю секунды.
                    _logger.LogDebug(ex, "Кадр курсоров доски {BoardId} не ушёл.", boardId);
                }
            }
        }
    }
}
