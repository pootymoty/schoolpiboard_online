using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;
using SchoolPiBoard.Web.Configuration;

namespace SchoolPiBoard.Web.Services;

public interface IEmailSender
{
    Task<bool> SendAsync(string to, string subject, string html, string text, CancellationToken cancellationToken);
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

    public async Task<bool> SendAsync(string to, string subject, string html, string text, CancellationToken cancellationToken)
    {
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress("SchoolPiBoard", _options.From));
        message.To.Add(MailboxAddress.Parse(to));
        message.Subject = subject;
        message.Body = new BodyBuilder { HtmlBody = html, TextBody = text }.ToMessageBody();

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
}
