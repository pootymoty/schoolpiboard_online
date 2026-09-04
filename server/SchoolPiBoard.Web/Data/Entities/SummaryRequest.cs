namespace SchoolPiBoard.Web.Data.Entities;

/// <summary>
/// Просьба прислать конспект занятия и её судьба.
///
/// Конспект уходит не по чужому желанию, а по решению того, кто вёл
/// занятие: адрес называет участник, отправляет владелец. Иначе доска
/// стала бы способом рассылать письма с вложениями на любой адрес от
/// нашего имени — и первый же спам оттуда прилетел бы нам.
///
/// Запись остаётся и после отправки: по ней видно, кому и когда конспект
/// уже уходил, и по ней же считается предел на отправку.
/// </summary>
public class SummaryRequest
{
    public const string StatusPending = "pending";
    public const string StatusSent = "sent";
    public const string StatusDeclined = "declined";

    /// <summary>Сколько просьб может висеть на доске неразобранными.</summary>
    public const int MaxPending = 20;

    /// <summary>Сколько конспектов уходит с одной доски за час.</summary>
    public const int MaxSentPerHour = 10;

    public const int MaxEmailLength = 254;

    public long Id { get; set; }

    public long BoardId { get; set; }

    /// <summary>Куда слать. Называет тот, кто просит; проверяет владелец.</summary>
    public string Email { get; set; } = string.Empty;

    /// <summary>
    /// Ключ участника, который попросил. У отправки себе это ключ
    /// владельца: тогда просьбы не было, но запись всё равно нужна —
    /// по ней считается предел.
    /// </summary>
    public string AskedBy { get; set; } = string.Empty;

    /// <summary>Как участник представился на доске — владельцу нужно имя, а не ключ.</summary>
    public string AskedName { get; set; } = string.Empty;

    public string Status { get; set; } = StatusPending;

    public DateTime CreatedAt { get; set; }

    public DateTime? ResolvedAt { get; set; }

    public Board? Board { get; set; }
}
