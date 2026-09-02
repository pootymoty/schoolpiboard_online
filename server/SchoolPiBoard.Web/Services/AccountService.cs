using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Configuration;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;

namespace SchoolPiBoard.Web.Services;

public enum AccountOutcome
{
    Ok,
    BadRequest,
    InvalidCredentials,
    EmailNotConfirmed,
    EmailTaken,
    MailFailed
}

public sealed record AccountResult(AccountOutcome Outcome, User? User = null, string? Message = null);

/// <summary>
/// Регистрация, подтверждение почты, вход и восстановление пароля.
///
/// Учётная запись создаётся сразу, с признаком «почта не подтверждена»
/// (раздел 5.1 задания). Вход до подтверждения не пускает.
/// </summary>
public sealed class AccountService
{
    public const int MinPasswordLength = 8;
    private const int TokenLifetimeHours = 24;

    /// <summary>
    /// Хеш заведомо неподходящего пароля. Нужен, чтобы вход по незнакомому
    /// адресу занимал столько же времени, сколько по знакомому: иначе по
    /// времени ответа видно, зарегистрирован адрес или нет.
    /// </summary>
    private static readonly string DummyHash = PasswordHasher.Hash("не подходит никому");

    private readonly AppDbContext _db;
    private readonly AuthTokenService _tokens;
    private readonly IEmailSender _email;
    private readonly AppOptions _options;
    private readonly SubscriptionService _subscriptions;
    private readonly ILogger<AccountService> _logger;

    public AccountService(
        AppDbContext db,
        AuthTokenService tokens,
        IEmailSender email,
        AppOptions options,
        SubscriptionService subscriptions,
        ILogger<AccountService> logger)
    {
        _db = db;
        _tokens = tokens;
        _email = email;
        _options = options;
        _subscriptions = subscriptions;
        _logger = logger;
    }

