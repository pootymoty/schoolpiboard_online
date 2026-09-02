using System.Security.Claims;
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
