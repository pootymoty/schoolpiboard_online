namespace SchoolPiBoard.Web.Data.Entities;

/// <summary>
/// Журнал согласий на автоматические списания.
///
/// Платёжная система требует хранить историю согласий, и требование это
/// разумное: спор о списании решается ответом на вопрос «когда и на что
/// человек соглашался». Галочка в интерфейсе такого ответа не даёт —
/// её состояние показывает только «сейчас».
///
/// Записывается и включение, и выключение: без второго нельзя показать,
/// что человек отозвал согласие раньше списания. Вместе с событием
/// сохраняется текст, под которым он его дал: формулировку на сайте
/// когда-нибудь поменяют, а согласие останется прежним.
/// </summary>
public class ConsentEvent
{
    /// <summary>Согласие на автоматические списания дано.</summary>
    public const string KindAutoRenewOn = "autorenew_on";

    /// <summary>Согласие отозвано.</summary>
    public const string KindAutoRenewOff = "autorenew_off";

    /// <summary>Дано при оформлении покупки.</summary>
    public const string SourcePurchase = "purchase";

    /// <summary>Переключено в личном кабинете.</summary>
    public const string SourceProfile = "profile";

    public const int MaxTextLength = 500;

    public long Id { get; set; }

    public long UserId { get; set; }

    public string Kind { get; set; } = KindAutoRenewOn;

    public string Source { get; set; } = SourceProfile;

    /// <summary>Текст, под которым дано согласие. Пусто при отзыве.</summary>
    public string Text { get; set; } = string.Empty;

    /// <summary>Тариф и срок, к которым относилось согласие, — если оно дано при покупке.</summary>
    public string PlanCode { get; set; } = string.Empty;

    public int Days { get; set; }

    public int Amount { get; set; }

    /// <summary>
    /// Адрес, с которого пришло действие. Хранится потому, что в споре о
    /// списании это единственное, что связывает согласие с устройством.
    /// </summary>
    public string Ip { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public User? User { get; set; }
}