    public async Task<AccountResult> RegisterAsync(
        string? displayName,
        string? email,
        string? password,
        string? passwordConfirm,
        CancellationToken cancellationToken)
    {
        var address = NormalizeEmail(email);
        if (address is null)
            return Bad("Проверьте адрес почты.");

        var name = (displayName ?? string.Empty).Trim();
        if (name.Length is 0 or > 100)
            return Bad("Укажите, как вас называть — от 1 до 100 символов.");

        if (string.IsNullOrEmpty(password) || password.Length < MinPasswordLength)
            return Bad($"Пароль должен быть не короче {MinPasswordLength} символов.");

        if (password != passwordConfirm)
            return Bad("Пароли не совпадают.");

        if (await _db.Users.AnyAsync(x => x.Email == address, cancellationToken))
            return new AccountResult(AccountOutcome.EmailTaken, Message: "Такая почта уже зарегистрирована.");

        var now = DateTime.UtcNow;

        var user = new User
        {
            Email = address,
            PasswordHash = PasswordHasher.Hash(password),
            DisplayName = name,
            EmailConfirmed = false,
            CreatedAt = now
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync(cancellationToken);

        var sent = await IssueEmailTokenAsync(user, EmailToken.KindConfirmEmail, "confirm", cancellationToken);

        return sent
            ? new AccountResult(AccountOutcome.Ok, user)
            : new AccountResult(AccountOutcome.MailFailed,
                Message: "Учётная запись создана, но письмо отправить не удалось. Запросите письмо ещё раз.");
    }

    public async Task<AccountResult> ConfirmEmailAsync(string? token, CancellationToken cancellationToken)
    {
        var record = await FindValidTokenAsync(token, EmailToken.KindConfirmEmail, cancellationToken);
        if (record?.User is null)
            return Bad("Ссылка недействительна или уже использована.");

        record.User.EmailConfirmed = true;
        record.UsedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(cancellationToken);

        // Пробный период выдаётся здесь, а не при регистрации: до
        // подтверждения почты учётной записью ещё нельзя пользоваться, и
        // дни утекали бы впустую. Выдаётся один раз — служба сама
        // откажет, если он уже был.
        await _subscriptions.StartTrialAsync(record.UserId, _options.TrialDays, cancellationToken);

        _logger.LogInformation("Подтверждена почта учётной записи {UserId}.", record.UserId);
        return new AccountResult(AccountOutcome.Ok, record.User);
    }

    public async Task<AccountResult> LoginAsync(string? email, string? password, CancellationToken cancellationToken)
    {
        var address = NormalizeEmail(email);
        var user = address is null
            ? null
            // Удалённая учётная запись входит в силу «такой нет»: строка
            // ещё полгода лежит в базе ради досок, но пользоваться ею нельзя.
            : await _db.Users.FirstOrDefaultAsync(x => x.Email == address && x.DeletedAt == null, cancellationToken);

        // Хеш проверяется всегда, даже когда учётной записи нет: см. DummyHash.
        var matches = PasswordHasher.Verify(password ?? string.Empty, user?.PasswordHash ?? DummyHash);

        if (user is null || !matches)
            return new AccountResult(AccountOutcome.InvalidCredentials, Message: "Почта или пароль не подошли.");

        if (!user.EmailConfirmed)
        {
            return new AccountResult(AccountOutcome.EmailNotConfirmed,
                Message: "Почта не подтверждена. Откройте ссылку из письма — или запросите письмо заново.");
        }

        user.LastSeenAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        return new AccountResult(AccountOutcome.Ok, user);
    }

    /// <summary>
    /// Повторная отправка письма с подтверждением и запрос смены пароля.
    ///
    /// Оба всегда отвечают успехом, даже если такого адреса нет: иначе форма
    /// превращается в способ проверять, кто зарегистрирован на сервисе.
    /// </summary>
    public async Task ResendConfirmationAsync(string? email, CancellationToken cancellationToken)
    {
        var address = NormalizeEmail(email);
        if (address is null) return;

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Email == address, cancellationToken);
        if (user is null || user.EmailConfirmed) return;

        await IssueEmailTokenAsync(user, EmailToken.KindConfirmEmail, "confirm", cancellationToken);
    }

    public async Task RequestPasswordResetAsync(string? email, CancellationToken cancellationToken)
    {
        var address = NormalizeEmail(email);
        if (address is null) return;

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Email == address, cancellationToken);
        if (user is null) return;

