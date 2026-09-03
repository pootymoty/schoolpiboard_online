using System.Security.Claims;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;
using SchoolPiBoard.Web.Services;

namespace SchoolPiBoard.Web.Endpoints;

public sealed record StoredFileDto(long Id, string Name, string ContentType, long Size, DateTime CreatedAt);

public sealed record LibraryDto(
    IEnumerable<StoredFileDto> Files, long Used, long Quota, long MaxFileSize, bool Allowed);

public sealed record BoardImageDto(string ImageRef, string Url);

/// <summary>
/// Библиотека файлов и картинки на досках.
///
/// Библиотека принадлежит человеку и переживает доски: один и тот же PDF
/// раскладывается по разным доскам без повторной загрузки. Картинка на
/// доске — уже отрисованная страница или вставка из буфера; она живёт
/// вместе с доской и уходит вместе с ней.
/// </summary>
public static class FileEndpoints
{
    public static void MapFileEndpoints(this WebApplication app)
    {
        var files = app.MapGroup("/api/files").RequireAuthorization();

        // ---------- Библиотека ----------

        files.MapGet("/", async (
            ClaimsPrincipal principal, AppDbContext db, LibraryService library,
            SubscriptionService subscriptions, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var rows = await library.ListAsync(user.Id, ct);
            var used = await library.UsedAsync(user.Id, ct);
            var access = await subscriptions.AccessAsync(user.Id, ct);

            return Results.Ok(new LibraryDto(
                rows.Select(ToDto),
                used,
                access.Plan.MaxStorageBytes,
                StoredFile.MaxFileSize,
                access.Plan.HasLibrary));
        });

        files.MapPost("/", async (
            HttpRequest request, ClaimsPrincipal principal,
            AppDbContext db, LibraryService library, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            if (!request.HasFormContentType)
                return Results.BadRequest(new { message = "Файл не приложен." });

            var form = await request.ReadFormAsync(ct);
            var upload = form.Files.GetFile("file");
            if (upload is null)
                return Results.BadRequest(new { message = "Файл не приложен." });

            await using var content = upload.OpenReadStream();

            var result = await library.AddAsync(
                user.Id, StoredFile.KindLibrary, null,
                upload.FileName, upload.ContentType, upload.Length, content, ct);

            return result.Outcome == UploadOutcome.Ok && result.File is not null
                ? Results.Ok(ToDto(result.File))
                : Explain(result.Outcome);
        });

        files.MapDelete("/{fileId:long}", async (
            long fileId, ClaimsPrincipal principal,
            AppDbContext db, LibraryService library, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            return await library.DeleteAsync(fileId, user.Id, ct)
                ? Results.Ok(new { ok = true })
                : Results.NotFound(new { message = "Файл не найден." });
        });

        // Оригинал документа: его читает браузер, чтобы самому отрисовать
        // нужную страницу. Отдаём только владельцу — в отличие от картинок
        // на доске, документ никому, кроме него, не предназначен.
        files.MapGet("/{fileId:long}/raw", async (
            long fileId, ClaimsPrincipal principal,
            AppDbContext db, LibraryService library, FileStorage storage, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var file = await library.FindAsync(fileId, user.Id, ct);
            if (file is null) return Results.NotFound(new { message = "Файл не найден." });

            var content = storage.OpenRead(file.StorageKey);
            if (content is null) return Results.NotFound(new { message = "Файл потерялся в хранилище." });

            return Results.Stream(content, file.ContentType, enableRangeProcessing: true);
        });

        // ---------- Картинки на доске ----------

        app.MapPost("/api/boards/{boardId:long}/images", async (
            long boardId, HttpRequest request, HttpContext http, ClaimsPrincipal principal,
            AppDbContext db, BoardService boards, LibraryService library, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);

            // Гостю загрузка закрыта совсем: он приходит по ссылке, и
            // складывать файлы на чужой сервер по ссылке — не то, что
            // стоит разрешать без учётной записи.
            if (user is null) return Results.Unauthorized();

            var guestToken = http.Request.Headers[BoardEndpoints.GuestHeader].ToString();
            var actor = await boards.ResolveActorAsync(boardId, user.Id, guestToken, ct);

            if (actor is null || !actor.CanEdit)
                return Results.Json(new { message = "Класть картинки на эту доску нельзя." }, statusCode: 403);

            var board = await db.Boards.FindAsync(new object[] { boardId }, ct);
            if (board is null || board.DeletedAt is not null)
                return Results.NotFound(new { message = "Доска не найдена." });

            if (!request.HasFormContentType)
                return Results.BadRequest(new { message = "Картинка не приложена." });

            var form = await request.ReadFormAsync(ct);
            var upload = form.Files.GetFile("file");
            if (upload is null)
                return Results.BadRequest(new { message = "Картинка не приложена." });

            await using var content = upload.OpenReadStream();

            // Место занимает владелец доски, а не тот, кто принёс картинку:
            // доска и всё на ней — его, и считать чужую квоту по гостевой
            // вставке было бы неожиданно для обоих.
            var result = await library.AddAsync(
                board.OwnerId, StoredFile.KindBoard, boardId,
                upload.FileName, upload.ContentType, upload.Length, content, ct);

            return result.Outcome == UploadOutcome.Ok && result.File is not null
                ? Results.Ok(new BoardImageDto(result.File.StorageKey, "/api/images/" + result.File.StorageKey))
                : Explain(result.Outcome);
        }).RequireAuthorization();

        // Картинка доски отдаётся по ключу без проверки прав — ключ
        // неугадываемый и работает так же, как ссылка на саму доску. Иначе
        // её не показать: тег <img> своих заголовков не шлёт, а гость ходит
        // именно с ним. Документы библиотеки этим путём не отдаются: они
        // предназначены владельцу и уходят через /api/files/{id}/raw.
        app.MapGet("/api/images/{**key}", async (
            string key, LibraryService library, FileStorage storage, HttpContext http, CancellationToken ct) =>
        {
            var file = await library.FindBoardImageAsync(key, ct);
            if (file is null) return Results.NotFound();

            var content = storage.OpenRead(file.StorageKey);
            if (content is null) return Results.NotFound();

            // Ключ у каждой загрузки свой, содержимое по нему не меняется —
            // значит браузеру можно держать картинку сколько угодно.
            http.Response.Headers.CacheControl = "public, max-age=31536000, immutable";

            return Results.Stream(content, file.ContentType, enableRangeProcessing: true);
        });
    }

    private static StoredFileDto ToDto(StoredFile file)
        => new(file.Id, file.Name, file.ContentType, file.Size, file.CreatedAt);

    private static IResult Explain(UploadOutcome outcome) => outcome switch
    {
        UploadOutcome.TooLarge => Results.BadRequest(new
        {
            message = $"Файл больше {StoredFile.MaxFileSize / (1024 * 1024)} МБ."
        }),
        UploadOutcome.QuotaExceeded => Results.BadRequest(new
        {
            message = "Кончилось место на вашем тарифе. Удалите что-нибудь из библиотеки "
                + "или перейдите на тариф побольше."
        }),
        UploadOutcome.NotOnPlan => Results.BadRequest(new
        {
            message = "Библиотека документов доступна на платных тарифах."
        }),
        UploadOutcome.BadType => Results.BadRequest(new
        {
            message = "Такие файлы доска не принимает. Подойдут PDF, PNG, JPEG и WebP."
        }),
        _ => Results.BadRequest(new { message = "Файл пустой." })
    };
}
