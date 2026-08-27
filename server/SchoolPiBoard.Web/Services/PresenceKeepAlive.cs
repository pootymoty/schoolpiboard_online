namespace SchoolPiBoard.Web.Services;

/// <summary>
/// Продлевает допуск гостям, пока они держат подключение к доске.
///
/// Допуск гостя живёт пять минут и продлевается при обращении к серверу.
/// Пока доска общается через хаб, обращений может не быть вовсе: человек
/// смотрит, как объясняют, и ничего не нажимает. Без этой службы его
/// выкинуло бы посреди занятия — за то, что он слушал молча.
/// </summary>
public sealed class PresenceKeepAlive : BackgroundService
{
    /// <summary>Заметно чаще, чем истекает допуск, — с запасом на паузы.</summary>
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(1);

    private readonly BoardPresence _presence;
    private readonly WaitingRoom _waiting;
    private readonly ILogger<PresenceKeepAlive> _logger;

    public PresenceKeepAlive(BoardPresence presence, WaitingRoom waiting, ILogger<PresenceKeepAlive> logger)
    {
        _presence = presence;
        _waiting = waiting;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                foreach (var presence in _presence.All().Where(p => p.IsGuest && p.GuestId is not null))
                    await _waiting.AdmittedRoleAsync(presence.BoardId, presence.GuestId!);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Redis моргнул — следующая попытка через минуту, а допуск
                // рассчитан на то, что одну попытку можно пропустить.
                _logger.LogWarning(ex, "Не удалось продлить допуски подключённых гостей.");
            }
        }
    }
}
