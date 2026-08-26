namespace SchoolPiBoard.Web.Data.Entities;

/// <summary>
/// Одноразовый код из письма: подтверждение почты и восстановление пароля.
///
/// Задание таблицу не описывает — она служебная. Отдельной таблицей, а не
/// колонками в Users, потому что кодов у одной учётной записи может быть
/// несколько сразу (запросил подтверждение, следом восстановление), и
/// у каждого свой срок жизни.
/// </summary>
public class EmailToken
{
    public const string KindConfirmEmail = "confirm_email";
    public const string KindResetPassword = "reset_password";

    public long Id { get; set; }

    public long UserId { get; set; }

    public string Kind { get; set; } = string.Empty;

    /// <summary>
    /// Хеш кода, а не сам код. Утечка таблицы не даёт подтвердить чужую почту
    /// и не даёт сбросить чужой пароль: восстановить код из хеша нельзя.
    /// </summary>
    public string TokenHash { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public DateTime ExpiresAt { get; set; }

    /// <summary>
    /// Когда код был использован. Использованный код не работает второй раз,
    /// но запись остаётся: по ней видно, что подтверждение действительно было.
    /// </summary>
    public DateTime? UsedAt { get; set; }

    public User? User { get; set; }
}
