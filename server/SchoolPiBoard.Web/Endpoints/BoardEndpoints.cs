using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Configuration;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;
using SchoolPiBoard.Web.Services;

namespace SchoolPiBoard.Web.Endpoints;

public sealed record CreateBoardRequest(string? Title);
public sealed record RenameBoardRequest(string? Title);
public sealed record FlagRequest(bool Value);
public sealed record RoleRequest(string? Role);
public sealed record AdmitRequest(string? RequestId, string? Role);
public sealed record RequestIdRequest(string? RequestId);
public sealed record GuestRoleRequest(string? GuestId, string? Role);
public sealed record GuestJoinRequest(string? DisplayName, string? GuestId);
public sealed record ReportRequest(string? Comment);

public sealed record BoardDto(
    long Id,
    string Title,
    string Role,
    bool CanEdit,
    bool CanManage,
    bool Locked,
    bool AutoAdmit,
    string? LinkUrl,
    DateTime UpdatedAt,
    // Сколько человек на доске прямо сейчас — 0 везде, кроме списка досок.
    int ActiveCount);

public sealed record MemberDto(long UserId, string DisplayName, string Email, string Role, DateTime JoinedAt);

public sealed record GuestDto(string GuestId, string DisplayName, string Role);

public sealed record WaitingDto(string RequestId, string DisplayName, bool IsGuest, DateTime RequestedAt);

/// <summary>
/// Закладка для панели-списка. <c>Data</c> передаётся как есть, тем же
/// JSON, каким её видит холст, — сервер не знает про x1/y1/text, это
/// геометрия объекта, а не его собственные поля.
/// </summary>
public sealed record BookmarkDto(long Id, long PageId, string PageTitle, JsonElement Data);

/// <summary>Ответ на попытку войти по ссылке — общий для гостя и для входа под учётной записью.</summary>
public sealed record JoinResultDto(
    string Status,
    long BoardId,
    string BoardTitle,
    string? Role,
    string? GuestToken,
    string? GuestId,
    string? Message);

public static class BoardEndpoints
{
    /// <summary>
    /// Гостевой токен приходит отдельным заголовком, а не в Authorization:
    /// там лежит токен учётной записи, и смешивать их значило бы разбирать
    /// на каждом запросе, чей именно токен пришёл.
    /// </summary>
    public const string GuestHeader = "X-Guest-Token";

