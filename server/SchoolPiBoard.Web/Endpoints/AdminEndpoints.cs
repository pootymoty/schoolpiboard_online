using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Configuration;
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

/// <summary>Открытая жалоба — на что и от кого.</summary>
public sealed record AdminReportDto(
    long Id,
    long BoardId,
    string BoardTitle,
    string? OwnerEmail,
    string? OwnerName,
    string Reporter,
    string Comment,
    DateTime CreatedAt);

/// <summary>Доска в списке администратора — без содержимого, только сведения о ней.</summary>
public sealed record AdminBoardDto(
    long Id,
    string Title,
    string? OwnerEmail,
    string? OwnerName,
    int Items,
    DateTime CreatedAt);

/// <summary>Текст, написанный на доске инструментом «текст» — по одной надписи.</summary>
public sealed record AdminBoardTextDto(
    long ItemId,
    long PageId,
    string PageTitle,
    string Text,
    DateTime UpdatedAt);

/// <summary>Надпись, совпавшая с грубой проверкой, — и почему она в списке.</summary>
public sealed record AdminFlaggedDto(
    long BoardId,
    string BoardTitle,
    string? OwnerEmail,
    long ItemId,
    string Text,
    string Reason);

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
                    // У администратора рядом с ролью показываем и его
                    // собственную подписку, если она куплена: роль
                    // временная, а подписка никуда не делась и снова
                    // начнёт действовать, когда роль снимут.
                    user.IsAdmin
                        ? mine?.Plan is null ? "Администратор" : $"Администратор · {mine.Plan.Name}"
                        : mine?.Plan?.Name ?? "Бесплатный",
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

        // ---------- Жалобы и содержимое досок ----------

        admin.MapGet("/reports", async (ClaimsPrincipal principal, AppDbContext db, CancellationToken ct) =>
        {
            var who = await AdminAsync(principal, db, ct);
            if (who is null) return Denied();

            var rows = await db.Reports
                .Where(x => x.ResolvedAt == null)
                .OrderByDescending(x => x.CreatedAt)
                .Take(200)
                .ToListAsync(ct);

            var boardIds = rows.Select(x => x.BoardId).Distinct().ToList();
            var boards = await db.Boards.Where(x => boardIds.Contains(x.Id)).ToListAsync(ct);
            var boardById = boards.ToDictionary(x => x.Id);

            // Владелец — по OwnerId отдельным запросом, а не через Board.Owner:
            // навигация у Board не настроена во фронт-конфигурации модели.
            var ownerIds = boards.Select(x => x.OwnerId).Distinct().ToList();
            var reporterIds = rows.Select(x => x.ReporterUserId).Where(x => x != null).Select(x => x!.Value).Distinct().ToList();
            var peopleIds = ownerIds.Concat(reporterIds).Distinct().ToList();
            var people = await db.Users.Where(x => peopleIds.Contains(x.Id)).ToListAsync(ct);
            var personById = people.ToDictionary(x => x.Id);

            var result = rows.Select(r =>
            {
                var board = boardById.GetValueOrDefault(r.BoardId);
                var owner = board is not null ? personById.GetValueOrDefault(board.OwnerId) : null;
                var reporter = r.ReporterUserId is not null ? personById.GetValueOrDefault(r.ReporterUserId.Value) : null;

                return new AdminReportDto(
                    r.Id, r.BoardId, board?.Title ?? "(доска удалена)",
                    owner?.Email, owner?.DisplayName,
                    reporter is not null ? $"{reporter.DisplayName} ({reporter.Email})" : r.ReporterGuestName ?? "гость",
                    r.Comment, r.CreatedAt);
            });

            return Results.Ok(result);
        });

        // Разбор без удаления доски: жалоба может оказаться пустой или
        // уже решённой другим путём — не всякая жалоба означает, что
        // доску нужно стирать.
        admin.MapPost("/reports/{reportId:long}/resolve", async (
            long reportId, ClaimsPrincipal principal, AppDbContext db, ILoggerFactory loggers, CancellationToken ct) =>
        {
            var who = await AdminAsync(principal, db, ct);
            if (who is null) return Denied();

            var report = await db.Reports.FirstOrDefaultAsync(x => x.Id == reportId, ct);
            if (report is null) return Results.NotFound(new { message = "Жалоба не найдена." });

            report.ResolvedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);

            loggers.CreateLogger("Admin").LogWarning(
                "Жалоба {ReportId} закрыта администратором {AdminId}.", reportId, who.Id);

            return Results.NoContent();
        });

        // Список досок целиком, а не только тех, на кого пожаловались:
        // разобраться в происходящем можно и без жалобы, если админ решил
        // посмотреть сам.
        admin.MapGet("/boards", async (
            string? query, int? page, int? size, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct) =>
        {
            var who = await AdminAsync(principal, db, ct);
            if (who is null) return Denied();

            var take = Math.Clamp(size ?? 20, 5, MaxPageSize);
            var skip = Math.Max(0, (page ?? 1) - 1) * take;

            // Владелец ищется через явный Join по OwnerId, а не через
            // Board.Owner: навигация у Board не настроена в конфигурации
            // модели, и это единственный надёжный способ дойти до почты
            // и имени владельца прямо в запросе.
            var boards = from b in db.Boards
                         join u in db.Users on b.OwnerId equals u.Id
                         where b.DeletedAt == null
                         select new { Board = b, Owner = u };

            var needle = (query ?? string.Empty).Trim().ToLowerInvariant();
            if (needle.Length > 0)
            {
                boards = boards.Where(x =>
                    x.Board.Title.ToLower().Contains(needle)
                    || x.Owner.Email.Contains(needle)
                    || x.Owner.DisplayName.ToLower().Contains(needle));
            }

            var total = await boards.CountAsync(ct);

            var rows = await boards
                .OrderByDescending(x => x.Board.CreatedAt)
                .Skip(skip).Take(take)
                .ToListAsync(ct);

            var ids = rows.Select(x => x.Board.Id).ToList();
            var counts = await db.BoardItems
                .Where(x => ids.Contains(x.BoardId))
                .GroupBy(x => x.BoardId)
                .Select(g => new { BoardId = g.Key, Count = g.Count() })
                .ToListAsync(ct);

            var result = rows.Select(x => new AdminBoardDto(
                x.Board.Id, x.Board.Title, x.Owner.Email, x.Owner.DisplayName,
                counts.FirstOrDefault(c => c.BoardId == x.Board.Id)?.Count ?? 0,
                x.Board.CreatedAt));

            return Results.Ok(new { boards = result, total, page = skip / take + 1, size = take });
        });

        // Только то, что набрано инструментом «текст»: полностью открыть
        // доску здесь не открыть — это не тот же интерактивный холст,
        // только список надписей, для быстрого просмотра без входа на
        // саму доску под её владельцем.
        admin.MapGet("/boards/{boardId:long}/text", async (
            long boardId, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct) =>
        {
            var who = await AdminAsync(principal, db, ct);
            if (who is null) return Denied();

            var pages = await db.BoardPages.Where(x => x.BoardId == boardId).ToListAsync(ct);
            var titleOf = pages.ToDictionary(x => x.Id, x => x.Title);

            var items = await db.BoardItems
                .Where(x => x.BoardId == boardId && x.Type == BoardItem.TypeText)
                .OrderBy(x => x.PageId).ThenBy(x => x.CreatedAt)
                .ToListAsync(ct);

            var result = items
                .Select(x => new AdminBoardTextDto(
                    x.Id, x.PageId, titleOf.GetValueOrDefault(x.PageId, "?"), ExtractText(x) ?? "", x.UpdatedAt))
                .Where(x => x.Text.Trim().Length > 0);

            return Results.Ok(result);
        });

        // Список подряд по всем доскам сразу — жалоба не единственный
        // повод присмотреться, а слово из списка иногда попадается там,
        // где никто не пожаловался.
        admin.MapGet("/boards/flagged", async (
            ClaimsPrincipal principal, AppDbContext db, ModerationOptions moderation, CancellationToken ct) =>
        {
            var who = await AdminAsync(principal, db, ct);
            if (who is null) return Denied();

            // Переписка от руки этой проверке не видна — только то, что
            // набрано клавиатурой; отсюда и ограничение сверху, чтобы
            // разовый просмотр не тянул в память лишнего.
            var items = await db.BoardItems
                .Where(x => x.Type == BoardItem.TypeText)
                .OrderByDescending(x => x.UpdatedAt)
                .Take(5000)
                .ToListAsync(ct);

            var hits = new List<(BoardItem Item, string Text, string Reason)>();
            foreach (var item in items)
            {
                var text = ExtractText(item);
                if (string.IsNullOrWhiteSpace(text)) continue;

                var reason = ModerationScanner.Scan(text, moderation.Keywords);
                if (reason is not null) hits.Add((item, text, reason));
            }

            var boardIds = hits.Select(x => x.Item.BoardId).Distinct().ToList();
            var boards = await db.Boards.Where(x => boardIds.Contains(x.Id)).ToListAsync(ct);
            var boardById = boards.ToDictionary(x => x.Id);

            var ownerIds = boards.Select(x => x.OwnerId).Distinct().ToList();
            var owners = await db.Users.Where(x => ownerIds.Contains(x.Id)).ToListAsync(ct);
            var ownerById = owners.ToDictionary(x => x.Id);

            var result = hits.Select(h =>
            {
                var board = boardById.GetValueOrDefault(h.Item.BoardId);
                var owner = board is not null ? ownerById.GetValueOrDefault(board.OwnerId) : null;
                return new AdminFlaggedDto(
                    h.Item.BoardId, board?.Title ?? "(доска удалена)", owner?.Email,
                    h.Item.Id, h.Text, h.Reason);
            });

            return Results.Ok(result);
        });

        // Удаляет доску независимо от того, кто её владелец, — не только
        // по жалобе: снятая с публикации доска остаётся помеченной, как и
        // при удалении владельцем, а не стирается совсем (раздел 5.2).
        admin.MapDelete("/boards/{boardId:long}", async (
            long boardId, ClaimsPrincipal principal, AppDbContext db,
            LibraryService library, ILoggerFactory loggers, CancellationToken ct) =>
        {
            var who = await AdminAsync(principal, db, ct);
            if (who is null) return Denied();

            var board = await db.Boards.FirstOrDefaultAsync(x => x.Id == boardId && x.DeletedAt == null, ct);
            if (board is null) return Results.NotFound(new { message = "Доска не найдена." });

            board.DeletedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            await library.DeleteBoardFilesAsync(boardId, ct);

            loggers.CreateLogger("Admin").LogWarning(
                "Доска {BoardId} удалена администратором {AdminId}.", boardId, who.Id);

            return Results.NoContent();
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

    /// <summary>Администратор — или ничего. Роль сверяется каждый раз.</summary>
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

    /// <summary>
    /// Текст надписи из <c>data.text</c>. Только у типа «текст» он лежит
    /// отдельным полем как есть, поэтому только этот тип и разбирается —
    /// таблицы и прочие объекты здесь не читаются вовсе.
    /// </summary>
    private static string? ExtractText(BoardItem item)
    {
        try
        {
            using var document = JsonDocument.Parse(item.Data);
            return document.RootElement.TryGetProperty("text", out var value) && value.ValueKind == JsonValueKind.String
                ? value.GetString()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
