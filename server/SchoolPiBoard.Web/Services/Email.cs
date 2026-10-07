using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;
using SchoolPiBoard.Web.Configuration;

namespace SchoolPiBoard.Web.Services;

/// <summary>Вложение письма: конспект уходит листами, а не ссылкой.</summary>
public sealed record EmailAttachment(string Name, byte[] Content, string ContentType);

public interface IEmailSender
{
    Task<bool> SendAsync(string to, string subject, string html, string text, CancellationToken cancellationToken);

    Task<bool> SendAsync(
        string to, string subject, string html, string text,
        IReadOnlyList<EmailAttachment> attachments, CancellationToken cancellationToken);
}

/// <summary>
/// Отправка через SMTP Яндекса. В MAIL_PASSWORD кладётся пароль приложения
/// из Яндекс ID, а не пароль от ящика: обычный пароль SMTP не примет.
/// </summary>
public sealed class SmtpEmailSender : IEmailSender
{
    private readonly MailOptions _options;
    private readonly ILogger<SmtpEmailSender> _logger;

    public SmtpEmailSender(AppOptions options, ILogger<SmtpEmailSender> logger)
    {
        _options = options.Mail;
        _logger = logger;
    }

    public Task<bool> SendAsync(string to, string subject, string html, string text, CancellationToken cancellationToken)
        => SendAsync(to, subject, html, text, Array.Empty<EmailAttachment>(), cancellationToken);

    public async Task<bool> SendAsync(
        string to, string subject, string html, string text,
        IReadOnlyList<EmailAttachment> attachments, CancellationToken cancellationToken)
    {
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress("Доска Пи", _options.From));
        message.To.Add(MailboxAddress.Parse(to));
        message.Subject = subject;

        var body = new BodyBuilder { HtmlBody = html, TextBody = text };

        foreach (var attachment in attachments)
            body.Attachments.Add(attachment.Name, attachment.Content, ContentType.Parse(attachment.ContentType));

        message.Body = body.ToMessageBody();

        try
        {
            using var client = new SmtpClient();

            // Порт 465 — SSL сразу, 587 — STARTTLS. Выбор по номеру порта,
            // а не отдельной настройкой: другого сочетания у Яндекса нет.
            var security = _options.Port == 465
                ? SecureSocketOptions.SslOnConnect
                : SecureSocketOptions.StartTls;

            await client.ConnectAsync(_options.Server, _options.Port, security, cancellationToken);
            await client.AuthenticateAsync(_options.Username, _options.Password, cancellationToken);
            await client.SendAsync(message, cancellationToken);
            await client.DisconnectAsync(true, cancellationToken);

            return true;
        }
        catch (Exception ex)
        {
            // Текст письма в лог не пишем: там ссылка подтверждения, которая
            // равносильна доступу к учётной записи.
            _logger.LogError(ex, "Не удалось отправить письмо на {Address}.", to);
            return false;
        }
    }
}

public static class EmailTemplates
{
    public static (string Subject, string Html, string Text) ConfirmEmail(string link, int hours)
        => (
            "Подтверждение почты — Доска Пи",
            $"""
             <p>Здравствуйте!</p>
             <p>Чтобы завершить регистрацию на доске «Доска Пи», перейдите по ссылке:</p>
             <p><a href="{link}">Подтвердить почту</a></p>
             <p>Ссылка действует {hours} ч. Если вы не регистрировались, письмо можно не читать.</p>
             """,
            $"""
             Здравствуйте!

             Чтобы завершить регистрацию на доске «Доска Пи», откройте ссылку:
             {link}

             Ссылка действует {hours} ч. Если вы не регистрировались, письмо можно не читать.
             """);

    public static (string Subject, string Html, string Text) ResetPassword(string link, int hours)
        => (
            "Восстановление пароля — Доска Пи",
            $"""
             <p>Здравствуйте!</p>
             <p>Вы запросили смену пароля. Задать новый можно по ссылке:</p>
             <p><a href="{link}">Задать новый пароль</a></p>
             <p>Ссылка действует {hours} ч. Если вы этого не делали, пароль останется прежним.</p>
             """,
            $"""
             Здравствуйте!

             Вы запросили смену пароля. Задать новый можно по ссылке:
             {link}

             Ссылка действует {hours} ч. Если вы этого не делали, пароль останется прежним.
             """);