        await IssueEmailTokenAsync(user, EmailToken.KindResetPassword, "reset-password", cancellationToken);
    }

    public async Task<AccountResult> ResetPasswordAsync(
        string? token,
        string? password,
        string? passwordConfirm,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(password) || password.Length < MinPasswordLength)
            return Bad($"Пароль должен быть не короче {MinPasswordLength} символов.");

        if (password != passwordConfirm)
            return Bad("Пароли не совпадают.");

        var record = await FindValidTokenAsync(token, EmailToken.KindResetPassword, cancellationToken);
        if (record?.User is null)
            return Bad("Ссылка недействительна или уже использована.");

        record.User.PasswordHash = PasswordHasher.Hash(password);
        record.UsedAt = DateTime.UtcNow;

        // Смена пароля заодно подтверждает почту: человек только что доказал,
        // что письмо на этот адрес дошло до него.
        record.User.EmailConfirmed = true;

        await _db.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Сменён пароль учётной записи {UserId}.", record.UserId);
        return new AccountResult(AccountOutcome.Ok, record.User);
    }

    public async Task<AccountResult> ChangeDisplayNameAsync(long userId, string? displayName, CancellationToken cancellationToken)
    {
        var name = (displayName ?? string.Empty).Trim();
        if (name.Length is 0 or > 100)
            return Bad("Имя — от 1 до 100 символов.");

        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId && x.DeletedAt == null, cancellationToken);
        if (user is null)
            return Bad("Учётная запись не найдена.");

        user.DisplayName = name;
        await _db.SaveChangesAsync(cancellationToken);

        return new AccountResult(AccountOutcome.Ok, user);
    }

    /// <summary>
    /// Удаление — по паролю, а не по одному нажатию кнопки: последствие
    /// необратимо для входа, и подтвердить его должен тот, кто знает пароль,
    /// а не тот, кто просто не закрыл сессию в чужом браузере.
    ///
    /// Строка не стирается: раздел о хранении данных даёт доскам ещё
    /// полгода жить для остальных участников. Их зачистит фоновая служба.
    /// </summary>
    public async Task<AccountResult> DeleteAccountAsync(long userId, string? password, CancellationToken cancellationToken)
    {
        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId && x.DeletedAt == null, cancellationToken);
        if (user is null)
            return Bad("Учётная запись не найдена.");

        if (!PasswordHasher.Verify(password ?? string.Empty, user.PasswordHash))
            return new AccountResult(AccountOutcome.InvalidCredentials, Message: "Пароль не подошёл.");

        user.DeletedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Удалена учётная запись {UserId}.", userId);
        return new AccountResult(AccountOutcome.Ok, user);
    }

    public string CreateAuthToken(User user) => _tokens.Create(user);

    private async Task<bool> IssueEmailTokenAsync(User user, string kind, string path, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;

        // Прежние неиспользованные коды того же вида гасим: иначе старое
        // письмо продолжало бы работать после того, как человек запросил новое.
        var previous = await _db.EmailTokens
            .Where(x => x.UserId == user.Id && x.Kind == kind && x.UsedAt == null)
            .ToListAsync(cancellationToken);

        foreach (var stale in previous)
            stale.UsedAt = now;

        var token = SecurityTokens.Create();

        _db.EmailTokens.Add(new EmailToken
        {
            UserId = user.Id,
            Kind = kind,
            TokenHash = SecurityTokens.HashOf(token),
            CreatedAt = now,
            ExpiresAt = now.AddHours(TokenLifetimeHours)
        });

        await _db.SaveChangesAsync(cancellationToken);

        var link = $"{_options.PublicUrl}/{path}?token={Uri.EscapeDataString(token)}";

        var letter = kind == EmailToken.KindResetPassword
            ? EmailTemplates.ResetPassword(link, TokenLifetimeHours)
            : EmailTemplates.ConfirmEmail(link, TokenLifetimeHours);

        return await _email.SendAsync(user.Email, letter.Subject, letter.Html, letter.Text, cancellationToken);
    }

    private async Task<EmailToken?> FindValidTokenAsync(string? token, string kind, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token))
            return null;

        var hash = SecurityTokens.HashOf(token);
        var now = DateTime.UtcNow;

        return await _db.EmailTokens
            .Include(x => x.User)
            .FirstOrDefaultAsync(
                x => x.TokenHash == hash && x.Kind == kind && x.UsedAt == null && x.ExpiresAt > now,
                cancellationToken);
    }

    /// <summary>
    /// Приводит адрес к нижнему регистру и проверяет на пригодность.
    /// В нижнем регистре — потому что на этом держится уникальный индекс:
    /// иначе Ivan@ и ivan@ стали бы разными учётными записями.
    /// </summary>
    private static string? NormalizeEmail(string? email)
    {
        var value = (email ?? string.Empty).Trim().ToLowerInvariant();

        if (value.Length is 0 or > 254)
            return null;

        var at = value.IndexOf('@');
        if (at <= 0 || at == value.Length - 1)
            return null;

        // Точка в домене обязательна, пробелов быть не должно.
        var domain = value[(at + 1)..];
        if (!domain.Contains('.') || value.Any(char.IsWhiteSpace))
            return null;

        return value;
    }

    private static AccountResult Bad(string message) => new(AccountOutcome.BadRequest, Message: message);
}
