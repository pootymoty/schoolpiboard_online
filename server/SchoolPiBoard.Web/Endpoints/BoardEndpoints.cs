using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using SchoolPiBoard.Web.Configuration;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;
using SchoolPiBoard.Web.Services;

namespace SchoolPiBoard.Web.Endpoints;

public sealed record CreateBoardRequest(string? Title);
public sealed record RenameBoardRequest(string? Title);
public sealed record LockBoardRequest(bool Locked);
public sealed record CreateLinkRequest(string? Role, string? Label, int? LifetimeDays);
public sealed record ChangeRoleRequest(string? Role);
public sealed record BanRequest(bool Banned);
public sealed record KickGuestRequest(string? GuestId);
public sealed record JoinAsGuestRequest(string? DisplayName, string? GuestId);

public sealed record BoardDto(
    long Id,
    string Title,
    string Role,
    bool CanEdit,
    bool CanManage,
    bool Locked,
    DateTime UpdatedAt);

public sealed record LinkDto(long Id, string Url, string Role, string? Label, DateTime CreatedAt, DateTime? ExpiresAt);

public sealed record MemberDto(long UserId, string DisplayName, string Email, string Role, string Source, bool Banned, DateTime JoinedAt);

public sealed record JoinInfoDto(string BoardTitle, string Role);