    public static void MapBoardEndpoints(this WebApplication app)
    {
        var boards = app.MapGroup("/api/boards").RequireAuthorization();

        // ---------- Доски ----------

        boards.MapGet("/", async (
            ClaimsPrincipal principal, AppDbContext db, BoardService service, AppOptions options,
            BoardPresence presence, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var rows = await service.ListAsync(user.Id, ct);
            var boardIds = rows.Select(row => row.Board.Id).ToList();

            // «Последнее редактирование» — по факту рисования, а не по
            // метаданным: Board.UpdatedAt трогают только переименование,
            // замок и перевыпуск ссылки, а обычный штрих на холсте — это
            // запись в board_items, о которой сама доска не знает.
            var lastEditRows = await db.BoardItems
                .Where(x => boardIds.Contains(x.BoardId))
                .GroupBy(x => x.BoardId)
                .Select(g => new { BoardId = g.Key, Last = g.Max(x => x.UpdatedAt) })
                .ToListAsync(ct);
            var lastEdits = lastEditRows.ToDictionary(x => x.BoardId, x => x.Last);

            return Results.Ok(rows.Select(row =>
            {
                var lastEdited = lastEdits.TryGetValue(row.Board.Id, out var itemsLast) && itemsLast > row.Board.UpdatedAt
                    ? itemsLast
                    : row.Board.UpdatedAt;

                return ToDto(
                    row.Board, row.Member.Role, options,
                    activeCount: presence.CountOnBoard(row.Board.Id), lastEdited: lastEdited);
            }));
        });

        boards.MapPost("/", async (
            [FromBody] CreateBoardRequest request,
            ClaimsPrincipal principal, AppDbContext db, BoardService service, AppOptions options, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.CreateAsync(user.Id, request.Title, ct);
            return Answer(result, board => ToDto(board, BoardMember.RoleOwner, options));
        });

        boards.MapPatch("/{boardId:long}", async (
            long boardId, [FromBody] RenameBoardRequest request,
            ClaimsPrincipal principal, AppDbContext db, BoardService service, AppOptions options, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.RenameAsync(boardId, user.Id, request.Title, ct);
            return Answer(result, board => ToDto(board, BoardMember.RoleOwner, options));
        });

        boards.MapPost("/{boardId:long}/lock", async (
            long boardId, [FromBody] FlagRequest request,
            ClaimsPrincipal principal, AppDbContext db, BoardService service, AppOptions options, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.SetLockedAsync(boardId, user.Id, request.Value, ct);
            return Answer(result, board => ToDto(board, BoardMember.RoleOwner, options));
        });

        boards.MapPost("/{boardId:long}/auto-admit", async (
            long boardId, [FromBody] FlagRequest request,
            ClaimsPrincipal principal, AppDbContext db, BoardService service, AppOptions options, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.SetAutoAdmitAsync(boardId, user.Id, request.Value, ct);
            return Answer(result, board => ToDto(board, BoardMember.RoleOwner, options));
        });

        boards.MapPost("/{boardId:long}/reissue-link", async (
            long boardId, ClaimsPrincipal principal, AppDbContext db,
            BoardService service, AppOptions options, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.ReissueLinkAsync(boardId, user.Id, ct);
            return Answer(result, board => ToDto(board, BoardMember.RoleOwner, options));
        });

        boards.MapDelete("/{boardId:long}", async (
            long boardId, ClaimsPrincipal principal, AppDbContext db,
            BoardService service, LibraryService library, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.DeleteAsync(boardId, user.Id, ct);
            if (result.Outcome != BoardOutcome.Ok) return Fail(result.Outcome, result.Message);

            // Картинки удалённой доски занимали бы место владельца, а
            // показать их больше негде.
            await library.DeleteBoardFilesAsync(boardId, ct);

            return Results.NoContent();
        });

        // ---------- Комната ожидания ----------

        boards.MapGet("/{boardId:long}/waiting", async (
            long boardId, ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.ListWaitingAsync(boardId, user.Id, ct);
            return result.Outcome == BoardOutcome.Ok && result.Value is not null
                ? Results.Ok(result.Value.Select(r => new WaitingDto(r.Id, r.DisplayName, r.IsGuest, r.RequestedAt)))
                : Fail(result.Outcome, result.Message);
        });

        boards.MapPost("/{boardId:long}/waiting/admit", async (
            long boardId, [FromBody] AdmitRequest request,
            ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.AdmitAsync(boardId, user.Id, request.RequestId ?? "", request.Role, ct);
            return result.Outcome == BoardOutcome.Ok ? Results.NoContent() : Fail(result.Outcome, result.Message);
        });

        boards.MapPost("/{boardId:long}/waiting/reject", async (
            long boardId, [FromBody] RequestIdRequest request,
            ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.RejectAsync(boardId, user.Id, request.RequestId ?? "", ct);
            return result.Outcome == BoardOutcome.Ok ? Results.NoContent() : Fail(result.Outcome, result.Message);
        });

        // ---------- Участники ----------

        boards.MapPatch("/{boardId:long}/members/{memberUserId:long}", async (
            long boardId, long memberUserId, [FromBody] RoleRequest request,
            ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.SetMemberRoleAsync(boardId, user.Id, memberUserId, request.Role, ct);
            return result.Outcome == BoardOutcome.Ok ? Results.NoContent() : Fail(result.Outcome, result.Message);
        });

        // Выгнать — не то же, что забанить: выгнанный вернётся по ссылке
        // через комнату ожидания, забаненный не войдёт вовсе.
        boards.MapDelete("/{boardId:long}/members/{memberUserId:long}", async (
            long boardId, long memberUserId, ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.KickMemberAsync(boardId, user.Id, memberUserId, ct);
            return result.Outcome == BoardOutcome.Ok ? Results.NoContent() : Fail(result.Outcome, result.Message);
        });

        boards.MapPost("/{boardId:long}/members/{memberUserId:long}/ban", async (
            long boardId, long memberUserId, ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.BanMemberAsync(boardId, user.Id, memberUserId, ct);
            return result.Outcome == BoardOutcome.Ok ? Results.NoContent() : Fail(result.Outcome, result.Message);
        });

        boards.MapPost("/{boardId:long}/guests/remove", async (
            long boardId, [FromBody] RequestIdRequest request,
            ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.RemoveGuestAsync(boardId, user.Id, request.RequestId ?? "", ct);
            return result.Outcome == BoardOutcome.Ok ? Results.NoContent() : Fail(result.Outcome, result.Message);
        });

        boards.MapPost("/{boardId:long}/guests/role", async (
            long boardId, [FromBody] GuestRoleRequest request,
            ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.SetGuestRoleAsync(boardId, user.Id, request.GuestId ?? "", request.Role, ct);
            return result.Outcome == BoardOutcome.Ok ? Results.NoContent() : Fail(result.Outcome, result.Message);
        });

        // ---------- Вход по ссылке ----------
        // Без RequireAuthorization: сюда приходят и те, у кого учётной записи нет.

        app.MapGet("/api/join/{token}", async (string token, BoardService service, CancellationToken ct) =>
        {
            var result = await service.PeekAsync(token, ct);
            return result.Outcome == BoardOutcome.Ok && result.Value is not null
                ? Results.Ok(new { boardTitle = result.Value.Title })
                : Fail(result.Outcome, result.Message);
        });

        app.MapPost("/api/join/{token}/guest", async (
            string token, [FromBody] GuestJoinRequest request, BoardService service, CancellationToken ct) =>
        {
            var attempt = await service.RequestAsGuestAsync(token, request.DisplayName, request.GuestId, ct);
            return FromAttempt(attempt);
        });

        app.MapPost("/api/join/{token}/user", async (
            string token, ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            return FromAttempt(await service.RequestAsUserAsync(token, user, ct));
        }).RequireAuthorization();

        // Опрашивается страницей ожидания, пока владелец не решит.
        app.MapPost("/api/join/{token}/check", async (
            string token, [FromBody] GuestJoinRequest request,
            ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);

            var attempt = await service.CheckRequestAsync(
                token, request.GuestId ?? "", request.DisplayName, user?.Id, ct);

            return FromAttempt(attempt);
        });

