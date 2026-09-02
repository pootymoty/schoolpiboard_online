using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Data;
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

/// <summary>Оформление холста.</summary>
public sealed record BackgroundDto(string Background, string GridStyle, string GridColor);

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
    /// Потолок службы поверх тарифов: больше двадцати человек на одной
    /// доске не выдерживает уже не кошелёк, а рассылка курсоров.
    /// </summary>
    private const int MaxParticipants = 20;

    /// <summary>Разлиновки, которые сервер принимает.</summary>
    private static readonly string[] GridStyles = { "none", "line", "dot", "square", "graph", "rhombus" };

    private readonly AppDbContext _db;
    private readonly BoardService _boards;
    private readonly BoardItemService _items;
    private readonly BoardEventLog _log;
    private readonly BoardPresence _presence;
    private readonly CursorRelay _cursors;
    private readonly SubscriptionService _subscriptions;

    public BoardHub(
        AppDbContext db,
        BoardService boards,
        BoardItemService items,
        BoardEventLog log,
        BoardPresence presence,
        CursorRelay cursors,
        SubscriptionService subscriptions)
    {
        _db = db;
        _boards = boards;
        _items = items;
        _log = log;
        _presence = presence;
        _cursors = cursors;
        _subscriptions = subscriptions;
    }

    public static string GroupOf(long boardId) => $"board:{boardId}";

    /// <summary>
    /// Сколько человек пускать на доску. Считается по тарифу её владельца;
    /// если доски вдруг нет, берётся общий потолок — отказывать во входе
    /// из-за неудачного запроса к базе было бы хуже.
    /// </summary>
    private async Task<int> ParticipantLimitAsync(long boardId)
    {
        var ownerId = await _db.Boards
            .Where(x => x.Id == boardId)
            .Select(x => (long?)x.OwnerId)
            .FirstOrDefaultAsync(Context.ConnectionAborted);

        if (ownerId is null) return MaxParticipants;

        var access = await _subscriptions.AccessAsync(ownerId.Value, Context.ConnectionAborted);
        return Math.Min(access.Plan.MaxParticipants, MaxParticipants);
    }

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

        // Сколько человек помещается — свойство тарифа владельца доски, а
        // не самой доски: платит он, и его тариф решает, класс это или
        // занятие один на один.
        var limit = await ParticipantLimitAsync(boardId);

        // Предел считается до добавления: иначе лишний успел бы войти и
        // увидеть доску, прежде чем его выставят.
        if (_presence.CountOnBoard(boardId) >= limit
            && _presence.ConnectionsOf(boardId, actor.UserId, actor.GuestId).Count == 0)
        {
            await Clients.Caller.SendAsync(
                "Error", "too_many",
                $"На доске уже {limit} участников — больше на тарифе владельца нельзя.");
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
                    participants = Participants(boardId),
                    background = await BackgroundOf(boardId)
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
                participants = Participants(presence.BoardId),
                background = await BackgroundOf(presence.BoardId)
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
    public async Task CommitItem(string tempId, string type, JsonElement data, string? imageRef)
    {
        var presence = await RequireEditorAsync();
        if (presence is null) return;

        var item = await _items.CreateAsync(
            presence.BoardId, type, data.GetRawText(), presence.UserId, imageRef, Context.ConnectionAborted);

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

    /// <summary>Сдвинуть выделенное. Замок не берётся: сдвиг применяется целиком или никак.</summary>
    public async Task MoveItems(long[] itemIds, double dx, double dy)
    {
        var presence = await RequireEditorAsync();
        if (presence is null) return;

        var moved = await _items.MoveAsync(presence.BoardId, itemIds, dx, dy, Context.ConnectionAborted);
        if (moved.Count == 0) return;

        await _items.TouchBoardAsync(presence.BoardId, Context.ConnectionAborted);

        await PublishAsync(presence.BoardId, "ItemsMoved", new
        {
            itemIds = moved.Select(x => x.Id),
            dx,
            dy,
            by = Context.ConnectionId
        });
    }

    /// <summary>На передний или на задний план.</summary>
    public async Task Reorder(long[] itemIds, bool toFront)
    {
        var presence = await RequireEditorAsync();
        if (presence is null) return;

        var moved = await _items.ReorderAsync(presence.BoardId, itemIds, toFront, Context.ConnectionAborted);
        if (moved.Count == 0) return;

        await _items.TouchBoardAsync(presence.BoardId, Context.ConnectionAborted);

        await PublishAsync(presence.BoardId, "ItemsReordered", new
        {
            items = moved.Select(ToDto),
            by = Context.ConnectionId
        });
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

    /// <summary>
    /// Оформление холста — только владелец. Фон общий для всех, кто на
    /// доске: это свойство самой доски, а не настройка каждого.
    /// </summary>
    public async Task SetBackground(string background, string gridStyle, string gridColor)
    {
        var presence = _presence.Find(Context.ConnectionId);

        if (presence is null || !presence.CanManage)
        {
            await Clients.Caller.SendAsync("Error", "forbidden", "Оформление меняет владелец доски.");
            return;
        }

        if (!GridStyles.Contains(gridStyle) || !IsColor(background) || !IsColor(gridColor))
        {
            await Clients.Caller.SendAsync("Error", "bad_request", "Такое оформление доска не принимает.");
            return;
        }

        var board = await _db.Boards.FirstOrDefaultAsync(x => x.Id == presence.BoardId, Context.ConnectionAborted);
        if (board is null) return;

        board.Background = background;
        board.GridStyle = gridStyle;
        board.GridColor = gridColor;
        await _db.SaveChangesAsync(Context.ConnectionAborted);

        await PublishAsync(presence.BoardId, "BackgroundChanged",
            new BackgroundDto(background, gridStyle, gridColor));
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

    private async Task<BackgroundDto> BackgroundOf(long boardId)
    {
        var board = await _db.Boards.FirstOrDefaultAsync(x => x.Id == boardId, Context.ConnectionAborted);

        return board is null
            ? new BackgroundDto("#FFFDF8", "none", "#D9CFC0")
            : new BackgroundDto(board.Background, board.GridStyle, board.GridColor);
    }

    /// <summary>Цвет принимаем только шестнадцатеричный: остальное — чужой ввод в стиль.</summary>
    private static bool IsColor(string value)
        => value.Length is 4 or 7
           && value[0] == '#'
           && value.Skip(1).All(Uri.IsHexDigit);

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