public sealed record GuestSessionDto(string GuestToken, string GuestId, long BoardId, string BoardTitle, string Role);

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

        boards.MapGet("/", async (ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var rows = await service.ListAsync(user.Id, ct);

            return Results.Ok(rows.Select(row => new BoardDto(
                row.Board.Id, row.Board.Title, row.Member.Role,
                row.Member.CanEdit, row.Member.CanManage, row.Board.Locked, row.Board.UpdatedAt)));
        });

        boards.MapPost("/", async (
            [FromBody] CreateBoardRequest request,
            ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.CreateAsync(user.Id, request.Title, ct);

            return result.Outcome == BoardOutcome.Ok && result.Value is not null
                ? Results.Ok(new BoardDto(result.Value.Id, result.Value.Title, BoardMember.RoleOwner,
                    true, true, result.Value.Locked, result.Value.UpdatedAt))
                : Answer(result.Outcome, result.Message);
        });

        boards.MapPatch("/{boardId:long}", async (
            long boardId, [FromBody] RenameBoardRequest request,
            ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.RenameAsync(boardId, user.Id, request.Title, ct);

            return result.Outcome == BoardOutcome.Ok && result.Value is not null
                ? Results.Ok(new BoardDto(result.Value.Id, result.Value.Title, BoardMember.RoleOwner,
                    true, true, result.Value.Locked, result.Value.UpdatedAt))
                : Answer(result.Outcome, result.Message);
        });

        boards.MapPost("/{boardId:long}/lock", async (
            long boardId, [FromBody] LockBoardRequest request,
            ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.SetLockedAsync(boardId, user.Id, request.Locked, ct);
            return result.Outcome == BoardOutcome.Ok
                ? Results.Ok(new { locked = result.Value })
                : Answer(result.Outcome, result.Message);
        });

        boards.MapDelete("/{boardId:long}", async (
            long boardId, ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.DeleteAsync(boardId, user.Id, ct);
            return result.Outcome == BoardOutcome.Ok ? Results.NoContent() : Answer(result.Outcome, result.Message);
        });

        // ---------- Ссылки ----------

        boards.MapGet("/{boardId:long}/links", async (
            long boardId, ClaimsPrincipal principal, AppDbContext db,
            BoardService service, AppOptions options, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.ListLinksAsync(boardId, user.Id, ct);
            return result.Outcome == BoardOutcome.Ok && result.Value is not null
                ? Results.Ok(result.Value.Select(link => ToDto(link, options)))
                : Answer(result.Outcome, result.Message);
        });

        boards.MapPost("/{boardId:long}/links", async (
            long boardId, [FromBody] CreateLinkRequest request,
            ClaimsPrincipal principal, AppDbContext db,
            BoardService service, AppOptions options, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.CreateLinkAsync(boardId, user.Id, request.Role, request.Label, request.LifetimeDays, ct);
            return result.Outcome == BoardOutcome.Ok && result.Value is not null
                ? Results.Ok(ToDto(result.Value, options))
                : Answer(result.Outcome, result.Message);
        });

        boards.MapDelete("/{boardId:long}/links/{linkId:long}", async (
            long boardId, long linkId, ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.RevokeLinkAsync(boardId, user.Id, linkId, ct);
            return result.Outcome == BoardOutcome.Ok ? Results.NoContent() : Answer(result.Outcome, result.Message);
        });

        // ---------- Участники ----------

        boards.MapGet("/{boardId:long}/members", async (
            long boardId, ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.ListMembersAsync(boardId, user.Id, ct);
            return result.Outcome == BoardOutcome.Ok && result.Value is not null
                ? Results.Ok(result.Value.Select(m => new MemberDto(
                    m.UserId, m.User?.DisplayName ?? "", m.User?.Email ?? "",
                    m.Role, m.Source, m.BannedAt is not null, m.JoinedAt)))
                : Answer(result.Outcome, result.Message);
        });

        boards.MapPatch("/{boardId:long}/members/{memberUserId:long}", async (
            long boardId, long memberUserId, [FromBody] ChangeRoleRequest request,
            ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.SetMemberRoleAsync(boardId, user.Id, memberUserId, request.Role, ct);
            return result.Outcome == BoardOutcome.Ok ? Results.NoContent() : Answer(result.Outcome, result.Message);
        });

        boards.MapPost("/{boardId:long}/members/{memberUserId:long}/ban", async (
            long boardId, long memberUserId, [FromBody] BanRequest request,
            ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.SetMemberBannedAsync(boardId, user.Id, memberUserId, request.Banned, ct);
            return result.Outcome == BoardOutcome.Ok ? Results.NoContent() : Answer(result.Outcome, result.Message);
        });

        boards.MapPost("/{boardId:long}/guests/kick", async (
            long boardId, [FromBody] KickGuestRequest request,
            ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.KickGuestAsync(boardId, user.Id, request.GuestId ?? "", ct);
            return result.Outcome == BoardOutcome.Ok ? Results.NoContent() : Answer(result.Outcome, result.Message);
        });

        // ---------- Вход по ссылке ----------
        // Без RequireAuthorization: сюда приходят и те, у кого учётной записи нет.

        app.MapGet("/api/join/{token}", async (string token, BoardService service, CancellationToken ct) =>
        {
            var result = await service.PeekLinkAsync(token, ct);
            return result.Outcome == BoardOutcome.Ok
                ? Results.Ok(new JoinInfoDto(result.Value.Board.Title, result.Value.Link.Role))
                : Answer(result.Outcome, result.Message);
        });

        app.MapPost("/api/join/{token}/user", async (
            string token, ClaimsPrincipal principal, AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await service.JoinAsUserAsync(token, user.Id, ct);
            return result.Outcome == BoardOutcome.Ok && result.Value is not null
                ? Results.Ok(new { boardId = result.Value.Id })
                : Answer(result.Outcome, result.Message);
        }).RequireAuthorization();

        app.MapPost("/api/join/{token}/guest", async (
            string token, [FromBody] JoinAsGuestRequest request, BoardService service, CancellationToken ct) =>
        {
            var result = await service.JoinAsGuestAsync(token, request.DisplayName, request.GuestId, ct);

            return result.Outcome == BoardOutcome.Ok
                ? Results.Ok(new GuestSessionDto(
                    result.Value.Token, result.Value.GuestId,
                    result.Value.Board.Id, result.Value.Board.Title, result.Value.Role))
                : Answer(result.Outcome, result.Message);
        });

        // Состояние доски для того, кто на ней: и для участника, и для гостя.
        app.MapGet("/api/boards/{boardId:long}/state", async (
            long boardId, HttpContext http, ClaimsPrincipal principal,
            AppDbContext db, BoardService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            var guestToken = http.Request.Headers[GuestHeader].ToString();

            var actor = await service.ResolveActorAsync(boardId, user?.Id, guestToken, ct);
            if (actor is null)
                return Results.Json(new { message = "Нет доступа к этой доске." }, statusCode: 403);

            var board = await db.Boards.FindAsync(new object[] { boardId }, ct);
            if (board is null || board.DeletedAt is not null)
                return Results.NotFound(new { message = "Доска не найдена." });

            return Results.Ok(new
            {
                board = new BoardDto(board.Id, board.Title, actor.Role, actor.CanEdit, actor.CanManage, board.Locked, board.UpdatedAt),
                me = new { actor.DisplayName, actor.IsGuest, actor.Role }
            });
        });
    }

    private static LinkDto ToDto(BoardLink link, AppOptions options)
        => new(link.Id, $"{options.PublicUrl}/join/{link.Token}", link.Role, link.Label, link.CreatedAt, link.ExpiresAt);

    private static IResult Answer(BoardOutcome outcome, string? message) => outcome switch
    {
        BoardOutcome.NotFound => Results.NotFound(new { message }),
        BoardOutcome.Forbidden => Results.Json(new { message }, statusCode: 403),
        BoardOutcome.Locked => Results.Json(new { code = "locked", message }, statusCode: 409),
        BoardOutcome.Kicked => Results.Json(new { code = "kicked", message }, statusCode: 429),
        _ => Results.BadRequest(new { message })
    };
}
