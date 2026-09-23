using System.Security.Claims;
using System.Text.Json;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;
using SchoolPiBoard.Web.Services;

namespace SchoolPiBoard.Web.Endpoints;

public sealed record RecordingDto(
    long Id, string? Title, string Status, DateTime StartedAt, DateTime? EndedAt, long DurationMs);

public sealed record RecordingStepDto(long Id, long OffsetMs, string Name, JsonElement Payload);

/// <summary>
/// Записи занятий: список и содержимое.
///
/// Доступны только зарегистрированным участникам доски — гостю, даже
/// если он был на занятии в момент записи, доступа нет: у него нет
/// учётной записи, к которой этот доступ можно было бы привязать.
/// Управляют записью (старт/пауза/стоп) через хаб — здесь только чтение
/// готового и удаление.
/// </summary>
public static class RecordingEndpoints
{
    public static void MapRecordingEndpoints(this WebApplication app)
    {
        app.MapGet("/api/boards/{boardId:long}/recordings", async (
            long boardId, ClaimsPrincipal principal,
            AppDbContext db, BoardService boards, BoardRecordingService recordings, CancellationToken ct) =>
        {
            var actor = await ActorAsync(boardId, principal, db, boards, ct);
            if (actor is null) return Forbidden();

            var rows = await recordings.ListAsync(boardId, ct);
            return Results.Ok(rows.Select(ToDto));
        }).RequireAuthorization();

        app.MapGet("/api/boards/{boardId:long}/recordings/{recordingId:long}", async (
            long boardId, long recordingId, ClaimsPrincipal principal,
            AppDbContext db, BoardService boards, BoardRecordingService recordings, CancellationToken ct) =>
        {
            var actor = await ActorAsync(boardId, principal, db, boards, ct);
            if (actor is null) return Forbidden();

            var recording = await recordings.FindAsync(boardId, recordingId, ct);
            if (recording is null) return Results.NotFound(new { message = "Запись не найдена." });

            var steps = await recordings.StepsAsync(recordingId, ct);

            return Results.Ok(new
            {
                recording = ToDto(recording),
                steps = steps.Select(ToStepDto),
            });
        }).RequireAuthorization();

        // Удаляет только владелец, и только уже остановленную: идущую
        // нужно сперва прекратить кнопкой на доске.
        app.MapDelete("/api/boards/{boardId:long}/recordings/{recordingId:long}", async (
            long boardId, long recordingId, ClaimsPrincipal principal,
            AppDbContext db, BoardService boards, BoardRecordingService recordings, CancellationToken ct) =>
        {
            var actor = await ActorAsync(boardId, principal, db, boards, ct);
            if (actor is null || !actor.CanManage) return Forbidden();

            var outcome = await recordings.DeleteAsync(boardId, recordingId, ct);

            return outcome switch
            {
                RecordingOutcome.Ok => Results.NoContent(),
                RecordingOutcome.StillActive => Results.BadRequest(new { message = "Сначала остановите запись." }),
                _ => Results.NotFound(new { message = "Запись не найдена." }),
            };
        }).RequireAuthorization();
    }

    private static async Task<BoardActor?> ActorAsync(
        long boardId, ClaimsPrincipal principal, AppDbContext db, BoardService boards,
        CancellationToken cancellationToken)
    {
        var user = await AuthEndpoints.CurrentUser(principal, db, cancellationToken);
        if (user is null) return null;

        // guestToken не передаётся: гостю сюда нельзя, только зарегистрированному участнику.
        return await boards.ResolveActorAsync(boardId, user.Id, null, cancellationToken);
    }

    private static RecordingStepDto ToStepDto(BoardRecordingStep step)
    {
        // Clone обязателен: RootElement живёт внутри JsonDocument, и после
        // его освобождения ссылка на элемент стала бы недействительной.
        using var document = JsonDocument.Parse(step.Payload);
        return new RecordingStepDto(step.Id, step.OffsetMs, step.Name, document.RootElement.Clone());
    }

    private static RecordingDto ToDto(BoardRecording recording) => new(
        recording.Id,
        recording.Title,
        recording.Status,
        recording.StartedAt,
        recording.EndedAt,
        recording.Status == BoardRecording.StatusRecording
            ? recording.DurationMs
                + (long)(DateTime.UtcNow - (recording.LastResumedAt ?? DateTime.UtcNow)).TotalMilliseconds
            : recording.DurationMs);

    private static IResult Forbidden()
        => Results.Json(new { message = "Нет доступа к этой доске." }, statusCode: 403);
}
