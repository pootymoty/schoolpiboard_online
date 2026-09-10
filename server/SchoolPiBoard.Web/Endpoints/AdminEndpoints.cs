using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;
using SchoolPiBoard.Web.Services;

namespace SchoolPiBoard.Web.Endpoints;

/// <summary>Человек в списке администратора: кто он и что у него с подпиской.</summary>
public sealed record AdminUserDto(
    long Id,
    string DisplayName,
    string Email,
    bool EmailConfirmed,
    bool IsAdmin,
    DateTime CreatedAt,
    DateTime? LastSeenAt,
    DateTime? DeletedAt,
    string PlanName,
    DateTime? Until,
    bool AutoRenew,
    int Boards,
    int Paid,
    int Spent);

public sealed record AdminPageDto(IReadOnlyList<AdminUserDto> Users, int Total, int Page, int Size);

/// <summary>Просьба выслать код: кому и какую роль хотим поставить.</summary>
public sealed record AdminRoleRequest(bool Admin);

public sealed record AdminRoleConfirm(bool Admin, string? Code);

/// <summary>Сводка по сервису — то, на что смотрят первым делом.</summary>
public sealed record AdminStatsDto(
    int Users,
    int Confirmed,
    int Active,
    int Trials,
    int Boards,
    int PaidMonth,
    int RevenueMonth,
    int RevenueTotal,
    int Pending,
    int Abandoned);

/// <summary>
/// Панель владельца сервиса.
///
/// Только чтение: смотреть, кто пришёл и что купил. Ничего менять здесь
/// нельзя намеренно — правка чужой подписки руками означала бы, что
/// деньги и доступ живут в двух местах сразу, и однажды они разойдутся.
///
/// Роль проверяется на каждом запросе, а не однажды при входе: у токена
/// долгий срок, и роль могли снять уже после того, как его выдали.
/// </summary>
public static class AdminEndpoints
{
    /// <summary>Сколько человек показываем на странице. Больше не помещается на экран.</summary>
    private const int MaxPageSize = 50;

    public static void MapAdminEndpoints(this WebApplication app)
    {
        var admin = app.MapGroup("/api/admin").RequireAuthorization();

        admin.MapGet("/stats", async (
            ClaimsPrincipal principal, AppDbContext db, CancellationToken ct) =>
        {
            var who = await AdminAsync(principal, db, ct);
            if (who is null) return Denied();

            var now = DateTime.UtcNow;
            var month = now.AddDays(-30);
            var stale = now - BillingOrder.PendingLifetime;

            var paid = db.BillingOrders.Where(x => x.Status == BillingOrder.StatusPaid);

            return Results.Ok(new AdminStatsDto(
                await db.Users.CountAsync(x => x.DeletedAt == null, ct),
                await db.Users.CountAsync(x => x.DeletedAt == null && x.EmailConfirmed, ct),
                await db.Subscriptions.CountAsync(
                    x => x.Kind == Subscription.KindPaid && x.StartsAt <= now && x.EndsAt > now, ct),
                await db.Subscriptions.CountAsync(
                    x => x.Kind == Subscription.KindTrial && x.StartsAt <= now && x.EndsAt > now, ct),
                await db.Boards.CountAsync(x => x.DeletedAt == null, ct),
                await paid.CountAsync(x => x.CreatedAt >= month, ct),
                await paid.Where(x => x.CreatedAt >= month).SumAsync(x => (int?)x.Amount, ct) ?? 0,
                await paid.SumAsync(x => (int?)x.Amount, ct) ?? 0,
                // «Ожидает» и «не завершён» — один и тот же статус в базе:
                // платёжная система сообщает только об успешной оплате, а
                // брошенным счёт становится по времени.
                await db.BillingOrders.CountAsync(
                    x => x.Status == BillingOrder.StatusPending && x.CreatedAt >= stale, ct),
                await db.BillingOrders.CountAsync(
                    x => x.Status == BillingOrder.StatusPending && x.CreatedAt < stale, ct)));
        });

        admin.MapGet("/users", async (
            string? query, int? page, int? size, ClaimsPrincipal principal,
            AppDbContext db, CancellationToken ct) =>
        {
            var who = await AdminAsync(principal, db, ct);
            if (who is null) return Denied();

            var take = Math.Clamp(size ?? 20, 5, MaxPageSize);
            var skip = Math.Max(0, (page ?? 1) - 1) * take;

            var people = db.Users.AsQueryable();

            // Поиск идёт по имени и почте разом: администратор помнит
            // человека то так, то так, и заставлять его выбирать поле —
            // значит заставлять искать дважды.
            var needle = (query ?? string.Empty).Trim().ToLowerInvariant();

            if (needle.Length > 0)
            {
                people = people.Where(x =>
                    x.Email.Contains(needle)
                    || x.DisplayName.ToLower().Contains(needle));
            }

            var total = await people.CountAsync(ct);

            var rows = await people
                .OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id)
                .Skip(skip)
                .Take(take)
                .ToListAsync(ct);

            var ids = rows.Select(x => x.Id).ToList();
            var now = DateTime.UtcNow;

            // Считаем сразу по всей странице, а не по человеку в цикле:
            // двадцать строк иначе дают шестьдесят запросов к базе.
            var running = await db.Subscriptions
                .Include(x => x.Plan)
                .Where(x => ids.Contains(x.UserId) && x.StartsAt <= now && x.EndsAt > now)
                .ToListAsync(ct);

            var boards = await db.Boards
                .Where(x => ids.Contains(x.OwnerId) && x.DeletedAt == null)
                .GroupBy(x => x.OwnerId)
                .Select(g => new { UserId = g.Key, Count = g.Count() })
                .ToListAsync(ct);

            var orders = await db.BillingOrders
                .Where(x => ids.Contains(x.UserId) && x.Status == BillingOrder.StatusPaid)
                .GroupBy(x => x.UserId)
                .Select(g => new { UserId = g.Key, Count = g.Count(), Sum = g.Sum(x => x.Amount) })
                .ToListAsync(ct);

            var users = rows.Select(user =>
            {
                var mine = running
                    .Where(x => x.UserId == user.Id)
                    .OrderByDescending(x => x.EndsAt)
                    .FirstOrDefault();

                var money = orders.FirstOrDefault(x => x.UserId == user.Id);

                return new AdminUserDto(
                    user.Id,
                    user.DisplayName,
                    user.Email,
                    user.EmailConfirmed,
                    user.IsAdmin,
                    user.CreatedAt,
                    user.LastSeenAt,
                    user.DeletedAt,
                    user.IsAdmin ? "Владелец сервиса" : mine?.Plan?.Name ?? "Бесплатный",
                    mine?.EndsAt,
                    mine?.AutoRenew ?? false,
                    boards.FirstOrDefault(x => x.UserId == user.Id)?.Count ?? 0,
                    money?.Count ?? 0,
                    money?.Sum ?? 0);
            }).ToList();

            return Results.Ok(new AdminPageDto(users, total, skip / take + 1, take));
        });

