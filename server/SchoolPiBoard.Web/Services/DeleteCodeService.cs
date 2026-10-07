using System.Security.Cryptography;
using StackExchange.Redis;

namespace SchoolPiBoard.Web.Services;

/// <summary>
/// Подтверждение удаления учётной записи кодом из письма.
///
/// Раньше удаление подтверждалось паролем. Код надёжнее: пароль знает и
/// тот, кто его подсмотрел, а письмо приходит только хозяину почты. И у
/// тех, кто входит через «Школу π», пароля нет вовсе — удалить учётную
/// запись им было нечем.
///
/// Живёт в Redis, как код смены роли (RoleChangeService): нужен четверть
/// часа и после этого никому.
/// </summary>
public sealed class DeleteCodeService
{
    /// <summary>Сколько живёт код.</summary>
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(15);

    /// <summary>Сколько раз можно ошибиться. Дальше код сгорает.</summary>
    private const int MaxAttempts = 5;

    private readonly IConnectionMultiplexer _redis;

    public DeleteCodeService(IConnectionMultiplexer redis) => _redis = redis;

    /// <summary>Заводит код и возвращает его — письмо отправляет вызывающий.</summary>
    public async Task<string> IssueAsync(long userId)
    {
        // Шесть цифр, с ведущими нулями: действие необратимое, и запас
        // против перебора здесь важнее, чем у кода смены роли.
        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");

        var db = _redis.GetDatabase();
        await db.StringSetAsync(Key(userId), code, Lifetime);
        await db.KeyDeleteAsync(Attempts(userId));

        return code;
    }

    public async Task<RoleCodeOutcome> CheckAsync(long userId, string? code)
    {
        var db = _redis.GetDatabase();

        var stored = await db.StringGetAsync(Key(userId));
        if (stored.IsNullOrEmpty) return RoleCodeOutcome.Expired;

        var typed = new string((code ?? string.Empty).Where(char.IsDigit).ToArray());

        if (stored != typed)
        {
            var attempts = await db.StringIncrementAsync(Attempts(userId));
            await db.KeyExpireAsync(Attempts(userId), Lifetime);

            if (attempts >= MaxAttempts) await db.KeyDeleteAsync(Key(userId));

            return RoleCodeOutcome.Wrong;
        }

        await db.KeyDeleteAsync(Key(userId));
        await db.KeyDeleteAsync(Attempts(userId));

        return RoleCodeOutcome.Ok;
    }

    private static string Key(long userId) => $"delete:code:{userId}";

    private static string Attempts(long userId) => $"delete:tries:{userId}";
}
