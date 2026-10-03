using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Configuration;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;

namespace SchoolPiBoard.Web.Services;

/// <summary>Кто вошёл в «Школе π» — по ответу её userinfo.</summary>
public sealed record SchoolPiProfile(string Id, string Email, bool EmailVerified, string Name);

/// <summary>
/// Подписанная записка, которую доска отдаёт браузеру и потом принимает
/// обратно: состояние входа (state), предложение связать учётные записи,
/// ссылка из письма. Хранить их на сервере незачем — подпись ключом
/// службы не даёт ни подделать записку, ни поменять в ней номер.
/// </summary>
public sealed class SchoolPiTicket
{
    public const string PurposeState = "state";
    public const string PurposeLink = "link";
    public const string PurposeMail = "mail";

    public string Purpose { get; set; } = string.Empty;

    /// <summary>Случайная метка, общая со служебной кукой: state чужого браузера не подойдёт.</summary>
    public string? Nonce { get; set; }

    /// <summary>Для state: «login» или «link» (привязать к уже вошедшему).</summary>
    public string? Mode { get; set; }

    /// <summary>Учётная запись доски: для привязки — та, к которой привязываем.</summary>
    public long? UserId { get; set; }

    public string? ExternalId { get; set; }

    public string? Email { get; set; }

    public string? Name { get; set; }

    public long Expires { get; set; }
}

/// <summary>Чем кончился вход через школу.</summary>
public enum SchoolPiOutcome
{
    /// <summary>Вошёл: выдан токен доски.</summary>
    SignedIn,

    /// <summary>На доске есть учётная запись с той же почтой — нужно подтвердить, что она его.</summary>
    NeedsConfirmation,

    /// <summary>Аккаунт школы привязан к учётной записи, в которую человек уже вошёл.</summary>
    Linked,

    Failed
}

public sealed record SchoolPiResult(
    SchoolPiOutcome Outcome,
    User? User = null,
    SchoolBonus? Bonus = null,
    string? Ticket = null,
    string? Error = null,
    string? Message = null)
{
    public static SchoolPiResult Fail(string error, string message) => new(SchoolPiOutcome.Failed, Error: error, Message: message);
}

/// <summary>
/// Вход через «Школу π» и привязка аккаунта школы к учётной записи доски.
///
/// Учётные записи сопоставляются по номеру пользователя школы
/// (<c>users.external_id</c>), а не по почте: почту можно сменить, номер —
/// нет. Почта нужна один раз — при первом входе, чтобы найти уже
/// заведённую на доске учётную запись:
///
/// <list type="bullet">
/// <item>с подтверждённой почтой — склеиваем только после того, как
/// человек докажет, что она его: паролем от доски или ссылкой из письма.
/// Одного совпадения адресов мало: если хоть где-то почту подтвердили
/// слабо, это был бы вход в чужие доски;</item>
/// <item>с неподтверждённой — в неё ни разу не входили (вход до
/// подтверждения закрыт), досок и оплат в ней нет, и скорее всего её
/// завёл кто-то другой на чужой адрес. Её занимаем: пароль затираем,
/// прежние входы отзываем;</item>
/// <item>учётной записи нет — заводим новую, без пароля. Пароль можно
/// задать потом через «Сменить пароль».</item>
/// </list>
///
/// После привязки дарится неделя «Расширенного» — см.
/// <see cref="SubscriptionService.GrantSchoolBonusAsync"/>.
/// </summary>
public sealed class SchoolPiAuthService
{
    public const string ModeLogin = "login";
    public const string ModeLink = "link";

    /// <summary>Служебная кука с меткой входа. Живёт, пока человек на стороне школы.</summary>
    public const string NonceCookie = "spb_schoolpi";

    public static readonly TimeSpan StateLifetime = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan LinkLifetime = TimeSpan.FromMinutes(30);
    private static readonly TimeSpan MailLifetime = TimeSpan.FromHours(1);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly AppOptions _options;
    private readonly IHttpClientFactory _http;
    private readonly AccountService _accounts;
    private readonly SubscriptionService _subscriptions;
    private readonly IEmailSender _email;
    private readonly ILogger<SchoolPiAuthService> _log;

    public SchoolPiAuthService(
        AppDbContext db,
        AppOptions options,
        IHttpClientFactory http,
        AccountService accounts,
        SubscriptionService subscriptions,
        IEmailSender email,
        ILogger<SchoolPiAuthService> log)
    {
        _db = db;
        _options = options;
        _http = http;
        _accounts = accounts;
        _subscriptions = subscriptions;
        _email = email;
        _log = log;
    }