        // ---------- Состояние доски ----------

        app.MapGet("/api/boards/{boardId:long}/state", async (
            long boardId, HttpContext http, ClaimsPrincipal principal,
            AppDbContext db, BoardService service, AppOptions options, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            var guestToken = http.Request.Headers[GuestHeader].ToString();

            var actor = await service.ResolveActorAsync(boardId, user?.Id, guestToken, ct);
            if (actor is null)
                return Results.Json(new { message = "Нет доступа к этой доске." }, statusCode: 403);

            var board = await db.Boards.FindAsync(new object[] { boardId }, ct);
            if (board is null || board.DeletedAt is not null)
                return Results.NotFound(new { message = "Доска не найдена." });

            // Страница доски опрашивает состояние каждые несколько секунд,
            // поэтому владелец получит перевыпущенную ссылку сам, не
            // перезагружая страницу.
            if (actor.CanManage)
                await service.RefreshLinkAsync(board, ct);

            var members = await service.ListMembersAsync(boardId, ct);
            var guests = await service.ListActiveGuestsAsync(boardId);

            return Results.Ok(new
            {
                board = ToDto(board, actor.Role, options, actor.CanManage),
                me = new { actor.DisplayName, actor.IsGuest, actor.Role, actor.GuestId },
                members = members
                    .Select(m => new MemberDto(m.UserId, m.User?.DisplayName ?? "", m.User?.Email ?? "", m.Role, m.JoinedAt)),
                guests = guests.Select(g => new GuestDto(g.GuestId, g.DisplayName, g.Role))
            });
        });

        // ---------- Закладки ----------

        // Список закладок доски целиком, а не одной открытой страницы:
        // панель «Закладки» даёт перейти к месту на любой странице, не
        // пролистывая их по одной. Страницы с ограниченной видимостью
        // отфильтрованы тем же правилом, что и сам список страниц —
        // закладка на чужую скрытую страницу иначе выдавала бы её название
        // и содержимое тому, кому эта страница не открыта.
        app.MapGet("/api/boards/{boardId:long}/bookmarks", async (
            long boardId, HttpContext http, ClaimsPrincipal principal,
            AppDbContext db, BoardService service, PageService pages, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            var guestToken = http.Request.Headers[GuestHeader].ToString();

            var actor = await service.ResolveActorAsync(boardId, user?.Id, guestToken, ct);
            if (actor is null)
                return Results.Json(new { message = "Нет доступа к этой доске." }, statusCode: 403);

            var visible = await pages.VisibleAsync(
                boardId, actor.CanManage, actor.UserId, actor.GuestId, ct);
            var titleOf = visible.ToDictionary(page => page.Id, page => page.Title);

            var items = await db.BoardItems
                .Where(x => x.BoardId == boardId && x.Type == BoardItem.TypeBookmark)
                .OrderBy(x => x.CreatedAt)
                .ToListAsync(ct);

            var result = items
                .Where(x => titleOf.ContainsKey(x.PageId))
                .Select(x => new BookmarkDto(x.Id, x.PageId, titleOf[x.PageId], ParsedData(x.Data)));

            return Results.Ok(result);
        });

        // ---------- Жалобы ----------

