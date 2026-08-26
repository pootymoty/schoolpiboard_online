using System.Security.Cryptography;
using System.Text;

namespace SchoolPiBoard.Web.Services;

/// <summary>
/// Хеширование паролей: PBKDF2-HMAC-SHA256.
///
/// Соль своя у каждого пароля, поэтому одинаковые пароли дают разные хеши и
/// радужные таблицы бесполезны. Число итераций хранится в самой строке —
/// иначе поднять его со временем было бы нельзя, не сломав старые пароли.
/// </summary>
public static class PasswordHasher
{
    private const int Iterations = 210_000;
    private const int SaltSize = 16;
    private const int HashSize = 32;

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, HashSize);

        return $"pbkdf2-sha256${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public static bool Verify(string password, string stored)
    {
        var parts = stored.Split('$');
        if (parts.Length != 4 || parts[0] != "pbkdf2-sha256")
            return false;

        if (!int.TryParse(parts[1], out var iterations))
            return false;

        byte[] salt, expected;
        try
        {
            salt = Convert.FromBase64String(parts[2]);
            expected = Convert.FromBase64String(parts[3]);
        }
        catch (FormatException)
        {
            return false;
        }

        var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, expected.Length);

        // Сравнение за постоянное время: обычное сравнение по байтам выдаёт
        // длину совпавшего префикса через время ответа.
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
}

/// <summary>Одноразовые коды: для писем и для ссылок на доску.</summary>
public static class SecurityTokens
{
    /// <summary>
    /// 32 байта случайности — заметно больше требуемых заданием 128 бит.
    /// Для ссылки на доску это единственное, что защищает доску (раздел 5.3),
    /// поэтому генератор криптографический, а не Random.
    /// </summary>
    public static string Create() => Base64Url(RandomNumberGenerator.GetBytes(32));

    /// <summary>
    /// Хеш кода для хранения. SHA-256 без соли — намеренно: код уже
    /// случайный и длинный, перебирать его нечем, а соль сделала бы поиск
    /// по хешу невозможным.
    /// </summary>
    public static string HashOf(string token)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    private static string Base64Url(byte[] bytes)
        => Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');
}
