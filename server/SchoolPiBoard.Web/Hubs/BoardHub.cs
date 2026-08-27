using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using SchoolPiBoard.Web.Data.Entities;
using SchoolPiBoard.Web.Services;

namespace SchoolPiBoard.Web.Hubs;

/// <summary>Объект доски в том виде, в каком его получает браузер.</summary>
public sealed record ItemDto(
    long Id,
    string Type,
    int Z,
    JsonElement Data,
    string? ImageRef,
    string? LockedBy);

/// <summary>Участник, подключённый к доске.</summary>
public sealed record ParticipantDto(string ConnectionId, string DisplayName, string Role, bool IsGuest);

/// <summary>
/// Хаб доски: комната на доску, всё общение по ней идёт здесь.
///
/// Права проверяются в каждом методе, а не один раз при входе. Скрытая
/// кнопка на клиенте — не защита: наблюдатель, отправивший «нарисуй»,
/// обязан получить отказ (раздел 7.2).
/// </summary>
public sealed class BoardHub : Hub
{
    /// <summary>
    /// Предел участников на доске. С этапа 11e его будет задавать тариф;
    /// до тех пор — общая величина, чтобы ссылка, ушедшая в чат класса, не
    /// привела сорок человек на доску для двоих (раздел 6.4).
    /// </summary>
    private const int MaxParticipants = 20;

    private readonly BoardService _boards;
    private readonly BoardItemService _items;
    private readonly BoardEventLog _log;
    private readonly BoardPresence _presence;
    private readonly CursorRelay _cursors;

    public BoardHub(
        BoardService boards,
        BoardItemService items,
        BoardEventLog log,
        BoardPresence presence,
        CursorRelay cursors)
    {
        _boards = boards;
        _items = items;
        _log = log;
        _presence = presence;
        _cursors = cursors;
    }

    public static string GroupOf(long boardId) => $"board:{boardId}";

    // ---------- Вход и выход ----------

    /// <summary>
    /// Вход на доску.
    ///
    /// <paramref name="sinceSeq"/> — номер последнего события, которое клиент
    /// успел получить до обрыва. Если журнал ещё помнит всё, что случилось
    /// после, придёт только пропущенное; иначе — доска целиком.
    /// </summary>
    public async Task JoinBoard(long boardId, string? guestToken, long sinceSeq)
    {
        var actor = await _boards.ResolveActorAsync(boardId, CurrentUserId(), guestToken, Context.ConnectionAborted);

        if (actor is null)
        {
            await Clients.Caller.SendAsync("Error", "no_access", "Нет доступа к этой доске.");
            return;
        }

        // Предел считается до добавления: иначе двадцать первый успел бы
        // войти и увидеть доску, прежде чем его выставят.
        if (_presence.CountOnBoard(boardId) >= MaxParticipants
            && _presence.ConnectionsOf(boardId, actor.UserId, actor.GuestId).Count == 0)
        {
            await Clients.Caller.SendAsync(
                "Error", "too_many", $"На доске уже {MaxParticipants} участников — больше пока нельзя.");
            return;
        }

        var presence = new Presence(
            Context.ConnectionId, boardId, actor.Role, actor.DisplayName, actor.UserId, actor.GuestId);

        _presence.Add(presence);
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupOf(boardId), Context.ConnectionAborted);

        var missed = await _log.SinceAsync(boardId, sinceSeq);

        if (missed is not null)
        {
            // Догоняем пропущенное. Доску не перезагружаем — у клиента она
            // уже нарисована, и подменять её целиком означало бы стереть
            // то, что он успел нарисовать локально, пока связи не было.
            await Clients.Caller.SendAsync(
                "Resumed",
                new
                {
                    role = actor.Role,
                    canEdit = actor.CanEdit,
                    canManage = actor.CanManage,
                    seq = await _log.CurrentSeqAsync(boardId),
                    // Присутствие шлём заново: пока связи не было, кто-то мог
                    // прийти и уйти, а эти события в журнале уже неактуальны.
                    participants = Participants(boardId),
                    events = missed.Select(e => new { seq = e.Seq, name = e.Name, payload = e.Payload })
                },
                Context.ConnectionAborted);
        }
        else
        {
            var items = await _items.ListAsync(boardId, Context.ConnectionAborted);

            await Clients.Caller.SendAsync(
                "Joined",
                new
                {
                    role = actor.Role,
                    canEdit = actor.CanEdit,
                    canManage = actor.CanManage,
                    seq = await _log.CurrentSeqAsync(boardId),
                    items = items.Select(ToDto),
                    participants = Participants(boardId)
                },
                Context.ConnectionAborted);
        }

