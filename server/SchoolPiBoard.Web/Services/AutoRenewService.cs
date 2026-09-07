using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Configuration;
using SchoolPiBoard.Web.Data;
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

    /// <summary>
    /// За сколько до конца предупреждаем письмом.
    ///
    /// Трое суток — чтобы письмо успели прочесть и, если передумали,
    /// выключить продление до списания. Сутки, как у самого списания,
    /// такой возможности почти не дают.
    /// </summary>
    private static readonly TimeSpan NoticeAhead = TimeSpan.FromDays(3);

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

        await NoticeAsync(scope.ServiceProvider, subscriptions, cancellationToken);

        foreach (var due in await subscriptions.DueForRenewalAsync(Ahead, cancellationToken))
        {
            var plan = due.Plan;
            if (plan is null || due.InvoiceId is null) continue;

            // Человек уже оплатил вперёд — например, купил другой тариф,
            // который встанет следующим. Списывать за продление сверх этого
            // нельзя: он заплатил бы дважды за одно и то же время, а
            // продлённый срок встал бы ещё и после купленного.
            var queued = await subscriptions.UpcomingAsync(due.UserId, cancellationToken);
            if (queued.Count > 0)
            {
                _logger.LogInformation(
                    "Подписка {Id}: дальше уже оплачен другой срок, автопродление пропущено.", due.Id);
                continue;
            }

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

            // Продление — такая же покупка, и в истории ей место наравне с
            // ручными: иначе человек видит списание в банке и ничего у нас.
            await subscriptions.RememberOrderAsync(
                due.UserId, charged.InvoiceId, plan, days, price.Value,
                autoRenew: true, startNow: false, cancellationToken);

            // Больше по этой подписке не списываем: продление придёт новой
            // строкой, и автопродление переедет на неё вместе с оплатой.
            await subscriptions.SetAutoRenewAsync(due.UserId, false, cancellationToken);

            _logger.LogInformation(
                "Автопродление подписки {Id}: выставлен счёт {Invoice}.", due.Id, charged.InvoiceId);
        }
    }

    /// <summary>
    /// Предупреждает о предстоящем списании.
    ///
    /// Отдельным проходом и заранее: списание без предупреждения — то,
    /// из-за чего пишут в банк «я этого не заказывал», даже когда
    /// заказывали. Отметка о письме хранится у подписки, иначе почасовой
    /// проход слал бы одно и то же письмо семьдесят два раза.
    /// </summary>
    private async Task NoticeAsync(
        IServiceProvider services, SubscriptionService subscriptions, CancellationToken cancellationToken)
    {
        var db = services.GetRequiredService<AppDbContext>();
        var email = services.GetRequiredService<IEmailSender>();
        var options = services.GetRequiredService<AppOptions>();

        foreach (var due in await subscriptions.DueForNoticeAsync(NoticeAhead, cancellationToken))
        {
            var plan = due.Plan;
            if (plan is null) continue;

            var days = (int)Math.Round((due.EndsAt - due.StartsAt).TotalDays);
            var price = plan.PriceFor(days);
            if (price is null or <= 0) continue;

            var address = await db.Users
                .Where(x => x.Id == due.UserId)
                .Select(x => x.Email)
                .FirstOrDefaultAsync(cancellationToken);

            if (string.IsNullOrWhiteSpace(address)) continue;

            var letter = EmailTemplates.RenewalSoon(
                plan.Name, days, price.Value, due.EndsAt - Ahead, options.PublicUrl + "/plan");

            // Отметку ставим и когда письмо не ушло: почта могла отказать
            // насовсем, а бесконечные попытки раз в час — это рассылка.
            await email.SendAsync(address, letter.Subject, letter.Html, letter.Text, cancellationToken);
            await subscriptions.MarkNoticedAsync(due.Id, cancellationToken);
        }
    }
}
