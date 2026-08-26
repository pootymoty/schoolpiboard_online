using System.Text.Json;
using StackExchange.Redis;

namespace SchoolPiBoard.Web.Services;

/// <summary>Заявка на вход, ожидающая решения владельца.</summary>
public sealed record WaitingRequest(
    string Id,
    string DisplayName,
    long? UserId,
    DateTime RequestedAt)
{
    public bool IsGuest => UserId is null;
}

/// <summary>Гость, впущенный на доску прямо сейчас.</summary>
public sealed record ActiveGuest(string GuestId, string DisplayName, string Role);

file sealed record ActiveGuestInfo(string DisplayName, string Role);

/// <summary>
/// Комната ожидания и выданные допуски.
///
/// Живёт в Redis, а не в базе: заявка гостя существует ровно столько,
/// сколько он смотрит на страницу ожидания, и записью в таблице была бы
/// мусором уже через минуту. По той же причине здесь всё со сроком годности —
/// доска, забытая открытой на ночь, не накопит очередь из призраков.
///
/// Допуск гостя живёт пятнадцать минут и продлевается, пока он на доске.
/// Ушёл и вернулся быстро — войдёт сразу; пропал надолго — попросится
/// заново. Так случайно закрытая вкладка не заставляет преподавателя
/// принимать человека второй раз, а ссылка, отданная кому-то ещё через
/// час, не открывает доску молча.
/// </summary>
public sealed class WaitingRoom
{
    /// <summary>Сколько заявка ждёт решения, если владельца нет на месте.</summary>
    private static readonly TimeSpan RequestLifetime = TimeSpan.FromMinutes(30);

    /// <summary>
    /// Сколько действует допуск после того, как человек ушёл с доски.
    ///
    /// Пять минут — это запас на вылет, а не на перерыв: у гостя ничего не
    /// сохраняется, и роль вместе с местом на доске существует ровно пока
    /// он на ней. Оборвалась связь или закрылась вкладка — успеет вернуться
    /// молча; ушёл насовсем — попросится заново, как и должен.
    /// </summary>
    private static readonly TimeSpan AdmissionLifetime = TimeSpan.FromMinutes(5);

    private readonly IConnectionMultiplexer _redis;

    public WaitingRoom(IConnectionMultiplexer redis) => _redis = redis;

    // ---------- Заявки ----------

    public async Task RequestAsync(long boardId, WaitingRequest request)
    {
        var db = _redis.GetDatabase();

        await db.HashSetAsync(RequestsKey(boardId), request.Id, JsonSerializer.Serialize(request));

        // Срок ставится на всю комнату: отдельные поля хеша в Redis своего
        // срока не имеют, а чистить их по одному пришлось бы фоновой задачей.
        await db.KeyExpireAsync(RequestsKey(boardId), RequestLifetime);
    }

    public async Task<List<WaitingRequest>> ListAsync(long boardId)
    {
        var entries = await _redis.GetDatabase().HashGetAllAsync(RequestsKey(boardId));

        return entries
            .Select(entry => JsonSerializer.Deserialize<WaitingRequest>(entry.Value!))
            .Where(request => request is not null)
            .Select(request => request!)
            .OrderBy(request => request.RequestedAt)
            .ToList();
    }

    public async Task<WaitingRequest?> FindAsync(long boardId, string requestId)
    {
        var value = await _redis.GetDatabase().HashGetAsync(RequestsKey(boardId), requestId);
        return value.IsNullOrEmpty ? null : JsonSerializer.Deserialize<WaitingRequest>(value!);
    }

    public Task RemoveAsync(long boardId, string requestId)
        => _redis.GetDatabase().HashDeleteAsync(RequestsKey(boardId), requestId);

    /// <summary>Ждёт ли этот человек решения прямо сейчас.</summary>
    public async Task<bool> IsWaitingAsync(long boardId, string requestId)
        => await _redis.GetDatabase().HashExistsAsync(RequestsKey(boardId), requestId);

    // ---------- Допуски ----------

    /// <summary>Впустить гостя с указанной ролью.</summary>
    public async Task AdmitAsync(long boardId, string guestId, string displayName, string role)
    {
        var db = _redis.GetDatabase();

        await db.StringSetAsync(AdmissionKey(boardId, guestId), role, AdmissionLifetime);
        await db.HashSetAsync(ActiveInfoKey(boardId), guestId, JsonSerializer.Serialize(new ActiveGuestInfo(displayName, role)));
        await Touch(db, boardId, guestId);
    }

