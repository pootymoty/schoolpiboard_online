using SchoolPiBoard.Web.Data.Entities;

namespace SchoolPiBoard.Web.Services;

/// <summary>
/// Автопродление подписок.
///
/// Когда продлевать — решает доска: сроки знает она. Списывает сервер
/// ключей: карта и пароли Робокассы живут только там. Об успехе доска
/// узнаёт обычным сообщением об оплате, как после ручной покупки, —
/// отдельного пути «продлить сразу» нет намеренно, иначе продление
/// засчитывалось бы до того, как деньги действительно пришли.
///
/// Заход раз в час, а не раз в сутки: сутки означали бы, что подписка,
/// кончающаяся вскоре после прохода, оборвётся на несколько часов.
/// </summary>
public sealed class AutoRenewService : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    /// <summary>За сколько до конца просим списать.</summary>
    private static readonly TimeSpan Ahead = TimeSpan.FromDays(1);

    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<AutoRenewService> _logger;

    public AutoRenewService(IServiceScopeFactory scopes, ILogger<AutoRenewService> logger)
    {
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);

        do
        {
            try
            {
                await RunOnceAsync(stoppingToken);
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                // Одна неудача не должна останавливать продления навсегда:
                // следующий заход через час.
                _logger.LogError(error, "Автопродление не выполнено.");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task RunOnceAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopes.CreateScope();

        var subscriptions = scope.ServiceProvider.GetRequiredService<SubscriptionService>();
        var keys = scope.ServiceProvider.GetRequiredService<KeyServerClient>();

        foreach (var due in await subscriptions.DueForRenewalAsync(Ahead, cancellationToken))
        {
            var plan = due.Plan;
            if (plan is null || due.InvoiceId is null) continue;

            // Продлеваем на тот же срок, что и покупали. Сколько дней это
            // было, видно по самой подписке — отдельного поля не нужно.
            var days = (int)Math.Round((due.EndsAt - due.StartsAt).TotalDays);
            var price = plan.PriceFor(days);

            if (price is null or <= 0)
            {
                _logger.LogWarning(
                    "Подписка {Id}: срок {Days} дн. больше не продаётся, автопродление пропущено.",
                    due.Id, days);
                continue;
            }

            var charged = await keys.ChargeRecurringAsync(
                due.UserId, plan.Code, plan.Name, days, price.Value, due.InvoiceId, cancellationToken);

            if (charged is null)
            {
                // Списание не прошло — человек просто опустится на бесплатный
                // тариф, ничего не потеряв. Письмо об этом — отдельная задача.
                _logger.LogWarning("Автопродление подписки {Id} не прошло.", due.Id);
                continue;
            }

            // Больше по этой подписке не списываем: продление придёт новой
            // строкой, и автопродление переедет на неё вместе с оплатой.
            await subscriptions.SetAutoRenewAsync(due.UserId, false, cancellationToken);

            _logger.LogInformation(
                "Автопродление подписки {Id}: выставлен счёт {Invoice}.", due.Id, charged.InvoiceId);
        }
    }
}
