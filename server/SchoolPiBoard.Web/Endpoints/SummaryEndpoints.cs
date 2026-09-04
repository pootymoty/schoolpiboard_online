using System.Security.Claims;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;
using SchoolPiBoard.Web.Services;

namespace SchoolPiBoard.Web.Endpoints;

public sealed record SummaryRequestDto(long Id, string Email, string AskedName, DateTime CreatedAt);

public sealed record AskSummaryRequest(string? Email);

/// <summary>
/// Конспект занятия по почте.
///
/// Просит участник, отправляет владелец. Порядок не удобство, а защита:
/// иначе доска стала бы способом слать письма с вложениями на любой адрес
/// от нашего имени.
///
/// Листы рисует браузер и присылает готовыми картинками — на сервере нет
/// ни холста, ни шрифтов доски, и вторая отрисовка там рано или поздно
/// разошлась бы с первой.
/// </summary>
public static class SummaryEndpoints
{
    private const string GuestHeader = "X-Guest-Token";

    /// <summary>Вес одного листа. Страница доски в разумном разрешении — единицы мегабайт.</summary>
    private const long MaxPageBytes = 6 * 1024 * 1024;

    public static void MapSummaryEndpoints(this WebApplication app)
    {
        // Просит любой, кто на доске, — в том числе гость: у него учётной
        // записи нет, а конспект занятия ему нужен ровно так же.
        app.MapPost("/api/boards/{boardId:long}/summary/request", async (
            long boardId, AskSummaryRequest request, HttpContext http, ClaimsPrincipal principal,
            AppDbContext db, BoardService boards, SummaryService summaries, CancellationToken ct) =>
        {
            var actor = await ActorAsync(boardId, http, principal, db, boards, ct);
            if (actor is null) return Forbidden();

            var outcome = await summaries.AskAsync(
                boardId, KeyOf(actor), actor.DisplayName, request.Email, ct);

            return outcome == SummaryOutcome.Ok
                ? Results.NoContent()
                : Results.BadRequest(new { message = Explain(outcome) });
        });

        app.MapGet("/api/boards/{boardId:long}/summary/requests", async (
            long boardId, HttpContext http, ClaimsPrincipal principal,
            AppDbContext db, BoardService boards, SummaryService summaries, CancellationToken ct) =>
        {
            var actor = await ActorAsync(boardId, http, principal, db, boards, ct);
            if (actor is null || !actor.CanManage) return Forbidden();

            var rows = await summaries.PendingAsync(boardId, ct);

            return Results.Ok(rows.Select(x => new SummaryRequestDto(x.Id, x.Email, x.AskedName, x.CreatedAt)));
        });

        app.MapPost("/api/boards/{boardId:long}/summary/requests/{requestId:long}/decline", async (
            long boardId, long requestId, HttpContext http, ClaimsPrincipal principal,
            AppDbContext db, BoardService boards, SummaryService summaries, CancellationToken ct) =>
        {
            var actor = await ActorAsync(boardId, http, principal, db, boards, ct);
            if (actor is null || !actor.CanManage) return Forbidden();

            return await summaries.DeclineAsync(boardId, requestId, ct)
                ? Results.NoContent()
                : Results.NotFound(new { message = "Просьба не найдена." });
        });

        // Отправка: листы приезжают многочастной формой, как и всякая
        // загрузка файлов. Гостю сюда нельзя — отправляет только владелец.
        app.MapPost("/api/boards/{boardId:long}/summary", async (
            long boardId, HttpRequest http, ClaimsPrincipal principal,
            AppDbContext db, BoardService boards, SummaryService summaries, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var actor = await boards.ResolveActorAsync(boardId, user.Id, null, ct);
            if (actor is null || !actor.CanManage) return Forbidden();

            var board = await db.Boards.FindAsync(new object[] { boardId }, ct);
            if (board is null || board.DeletedAt is not null)
                return Results.NotFound(new { message = "Доска не найдена." });

            if (!http.HasFormContentType)
                return Results.BadRequest(new { message = "Листы не приложены." });

            var form = await http.ReadFormAsync(ct);

            long? requestId = long.TryParse(form["requestId"].ToString(), out var parsed) ? parsed : null;

            var pages = new List<EmailAttachment>();

            foreach (var file in form.Files)
            {
                if (file.Length <= 0 || file.Length > MaxPageBytes)
                    return Results.BadRequest(new { message = "Лист слишком большой." });

                using var memory = new MemoryStream();
                await using (var content = file.OpenReadStream()) await content.CopyToAsync(memory, ct);

                pages.Add(new EmailAttachment(
                    string.IsNullOrWhiteSpace(file.FileName) ? $"Лист {pages.Count + 1}.png" : file.FileName,
                    memory.ToArray(),
                    "image/png"));
            }

            var outcome = await summaries.SendAsync(
                board, requestId, BoardPageViewer.ForUser(user.Id), user.Email, pages, ct);

            return outcome == SummaryOutcome.Ok
                ? Results.NoContent()
                : Results.BadRequest(new { message = Explain(outcome) });
        }).RequireAuthorization();
    }

    private static async Task<BoardActor?> ActorAsync(
        long boardId, HttpContext http, ClaimsPrincipal principal,
        AppDbContext db, BoardService boards, CancellationToken cancellationToken)
    {
        var user = await AuthEndpoints.CurrentUser(principal, db, cancellationToken);
        var guestToken = http.Request.Headers[GuestHeader].ToString();

        return await boards.ResolveActorAsync(boardId, user?.Id, guestToken, cancellationToken);
    }

    /// <summary>Ключ участника — тот же, которым отмечают, кому открыта страница.</summary>
    private static string KeyOf(BoardActor actor)
        => actor.UserId is not null
            ? BoardPageViewer.ForUser(actor.UserId.Value)
            : BoardPageViewer.ForGuest(actor.GuestId ?? string.Empty);

    private static IResult Forbidden()
        => Results.Json(new { message = "Нет доступа к этой доске." }, statusCode: 403);

    private static string Explain(SummaryOutcome outcome) => outcome switch
    {
        SummaryOutcome.BadEmail => "Адрес не похож на почтовый.",
        SummaryOutcome.TooManyPending => "Слишком много неразобранных просьб на этой доске.",
        SummaryOutcome.TooManySent => "С этой доски за час уже ушло много конспектов. Попробуйте позже.",
        SummaryOutcome.NothingToSend => "Отправлять нечего: на страницах пусто.",
        SummaryOutcome.TooBig => $"Конспект не больше {SummaryService.MaxPages} листов.",
        SummaryOutcome.NotFound => "Просьба не найдена — возможно, её уже разобрали.",
        _ => "Письмо не ушло. Попробуйте ещё раз.",
    };
}
