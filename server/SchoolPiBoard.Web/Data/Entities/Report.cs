namespace SchoolPiBoard.Web.Data.Entities;

/// <summary>
/// Жалоба на доску — от участника, который увидел на ней запрещённое.
///
/// Хранится, а не только уходит письмом: письмо потеряется среди прочей
/// почты, а строка в списке администратора — нет, и по отметке о разборе
/// видно, что с жалобой уже сделали.
///
/// На отправителя нет внешнего ключа намеренно: это справочная пометка
/// для администратора, а не связь, которая должна жить и меняться вместе
/// с учётной записью — удалённый пользователь не должен утаскивать за
/// собой историю поданных им жалоб.
/// </summary>
public class Report
{
    public long Id { get; set; }

    public long BoardId { get; set; }

    /// <summary>Кто пожаловался, если вошёл в учётную запись.</summary>
    public long? ReporterUserId { get; set; }

    /// <summary>Имя, под которым зашёл гость, если он пожаловался без учётной записи.</summary>
    public string? ReporterGuestName { get; set; }

    public string Comment { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    /// <summary>null — жалоба открыта и ждёт разбора.</summary>
    public DateTime? ResolvedAt { get; set; }

    public Board? Board { get; set; }
}
