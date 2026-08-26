namespace SchoolPiBoard.Web.Data.Entities;

/// <summary>
/// Ссылка на доску. Несёт роль: кто открыл ссылку, входит с этой ролью.
///
/// Ссылок у доски может быть несколько сразу и с разными ролями — например,
/// одна для тех, кто работает на доске, другая для наблюдателей.
/// </summary>
public class BoardLink
{
    public long Id { get; set; }

    public long BoardId { get; set; }

    /// <summary>
    /// Случайный, не угадываемый: 256 бит от криптографического генератора
    /// при требуемых заданием 128. Это единственное, что защищает доску.
    ///
    /// Хранится как есть, а не хешем — так задано разделом 5.3. Взамен
    /// владелец может открыть свою ссылку повторно, не выпуская новую;
    /// платой служит то, что утечка базы открывает и доски.
    /// </summary>
    public string Token { get; set; } = string.Empty;

    /// <summary>editor или viewer. Владельцем по ссылке стать нельзя.</summary>
    public string Role { get; set; } = string.Empty;

    /// <summary>Подпись для владельца: «для обучающихся», «для наблюдателей».</summary>
    public string? Label { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? ExpiresAt { get; set; }

    /// <summary>
    /// Отозванная ссылка перестаёт работать немедленно — это пункт 13.5
    /// приёмки. Запись остаётся: по ней видно, откуда пришли участники,
    /// вошедшие до отзыва.
    /// </summary>
    public DateTime? RevokedAt { get; set; }

    public Board? Board { get; set; }

    /// <summary>Действует ли ссылка прямо сейчас.</summary>
    public bool IsUsable(DateTime now)
        => RevokedAt is null && (ExpiresAt is null || ExpiresAt > now);
}