    public bool IsConfigured => _options.SchoolPi.IsConfigured;

    public string CallbackUrl => $"{_options.PublicUrl}/api/auth/schoolpi/callback";

    // ---------- Переход в школу ----------

    /// <summary>Куда отправить браузер и какую метку положить ему в куку.</summary>
    public (string Url, string Nonce) Begin(string mode, long? userId)
    {
        var nonce = SecurityTokens.Create();

        var state = Sign(new SchoolPiTicket
        {
            Purpose = SchoolPiTicket.PurposeState,
            Nonce = nonce,
            Mode = mode,
            UserId = userId,
            Expires = Expiry(StateLifetime)
        });

        var school = _options.SchoolPi;
        var url = $"{school.BaseUrl}/oauth/authorize"
            + $"?response_type=code"
            + $"&client_id={Uri.EscapeDataString(school.ClientId)}"
            + $"&redirect_uri={Uri.EscapeDataString(CallbackUrl)}"
            + $"&state={Uri.EscapeDataString(state)}";

        return (url, nonce);
    }

    /// <summary>
    /// Проверяет state из возврата: подпись, срок и совпадение с меткой из
    /// куки. Без последнего чужой человек мог бы подсунуть свою ссылку
    /// возврата — и браузер жертвы вошёл бы в его учётную запись.
    /// </summary>
    public SchoolPiTicket? ReadState(string? state, string? cookieNonce)
    {
        var ticket = Read(state, SchoolPiTicket.PurposeState);
        if (ticket?.Nonce is null || string.IsNullOrEmpty(cookieNonce)) return null;

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(ticket.Nonce), Encoding.UTF8.GetBytes(cookieNonce))
            ? ticket
            : null;
    }

    // ---------- Обмен кода ----------

    /// <summary>Меняет код из возврата на профиль пользователя школы. Пусто — не вышло.</summary>
    public async Task<SchoolPiProfile?> FetchProfileAsync(string code, CancellationToken cancellationToken)
    {
        var school = _options.SchoolPi;
        var client = _http.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(15);

        try
        {
            using var tokenResponse = await client.PostAsync(
                $"{school.BaseUrl}/oauth/token",
                new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["grant_type"] = "authorization_code",
                    ["code"] = code,
                    ["redirect_uri"] = CallbackUrl,
                    ["client_id"] = school.ClientId,
                    ["client_secret"] = school.ClientSecret
                }),
                cancellationToken);

            if (!tokenResponse.IsSuccessStatusCode)
            {
                _log.LogWarning("Школа π не обменяла код: {Status}.", (int)tokenResponse.StatusCode);
                return null;
            }

            var token = JsonNode.Parse(await tokenResponse.Content.ReadAsStringAsync(cancellationToken));
            var accessToken = Text(token, "access_token");
            if (accessToken is null)
            {
                _log.LogWarning("Школа π ответила на обмен кода без access_token.");
                return null;
            }

            using var request = new HttpRequestMessage(HttpMethod.Get, $"{school.BaseUrl}/oauth/userinfo");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            using var infoResponse = await client.SendAsync(request, cancellationToken);
            if (!infoResponse.IsSuccessStatusCode)
            {
                _log.LogWarning("Школа π не отдала userinfo: {Status}.", (int)infoResponse.StatusCode);
                return null;
            }

            var info = JsonNode.Parse(await infoResponse.Content.ReadAsStringAsync(cancellationToken));

            var id = Text(info, "sub") ?? Text(info, "id") ?? Text(info, "user_id");
            var email = Text(info, "email")?.Trim().ToLowerInvariant();

            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(email))
            {
                _log.LogWarning("В userinfo Школы π нет номера пользователя или почты.");
                return null;
            }

            var name = Text(info, "name") ?? Text(info, "display_name") ?? Text(info, "full_name")
                ?? Text(info, "username") ?? string.Empty;

            return new SchoolPiProfile(id.Trim(), email, Flag(info, "email_verified"), name.Trim());
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            _log.LogWarning(ex, "Не удалось связаться со Школой π.");
            return null;
        }
    }

    // ---------- Вход ----------

    /// <summary>Вход через школу: найти, склеить или завести учётную запись.</summary>
    public async Task<SchoolPiResult> SignInAsync(SchoolPiProfile profile, CancellationToken cancellationToken)
    {
        var linked = await _db.Users.FirstOrDefaultAsync(
            x => x.ExternalId == profile.Id && x.DeletedAt == null, cancellationToken);

        if (linked is not null)
        {
            await SyncEmailAsync(linked, profile, cancellationToken);

            // Обычно бонус уже выдан при привязке, и служба просто
            // откажет. Но если тогда что-то сорвалось — выдаём сейчас:
            // отметка о бонусе одна, дважды он не выдастся.
            var bonus = await GrantBonusAsync(linked, cancellationToken);
            return await SignedInAsync(linked, bonus, cancellationToken);
        }

        // Дальше учётная запись ищется по почте — и только по почте,
        // которую школа подтвердила.
        if (!profile.EmailVerified)
        {
            return SchoolPiResult.Fail("email_not_verified",
                "В Школе π не подтверждена почта. Подтвердите её там и попробуйте снова.");
        }

        var byEmail = await _db.Users.FirstOrDefaultAsync(
            x => x.Email == profile.Email && x.DeletedAt == null, cancellationToken);

        if (byEmail is not null)
        {
            if (byEmail.ExternalId is not null)
            {
                return SchoolPiResult.Fail("email_linked_other",
                    "Учётная запись доски с этой почтой уже связана с другим аккаунтом Школы π.");
            }

            if (byEmail.EmailConfirmed)
            {
                var ticket = Sign(new SchoolPiTicket
                {
                    Purpose = SchoolPiTicket.PurposeLink,
                    UserId = byEmail.Id,
                    ExternalId = profile.Id,
                    Email = profile.Email,
                    Name = profile.Name,
                    Expires = Expiry(LinkLifetime)
                });

                return new SchoolPiResult(SchoolPiOutcome.NeedsConfirmation, byEmail, Ticket: ticket);
            }

            return await TakeOverAsync(byEmail, profile, cancellationToken);
        }

        return await CreateAsync(profile, cancellationToken);
    }

    /// <summary>
    /// Учётная запись с неподтверждённой почтой: её никто ни разу не
    /// открывал, и войти в неё можно было только по чужой почте. Теперь
    /// хозяин почты — тот, кого подтвердила школа.
    /// </summary>
    private async Task<SchoolPiResult> TakeOverAsync(User user, SchoolPiProfile profile, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;

        user.ExternalId = profile.Id;
        user.EmailConfirmed = true;
        user.PasswordHash = PasswordHasher.Hash(SecurityTokens.Create());
        user.SessionsValidAfter = AuthTokenService.NowForRevocation();
        if (NameOf(profile) is { } name) user.DisplayName = name;

        // Письма, отправленные на эту запись раньше, больше не должны
        // работать: ими её мог бы забрать обратно тот, кто её завёл.
        var pending = await _db.EmailTokens
            .Where(x => x.UserId == user.Id && x.UsedAt == null)
            .ToListAsync(cancellationToken);

        foreach (var token in pending) token.UsedAt = now;

        await _db.SaveChangesAsync(cancellationToken);

        _log.LogInformation(
            "Учётная запись {UserId} с неподтверждённой почтой занята аккаунтом Школы π.", user.Id);

        var bonus = await GrantBonusAsync(user, cancellationToken);
        return await SignedInAsync(user, bonus, cancellationToken);
    }

    private async Task<SchoolPiResult> CreateAsync(SchoolPiProfile profile, CancellationToken cancellationToken)
    {
        var user = new User
        {
            Email = profile.Email,
            // Пароля у такой учётной записи нет: вход — через школу. Хеш
            // от случайной строки не подходит ни к одному паролю, а задать
            // свой можно кнопкой «Сменить пароль».
            PasswordHash = PasswordHasher.Hash(SecurityTokens.Create()),
            DisplayName = NameOf(profile) ?? profile.Email.Split('@')[0],
            ExternalId = profile.Id,
            EmailConfirmed = true,
            CreatedAt = DateTime.UtcNow
        };

        _db.Users.Add(user);

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Почту или номер школы успел занять параллельный вход.
            return SchoolPiResult.Fail("conflict", "Не получилось — попробуйте войти ещё раз.");
        }

        _log.LogInformation("Учётная запись {UserId} заведена входом через Школу π.", user.Id);

        var bonus = await GrantBonusAsync(user, cancellationToken);
        return await SignedInAsync(user, bonus, cancellationToken);
    }

    // ---------- Подтверждение склейки ----------

    /// <summary>Склейка с подтверждением паролем от доски.</summary>
    public async Task<SchoolPiResult> ConfirmByPasswordAsync(
        string? ticket, string? password, CancellationToken cancellationToken)
    {
        var note = Read(ticket, SchoolPiTicket.PurposeLink, out var expired);
        if (note is null) return expired ? TimedOut(LinkLifetime) : Broken();

        var user = await PendingUserAsync(note, cancellationToken);
        if (user is null) return Changed();

        if (!PasswordHasher.Verify(password ?? string.Empty, user.PasswordHash))
        {
            return SchoolPiResult.Fail("bad_password",
                "Пароль не подошёл. Попробуйте ещё раз — или пришлите ссылку на почту.");
        }

        return await LinkAndSignInAsync(user, note, cancellationToken);
    }

    /// <summary>
    /// Письмо со ссылкой для склейки — для тех, кто не помнит пароль от
    /// доски. Уходит на почту учётной записи доски: открыть его — и есть
    /// доказательство, что она его.
    /// </summary>
    public async Task<SchoolPiResult> SendConfirmationAsync(string? ticket, CancellationToken cancellationToken)
    {
        var note = Read(ticket, SchoolPiTicket.PurposeLink, out var expired);
        if (note is null) return expired ? TimedOut(LinkLifetime) : Broken();

        var user = await PendingUserAsync(note, cancellationToken);
        if (user is null) return Changed();

        var mail = Sign(new SchoolPiTicket
        {
            Purpose = SchoolPiTicket.PurposeMail,
            UserId = user.Id,
            ExternalId = note.ExternalId,
            Email = note.Email,
            Name = note.Name,
            Expires = Expiry(MailLifetime)
        });

        var link = $"{_options.PublicUrl}/auth/schoolpi?confirm={Uri.EscapeDataString(mail)}";
        var letter = EmailTemplates.SchoolPiLink(link, (int)MailLifetime.TotalMinutes);

        var sent = await _email.SendAsync(user.Email, letter.Subject, letter.Html, letter.Text, cancellationToken);

        return sent
            ? new SchoolPiResult(SchoolPiOutcome.NeedsConfirmation, user)
            : SchoolPiResult.Fail("mail_failed", "Письмо отправить не удалось. Попробуйте ещё раз чуть позже.");
    }

    /// <summary>Склейка по ссылке из письма.</summary>
    public async Task<SchoolPiResult> ConfirmByMailAsync(string? ticket, CancellationToken cancellationToken)
    {
        var note = Read(ticket, SchoolPiTicket.PurposeMail, out var expired);
        if (note is null) return expired ? TimedOut(MailLifetime) : Broken();

        var user = await PendingUserAsync(note, cancellationToken);
        if (user is null) return Changed();

        return await LinkAndSignInAsync(user, note, cancellationToken);
    }

    // ---------- Привязка из профиля ----------

    /// <summary>
    /// Привязка к учётной записи, в которую человек уже вошёл, — когда
    /// почты на доске и в школе разные и сами они друг друга не найдут.
    /// Доказательство владения — сам вход: человек уже в своей учётной
    /// записи и только что вошёл в школу.
    /// </summary>
    public async Task<SchoolPiResult> LinkAsync(long userId, SchoolPiProfile profile, CancellationToken cancellationToken)
    {
        var user = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId && x.DeletedAt == null, cancellationToken);
        if (user is null) return SchoolPiResult.Fail("expired", "Войдите на доску заново и повторите привязку.");

        if (user.ExternalId == profile.Id)
            return new SchoolPiResult(SchoolPiOutcome.Linked, user);

        if (user.ExternalId is not null)
        {
            return SchoolPiResult.Fail("already_linked",
                "К этой учётной записи уже привязан другой аккаунт Школы π.");
        }

        var taken = await _db.Users.AnyAsync(x => x.ExternalId == profile.Id && x.Id != user.Id, cancellationToken);
        if (taken)
        {
            return SchoolPiResult.Fail("school_linked_other",
                "Этот аккаунт Школы π уже привязан к другой учётной записи доски.");
        }

        user.ExternalId = profile.Id;
        await _db.SaveChangesAsync(cancellationToken);

        _log.LogInformation("К учётной записи {UserId} привязан аккаунт Школы π.", user.Id);

        var bonus = await GrantBonusAsync(user, cancellationToken);
        return new SchoolPiResult(SchoolPiOutcome.Linked, user, bonus);
    }

    // ---------- Общее ----------

    private async Task<SchoolPiResult> LinkAndSignInAsync(User user, SchoolPiTicket note, CancellationToken cancellationToken)
    {
        var taken = await _db.Users.AnyAsync(x => x.ExternalId == note.ExternalId && x.Id != user.Id, cancellationToken);
        if (taken)
        {
            return SchoolPiResult.Fail("school_linked_other",
                "Этот аккаунт Школы π уже привязан к другой учётной записи доски.");
        }

        if (user.ExternalId != note.ExternalId)
        {
            user.ExternalId = note.ExternalId;
            await _db.SaveChangesAsync(cancellationToken);

            _log.LogInformation("Учётная запись {UserId} связана с аккаунтом Школы π.", user.Id);
        }

        var bonus = await GrantBonusAsync(user, cancellationToken);
        return await SignedInAsync(user, bonus, cancellationToken);
    }

    /// <summary>
    /// Учётная запись из записки о склейке — если склейка с ней всё ещё
    /// возможна: жива, почта та же, и к ней не привязан другой аккаунт
    /// школы. Привязан этот же — тоже годится: это повтор (второе нажатие,
    /// повторная отправка формы после сбоя связи), и отвечать на него
    /// «ссылка устарела» значило бы пугать человека, у которого всё
    /// получилось.
    /// </summary>
    private async Task<User?> PendingUserAsync(SchoolPiTicket note, CancellationToken cancellationToken)
    {
        if (note.UserId is null || string.IsNullOrEmpty(note.ExternalId)) return null;

        var user = await _db.Users.FirstOrDefaultAsync(
            x => x.Id == note.UserId && x.DeletedAt == null, cancellationToken);

        return user is not null
            && (user.ExternalId is null || user.ExternalId == note.ExternalId)
            && user.Email == note.Email
            ? user
            : null;
    }

    private async Task<SchoolPiResult> SignedInAsync(User user, SchoolBonus? bonus, CancellationToken cancellationToken)
    {
        user.LastSeenAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        await _accounts.SyncRoleAsync(user, cancellationToken);

        return new SchoolPiResult(SchoolPiOutcome.SignedIn, user, bonus);
    }

    private async Task<SchoolBonus?> GrantBonusAsync(User user, CancellationToken cancellationToken)
    {
        if (user.ExternalId is null) return null;

        SchoolBonus? bonus;
        try
        {
            bonus = await _subscriptions.GrantSchoolBonusAsync(
                user.Id, user.ExternalId, _options.SchoolPi.BonusDays, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Чаще всего — параллельный вход успел выдать его первым
            // (уникальный индекс отметки). Транзакция откатилась, но
            // несохранённые строки ещё висят в контексте — их сбрасываем,
            // иначе следующее сохранение попробовало бы записать их снова.
            //
            // Что бы ни случилось с бонусом, вход от этого ломаться не
            // должен: учётные записи уже связаны, и ошибка здесь показала бы
            // человеку «не получилось» на самом деле удачном входе. Бонус
            // не записан — значит, его выдаст следующий вход через школу.
            _log.LogWarning(ex, "Бонус Школы π для {UserId} не выдан.", user.Id);
            _db.ChangeTracker.Clear();
            _db.Users.Attach(user);
            return null;
        }

        if (bonus is null) return null;

        // Письмо — тоже не повод сорвать вход: бонус уже выдан, а увидеть
        // его человек может и на сайте.
        try
        {
            var letter = EmailTemplates.SchoolPiBonus(bonus, _options.SchoolPi.BonusDays, _options.PublicUrl + "/plan");
            await _email.SendAsync(user.Email, letter.Subject, letter.Html, letter.Text, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _log.LogError(ex, "Письмо о бонусе Школы π для {UserId} не отправлено.", user.Id);
        }

        return bonus;
    }

    /// <summary>
    /// Почта сменилась в школе — меняем и на доске, если новый адрес не
    /// занят другой учётной записью. Занят — оставляем прежний: отбирать
    /// адрес у чужой учётной записи нельзя.
    /// </summary>
    private async Task SyncEmailAsync(User user, SchoolPiProfile profile, CancellationToken cancellationToken)
    {
        if (!profile.EmailVerified || user.Email == profile.Email) return;

        var taken = await _db.Users.AnyAsync(x => x.Email == profile.Email && x.Id != user.Id, cancellationToken);
        if (taken) return;

        user.Email = profile.Email;
        user.EmailConfirmed = true;

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
            _log.LogInformation("Почта учётной записи {UserId} обновлена по Школе π.", user.Id);
        }
        catch (DbUpdateException)
        {
            // Адрес заняли между проверкой и записью — оставляем прежний.
            _db.Entry(user).State = EntityState.Unchanged;
            await _db.Entry(user).ReloadAsync(cancellationToken);
        }
    }

    private static string? NameOf(SchoolPiProfile profile)
    {
        var name = profile.Name.Trim();
        if (name.Length == 0) return null;
        return name.Length > 100 ? name[..100] : name;
    }

    private static SchoolPiResult TimedOut(TimeSpan lifetime)
        => SchoolPiResult.Fail("expired",
            $"На подтверждение даётся {Minutes(lifetime)}, и это время вышло. Войдите через Школу π ещё раз.");

    private static SchoolPiResult Broken()
        => SchoolPiResult.Fail("invalid", "Ссылка неполная или повреждена. Войдите через Школу π ещё раз.");

    private static SchoolPiResult Changed()
        => SchoolPiResult.Fail("changed",
            "Пока шло подтверждение, учётная запись изменилась (сменилась почта или привязан другой аккаунт Школы π). "
            + "Войдите через Школу π ещё раз.");

    private static string Minutes(TimeSpan lifetime)
        => lifetime.TotalMinutes >= 60 ? $"{(int)lifetime.TotalHours} ч." : $"{(int)lifetime.TotalMinutes} мин.";

    private static long Expiry(TimeSpan lifetime) => DateTimeOffset.UtcNow.Add(lifetime).ToUnixTimeSeconds();

    // ---------- Подпись записок ----------

    private byte[] Key()
        // Ключ свой, производный от ключа подписи входов: записка не
        // должна годиться как токен входа, и наоборот.
        => HMACSHA256.HashData(Encoding.UTF8.GetBytes(_options.JwtSigningKey), Encoding.UTF8.GetBytes("schoolpi-ticket"));

    public string Sign(SchoolPiTicket ticket)
    {
        var body = Base64Url(JsonSerializer.SerializeToUtf8Bytes(ticket, Json));
        var signature = Base64Url(HMACSHA256.HashData(Key(), Encoding.ASCII.GetBytes(body)));
        return body + "." + signature;
    }

    public SchoolPiTicket? Read(string? value, string purpose) => Read(value, purpose, out _);

    /// <summary>Читает записку. <paramref name="expired"/> — подпись верна, но срок вышел.</summary>
    public SchoolPiTicket? Read(string? value, string purpose, out bool expired)
    {
        expired = false;
        if (string.IsNullOrWhiteSpace(value)) return null;

        var dot = value.IndexOf('.');
        if (dot <= 0 || dot == value.Length - 1) return null;

        var body = value[..dot];
        var expected = Base64Url(HMACSHA256.HashData(Key(), Encoding.ASCII.GetBytes(body)));

        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(value[(dot + 1)..])))
        {
            return null;
        }

        try
        {
            var ticket = JsonSerializer.Deserialize<SchoolPiTicket>(FromBase64Url(body), Json);
            if (ticket is null || ticket.Purpose != purpose) return null;
            if (ticket.Expires < DateTimeOffset.UtcNow.ToUnixTimeSeconds())
            {
                expired = true;
                return null;
            }

            return ticket;
        }
        catch (Exception ex) when (ex is JsonException or FormatException)
        {
            return null;
        }
    }

    private static string Base64Url(byte[] bytes)
        => Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');

    private static byte[] FromBase64Url(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded += (padded.Length % 4) switch { 2 => "==", 3 => "=", _ => string.Empty };
        return Convert.FromBase64String(padded);
    }

    // ---------- Разбор ответа школы ----------

    private static string? Text(JsonNode? node, string name)
    {
        if (node is not JsonObject obj || !obj.TryGetPropertyValue(name, out var value) || value is null)
            return null;

        return value is JsonValue scalar
            ? scalar.TryGetValue<string>(out var text) ? text : scalar.ToJsonString().Trim('"')
            : null;
    }

    private static bool Flag(JsonNode? node, string name)
    {
        if (node is not JsonObject obj || !obj.TryGetPropertyValue(name, out var value) || value is not JsonValue scalar)
            return false;

        if (scalar.TryGetValue<bool>(out var flag)) return flag;
        if (scalar.TryGetValue<string>(out var text)) return text.Equals("true", StringComparison.OrdinalIgnoreCase);
        return false;
    }
}
