using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using SchoolPiBoard.Web.Configuration;
using SchoolPiBoard.Web.Data.Entities;

namespace SchoolPiBoard.Web.Services;

/// <summary>
/// Выпуск и проверка токенов входа.
///
/// Вход живёт <see cref="IdleLifetime"/> — 12 часов — и, пока человек
/// пользуется сайтом, продлевается: браузер сам просит новый токен
/// (<c>POST /api/auth/refresh</c>). Не пользовался дольше — токен истёк,
/// нужно войти заново. Но и продлевать бесконечно нельзя: от самого входа
/// (claim <c>auth_time</c>, переносится в каждый продлённый токен) не
/// больше <see cref="AbsoluteLifetime"/> — 30 дней, потом вход заново.
/// Отзыв входов — <see cref="User.SessionsValidAfter"/>.
/// </summary>
public sealed class AuthTokenService
{
    private const string Issuer = "schoolpiboard-web";

    /// <summary>Время входа — секунды Unix, как и прочие времена в JWT.</summary>
    public const string AuthTimeClaim = "auth_time";

    public static readonly TimeSpan IdleLifetime = TimeSpan.FromHours(12);
    public static readonly TimeSpan AbsoluteLifetime = TimeSpan.FromDays(30);

    private readonly AppOptions _options;

    public AuthTokenService(AppOptions options) => _options = options;

    /// <summary>
    /// Новый токен. <paramref name="authTime"/> — когда человек вошёл; пусто —
    /// входит прямо сейчас (форма входа, подтверждение почты, сброс пароля).
    /// Продление передаёт время исходного входа, и предел в 30 дней от него
    /// не сдвигается.
    /// </summary>
    public string Create(User user, DateTime? authTime = null)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.JwtSigningKey));

        var now = DateTime.UtcNow;
        var since = authTime ?? now;
        var expires = Min(now + IdleLifetime, since + AbsoluteLifetime);

        var token = new JwtSecurityToken(
            issuer: Issuer,
            audience: Issuer,
            claims: new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, user.Email),
                new Claim(AuthTimeClaim, ToUnix(since).ToString(), ClaimValueTypes.Integer64),
                // Когда выпущен — по нему браузер решает, пора ли продлить.
                new Claim(JwtRegisteredClaimNames.Iat, ToUnix(now).ToString(), ClaimValueTypes.Integer64),
            },
            notBefore: now,
            expires: expires,
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>Время входа из токена; пусто — токен старого образца, без него.</summary>
    public static DateTime? AuthTimeOf(ClaimsPrincipal principal)
    {
        var raw = principal.FindFirst(AuthTimeClaim)?.Value;
        return long.TryParse(raw, out var seconds) ? DateTimeOffset.FromUnixTimeSeconds(seconds).UtcDateTime : null;
    }

    /// <summary>
    /// Действителен ли вход: время входа известно, 30 дней от него не
    /// прошло, и входы не отзывались позже него. Время округляется до
    /// секунды — с той же точностью оно лежит в токене.
    /// </summary>
    public static bool IsSessionAlive(DateTime? authTime, DateTime? sessionsValidAfter)
    {
        if (authTime is null) return false;
        if (DateTime.UtcNow - authTime.Value > AbsoluteLifetime) return false;
        return sessionsValidAfter is null || ToUnix(authTime.Value) >= ToUnix(sessionsValidAfter.Value);
    }

    /// <summary>Момент отзыва — с точностью до секунды, как время входа в токене.</summary>
    public static DateTime NowForRevocation() => DateTimeOffset.FromUnixTimeSeconds(ToUnix(DateTime.UtcNow)).UtcDateTime;

    private static long ToUnix(DateTime value) => new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Utc)).ToUnixTimeSeconds();

    private static DateTime Min(DateTime a, DateTime b) => a < b ? a : b;

    public static TokenValidationParameters CreateValidationParameters(AppOptions options)
        => new()
        {
            ValidateIssuer = true,
            ValidIssuer = Issuer,
            ValidateAudience = true,
            ValidAudience = Issuer,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(options.JwtSigningKey)),
            ValidateLifetime = true,
            // По умолчанию допускается пять минут расхождения часов. Протухший
            // токен должен переставать работать тогда же, когда написано в нём.
            ClockSkew = TimeSpan.Zero
        };
}
