namespace SchoolPiBoard.Web.Data.Entities;

/// <summary>
/// Участник доски, вошедший под своей учётной записью.
///
/// Гостей здесь нет и не будет: у гостя нет ничего, что переживёт закрытие
/// вкладки, и запись о нём была бы записью ни о ком (раздел 5.3).
///
/// Появление этой строки — то, ради чего стоит входить под учётной записью:
/// дальше доступ держится на ней, а не на ссылке. Доска остаётся в списке,
/// и отзыв ссылки её не забирает — иначе человек терял бы доску из-за
/// действия, которого не совершал.
/// </summary>
public class BoardMember
{
    public const string RoleOwner = "owner";
    public const string RoleEditor = "editor";
    public const string RoleViewer = "viewer";

    public const string SourceOwner = "owner";
    public const string SourceLink = "link";

    public long Id { get; set; }

    public long BoardId { get; set; }

    public long UserId { get; set; }

    /// <summary>owner, editor или viewer.</summary>
    public string Role { get; set; } = string.Empty;

    /// <summary>owner — создал доску, link — вошёл по ссылке.</summary>
    public string Source { get; set; } = string.Empty;

    public DateTime JoinedAt { get; set; }

    /// <summary>
    /// Закрытый доступ. Доска пропадает из списка, войти нельзя.
    /// В отличие от «выгнать», действует до отмены владельцем.
    /// </summary>
    public DateTime? BannedAt { get; set; }

    public Board? Board { get; set; }

    public User? User { get; set; }

    public bool CanEdit => BannedAt is null && Role is RoleOwner or RoleEditor;

    public bool CanManage => BannedAt is null && Role == RoleOwner;
}
