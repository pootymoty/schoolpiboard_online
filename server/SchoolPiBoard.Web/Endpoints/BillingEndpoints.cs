using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;
using SchoolPiBoard.Web.Services;

namespace SchoolPiBoard.Web.Endpoints;

/// <summary>Тариф в том виде, в каком его показывают на странице цен.</summary>
public sealed record PlanDto(
    string Code,
    string Name,
    int Sort,
    int Price30,
    int Price90,
    int Price180,
    int Price365,
    int MaxBoards,
    long MaxStorageBytes,
    int MaxParticipants,
    bool HasLibrary);

/// <summary>Заказ на оплату: какой тариф, на какой срок и когда начать.</summary>
/// <summary>
/// Заказ подписки. <c>Consent</c> — текст, под которым человек согласился
/// на автосписания: он приходит от браузера и ложится в журнал согласий,
/// чтобы в споре было видно не «галочка стояла», а что именно было
/// написано рядом с ней в тот день.
/// </summary>
public sealed record CheckoutRequest(
    string? PlanCode, int Days, bool AutoRenew, bool StartNow, string? Consent);

/// <summary>Оплаченный срок, который ещё не начался.</summary>
public sealed record UpcomingDto(string PlanCode, string PlanName, DateTime StartsAt, DateTime EndsAt);

/// <summary>Строка истории покупок.</summary>
public sealed record OrderDto(
    string InvoiceId,
    string PlanName,
    int Days,
    int Amount,
    bool AutoRenew,
    string Status,
    DateTime CreatedAt,
    DateTime? PaidAt);

/// <summary>Переключатель автопродления.</summary>
public sealed record AutoRenewRequest(bool Value, string? Consent);

/// <summary>Сообщение сервера ключей об оплате.</summary>
public sealed record PaidCallback(
    string? InvoiceId,
    long UserId,
    string? PlanCode,
    int Days,
    decimal Amount,
    bool AutoRenew,
    DateTime? PaidAt);

/// <summary>Что у человека сейчас: тариф, срок и на сколько израсходованы пределы.</summary>
public sealed record MyPlanDto(
    PlanDto Plan,
    string Kind,
    DateTime? Until,
    bool AutoRenew,
    bool CanAutoRenew,
    int Boards,
    long StorageUsed,
    IReadOnlyList<UpcomingDto> Upcoming,
    bool CanStartUpcomingNow);

