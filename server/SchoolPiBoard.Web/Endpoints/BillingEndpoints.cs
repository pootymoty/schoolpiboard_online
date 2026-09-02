using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;
using SchoolPiBoard.Web.Services;

namespace SchoolPiBoard.Web.Endpoints;

/// <summary>Тариф в том виде, в каком его показывают на странице цен.</summary>
public sealed record PlanDto(
    string Code,
    string Name,
    int Price30,
    int Price90,
    int Price180,
    int Price365,
    int MaxBoards,
    long MaxStorageBytes,
    int MaxParticipants,
    bool HasLibrary);

/// <summary>Заказ на оплату: какой тариф и на какой срок.</summary>
public sealed record CheckoutRequest(string? PlanCode, int Days, bool AutoRenew);

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
    int Boards,
    long StorageUsed);

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

            return Results.Ok(new MyPlanDto(
                ToDto(access.Plan),
                access.Subscription?.Kind ?? "free",
                access.Until,
                access.Subscription?.AutoRenew ?? false,
                await subscriptions.BoardCountAsync(user.Id, ct),
                await library.UsedAsync(user.Id, ct)));
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

            var invoice = await keys.CreateInvoiceAsync(
                user.Id, user.Email, plan.Code, plan.Name, request.Days, price.Value, request.AutoRenew, ct);

            return invoice is null
                ? Results.Json(new { message = "Оплата временно недоступна. Попробуйте позже." }, statusCode: 503)
                : Results.Ok(new { invoice.PaymentUrl, invoice.Amount });
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
            HttpRequest http, SubscriptionService subscriptions, KeyServerClient keys,
            ILoggerFactory loggers, CancellationToken ct) =>
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

            // Повторное сообщение о том же счёте срок не удваивает: службa
            // сама вернёт уже созданную подписку.
            var subscription = await subscriptions.ExtendAsync(
                paid.UserId, plan, paid.Days, Subscription.KindPaid, Subscription.SourceKeys, paid.InvoiceId, ct);

            if (subscription is null)
                return Results.BadRequest(new { message = "Срок не разобран." });

            if (paid.AutoRenew && !subscription.AutoRenew)
                await subscriptions.SetAutoRenewAsync(paid.UserId, true, ct);

            logger.LogInformation(
                "Счёт {Invoice} принят: пользователь {UserId}, тариф {Plan}, {Days} дн.",
                paid.InvoiceId, paid.UserId, plan.Code, paid.Days);

            return Results.Ok(new { ok = true });
        });
    }

    private static PlanDto ToDto(Plan plan) => new(
        plan.Code,
        plan.Name,
        plan.Price30,
        plan.Price90,
        plan.Price180,
        plan.Price365,
        plan.MaxBoards,
        plan.MaxStorageBytes,
        plan.MaxParticipants,
        plan.HasLibrary);
}
