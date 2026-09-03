namespace SchoolPiBoard.Web.Data.Entities;

/// <summary>
/// Заказ на оплату: что человек выбрал, уходя на форму Робокассы.
///
/// Нужен по двум причинам. Первая — история покупок: без неё человек,
/// вернувшийся с оплаты, не может проверить, что вообще происходило с его
/// деньгами. Вторая — выбор, сделанный до оплаты (начать сразу или после
/// текущего срока, продлевать ли автоматически): подтверждение приходит
/// позже и отдельным запросом, и вспомнить решение больше неоткуда.
///
/// Неудачных оплат здесь не будет: Робокасса сообщает только об успехе.
/// Заказ, по которому не пришло подтверждение, так и остаётся ожидающим —
/// и через сутки показывается как незавершённый. Придумывать ему отказ
/// нельзя: человек мог заплатить, а уведомление задержаться.
/// </summary>
public class BillingOrder
{
    public const string StatusPending = "pending";
    public const string StatusPaid = "paid";

    /// <summary>Через сколько незавершённый заказ показывается как брошенный.</summary>
    public static readonly TimeSpan PendingLifetime = TimeSpan.FromHours(24);

    public long Id { get; set; }

    public long UserId { get; set; }

    /// <summary>Номер счёта у сервера ключей. По нему приходит подтверждение.</summary>
    public string InvoiceId { get; set; } = string.Empty;

    public string PlanCode { get; set; } = string.Empty;

    /// <summary>
    /// Название тарифа на момент покупки. Хранится копией: тариф могут
    /// переименовать, а в истории должно остаться то, что человек купил.
    /// </summary>
    public string PlanName { get; set; } = string.Empty;

    public int Days { get; set; }

    /// <summary>Сумма в рублях — та, что ушла в Робокассу.</summary>
    public int Amount { get; set; }

    /// <summary>Просил ли покупатель продлевать автоматически.</summary>
    public bool AutoRenew { get; set; }

    /// <summary>
    /// Начать новый тариф сразу, оборвав действующий, а не встать в
    /// очередь за ним. Выбирает покупатель, и только вверх по уровню.
    /// </summary>
    public bool StartNow { get; set; }

    public string Status { get; set; } = StatusPending;

    public DateTime CreatedAt { get; set; }

    public DateTime? PaidAt { get; set; }
}
