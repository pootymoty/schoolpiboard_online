using System.Security.Cryptography;
using StackExchange.Redis;

namespace SchoolPiBoard.Web.Services;

public enum RoleCodeOutcome
{
    Ok,
    Wrong,
    Expired,
}

/// <summary>
/// Подтверждение смены роли кодом из письма.
///
/// Роль администратора открывает чужие покупки и чужие адреса, поэтому
/// одного нажатия для неё мало: угнанная сессия иначе выдавала бы права
/// сама себе. Код уходит на почту того, кто меняет роль, — то есть
/// нужен второй канал, а не второе нажатие в том же окне.
///
/// Живёт в Redis, а не в базе: код нужен пять минут и после этого не
/// нужен никому. Ключ включает и кто меняет, и кому, и на что — кодом от
/// одной смены нельзя подтвердить другую.
/// </summary>
public sealed class RoleChangeService
{
    /// <summary>Сколько живёт код. Дольше — уже не «сейчас подтвержу».</summary>
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(5);

    /// <summary>Сколько раз можно ошибиться. Дальше код сгорает.</summary>
    private const int MaxAttempts = 5;

    private readonly IConnectionMultiplexer _redis;

    public RoleChangeService(IConnectionMultiplexer redis) => _redis = redis;

    /// <summary>Заводит код и возвращает его — отправить письмо должен вызывающий.</summary>
    public async Task<string> IssueAsync(long adminId, long targetId, bool makeAdmin)
    {
        // Четыре цифры, включая ведущие нули: код набирают с телефона, и
        // короткий срок жизни с пятью попытками делает перебор бесполезным.
        var code = RandomNumberGenerator.GetInt32(0, 10000).ToString("D4");

        var db = _redis.GetDatabase();

        await db.StringSetAsync(Key(adminId, targetId, makeAdmin), code, Lifetime);
        await db.KeyDeleteAsync(Attempts(adminId, targetId, makeAdmin));

        return code;
    }

    public async Task<RoleCodeOutcome> CheckAsync(long adminId, long targetId, bool makeAdmin, string? code)
    {
        var db = _redis.GetDatabase();
        var key = Key(adminId, targetId, makeAdmin);

        var stored = await db.StringGetAsync(key);
        if (stored.IsNullOrEmpty) return RoleCodeOutcome.Expired;

        var typed = (code ?? string.Empty).Trim();

        if (stored != typed)
        {
            // Считаем промахи: без счётчика четыре цифры подбираются за
            // десять тысяч запросов, то есть за пару минут.
            var attempts = await db.StringIncrementAsync(Attempts(adminId, targetId, makeAdmin));
            await db.KeyExpireAsync(Attempts(adminId, targetId, makeAdmin), Lifetime);

            if (attempts >= MaxAttempts) await db.KeyDeleteAsync(key);

            return RoleCodeOutcome.Wrong;
        }

        // Код одноразовый: подтверждённая смена не должна подтверждаться
        // второй раз тем же кодом.
        await db.KeyDeleteAsync(key);
        await db.KeyDeleteAsync(Attempts(adminId, targetId, makeAdmin));

        return RoleCodeOutcome.Ok;
    }

    private static string Key(long adminId, long targetId, bool makeAdmin)
        => $"role:code:{adminId}:{targetId}:{(makeAdmin ? 1 : 0)}";

    private static string Attempts(long adminId, long targetId, bool makeAdmin)
        => $"role:tries:{adminId}:{targetId}:{(makeAdmin ? 1 : 0)}";
}