    /// <summary>
    /// Подтверждение оплаты подписки.
    ///
    /// Это не чек: фискальный чек формирует платёжная система, и второй
    /// документ с тем же названием только запутал бы. Здесь — человеческое
    /// «что купили и до какого числа», которого в чеке нет: он показывает
    /// сумму, но не срок, а спрашивают всегда про срок.
    ///
    /// Дата начала указывается отдельно, когда срок отложенный: покупка
    /// поверх действующей подписки начинается не сегодня, и человек должен
    /// увидеть это письмом, а не обнаружить через месяц.
    /// </summary>
    public static (string Subject, string Html, string Text) SubscriptionPaid(
        string planName, int days, int amount, DateTime startsAt, DateTime endsAt, bool autoRenew)
    {
        var from = Day(startsAt);
        var to = Day(endsAt);
        var later = startsAt > DateTime.UtcNow.AddMinutes(5);

        var period = later
            ? $"Срок начнётся {from} и продлится до {to} — он встал в очередь за уже оплаченным."
            : $"Срок действует с {from} до {to}.";

        var renew = autoRenew
            ? "Автопродление включено: за сутки до конца срока спишется столько же с той же карты. "
              + "Отключить можно в любой момент в разделе «Мой тариф»."
            : "Автопродление выключено — ничего больше не спишется.";

        return (
            $"Подписка оформлена: {planName} — Доска Пи",
            $"""
             <p>Здравствуйте!</p>
             <p>Оплата получена. Тариф «{planName}», {days} дн., {amount} ₽.</p>
             <p>{period}</p>
             <p>{renew}</p>
             <p>Что доступно и сколько израсходовано — на странице «Мой тариф».</p>
             """,
            $"""
             Здравствуйте!

             Оплата получена. Тариф «{planName}», {days} дн., {amount} ₽.

             {period}

             {renew}

             Что доступно и сколько израсходовано — на странице «Мой тариф».
             """);
    }

    /// <summary>
    /// Конспект.
    ///
    /// Листы идут вложениями, а не ссылками: письмо должно открываться и
    /// через полгода, когда доски уже нет, а ссылка на неё ведёт в пустоту.
    /// </summary>
    public static (string Subject, string Html, string Text) Summary(string boardTitle, int pages, bool asPdf)
    {
        var word = pages switch
        {
            1 => "лист",
            >= 2 and <= 4 => "листа",
            _ => "листов",
        };

        var name = string.IsNullOrWhiteSpace(boardTitle) ? "Доска" : boardTitle;
        var how = asPdf ? "Конспект приложен одним PDF-файлом." : "Листы приложены картинками и открываются любым просмотрщиком.";

        return (
            $"Конспект: {name} — Доска Пи",
            $"""
             <p>Здравствуйте!</p>
             <p>Во вложении конспект «{name}» — {pages} {word}.</p>
             <p>{how}</p>
             """,
            $"""
             Здравствуйте!

             Во вложении конспект «{name}» — {pages} {word}.

             {how}
             """);
    }

    /// <summary>
    /// Предупреждение о предстоящем списании.
    ///
    /// Письмо приходит заранее, а не в момент списания: смысл в том,
    /// чтобы человек успел отказаться, если передумал. Поэтому в нём
    /// названы и сумма, и дата, и место, где выключается продление.
    /// </summary>
    public static (string Subject, string Html, string Text) RenewalSoon(
        string planName, int days, int amount, DateTime chargeAt, string planUrl)
    {
        var when = Day(chargeAt);

        return (
            $"Подписка продлится {when}: {planName} — Доска Пи",
            $"""
             <p>Здравствуйте!</p>
             <p>{when} мы спишем {amount} ₽ с карты, которой вы платили, и продлим тариф
             «{planName}» ещё на {days} дн. — вы включали автоматическое продление.</p>
             <p>Если продлевать не нужно, выключите автопродление до этой даты:
             <a href="{planUrl}">Мой тариф</a>. Оплаченные дни при этом остаются при вас.</p>
             """,
            $"""
             Здравствуйте!

             {when} мы спишем {amount} ₽ с карты, которой вы платили, и продлим тариф
             «{planName}» ещё на {days} дн. — вы включали автоматическое продление.

             Если продлевать не нужно, выключите автопродление до этой даты на странице
             «Мой тариф»: {planUrl}. Оплаченные дни при этом остаются при вас.
             """);
    }

    /// <summary>
    /// Код подтверждения смены роли.
    ///
    /// В письме назван и тот, кому меняют роль, и на что: код, пришедший
    /// без повода, должен читаться как «кто-то делает это от вашего
    /// имени», а не как обычная рассылка.
    /// </summary>
    /// <summary>Код подтверждения удаления учётной записи.</summary>
    public static (string Subject, string Html, string Text) DeleteCode(string code, int minutes)
        => (
            $"Код для удаления учётной записи: {code} — Доска Пи",
            $"""
             <p>Код для удаления учётной записи на «Доске Пи»: <b>{code}</b></p>
             <p>Введите его на странице профиля. После удаления войти станет нельзя,
             почта освободится сразу, а доски проработают у участников ещё полгода.</p>
             <p>Код действует {minutes} мин. Если вы этого не делали — не вводите код
             и смените пароль.</p>
             """,
            $"""
             Код для удаления учётной записи на «Доске Пи»: {code}

             Введите его на странице профиля. После удаления войти станет нельзя,
             почта освободится сразу, а доски проработают у участников ещё полгода.

             Код действует {minutes} мин. Если вы этого не делали — не вводите код
             и смените пароль.
             """);

