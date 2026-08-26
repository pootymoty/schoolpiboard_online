using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using SchoolPiBoard.Web.Configuration;
using SchoolPiBoard.Web.Data.Entities;

namespace SchoolPiBoard.Web.Services;

/// <summary>Выпуск и проверка токенов входа.</summary>
public sealed class AuthTokenService
{
    private const string Issuer = "schoolpiboard-web";
    private const int LifetimeDays = 30;

    private readonly AppOptions _options;

    public AuthTokenService(AppOptions options) => _options = options;

    public string Create(User user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.JwtSigningKey));

        var token = new JwtSecurityToken(
            issuer: Issuer,
            audience: Issuer,
            claims: new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, user.Email)
            },
            expires: DateTime.UtcNow.AddDays(LifetimeDays),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

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
            // По умолчанию допускается пять минут расхождения часов. Для срока
            // жизни в 30 дней это ничего не решает, а протухший токен должен
            // переставать работать тогда же, когда написано в нём.
            ClockSkew = TimeSpan.Zero
        };
}
