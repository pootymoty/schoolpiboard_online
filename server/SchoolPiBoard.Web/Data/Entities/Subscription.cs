namespace SchoolPiBoard.Web.Data.Entities;

/// <summary>
/// Оплаченный или пробный срок на тарифе.
///
/// Состояния у подписки нет: она действует по времени, и «действует
/// сейчас» — это сравнение с текущим моментом. Поле состояния рано или
/// поздно разошлось бы с действительностью.
///
/// Бесплатного уровня здесь нет намеренно: он не кончается, и строка с
/// датой окончания «никогда» только просила бы её однажды проверить.
/// Нет действующей подписки — значит бесплатный.
/// </summary>
public class Subscription
{
    public const string KindTrial = "trial";
    public const string KindPaid = "paid";

    /// <summary>Оплата прошла через сервер ключей.</summary>
    public const string SourceKeys = "keys";

    /// <summary>Выдано руками владельца сервиса.</summary>
    public const string SourceManual = "manual";

    /// <summary>Пробный период при подтверждении почты.</summary>
    public const string SourceTrial = "trial";

    public long Id { get; set; }

    public long UserId { get; set; }

    public int PlanId { get; set; }

    public string Kind { get; set; } = KindPaid;

    public DateTime StartsAt { get; set; }

    public DateTime EndsAt { get; set; }

    public string Source { get; set; } = SourceKeys;

    /// <summary>
    /// Номер счёта на сервере ключей. Уникален: повторный обратный вызов
    /// с тем же номером не должен продлевать срок дважды.
    /// </summary>
    public string? InvoiceId { get; set; }

    /// <summary>
    /// Продлевать ли автоматически. Списание делает сервер ключей — у
    /// доски нет и не должно быть платёжных данных.
    /// </summary>
    public bool AutoRenew { get; set; }

    public DateTime CreatedAt { get; set; }

    public Plan? Plan { get; set; }

    public bool IsActiveAt(DateTime moment) => StartsAt <= moment && moment < EndsAt;
}
