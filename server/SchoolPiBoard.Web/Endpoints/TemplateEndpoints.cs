using System.Security.Claims;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;
using SchoolPiBoard.Web.Services;

namespace SchoolPiBoard.Web.Endpoints;

public sealed record UserTemplateDto(long Id, string Title, int Count, DateTime CreatedAt, string Body);

public sealed record SaveTemplateRequest(string? Title, string? Body);

/// <summary>
/// Папка «Мои заготовки».
///
/// Заготовка принадлежит человеку, а не доске: её затем и делают, чтобы
/// поставить на следующем занятии. Поэтому и гостю она недоступна —
/// хранить её было бы не за кем.
/// </summary>
public static class TemplateEndpoints
{
    public static void MapTemplateEndpoints(this WebApplication app)
    {
        var templates = app.MapGroup("/api/templates").RequireAuthorization();

        templates.MapGet("/", async (
            ClaimsPrincipal principal, AppDbContext db, TemplateService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var rows = await service.ListAsync(user.Id, ct);
            return Results.Ok(rows.Select(ToDto));
        });

        templates.MapPost("/", async (
            SaveTemplateRequest request, ClaimsPrincipal principal,
            AppDbContext db, TemplateService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var (outcome, template) = await service.CreateAsync(user.Id, request.Title, request.Body, ct);

            return outcome == TemplateOutcome.Ok && template is not null
                ? Results.Ok(ToDto(template))
                : Results.BadRequest(new { message = Explain(outcome) });
        });

        templates.MapDelete("/{templateId:long}", async (
            long templateId, ClaimsPrincipal principal,
            AppDbContext db, TemplateService service, CancellationToken ct) =>
        {
            var user = await AuthEndpoints.CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            return await service.DeleteAsync(user.Id, templateId, ct)
                ? Results.NoContent()
                : Results.NotFound(new { message = "Заготовка не найдена." });
        });
    }

    private static UserTemplateDto ToDto(UserTemplate template)
        => new(template.Id, template.Title, template.Count, template.CreatedAt, template.Body);

    private static string Explain(TemplateOutcome outcome) => outcome switch
    {
        TemplateOutcome.NoTitle => "У заготовки должно быть название.",
        TemplateOutcome.TooMany => $"Заготовок не больше {UserTemplate.MaxPerUser}. Удалите ненужные.",
        TemplateOutcome.TooBig => "Заготовка слишком большая. Сохраните её частями.",
        TemplateOutcome.Empty => "Сохранять нечего: выделите объекты на доске.",
        _ => "Заготовка не сохранилась: неизвестное содержимое.",
    };
}
