namespace SchoolPiBoard.Web.Data.Entities;

/// <summary>Учётная запись преподавателя. Состав полей задан разделом 5.1.</summary>
public class User
{
    public long Id { get; set; }

    /// <summary>Всегда в нижнем регистре — на этом держится уникальный индекс.</summary>
    public string Email { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    /// <summary>Имя, которым человек подписан для остальных на доске.</summary>
    public string DisplayName { get; set; } = string.Empty;

    /// <summary>
    /// Место под единый вход со «Школой π». В эту фазу вход не входит, но
    /// колонка заводится сразу и пустой: добавить её потом означало бы
    /// мигрировать таблицу с живыми учётными записями.
    /// </summary>
    public string? ExternalId { get; set; }

    /// <summary>
    /// Подтверждена ли почта. Учётная запись создаётся сразу, до перехода
    /// по ссылке из письма, поэтому вход проверяет этот признак отдельно.
    /// </summary>
    public bool EmailConfirmed { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? LastSeenAt { get; set; }

    /// <summary>
    /// Учётная запись удалена человеком. Строка не стирается сразу: доски
    /// остаются рабочими для остальных участников ещё полгода — до
    /// автоматической зачистки, которая заберёт с собой и их (раздел про
    /// хранение данных).
    /// </summary>
    public DateTime? DeletedAt { get; set; }
}