        await PublishAsync(boardId, "MemberJoined", new
        {
            connectionId = Context.ConnectionId,
            displayName = actor.DisplayName,
            role = actor.Role,
            isGuest = actor.IsGuest
        });
    }

    /// <summary>
    /// Прислать доску заново.
    ///
    /// Догон по журналу закрывает обрыв, о котором клиент знает. Но
    /// вкладка может провисеть в фоне, где браузер приглушает и таймеры,
    /// и сокет, — и вернуться в уверенности, что ничего не пропустила.
    /// Поэтому при возврате к доске состояние берётся у сервера целиком:
    /// он тут единственный, кто знает правду.
    /// </summary>
    public async Task Sync()
    {
        var presence = _presence.Find(Context.ConnectionId);
        if (presence is null)
        {
            await Clients.Caller.SendAsync("Error", "not_joined", "Сначала откройте доску.");
            return;
        }

        var items = await _items.ListAsync(presence.BoardId, Context.ConnectionAborted);

        await Clients.Caller.SendAsync(
            "Synced",
            new
            {
                seq = await _log.CurrentSeqAsync(presence.BoardId),
                items = items.Select(ToDto),
                participants = Participants(presence.BoardId)
            },
            Context.ConnectionAborted);
    }

    public async Task LeaveBoard() => await DepartAsync();

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await DepartAsync();
        await base.OnDisconnectedAsync(exception);
    }

    // ---------- Курсоры ----------

    /// <summary>
    /// Позиция указателя. Не рассылается сразу: копится и уходит кадром
    /// десять раз в секунду (см. <see cref="CursorRelay"/>).
    /// </summary>
    public Task Cursor(double x, double y)
    {
        var presence = _presence.Find(Context.ConnectionId);
        if (presence is null)
            return Task.CompletedTask;

        _cursors.Report(presence.BoardId, Context.ConnectionId, presence.DisplayName, x, y);
        return Task.CompletedTask;
    }

    // ---------- Рисование ----------

    /// <summary>
    /// Начало штриха. В базу не пишется: промежуточные точки только
    /// рассылаются, иначе на один штрих пришлись бы сотни записей
    /// (раздел 7.3).
    /// </summary>
    public async Task BeginItem(string tempId, string type, JsonElement data)
    {
        var presence = await RequireEditorAsync();
        if (presence is null) return;

        await PublishAsync(presence.BoardId, "ItemBegan", new
        {
            tempId,
            by = Context.ConnectionId,
            type,
            data
        });
    }

    /// <summary>Продолжение штриха — тоже только рассылка.</summary>
    public async Task AppendPoints(string tempId, JsonElement points)
    {
        var presence = await RequireEditorAsync();
        if (presence is null) return;

        await PublishAsync(presence.BoardId, "ItemPoints", new
        {
            tempId,
            by = Context.ConnectionId,
            points
        });
    }

    /// <summary>
    /// Штрих брошен, не начавшись как следует: рисующий положил на экран
    /// второй палец, и это оказался жест, а не линия.
    ///
    /// Без этого сообщения недорисованный штрих остался бы висеть у всех
    /// остальных: он живёт в памяти до закрепления, а закрепления не будет.
    /// </summary>
    public async Task CancelItem(string tempId)
    {
        var presence = await RequireEditorAsync();
        if (presence is null) return;

        await PublishAsync(presence.BoardId, "ItemCancelled", new { tempId, by = Context.ConnectionId });
    }

    /// <summary>Штрих закончен — вот теперь он становится объектом доски.</summary>
    public async Task CommitItem(string tempId, string type, JsonElement data)
    {
        var presence = await RequireEditorAsync();
        if (presence is null) return;

        var item = await _items.CreateAsync(
            presence.BoardId, type, data.GetRawText(), presence.UserId, Context.ConnectionAborted);

        if (item is null)
        {
            await Clients.Caller.SendAsync("Error", "bad_item", "Этот объект доска принять не может.");
            return;
        }

        await _items.TouchBoardAsync(presence.BoardId, Context.ConnectionAborted);

        await PublishAsync(presence.BoardId, "ItemCommitted", new
        {
            tempId,
            by = Context.ConnectionId,
            item = ToDto(item)
        });
    }

    // ---------- Правка ----------

    public async Task LockItem(long itemId)
    {
        var presence = await RequireEditorAsync();
        if (presence is null) return;

        var taken = await _items.TryLockAsync(
            presence.BoardId, itemId, Context.ConnectionId, Context.ConnectionAborted);

        if (!taken)
        {
            await Clients.Caller.SendAsync("Error", "locked", "Этот объект сейчас держит кто-то другой.");
            return;
        }

        await PublishAsync(presence.BoardId, "ItemLocked", new { itemId, by = Context.ConnectionId });
    }

    public async Task UpdateItem(long itemId, JsonElement data)
    {
        var presence = await RequireEditorAsync();
        if (presence is null) return;

        var item = await _items.UpdateAsync(
            presence.BoardId, itemId, Context.ConnectionId, data.GetRawText(), Context.ConnectionAborted);

        if (item is null)
        {
            await Clients.Caller.SendAsync("Error", "locked", "Этот объект сейчас держит кто-то другой.");
            return;
        }

        await _items.TouchBoardAsync(presence.BoardId, Context.ConnectionAborted);
        await PublishAsync(presence.BoardId, "ItemUpdated", new { item = ToDto(item), by = Context.ConnectionId });
    }

    public async Task UnlockItem(long itemId)
    {
        var presence = await RequireEditorAsync();
        if (presence is null) return;

        if (await _items.UnlockAsync(presence.BoardId, itemId, Context.ConnectionId, Context.ConnectionAborted))
            await PublishAsync(presence.BoardId, "ItemUnlocked", new { itemId });
    }

    public async Task DeleteItems(long[] itemIds)
    {
        var presence = await RequireEditorAsync();
        if (presence is null) return;

        var removed = await _items.DeleteAsync(presence.BoardId, itemIds, Context.ConnectionAborted);
        if (removed.Count == 0) return;

        await _items.TouchBoardAsync(presence.BoardId, Context.ConnectionAborted);
        await PublishAsync(presence.BoardId, "ItemsDeleted", new { itemIds = removed });
    }

    /// <summary>Очистить доску целиком — только владелец.</summary>
    public async Task ClearBoard()
    {
        var presence = _presence.Find(Context.ConnectionId);

        if (presence is null || !presence.CanManage)
        {
            await Clients.Caller.SendAsync("Error", "forbidden", "Очистить доску может только её владелец.");
            return;
        }

        await _items.ClearAsync(presence.BoardId, Context.ConnectionAborted);
        await _items.TouchBoardAsync(presence.BoardId, Context.ConnectionAborted);

        await PublishAsync(presence.BoardId, "BoardCleared", new { by = Context.ConnectionId });
    }

    // ---------- Вспомогательное ----------

    /// <summary>
    /// Рассылает событие всей доске и записывает его в журнал, чтобы
    /// вернувшийся после обрыва мог его добрать.
    /// </summary>
    private async Task PublishAsync(long boardId, string name, object payload)
    {
        var seq = await _log.AppendAsync(boardId, name, payload);

        // Без Context.ConnectionAborted намеренно: рассылка идёт всей доске,
        // а не вызвавшему, и при отключении — когда его токен уже отменён —
        // остальные всё равно должны узнать, что он ушёл и отпустил замки.
        await Clients.Group(GroupOf(boardId)).SendAsync(name, payload, seq);
    }

    /// <summary>
    /// Проверка права рисовать. Роль берётся из присутствия — того же, что
    /// установил вход, — а вход её выяснял у <see cref="BoardService"/>.
    /// </summary>
    private async Task<Presence?> RequireEditorAsync()
    {
        var presence = _presence.Find(Context.ConnectionId);

        if (presence is null)
        {
            await Clients.Caller.SendAsync("Error", "not_joined", "Сначала откройте доску.");
            return null;
        }

        if (!presence.CanEdit)
        {
            await Clients.Caller.SendAsync("Error", "read_only", "У вас доступ только на просмотр.");
            return null;
        }

        return presence;
    }

    private async Task DepartAsync()
    {
        var presence = _presence.Remove(Context.ConnectionId);
        if (presence is null) return;

        _cursors.Forget(presence.BoardId, Context.ConnectionId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupOf(presence.BoardId));

        // Замки ушедшего снимаем сразу: ждать десяти секунд незачем, когда
        // про уход известно наверняка.
        var released = await _items.ReleaseLocksAsync(Context.ConnectionId, CancellationToken.None);
        foreach (var itemId in released)
            await PublishAsync(presence.BoardId, "ItemUnlocked", new { itemId });

        await PublishAsync(presence.BoardId, "MemberLeft", new { connectionId = Context.ConnectionId });
    }

    private List<ParticipantDto> Participants(long boardId)
        => _presence.OnBoard(boardId)
            .Select(p => new ParticipantDto(p.ConnectionId, p.DisplayName, p.Role, p.IsGuest))
            .ToList();

    private long? CurrentUserId()
    {
        var raw = Context.User?.FindFirstValue("sub");
        return long.TryParse(raw, out var id) ? id : null;
    }

    private static ItemDto ToDto(BoardItem item)
    {
        // Clone обязателен: RootElement живёт внутри JsonDocument, и после
        // его освобождения ссылка на элемент стала бы недействительной.
        using var document = JsonDocument.Parse(item.Data);

        return new ItemDto(
            item.Id,
            item.Type,
            item.Z,
            document.RootElement.Clone(),
            item.ImageRef,
            item.LockedBy);
    }
}