        admin.MapGet("/users/{userId:long}/orders", async (
            long userId, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct) =>
        {
            var who = await AdminAsync(principal, db, ct);
            if (who is null) return Denied();

            var rows = await db.BillingOrders
                .Where(x => x.UserId == userId)
                .OrderByDescending(x => x.CreatedAt)
                .Take(100)
                .ToListAsync(ct);

            return Results.Ok(rows.Select(x => new
            {
                x.InvoiceId,
                x.PlanName,
                x.Days,
                x.Amount,
                x.Status,
                x.AutoRenew,
                x.CreatedAt,
                x.PaidAt,
            }));
        });

        // Смена роли в два шага: сначала код на почту того, кто меняет,
        // потом ввод. Роль администратора открывает чужие покупки и чужие
        // адреса, и одного нажатия для неё мало — угнанная сессия иначе
        // выдавала бы права сама себе.
        admin.MapPost("/users/{userId:long}/role/request", async (
            long userId, AdminRoleRequest request, ClaimsPrincipal principal,
            AppDbContext db, RoleChangeService roles, IEmailSender emails,
            ILoggerFactory loggers, CancellationToken ct) =>
        {
            var who = await AdminAsync(principal, db, ct);
            if (who is null) return Denied();

            var target = await db.Users.FirstOrDefaultAsync(x => x.Id == userId, ct);
            if (target is null) return Results.NotFound(new { message = "Учётная запись не найдена." });

            if (target.Id == who.Id)
                return Results.BadRequest(new { message = "Свою роль изменить нельзя." });

            if (target.DeletedAt is not null)
                return Results.BadRequest(new { message = "Учётная запись удалена." });

            if (target.IsAdmin == request.Admin)
                return Results.BadRequest(new { message = "Роль уже такая." });

            var code = await roles.IssueAsync(who.Id, target.Id, request.Admin);

            var letter = EmailTemplates.RoleCode(
                code, target.Email, request.Admin, (int)RoleChangeService.Lifetime.TotalMinutes);

            var sent = await emails.SendAsync(who.Email, letter.Subject, letter.Html, letter.Text, ct);

            if (!sent)
            {
                loggers.CreateLogger("Admin").LogError("Код смены роли не отправлен на {Address}.", who.Email);
                return Results.Json(new { message = "Письмо с кодом не ушло." }, statusCode: 502);
            }

            return Results.Ok(new { sentTo = who.Email });
        });

        admin.MapPost("/users/{userId:long}/role/confirm", async (
            long userId, AdminRoleConfirm request, ClaimsPrincipal principal,
            AppDbContext db, RoleChangeService roles, ILoggerFactory loggers, CancellationToken ct) =>
        {
            var who = await AdminAsync(principal, db, ct);
            if (who is null) return Denied();

            var target = await db.Users.FirstOrDefaultAsync(x => x.Id == userId, ct);
            if (target is null) return Results.NotFound(new { message = "Учётная запись не найдена." });

            if (target.Id == who.Id)
                return Results.BadRequest(new { message = "Свою роль изменить нельзя." });

            var outcome = await roles.CheckAsync(who.Id, target.Id, request.Admin, request.Code);

            if (outcome == RoleCodeOutcome.Expired)
                return Results.BadRequest(new { message = "Код истёк. Запросите новый." });

            if (outcome == RoleCodeOutcome.Wrong)
                return Results.BadRequest(new { message = "Код не подошёл." });

            target.Role = request.Admin ? User.RoleAdmin : User.RoleUser;
            await db.SaveChangesAsync(ct);

            loggers.CreateLogger("Admin").LogWarning(
                "Роль учётной записи {UserId} изменена на {Role} администратором {AdminId}.",
                target.Id, target.Role, who.Id);

            return Results.Ok(new { isAdmin = target.IsAdmin });
        });
    }

    /// <summary>Владелец сервиса — или ничего. Роль сверяется каждый раз.</summary>
    private static async Task<User?> AdminAsync(
        ClaimsPrincipal principal, AppDbContext db, CancellationToken cancellationToken)
    {
        var user = await AuthEndpoints.CurrentUser(principal, db, cancellationToken);
        return user?.IsAdmin == true ? user : null;
    }

    /// <summary>
    /// Не «нет доступа», а «нет такой страницы»: существование панели —
    /// само по себе сведение, которое посторонним знать незачем.
    /// </summary>
    private static IResult Denied()
        => Results.NotFound(new { message = "Страница не найдена." });
}