        // Пожаловаться может любой, у кого есть доступ к доске, — не
        // только владелец: происходящее на доске видит участник, а
        // владелец может быть не в курсе или сам быть тем, кто пишет.
        app.MapPost("/api/boards/{boardId:long}/report", async (
            long boardId, [FromBody] ReportRequest request, HttpContext http, ClaimsPrincipal principal,
            AppDbContext db, BoardService service, ILoggerFactory loggers, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            var guestToken = http.Request.Headers[GuestHeader].ToString();

            var actor = await service.ResolveActorAsync(boardId, user?.Id, guestToken, ct);
            if (actor is null)
                return Results.Json(new { message = "Нет доступа к этой доске." }, statusCode: 403);

            var comment = (request.Comment ?? string.Empty).Trim();
            if (comment.Length == 0)
                return Results.BadRequest(new { message = "Напишите, что не так с доской." });
            if (comment.Length > 2000)
                return Results.BadRequest(new { message = "Слишком длинный текст — покороче, пожалуйста." });

            db.Reports.Add(new Report
            {
                BoardId = boardId,
                ReporterUserId = actor.UserId,
                ReporterGuestName = actor.IsGuest ? actor.DisplayName : null,
                Comment = comment,
                CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync(ct);

            loggers.CreateLogger("Report").LogWarning("Жалоба на доску {BoardId}.", boardId);

            return Results.NoContent();
        });

        // Гость уходит сам. Без этого запись о нём висела бы у владельца в
        // списке присутствующих ещё до пятнадцати минут — до истечения
        // допуска, — хотя человек уже закрыл вкладку. Учётной записи у
        // маршрута нет: он и для того, кто аутентифицирован не был.
        app.MapPost("/api/boards/{boardId:long}/leave", async (
            long boardId, HttpContext http, BoardService service, CancellationToken ct) =>
        {
            var guestToken = http.Request.Headers[GuestHeader].ToString();
            await service.LeaveAsGuestAsync(boardId, guestToken, ct);
            return Results.NoContent();
        });
    }

    /// <summary>
    /// Ссылка показывается только тому, кто может ею распорядиться:
    /// наблюдателю она ни к чему, а раздавать доступ он не должен.
    /// </summary>
    private static BoardDto ToDto(
        Board board, string role, AppOptions options, bool? canManage = null,
        int activeCount = 0, DateTime? lastEdited = null)
    {
        var manages = canManage ?? role == BoardMember.RoleOwner;

        return new BoardDto(
            board.Id,
            board.Title,
            role,
            CanEdit: role is BoardMember.RoleOwner or BoardMember.RoleEditor,
            CanManage: manages,
            board.Locked,
            board.AutoAdmit,
            LinkUrl: manages ? $"{options.PublicUrl}/join/{board.LinkToken}" : null,
            lastEdited ?? board.UpdatedAt,
            activeCount);
    }

    /// <summary>
    /// Clone обязателен: RootElement живёт внутри JsonDocument, и после
    /// его освобождения (выхода из <c>using</c>) ссылка на элемент стала
    /// бы недействительной — тот же приём, что и в BoardHub.ToDto.
    /// </summary>
    private static JsonElement ParsedData(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    private static IResult FromAttempt(JoinAttempt attempt) => attempt.Outcome switch
    {
        BoardOutcome.Ok => Results.Ok(new JoinResultDto(
            "admitted", attempt.BoardId, attempt.BoardTitle, attempt.Role, attempt.GuestToken, attempt.RequestId, null)),

        BoardOutcome.Waiting => Results.Ok(new JoinResultDto(
            "waiting", attempt.BoardId, attempt.BoardTitle, null, null, attempt.RequestId, attempt.Message)),

        BoardOutcome.Rejected => Results.Ok(new JoinResultDto(
            "rejected", attempt.BoardId, attempt.BoardTitle, null, null, null, attempt.Message)),

        BoardOutcome.Locked => Results.Ok(new JoinResultDto(
            "locked", attempt.BoardId, attempt.BoardTitle, null, null, null, attempt.Message)),

        BoardOutcome.NotFound => Results.NotFound(new { message = attempt.Message }),
        BoardOutcome.Forbidden => Results.Json(new { message = attempt.Message }, statusCode: 403),
        _ => Results.BadRequest(new { message = attempt.Message })
    };

    private static IResult Answer<T>(BoardResult<T> result, Func<T, object> map)
        => result.Outcome == BoardOutcome.Ok && result.Value is not null
            ? Results.Ok(map(result.Value))
            : Fail(result.Outcome, result.Message);

    private static IResult Fail(BoardOutcome outcome, string? message) => outcome switch
    {
        BoardOutcome.NotFound => Results.NotFound(new { message }),
        BoardOutcome.Forbidden => Results.Json(new { message }, statusCode: 403),
        BoardOutcome.Locked => Results.Json(new { code = "locked", message }, statusCode: 409),
        _ => Results.BadRequest(new { message })
    };
}
