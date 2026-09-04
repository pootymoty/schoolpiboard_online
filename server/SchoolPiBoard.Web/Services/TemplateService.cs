using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;

namespace SchoolPiBoard.Web.Services;

public enum TemplateOutcome
{
    Ok,
    NoTitle,
    TooMany,
    TooBig,
    Malformed,
    Empty,
}

/// <summary>
/// Свои заготовки учителя — папка «Мои заготовки» в библиотеке.
///
/// Хранится ровно то, что показывает доска: список объектов с их
/// оформлением. Разбирать этот список сервер не обязан — он его не
/// рисует, — но проверить обязан: содержимое приходит от клиента и
/// вернётся на доску, а всё, что вернётся на доску, должно быть тем, чем
/// назвалось.
/// </summary>
public sealed class TemplateService
{
    private readonly AppDbContext _db;

    public TemplateService(AppDbContext db) => _db = db;

    public Task<List<UserTemplate>> ListAsync(long userId, CancellationToken cancellationToken)
        => _db.UserTemplates
            .Where(x => x.UserId == userId)
            .OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id)
            .ToListAsync(cancellationToken);

    public async Task<(TemplateOutcome Outcome, UserTemplate? Template)> CreateAsync(
        long userId, string? title, string? body, CancellationToken cancellationToken)
    {
        var name = (title ?? string.Empty).Trim();
        if (name.Length == 0) return (TemplateOutcome.NoTitle, null);
        if (name.Length > UserTemplate.MaxTitleLength) name = name[..UserTemplate.MaxTitleLength];

        if (string.IsNullOrWhiteSpace(body)) return (TemplateOutcome.Empty, null);
        if (body.Length > UserTemplate.MaxBodyLength) return (TemplateOutcome.TooBig, null);

        var count = Validate(body);
        if (count is null) return (TemplateOutcome.Malformed, null);
        if (count == 0) return (TemplateOutcome.Empty, null);

        var mine = await _db.UserTemplates.CountAsync(x => x.UserId == userId, cancellationToken);
        if (mine >= UserTemplate.MaxPerUser) return (TemplateOutcome.TooMany, null);

        var template = new UserTemplate
        {
            UserId = userId,
            Title = name,
            Body = body,
            Count = count.Value,
            CreatedAt = DateTime.UtcNow,
        };

        _db.UserTemplates.Add(template);
        await _db.SaveChangesAsync(cancellationToken);

        return (TemplateOutcome.Ok, template);
    }

    public async Task<bool> DeleteAsync(long userId, long templateId, CancellationToken cancellationToken)
    {
        var template = await _db.UserTemplates
            .FirstOrDefaultAsync(x => x.Id == templateId && x.UserId == userId, cancellationToken);

        if (template is null) return false;

        _db.UserTemplates.Remove(template);
        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    /// <summary>
    /// Сколько объектов в заготовке, если она вообще заготовка.
    ///
    /// Проверяется форма, а не смысл: список, у каждого известный тип и
    /// объект оформления. Картинка отвергается — файл принадлежит своей
    /// доске, и на другой от неё осталась бы пустая рамка.
    /// </summary>
    private static int? Validate(string body)
    {
        JsonNode? parsed;

        try
        {
            parsed = JsonNode.Parse(body);
        }
        catch (JsonException)
        {
            return null;
        }

        if (parsed is not JsonArray items) return null;

        foreach (var entry in items)
        {
            if (entry is not JsonObject item) return null;

            // Через JsonValue, а не GetValue: у числа или объекта на этом
            // месте GetValue бросает исключение, и проверка формы сама
            // стала бы способом уронить запрос.
            if (item["type"] is not JsonValue node || !node.TryGetValue<string>(out var type))
                return null;

            if (!BoardItem.KnownTypes.Contains(type)) return null;
            if (type == BoardItem.TypeImage) return null;

            if (item["data"] is not JsonObject) return null;
        }

        return items.Count;
    }
}
