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
public sealed record CheckoutRequest(string? PlanCode, int Days, bool AutoRenew, bool StartNow);

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
public sealed record AutoRenewRequest(bool Value);

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
            var order = access.Subscription?.InvoiceId is null
                ? null
                : await subscriptions.FindOrderAsync(access.Subscription.InvoiceId, ct);

            // Перейти на отложенный тариф досрочно — только вверх по уровню.
            var next = upcoming.FirstOrDefault();
            var canStartNow = next?.Plan is not null
                && access.Subscription is not null
                && next.Plan.Sort > access.Plan.Sort;

            return Results.Ok(new MyPlanDto(
                ToDto(access.Plan),
                access.Subscription?.Kind ?? "free",
                access.Until,
                access.Subscription?.AutoRenew ?? false,
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
            [FromBody] CheckoutRequest request, ClaimsPrincipal principal, AppDbContext db,
            SubscriptionService subscriptions, KeyServerClient keys, CancellationToken ct) =>
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
            var startNow = request.StartNow
                && access.Subscription is not null
                && plan.Sort > access.Plan.Sort;

            var invoice = await keys.CreateInvoiceAsync(
                user.Id, user.Email, plan.Code, plan.Name, request.Days, price.Value, request.AutoRenew, ct);

            if (invoice is null)
                return Results.Json(new { message = "Оплата временно недоступна. Попробуйте позже." }, statusCode: 503);

            // Выбор запоминаем здесь: подтверждение придёт отдельным
            // запросом от сервера ключей и решения покупателя не содержит.
            await subscriptions.RememberOrderAsync(
                user.Id, invoice.InvoiceId, plan, request.Days, price.Value, request.AutoRenew, startNow, ct);

            return Results.Ok(new { invoice.PaymentUrl, invoice.Amount });
        }).RequireAuthorization();

        app.MapPost("/api/billing/auto-renew", async (
            [FromBody] AutoRenewRequest request, ClaimsPrincipal principal, AppDbContext db,
            SubscriptionService subscriptions, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var changed = await subscriptions.SetAutoRenewAsync(user.Id, request.Value, ct);

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

            if (paid.AutoRenew && !subscription.AutoRenew)
            {
                subscription.AutoRenew = true;
                await db.SaveChangesAsync(ct);
            }

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
}