    /// <summary>
    /// Роль впущенного гостя, если допуск ещё действует. Заодно продлевает
    /// его: пока человек на доске, срок не должен истекать под ним.
    /// </summary>
    public async Task<string?> AdmittedRoleAsync(long boardId, string guestId)
    {
        var db = _redis.GetDatabase();
        var key = AdmissionKey(boardId, guestId);

        var role = await db.StringGetAsync(key);
        if (role.IsNullOrEmpty)
            return null;

        await db.KeyExpireAsync(key, AdmissionLifetime);
        // Опрос состояния доски — единственный «пинг», который присылает
        // подключённый гость: он же продлевает его присутствие в списке
        // участников, пока хаб (11c) не даст этого делать напрямую.
        await Touch(db, boardId, guestId);
        return role!;
    }

    /// <summary>
    /// Сменить роль впущенного гостя. Возвращает false, если допуска уже
    /// нет: гость успел уйти, и менять нечего.
    /// </summary>
    public async Task<bool> SetRoleAsync(long boardId, string guestId, string role)
    {
        var db = _redis.GetDatabase();

        var info = await db.HashGetAsync(ActiveInfoKey(boardId), guestId);
        if (info.IsNullOrEmpty)
            return false;

        var current = JsonSerializer.Deserialize<ActiveGuestInfo>(info!);
        if (current is null)
            return false;

        await db.StringSetAsync(AdmissionKey(boardId, guestId), role, AdmissionLifetime);
        await db.HashSetAsync(
            ActiveInfoKey(boardId), guestId,
            JsonSerializer.Serialize(current with { Role = role }));

        return true;
    }

    /// <summary>Отобрать допуск: гость отключается и просится заново.</summary>
    public async Task RevokeAdmissionAsync(long boardId, string guestId)
    {
        var db = _redis.GetDatabase();

        await db.KeyDeleteAsync(AdmissionKey(boardId, guestId));
        await db.HashDeleteAsync(ActiveInfoKey(boardId), guestId);
        await db.SortedSetRemoveAsync(ActiveSeenKey(boardId), guestId);
    }

    /// <summary>
    /// Гости, впущенные на доску и не пропадавшие дольше времени жизни
    /// допуска. Список живёт в Redis, а не в базе — по той же причине, что
    /// и сама заявка: гость нигде не хранится (раздел 5.3).
    /// </summary>
    public async Task<List<ActiveGuest>> ListActiveGuestsAsync(long boardId)
    {
        var db = _redis.GetDatabase();
        var seenKey = ActiveSeenKey(boardId);
        var infoKey = ActiveInfoKey(boardId);

        // Кто не подавал признаков жизни дольше срока допуска — тот отключился;
        // чистим здесь же, а не фоновой задачей, которой в проекте нет.
        var cutoff = DateTimeOffset.UtcNow.Subtract(AdmissionLifetime).ToUnixTimeMilliseconds();
        await db.SortedSetRemoveRangeByScoreAsync(seenKey, double.NegativeInfinity, cutoff);

        var guestIds = await db.SortedSetRangeByScoreAsync(seenKey);
        if (guestIds.Length == 0)
            return new List<ActiveGuest>();

        var infos = await db.HashGetAsync(infoKey, guestIds);

        var result = new List<ActiveGuest>();
        for (var i = 0; i < guestIds.Length; i++)
        {
            if (infos[i].IsNullOrEmpty) continue;

            var info = JsonSerializer.Deserialize<ActiveGuestInfo>(infos[i]!);
            if (info is not null)
                result.Add(new ActiveGuest(guestIds[i]!, info.DisplayName, info.Role));
        }

        return result;
    }

    private static Task Touch(IDatabase db, long boardId, string guestId)
        => db.SortedSetAddAsync(ActiveSeenKey(boardId), guestId, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());

    // ---------- Отказы ----------

    /// <summary>
    /// Отметка об отказе. Нужна только чтобы сказать человеку «вас не
    /// пустили» вместо молчания: без неё страница ожидания просто перестала
    /// бы обновляться, и он не понял бы, отказали ему или что-то сломалось.
    ///
    /// Живёт недолго: это сообщение, а не запрет. Попроситься снова можно —
    /// и владелец снова увидит заявку.
    /// </summary>
    public Task RejectAsync(long boardId, string requestId)
        => _redis.GetDatabase().StringSetAsync(RejectedKey(boardId, requestId), "1", TimeSpan.FromMinutes(5));

    public async Task<bool> IsRejectedAsync(long boardId, string requestId)
        => await _redis.GetDatabase().KeyExistsAsync(RejectedKey(boardId, requestId));

    public Task ClearRejectionAsync(long boardId, string requestId)
        => _redis.GetDatabase().KeyDeleteAsync(RejectedKey(boardId, requestId));

    private static string RequestsKey(long boardId) => $"waiting:{boardId}";

    private static string AdmissionKey(long boardId, string guestId) => $"admitted:{boardId}:{guestId}";

    private static string ActiveInfoKey(long boardId) => $"activeinfo:{boardId}";

    private static string ActiveSeenKey(long boardId) => $"activeseen:{boardId}";

    private static string RejectedKey(long boardId, string requestId) => $"rejected:{boardId}:{requestId}";
}
