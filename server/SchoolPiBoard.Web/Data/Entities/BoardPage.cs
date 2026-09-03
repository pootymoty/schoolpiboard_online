namespace SchoolPiBoard.Web.Data.Entities;

/// <summary>
/// Страница доски.
///
/// Занятие идёт не по одному бесконечному холсту, а по страницам: «задача
/// один», «задача два». Так у занятия появляется порядок, а найти нужное
/// можно не рассматривая карту целиком.
///
/// У каждой страницы своя видимость. Это не только удобство: страница,
/// открытая одному ученику, — единственный способ дать ему решать
/// самостоятельно, не показывая решение остальным.
/// </summary>
public class BoardPage
{
    /// <summary>Страницу видят все, кто на доске. Так заводится каждая новая.</summary>
    public const string VisibilityAll = "all";

    /// <summary>Страницу видят только перечисленные участники и владелец.</summary>
    public const string VisibilitySelected = "selected";

    /// <summary>Страницу видит только владелец доски.</summary>
    public const string VisibilityOwner = "owner";

    public static readonly string[] Visibilities = { VisibilityAll, VisibilitySelected, VisibilityOwner };

    /// <summary>
    /// Сколько страниц помещается на доске.
    ///
    /// Предел есть, потому что страницы бесплатны для того, кто их
    /// заводит, и дороги для того, кто их хранит. Сотни на одном занятии
    /// не бывает.
    /// </summary>
    public const int MaxPerBoard = 60;

    public long Id { get; set; }

    public long BoardId { get; set; }

    public string Title { get; set; } = string.Empty;

    /// <summary>Порядок в полосе страниц: меньше — левее.</summary>
    public int Sort { get; set; }

    public string Visibility { get; set; } = VisibilityAll;

    public DateTime CreatedAt { get; set; }

    public Board? Board { get; set; }
}

/// <summary>
/// Кому открыта страница с выборочной видимостью.
///
/// Участник записан ключом, а не номером учётной записи: на доску ходят и
/// гости, у которых учётной записи нет вовсе. Ключ гостя живёт столько
/// же, сколько его пропуск, — то есть занятие; учётной записи — всегда.
/// </summary>
public class BoardPageViewer
{
    /// <summary>Ключ участника с учётной записью.</summary>
    public static string ForUser(long userId) => $"u:{userId}";

    /// <summary>Ключ гостя, пришедшего по ссылке.</summary>
    public static string ForGuest(string guestId) => $"g:{guestId}";

    public long Id { get; set; }

    public long PageId { get; set; }

    public string ParticipantKey { get; set; } = string.Empty;

    public BoardPage? Page { get; set; }
}
