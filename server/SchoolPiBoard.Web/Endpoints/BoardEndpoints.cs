using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
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
public sealed record GuestJoinRequest(string? DisplayName, string? GuestId);

public sealed record BoardDto(
    long Id,
    string Title,
    string Role,
    bool CanEdit,
    bool CanManage,
    bool Locked,
    bool AutoAdmit,
    string? LinkUrl,
    DateTime UpdatedAt);

public sealed record MemberDto(long UserId, string DisplayName, string Email, string Role, DateTime JoinedAt);

public sealed record GuestDto(string GuestId, string DisplayName, string Role);

public sealed record WaitingDto(string RequestId, string DisplayName, bool IsGuest, DateTime RequestedAt);

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

        boards.MapGet("/", async (ClaimsPrincipal principal, AppDbContext db, BoardService service, AppOptions options, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var rows = await service.ListAsync(user.Id, ct);
            return Results.Ok(rows.Select(row => ToDto(row.Board, row.Member.Role, options)));
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
            long boardId, ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.DeleteAsync(boardId, user.Id, ct);
            return result.Outcome == BoardOutcome.Ok ? Results.NoContent() : Fail(result.Outcome, result.Message);
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

        boards.MapDelete("/{boardId:long}/members/{memberUserId:long}", async (
            long boardId, long memberUserId, ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.RemoveMemberAsync(boardId, user.Id, memberUserId, ct);
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

            var members = await service.ListMembersAsync(boardId, user?.Id ?? 0, ct);
            var guests = await service.ListActiveGuestsAsync(boardId);

            return Results.Ok(new
            {
                board = ToDto(board, actor.Role, options, actor.CanManage),
                me = new { actor.DisplayName, actor.IsGuest, actor.Role, actor.GuestId },
                members = (members.Value ?? new List<BoardMember>())
                    .Select(m => new MemberDto(m.UserId, m.User?.DisplayName ?? "", m.User?.Email ?? "", m.Role, m.JoinedAt)),
                guests = guests.Select(g => new GuestDto(g.GuestId, g.DisplayName, g.Role))
            });
        });
    }

    /// <summary>
    /// Ссылка показывается только тому, кто может ею распорядиться:
    /// наблюдателю она ни к чему, а раздавать доступ он не должен.
    /// </summary>
    private static BoardDto ToDto(Board board, string role, AppOptions options, bool? canManage = null)
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
            board.UpdatedAt);
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
