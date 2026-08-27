using System.Text.Json;
using StackExchange.Redis;

namespace SchoolPiBoard.Web.Services;

/// <summary>Записанное событие доски: номер, имя, полезная нагрузка.</summary>
public sealed record BoardEvent(long Seq, string Name, JsonElement Payload);

/// <summary>
/// Журнал событий доски — то, чем догоняют пропущенное после обрыва связи.
///
/// У каждого изменения свой сквозной номер. Клиент помнит последний
/// полученный; вернувшись, называет его — и получает только то, что
/// произошло без него, вместо полной перезагрузки доски (раздел 7.4).
///
/// Живёт в Redis и недолго: это не история доски, а короткая память на
/// случай обрыва. Само содержимое лежит в базе, и если журнала не хватило,
/// доска просто загружается целиком — работа не теряется в обоих случаях.
///
/// Курсоры сюда не пишутся: десять кадров в секунду забили бы журнал
/// тем, что устаревает быстрее, чем его успевают прочитать.
/// </summary>
public sealed class BoardEventLog
{
    /// <summary>Сколько событий храним на доску.</summary>
    private const int MaxEvents = 2000;

    /// <summary>
    /// Сколько живёт журнал без обращений. Заметно больше тридцати секунд
    /// из требования к обрыву — с запасом на то, что человек уходит и
    /// возвращается не по секундомеру.
    /// </summary>
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(15);

    private readonly IConnectionMultiplexer _redis;

    public BoardEventLog(IConnectionMultiplexer redis) => _redis = redis;

    /// <summary>Записывает событие и возвращает его номер.</summary>
    public async Task<long> AppendAsync(long boardId, string name, object payload)
    {
        var db = _redis.GetDatabase();

        var seq = await db.StringIncrementAsync(SeqKey(boardId));
        var entry = JsonSerializer.Serialize(new { seq, name, payload });

        var log = LogKey(boardId);
        await db.ListRightPushAsync(log, entry);

        // Обрезаем здесь же, а не фоновой задачей: журнал растёт только в
        // этом месте, и здесь же ему проще всего не дать разрастись.
        await db.ListTrimAsync(log, -MaxEvents, -1);

        await db.KeyExpireAsync(log, Lifetime);
        await db.KeyExpireAsync(SeqKey(boardId), Lifetime);

        return seq;
    }

    /// <summary>Текущий номер: его получает тот, кто вошёл заново.</summary>
    public async Task<long> CurrentSeqAsync(long boardId)
    {
        var value = await _redis.GetDatabase().StringGetAsync(SeqKey(boardId));
        return value.IsNullOrEmpty ? 0 : (long)value;
    }

    /// <summary>
    /// События после указанного номера — или null, если догнать нельзя:
    /// журнала не хватило, либо номер из прошлой жизни доски. Тогда
    /// вызывающий обязан прислать состояние целиком.
    /// </summary>
    public async Task<List<BoardEvent>?> SinceAsync(long boardId, long sinceSeq)
    {
        if (sinceSeq <= 0)
            return null;

        var db = _redis.GetDatabase();

        var current = await CurrentSeqAsync(boardId);
        if (current < sinceSeq)
            return null; // Журнал успел истечь и начаться заново.

        if (current == sinceSeq)
            return new List<BoardEvent>();

        var entries = await db.ListRangeAsync(LogKey(boardId));
        var events = new List<BoardEvent>();
        var oldest = long.MaxValue;

        foreach (var entry in entries)
        {
            var parsed = Parse(entry.ToString());
            if (parsed is null) continue;

            oldest = Math.Min(oldest, parsed.Seq);
            if (parsed.Seq > sinceSeq) events.Add(parsed);
        }

        // В журнале должно найтись само следующее событие. Если самое
        // старое, что есть, уже позже — часть пропущенного вытеснена,
        // и склеивать половину истории нельзя.
        return oldest <= sinceSeq + 1 ? events : null;
    }

    private static BoardEvent? Parse(string entry)
    {
        try
        {
            using var document = JsonDocument.Parse(entry);
            var root = document.RootElement;

            return new BoardEvent(
                root.GetProperty("seq").GetInt64(),
                root.GetProperty("name").GetString() ?? string.Empty,
                root.GetProperty("payload").Clone());
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string SeqKey(long boardId) => $"boardseq:{boardId}";

    private static string LogKey(long boardId) => $"boardlog:{boardId}";
}
