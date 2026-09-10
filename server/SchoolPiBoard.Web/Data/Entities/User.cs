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

    /// <summary>
    /// Роль в сервисе.
    ///
    /// Их две: обычный человек и владелец сервиса. Роль не выдаётся из
    /// интерфейса и не покупается — она берётся из списка адресов в
    /// настройках службы. Так у неё нет пути «внутрь»: тот, кто взломал
    /// чужую учётную запись, администратором от этого не станет.
    /// </summary>
    public string Role { get; set; } = RoleUser;

    public const string RoleUser = "user";

    public const string RoleAdmin = "admin";

    public bool IsAdmin => Role == RoleAdmin;

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
