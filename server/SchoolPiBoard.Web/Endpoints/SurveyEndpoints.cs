using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Services;

namespace SchoolPiBoard.Web.Endpoints;

public sealed record SurveyAnswerRequest(Dictionary<string, int?>? Scores, Dictionary<string, string?>? Texts);

public sealed record SurveyCreateRequest(List<SurveyQuestionDraft>? Questions);

public sealed record SurveyTemplateRequest(string? Name, List<SurveyQuestionDraft>? Questions);

public sealed record SurveyFormDto(
    long Id, DateTime CreatedAt, bool Closed, bool Answered, IReadOnlyList<SurveyQuestion> Questions, int MaxText);

public sealed record AdminSurveyDto(
    long Id, DateTime CreatedAt, int Recipients, int Sent, int Responses, DateTime? ClosedAt);

public sealed record AdminSurveyPageDto(IReadOnlyList<AdminSurveyDto> Items, int Total, int RecipientsNow);

/// <summary>
/// Опросы пользователей о доске.
///
/// Пройти опрос может только вошедший: так каждый отвечает один раз. Но
/// ответ при этом обезличен — см. <see cref="SurveyService.AnswerAsync"/>.
/// </summary>
public static class SurveyEndpoints
{
    /// <summary>Опросов на странице администрирования.</summary>
    private const int PageSize = 10;

