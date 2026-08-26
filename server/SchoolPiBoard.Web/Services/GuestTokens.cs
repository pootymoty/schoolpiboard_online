using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using SchoolPiBoard.Web.Configuration;

namespace SchoolPiBoard.Web.Services;

/// <summary>
/// Кто обращается к доске: участник с учётной записью или гость.
///
/// Гостя в базе нет, поэтому всё, что о нём известно, живёт в его токене.
/// Одно представление на обоих нужно затем, чтобы проверки прав в API и в
/// хабе писались один раз, а не двумя ветками с расходящейся логикой.
/// </summary>
public sealed record BoardActor(
    long BoardId,
    string Role,
    string DisplayName,
    long? UserId,
    string? GuestId)
{
    public bool IsGuest => UserId is null;

    public bool CanEdit => Role is "owner" or "editor";

    public bool CanManage => Role == "owner";
}

/// <summary>
/// Токен гостя: привязан к одной доске и ничего не даёт за её пределами.
///
/// Отдельно от токена входа намеренно. Гость — не учётная запись: он не может
/// открыть список досок, сменить пароль или войти на другую доску, и токен
/// не должен давать даже возможности попробовать.
/// </summary>
public sealed class GuestTokenService
{
    public const string Issuer = "schoolpiboard-web-guest";

    /// <summary>
    /// Двенадцать часов: занятие столько не длится, а переживать закрытую
    /// и снова открытую вкладку токен должен — иначе человек, свернувший
    /// браузер на перемене, вернулся бы к форме ввода имени.
    /// </summary>
    private const int LifetimeHours = 12;

    private readonly AppOptions _options;

    public GuestTokenService(AppOptions options) => _options = options;

    public string Create(long boardId, string role, string displayName, string guestId)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.JwtSigningKey));

        var token = new JwtSecurityToken(
            issuer: Issuer,
            audience: Issuer,
            claims: new[]
            {
                new Claim("board", boardId.ToString()),
                new Claim("role", role),
                new Claim("name", displayName),
                // Метка гостя. По ней он попадает в список отказа при выгоне —
                // это единственное, чем гость опознаётся между заходами.
                new Claim("gid", guestId)
            },
            expires: DateTime.UtcNow.AddHours(LifetimeHours),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>
    /// Разбирает гостевой токен. Возвращает null, если он недействителен —
    /// в том числе если подписан не нашим ключом или выпущен для другой доски.
    /// </summary>
    public BoardActor? Read(string? token, long boardId)
    {
        if (string.IsNullOrWhiteSpace(token))
            return null;

        var parameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = Issuer,
            ValidateAudience = true,
            ValidAudience = Issuer,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.JwtSigningKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };

        try
        {
            var principal = new JwtSecurityTokenHandler().ValidateToken(token, parameters, out _);

            var board = principal.FindFirst("board")?.Value;
            var role = principal.FindFirst("role")?.Value;
            var name = principal.FindFirst("name")?.Value;
            var guestId = principal.FindFirst("gid")?.Value;

            if (!long.TryParse(board, out var tokenBoardId) || tokenBoardId != boardId)
                return null;

            if (string.IsNullOrEmpty(role) || string.IsNullOrEmpty(name) || string.IsNullOrEmpty(guestId))
                return null;

            return new BoardActor(tokenBoardId, role, name, UserId: null, GuestId: guestId);
        }
        catch (Exception)
        {
            // Причина недействительности гостю не сообщается: она подсказала бы,
            // чем именно токен не подошёл.
            return null;
        }
    }
}