    public static (string Subject, string Html, string Text) RoleCode(
        string code, string target, bool makeAdmin, int minutes)
    {
        var what = makeAdmin ? "выдать права администратора" : "снять права администратора";

        return (
            $"Код подтверждения: {code} — Доска Пи",
            $"""
             <p>Код подтверждения: <b>{code}</b></p>
             <p>Им подтверждается действие «{what}» для учётной записи {target}.</p>
             <p>Код действует {minutes} мин. Если вы этого не делали — не вводите код
             и смените пароль.</p>
             """,
            $"""
             Код подтверждения: {code}

             Им подтверждается действие «{what}» для учётной записи {target}.

             Код действует {minutes} мин. Если вы этого не делали — не вводите код
             и смените пароль.
             """);
    }

    /// <summary>
    /// Ссылка, подтверждающая, что учётная запись доски и аккаунт «Школы π»
    /// принадлежат одному человеку. Уходит на почту учётной записи доски.
    /// </summary>
    public static (string Subject, string Html, string Text) SchoolPiLink(string link, int minutes)
        => (
            "Вход через Школу π — Доска Пи",
            $"""
             <p>Здравствуйте!</p>
             <p>Вы входите на «Доску Пи» через Школу π, а на доске уже есть учётная запись с этой почтой.
             Чтобы связать их, перейдите по ссылке — доски, подписка и всё остальное останутся на месте:</p>
             <p><a href="{link}">Связать и войти</a></p>
             <p>Ссылка действует {minutes} мин. Если это были не вы, письмо можно не читать: без ссылки ничего не свяжется.</p>
             """,
            $"""
             Здравствуйте!

             Вы входите на «Доску Пи» через Школу π, а на доске уже есть учётная запись с этой почтой.
             Чтобы связать их, откройте ссылку — доски, подписка и всё остальное останутся на месте:
             {link}

             Ссылка действует {minutes} мин. Если это были не вы, письмо можно не читать: без ссылки ничего не свяжется.
             """);

    /// <summary>Бонус за вход через «Школу π»: что выдано и что стало с прежней подпиской.</summary>
    public static (string Subject, string Html, string Text) SchoolPiBonus(
        SchoolPiBoard.Web.Services.SchoolBonus bonus, int days, string planUrl)
    {
        var what = bonus.Kind switch
        {
            SchoolPiBoard.Web.Services.SchoolBonus.KindExtended =>
                $"К вашему тарифу «{bonus.PlanName}» добавлено {days} дн. — теперь он действует до {Day(bonus.Until)}.",
            SchoolPiBoard.Web.Services.SchoolBonus.KindPaused =>
                $"Вам начислено {days} дн. тарифа «{bonus.PlanName}» — до {Day(bonus.Until)}. "
                + $"Ваш тариф «{bonus.PausedPlan}» на это время поставлен на паузу и продолжится "
                + $"{Day(bonus.ResumesAt ?? bonus.Until)} — оставшиеся дни не пропадут.",
            _ =>
                $"Вам начислено {days} дн. тарифа «{bonus.PlanName}» — до {Day(bonus.Until)}."
        };

        return (
            $"Подарок за вход через Школу π: {days} дн. тарифа «{bonus.PlanName}» — Доска Пи",
            $"""
             <p>Здравствуйте!</p>
             <p>Спасибо, что вошли на «Доску Пи» через Школу π.</p>
             <p>{what}</p>
             <p>Подробности — на странице <a href="{planUrl}">«Мой тариф»</a>.</p>
             """,
            $"""
             Здравствуйте!

             Спасибо, что вошли на «Доску Пи» через Школу π.

             {what}

             Подробности — на странице «Мой тариф»: {planUrl}
             """);
    }

    private static readonly string[] Months =
    {
        "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря"
    };

    /// <summary>Сдвиг московского времени от UTC. Летнего времени в России нет.</summary>
    private static readonly TimeSpan Moscow = TimeSpan.FromHours(3);

    /// <summary>
    /// Дата по-русски: в письме её читают глазами, а не разбирают кодом.
    ///
    /// Месяцы — своим списком, а не через CultureInfo("ru-RU"): служба
    /// собирается без языковых данных (InvariantGlobalization в .csproj),
    /// и там такая культура не создаётся вовсе — бросает исключение. Из-за
    /// этого падали все письма с датой: об оплате, о скором списании, о
    /// подарке за вход через Школу π. Дата — по Москве: сроки в базе в
    /// UTC, и срок, кончающийся в 23:00 UTC, по-московски кончается уже
    /// на следующий день.
    /// </summary>
    private static string Day(DateTime moment)
    {
        var local = (moment.Kind == DateTimeKind.Local ? moment.ToUniversalTime() : moment) + Moscow;
        return $"{local.Day} {Months[local.Month - 1]} {local.Year}";
    }
}