    public static void MapSurveyEndpoints(this WebApplication app)
    {
        var surveys = app.MapGroup("/api/surveys").RequireAuthorization();

        surveys.MapGet("/{id:long}", async (
            long id, ClaimsPrincipal principal, AppDbContext db, SurveyService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var survey = await service.FindAsync(id, ct);
            if (survey is null) return Results.NotFound(new { message = "Такого опроса нет." });

            return Results.Ok(new SurveyFormDto(
                survey.Id, survey.CreatedAt, survey.ClosedAt is not null,
                await service.HasAnsweredAsync(survey.Id, user.Id, ct),
                SurveyService.QuestionsOf(survey), SurveyQuestions.MaxTextAnswerLength));
        });

        surveys.MapPost("/{id:long}/answer", async (
            long id, [FromBody] SurveyAnswerRequest request, ClaimsPrincipal principal,
            AppDbContext db, SurveyService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            return await service.AnswerAsync(id, user.Id, request.Scores, request.Texts, ct) switch
            {
                SurveyAnswerOutcome.Ok => Results.Ok(new { message = "Спасибо! Ответ принят." }),
                SurveyAnswerOutcome.NotFound => Results.NotFound(new { message = "Такого опроса нет." }),
                SurveyAnswerOutcome.Closed => Results.Json(new { message = "Опрос уже закрыт." }, statusCode: 410),
                SurveyAnswerOutcome.AlreadyAnswered => Results.Conflict(new { message = "Вы уже ответили на этот опрос. Спасибо!" }),
                _ => Results.BadRequest(new { message = "Поставьте оценку в каждом обязательном вопросе." }),
            };
        });

        var admin = app.MapGroup("/api/admin/surveys").RequireAuthorization();

        admin.MapGet("", async (
            int? page, ClaimsPrincipal principal, AppDbContext db, SurveyService service, CancellationToken ct) =>
        {
            if (await AdminEndpoints.AdminAsync(principal, db, ct) is null) return AdminEndpoints.Denied();

            var at = Math.Max(1, page ?? 1);
            var total = await db.Surveys.CountAsync(ct);

            var items = await db.Surveys
                .OrderByDescending(x => x.CreatedAt)
                .Skip((at - 1) * PageSize).Take(PageSize)
                .Select(x => new AdminSurveyDto(
                    x.Id, x.CreatedAt, x.Recipients, x.Sent,
                    db.SurveyResponses.Count(r => r.SurveyId == x.Id), x.ClosedAt))
                .ToListAsync(ct);

            return Results.Ok(new AdminSurveyPageDto(items, total, await service.Recipients().CountAsync(ct)));
        });

        // С чего начинается форма нового опроса — вопросы последнего.
        admin.MapGet("/template", async (
            ClaimsPrincipal principal, AppDbContext db, SurveyService service, CancellationToken ct) =>
        {
            if (await AdminEndpoints.AdminAsync(principal, db, ct) is null) return AdminEndpoints.Denied();
            return Results.Ok(new
            {
                questions = await service.TemplateAsync(ct),
                maxQuestions = SurveyQuestions.MaxQuestions,
                maxQuestionLength = SurveyQuestions.MaxQuestionLength,
            });
        });

        admin.MapPost("", async (
            [FromBody] SurveyCreateRequest request, ClaimsPrincipal principal,
            AppDbContext db, SurveyService service, CancellationToken ct) =>
        {
            var who = await AdminEndpoints.AdminAsync(principal, db, ct);
            if (who is null) return AdminEndpoints.Denied();

            var (outcome, survey) = await service.CreateAsync(who.Id, request.Questions, ct);
            if (outcome != SurveyCreateOutcome.Ok || survey is null)
            {
                return Results.BadRequest(new
                {
                    message = $"Проверьте вопросы: от 1 до {SurveyQuestions.MaxQuestions}, у каждого есть текст "
                        + $"не длиннее {SurveyQuestions.MaxQuestionLength} символов.",
                });
            }

            return Results.Ok(new { survey.Id, survey.Recipients });
        });

        // Шаблоны — сохранённые наборы вопросов для повторяющихся опросов.
        admin.MapGet("/templates", async (
            ClaimsPrincipal principal, AppDbContext db, SurveyService service, CancellationToken ct) =>
        {
            if (await AdminEndpoints.AdminAsync(principal, db, ct) is null) return AdminEndpoints.Denied();
            return Results.Ok(await service.TemplatesAsync(ct));
        });

        admin.MapPost("/templates", async (
            [FromBody] SurveyTemplateRequest request, ClaimsPrincipal principal,
            AppDbContext db, SurveyService service, CancellationToken ct) =>
        {
            if (await AdminEndpoints.AdminAsync(principal, db, ct) is null) return AdminEndpoints.Denied();

            return await service.SaveTemplateAsync(request.Name, request.Questions, ct) switch
            {
                SurveyTemplateOutcome.Created => Results.Ok(new { replaced = false, message = "Шаблон сохранён." }),
                SurveyTemplateOutcome.Replaced => Results.Ok(new { replaced = true, message = "Шаблон с таким именем обновлён." }),
                _ => Results.BadRequest(new
                {
                    message = $"Нужно имя шаблона (до {SurveyService.MaxTemplateNameLength} символов) и хотя бы один вопрос с текстом.",
                }),
            };
        });

        admin.MapDelete("/templates/{id:long}", async (
            long id, ClaimsPrincipal principal, AppDbContext db, SurveyService service, CancellationToken ct) =>
        {
            if (await AdminEndpoints.AdminAsync(principal, db, ct) is null) return AdminEndpoints.Denied();

            return await service.DeleteTemplateAsync(id, ct)
                ? Results.NoContent()
                : Results.NotFound(new { message = "Такого шаблона нет." });
        });

        // Открытые ответы на один вопрос — отдельно от сводки: их может быть много.
        admin.MapGet("/{id:long}/answers/{key}", async (
            long id, string key, ClaimsPrincipal principal, AppDbContext db, SurveyService service, CancellationToken ct) =>
        {
            if (await AdminEndpoints.AdminAsync(principal, db, ct) is null) return AdminEndpoints.Denied();

            var answers = await service.TextAnswersAsync(id, key, ct);
            return answers is null ? Results.NotFound(new { message = "Такого вопроса нет." }) : Results.Ok(answers);
        });

        admin.MapGet("/{id:long}", async (
            long id, ClaimsPrincipal principal, AppDbContext db, SurveyService service, CancellationToken ct) =>
        {
            if (await AdminEndpoints.AdminAsync(principal, db, ct) is null) return AdminEndpoints.Denied();

            var results = await service.ResultsAsync(id, ct);
            return results is null ? Results.NotFound(new { message = "Такого опроса нет." }) : Results.Ok(results);
        });

        admin.MapPost("/{id:long}/close", async (
            long id, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct) =>
        {
            if (await AdminEndpoints.AdminAsync(principal, db, ct) is null) return AdminEndpoints.Denied();

            var survey = await db.Surveys.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (survey is null) return Results.NotFound(new { message = "Такого опроса нет." });

            survey.ClosedAt ??= DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { survey.ClosedAt });
        });
    }
}
