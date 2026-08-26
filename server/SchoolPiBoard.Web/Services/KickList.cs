using StackExchange.Redis;

namespace SchoolPiBoard.Web.Services;

/// <summary>
/// Список отказа для выгнанных гостей.
///
/// Гостя нельзя забанить насовсем, и это свойство, а не недоделка: между
/// заходами он ничем не опознаётся. При входе браузеру достаётся метка,
/// при выгоне она попадает сюда на пятнадцать минут. Против обычного
/// человека этого достаточно, против вкладки инкогнито — нет, и так
/// и сказано в интерфейсе.
///
/// Настоящий ответ на гостя-нарушителя — перевыпуск ссылки: старая умирает
/// мгновенно, новая раздаётся тем, кто нужен.
///
/// Живёт в Redis, а не в памяти процесса: иначе перезапуск службы снимал бы
/// все отказы разом, а при нескольких процессах выгнанный возвращался бы
/// через соседний.
/// </summary>
public sealed class KickList
{
    private static readonly TimeSpan Duration = TimeSpan.FromMinutes(15);

    private readonly IConnectionMultiplexer _redis;

    public KickList(IConnectionMultiplexer redis) => _redis = redis;

    public Task AddAsync(long boardId, string guestId)
        => _redis.GetDatabase().StringSetAsync(Key(boardId, guestId), "1", Duration);

    public async Task<bool> ContainsAsync(long boardId, string guestId)
        => await _redis.GetDatabase().KeyExistsAsync(Key(boardId, guestId));

    /// <summary>Сколько ещё действует отказ — чтобы сказать человеку честно.</summary>
    public async Task<TimeSpan?> RemainingAsync(long boardId, string guestId)
        => await _redis.GetDatabase().KeyTimeToLiveAsync(Key(boardId, guestId));

    private static string Key(long boardId, string guestId) => $"kick:{boardId}:{guestId}";
}
