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
        message.From.Add(new MailboxAddress("SchoolPiBoard", _options.From));
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
            "Подтверждение почты — SchoolPiBoard",
            $"""
             <p>Здравствуйте!</p>
             <p>Чтобы завершить регистрацию на доске SchoolPiBoard, перейдите по ссылке:</p>
             <p><a href="{link}">Подтвердить почту</a></p>
             <p>Ссылка действует {hours} ч. Если вы не регистрировались, письмо можно не читать.</p>
             """,
            $"""
             Здравствуйте!

             Чтобы завершить регистрацию на доске SchoolPiBoard, откройте ссылку:
             {link}

             Ссылка действует {hours} ч. Если вы не регистрировались, письмо можно не читать.
             """);

    public static (string Subject, string Html, string Text) ResetPassword(string link, int hours)
        => (
            "Восстановление пароля — SchoolPiBoard",
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
            $"Подписка оформлена: {planName} — SchoolPiBoard",
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
    /// Конспект занятия.
    ///
    /// Листы идут вложениями, а не ссылками: письмо должно открываться и
    /// через полгода, когда доски уже нет, а ссылка на неё ведёт в пустоту.
    /// </summary>
    public static (string Subject, string Html, string Text) Summary(string boardTitle, int pages)
    {
        var word = pages switch
        {
            1 => "лист",
            >= 2 and <= 4 => "листа",
            _ => "листов",
        };

        var name = string.IsNullOrWhiteSpace(boardTitle) ? "Занятие" : boardTitle;

        return (
            $"Конспект занятия: {name} — SchoolPiBoard",
            $"""
             <p>Здравствуйте!</p>
             <p>Во вложении конспект занятия «{name}» — {pages} {word}.</p>
             <p>Листы приложены картинками и открываются любым просмотрщиком.</p>
             """,
            $"""
             Здравствуйте!

             Во вложении конспект занятия «{name}» — {pages} {word}.

             Листы приложены картинками и открываются любым просмотрщиком.
             """);
    }

    /// <summary>Дата по-русски: в письме её читают глазами, а не разбирают кодом.</summary>
    private static string Day(DateTime moment)
        => moment.ToString("d MMMM yyyy", new System.Globalization.CultureInfo("ru-RU"));
}
