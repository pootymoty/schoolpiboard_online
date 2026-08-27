using System.Collections.Concurrent;

namespace SchoolPiBoard.Web.Services;

/// <summary>Кто подключён к доске прямо сейчас.</summary>
public sealed record Presence(
    string ConnectionId,
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
/// Присутствие на досках.
///
/// Живёт в памяти процесса, а не в Redis: присутствие существует ровно
/// столько, сколько живёт само подключение, и переживать перезапуск ему
/// незачем — соединения его тоже не переживут. Если служба когда-нибудь
/// поедет в несколько процессов, это первое место, которое придётся
/// переносить в Redis вслед за backplane.
/// </summary>
public sealed class BoardPresence
{
    private readonly ConcurrentDictionary<string, Presence> _byConnection = new();
    private readonly ConcurrentDictionary<long, ConcurrentDictionary<string, byte>> _byBoard = new();

    public void Add(Presence presence)
    {
        _byConnection[presence.ConnectionId] = presence;
        _byBoard.GetOrAdd(presence.BoardId, _ => new ConcurrentDictionary<string, byte>())
            .TryAdd(presence.ConnectionId, 0);
    }

    public Presence? Remove(string connectionId)
    {
        if (!_byConnection.TryRemove(connectionId, out var presence))
            return null;

        if (_byBoard.TryGetValue(presence.BoardId, out var connections))
        {
            connections.TryRemove(connectionId, out _);

            // Пустую доску убираем целиком, иначе словарь копил бы по записи
            // на каждую доску, которую хоть раз открывали.
            if (connections.IsEmpty)
                _byBoard.TryRemove(presence.BoardId, out _);
        }

        return presence;
    }

    public Presence? Find(string connectionId)
        => _byConnection.TryGetValue(connectionId, out var presence) ? presence : null;

    public List<Presence> OnBoard(long boardId)
    {
        if (!_byBoard.TryGetValue(boardId, out var connections))
            return new List<Presence>();

        return connections.Keys
            .Select(Find)
            .Where(presence => presence is not null)
            .Select(presence => presence!)
            .ToList();
    }

    /// <summary>Все подключения — для служб, обходящих присутствие целиком.</summary>
    public List<Presence> All() => _byConnection.Values.ToList();

    public int CountOnBoard(long boardId)
        => _byBoard.TryGetValue(boardId, out var connections) ? connections.Count : 0;

    /// <summary>Подключения одного и того же человека — им шлют «вас выгнали».</summary>
    public List<string> ConnectionsOf(long boardId, long? userId, string? guestId)
        => OnBoard(boardId)
            .Where(p => userId is not null ? p.UserId == userId : p.GuestId == guestId)
            .Select(p => p.ConnectionId)
            .ToList();
}