/// <summary>
/// Тарифы и подписка.
///
/// Бесплатный уровень отдаётся тем же списком, что и платные: человек
/// должен видеть, что у него есть сейчас, рядом с тем, что он получит за
/// деньги. Оплата приедет отдельно — она идёт через сервер ключей, и
/// доска платёжных данных не касается.
/// </summary>
public static class BillingEndpoints
{
    public static void MapBillingEndpoints(this WebApplication app)
    {
        // Список тарифов открыт всем: страницу цен смотрят до регистрации.
        app.MapGet("/api/plans", async (SubscriptionService subscriptions, CancellationToken ct) =>
        {
            var plans = await subscriptions.ListAsync(ct);
            return Results.Ok(plans.Select(ToDto));
        });

        app.MapGet("/api/billing/me", async (
            ClaimsPrincipal principal, AppDbContext db,
            SubscriptionService subscriptions, LibraryService library, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var access = await subscriptions.AccessAsync(user.Id, ct);
            var upcoming = await subscriptions.UpcomingAsync(user.Id, ct);

            // Включить автопродление можно только по счёту, помеченному
            // таким при оплате: Робокасса задним числом это не разрешает.
            // Показывать переключатель, который заведомо не сработает, —
            // хуже, чем честно объяснить, что его нет.
            // Спрашиваем про последний оплаченный срок, а не про
            // действующий: продлевается всё оплаченное разом, и галочка
            // должна показывать состояние того срока, по которому пойдёт
            // списание.
            var last = await subscriptions.LastPaidAsync(user.Id, ct);

            var order = last?.InvoiceId is null
                ? null
                : await subscriptions.FindOrderAsync(last.InvoiceId, ct);

            // Перейти на отложенный тариф досрочно — только вверх по уровню.
            var next = upcoming.FirstOrDefault();
            var canStartNow = next?.Plan is not null
                && access.Subscription is not null
                && next.Plan.Sort > access.Plan.Sort;

            return Results.Ok(new MyPlanDto(
                ToDto(access.Plan),
                access.Subscription?.Kind ?? "free",
                access.Until,
                last?.AutoRenew ?? false,
                order?.AutoRenew ?? false,
                await subscriptions.BoardCountAsync(user.Id, ct),
                await library.UsedAsync(user.Id, ct),
                upcoming
                    .Where(x => x.Plan is not null)
                    .Select(x => new UpcomingDto(x.Plan!.Code, x.Plan.Name, x.StartsAt, x.EndsAt))
                    .ToList(),
                canStartNow));
        }).RequireAuthorization();

        // ---------- Оплата ----------

        app.MapPost("/api/billing/checkout", async (
            [FromBody] CheckoutRequest request, HttpContext http, ClaimsPrincipal principal, AppDbContext db,
            SubscriptionService subscriptions, KeyServerClient keys, ConsentService consents,
            CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var plan = await subscriptions.FindPlanAsync(request.PlanCode ?? string.Empty, ct);

            // Цену берём из своей базы, а не из запроса: иначе тариф за рубль
            // выписал бы себе любой, кто умеет открыть консоль браузера.
            var price = plan?.PriceFor(request.Days);

            if (plan is null || plan.Code == Plan.CodeFree || price is null or <= 0)
                return Results.BadRequest(new { message = "Такого тарифа или срока нет." });

            // «Начать сейчас» осмысленно только вверх по уровню и только
            // поверх действующего платного срока. В остальных случаях
            // отложенный старт — единственное честное поведение, и просьбу
            // браузера мы здесь не переспрашиваем, а поправляем.
            var access = await subscriptions.AccessAsync(user.Id, ct);

            // Если что-то уже стоит в очереди, «начать сейчас» превратило бы
            // сроки в кашу: новый пошёл бы с сегодня, а купленный раньше
            // остался бы на своей дате — с разрывом или наложением. Такая
            // покупка просто встаёт в конец очереди.
            var queued = await subscriptions.UpcomingAsync(user.Id, ct);

            // В очереди стоит не больше одного уровня. Дни к тому же уровню
            // докупаются свободно — это то же самое продление; а вот второй
            // уровень поверх первого превратил бы срок в лестницу, по
            // которой человек не смог бы сказать, что у него сейчас и что
            // будет через месяц. Чтобы взять другой уровень, отложенный
            // нужно сначала включить — и там честно сказано, что остаток
            // текущего срока при этом сгорит.
            var waiting = queued.FirstOrDefault(x => x.Plan is not null);

            if (waiting?.Plan is not null && waiting.Plan.Code != plan.Code)
            {
                return Results.BadRequest(new
                {
                    message = $"В очереди уже стоит тариф «{waiting.Plan.Name}». "
                        + "Докупить дни к нему можно, а другой тариф — только после того, как "
                        + "включите отложенный сейчас: тогда неиспользованные дни текущего срока сгорят."
                });
            }

            var startNow = request.StartNow
                && access.Subscription is not null
                && queued.Count == 0
                && plan.Sort > access.Plan.Sort;

            var invoice = await keys.CreateInvoiceAsync(
                user.Id, user.Email, plan.Code, plan.Name, request.Days, price.Value, request.AutoRenew, ct);

            if (invoice is null)
                return Results.Json(new { message = "Оплата временно недоступна. Попробуйте позже." }, statusCode: 503);

            // Выбор запоминаем здесь: подтверждение придёт отдельным
            // запросом от сервера ключей и решения покупателя не содержит.
            await subscriptions.RememberOrderAsync(
                user.Id, invoice.InvoiceId, plan, request.Days, price.Value, request.AutoRenew, startNow, ct);

            // Согласие на автосписания записываем отдельно от заказа: заказ
            // говорит, что купили, а журнал — на что человек согласился и
            // под каким текстом. В споре о списании спросят второе.
            if (request.AutoRenew)
            {
                await consents.GivenAsync(
                    user.Id, ConsentEvent.SourcePurchase, request.Consent ?? string.Empty,
                    plan.Code, request.Days, price.Value, Ip(http), ct);
            }

            return Results.Ok(new { invoice.PaymentUrl, invoice.Amount });
        }).RequireAuthorization();

        app.MapPost("/api/billing/auto-renew", async (
            [FromBody] AutoRenewRequest request, HttpContext http, ClaimsPrincipal principal, AppDbContext db,
            SubscriptionService subscriptions, ConsentService consents, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var changed = await subscriptions.SetAutoRenewAsync(user.Id, request.Value, ct);

            if (changed)
            {
                // Отзыв записываем так же, как согласие: без него нельзя
                // показать, что человек выключил списания раньше даты.
                if (request.Value)
                {
                    await consents.GivenAsync(
                        user.Id, ConsentEvent.SourceProfile, request.Consent ?? string.Empty,
                        string.Empty, 0, 0, Ip(http), ct);
                }
                else
                {
                    await consents.WithdrawnAsync(user.Id, ConsentEvent.SourceProfile, Ip(http), ct);
                }
            }

            return changed
                ? Results.Ok(new { autoRenew = request.Value })
                : Results.BadRequest(new { message = "Автопродление включается на платном тарифе." });
        }).RequireAuthorization();

        // Сообщение об оплате от сервера ключей. Без RequireAuthorization:
        // это разговор двух служб, и он подписан общим секретом, а не
        // токеном человека.
        app.MapPost("/api/billing/callback", async (
            HttpRequest http, AppDbContext db, SubscriptionService subscriptions, KeyServerClient keys,
            IEmailSender emails, ILoggerFactory loggers, CancellationToken ct) =>
        {
            var logger = loggers.CreateLogger("Billing");

            using var reader = new StreamReader(http.Body);
            var body = await reader.ReadToEndAsync(ct);

            var timestamp = http.Headers[KeyServerClient.TimestampHeader].ToString();
            var signature = http.Headers[KeyServerClient.SignatureHeader].ToString();

            if (!keys.Verify(timestamp, signature, body))
            {
                logger.LogWarning("Сообщение об оплате отклонено: подпись не сходится.");
                return Results.Json(new { message = "Подпись не сходится." }, statusCode: 403);
            }

            PaidCallback? paid;
            try
            {
                paid = JsonSerializer.Deserialize<PaidCallback>(body, new JsonSerializerOptions(JsonSerializerDefaults.Web));
            }
            catch (JsonException)
            {
                return Results.BadRequest(new { message = "Сообщение не разобрано." });
            }

            if (paid is null || string.IsNullOrWhiteSpace(paid.InvoiceId) || paid.UserId <= 0)
                return Results.BadRequest(new { message = "Сообщение не разобрано." });

            var plan = await subscriptions.FindPlanAsync(paid.PlanCode ?? string.Empty, ct);
            if (plan is null)
            {
                logger.LogError("Оплачен неизвестный тариф {Plan}, счёт {Invoice}.", paid.PlanCode, paid.InvoiceId);
                return Results.BadRequest(new { message = "Тариф не найден." });
            }

            // Начать сразу или встать в очередь — выбрал покупатель до
            // оплаты. Здесь этого выбора нет, поэтому берём его из заказа.
            var order = await subscriptions.FindOrderAsync(paid.InvoiceId, ct);
            var known = order is not null && order.Status == BillingOrder.StatusPaid;

            // Повторное сообщение о том же счёте срок не удваивает: службa
            // сама вернёт уже созданную подписку.
            var subscription = await subscriptions.ExtendAsync(
                paid.UserId, plan, paid.Days, Subscription.KindPaid, Subscription.SourceKeys, paid.InvoiceId, ct,
                startNow: order?.StartNow ?? false);

            if (subscription is null)
                return Results.BadRequest(new { message = "Срок не разобран." });

            // Автопродление — свойство учётной записи, а не отдельного
            // срока: списание должно быть одно, и решает его последняя
            // оплата. Иначе у человека с двумя оплаченными сроками
            // осталась бы галочка от старой покупки, о которой он уже
            // забыл, — и списание пришло бы «ниоткуда».
            await subscriptions.ApplyAutoRenewAsync(paid.UserId, subscription.Id, paid.AutoRenew, ct);

            if (order is not null)
                await subscriptions.MarkOrderPaidAsync(order, paid.PaidAt ?? DateTime.UtcNow, ct);

            logger.LogInformation(
                "Счёт {Invoice} принят: пользователь {UserId}, тариф {Plan}, {Days} дн.",
                paid.InvoiceId, paid.UserId, plan.Code, paid.Days);

            // Письмо — только на первое сообщение о счёте: сервер ключей
            // повторяет уведомление, пока мы не ответим «принято», и без
            // этой проверки человек получил бы их столько же.
            if (!known)
            {
                var buyer = await db.Users.FirstOrDefaultAsync(x => x.Id == paid.UserId, ct);

                if (buyer is not null)
                {
                    var letter = EmailTemplates.SubscriptionPaid(
                        plan.Name, paid.Days, (int)paid.Amount,
                        subscription.StartsAt, subscription.EndsAt, subscription.AutoRenew);

                    await emails.SendAsync(buyer.Email, letter.Subject, letter.Html, letter.Text, ct);
                }
            }

            return Results.Ok(new { ok = true });
        });

        app.MapGet("/api/billing/history", async (
            ClaimsPrincipal principal, AppDbContext db,
            SubscriptionService subscriptions, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var now = DateTime.UtcNow;
            var orders = await subscriptions.OrdersAsync(user.Id, ct);

            return Results.Ok(orders.Select(order => new OrderDto(
                order.InvoiceId,
                order.PlanName,
                order.Days,
                order.Amount,
                order.AutoRenew,
                // Отказов Робокасса не присылает — она зовёт нас только при
                // успехе. Поэтому «не завершён» ставится по времени, а не по
                // сообщению об ошибке: его не существует.
                order.Status == BillingOrder.StatusPaid
                    ? BillingOrder.StatusPaid
                    : now - order.CreatedAt > BillingOrder.PendingLifetime ? "abandoned" : BillingOrder.StatusPending,
                order.CreatedAt,
                order.PaidAt)));
        }).RequireAuthorization();

        // Перейти на уже оплаченный, но отложенный тариф досрочно. Только
        // вверх по уровню и только в одну сторону: остаток текущего срока
        // сгорает, и вернуть его назад нельзя.
        app.MapPost("/api/billing/start-now", async (
            ClaimsPrincipal principal, AppDbContext db,
            SubscriptionService subscriptions, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var moved = await subscriptions.StartUpcomingNowAsync(user.Id, ct);

            return moved
                ? Results.Ok(new { ok = true })
                : Results.BadRequest(new { message = "Перейти досрочно не на что." });
        }).RequireAuthorization();
    }

    private static PlanDto ToDto(Plan plan) => new(
        plan.Code,
        plan.Name,
        plan.Sort,
        plan.Price30,
        plan.Price90,
        plan.Price180,
        plan.Price365,
        plan.MaxBoards,
        plan.MaxStorageBytes,
        plan.MaxParticipants,
        plan.HasLibrary);

    /// <summary>
    /// Адрес, с которого пришло действие. За обратным прокси настоящий
    /// адрес приходит заголовком — без него в журнале согласий стоял бы
    /// один и тот же localhost у всех.
    /// </summary>
    private static string Ip(HttpContext http)
    {
        var forwarded = http.Request.Headers["X-Forwarded-For"].ToString();

        if (!string.IsNullOrWhiteSpace(forwarded))
        {
            var first = forwarded.Split(',')[0].Trim();
            if (first.Length > 0) return first;
        }

        return http.Connection.RemoteIpAddress?.ToString() ?? string.Empty;
    }

}
