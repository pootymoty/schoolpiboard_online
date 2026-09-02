using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;

namespace SchoolPiBoard.Web.Services;

public enum BoardOutcome
{
    Ok,
    NotFound,
    Forbidden,
    BadRequest,
    Locked,
    Waiting,
    Rejected
}

public sealed record BoardResult<T>(BoardOutcome Outcome, T? Value = default, string? Message = null)
{
    public static BoardResult<T> Ok(T value) => new(BoardOutcome.Ok, value);
    public static BoardResult<T> NotFound(string message = "Доска не найдена.") => new(BoardOutcome.NotFound, Message: message);
    public static BoardResult<T> Forbidden(string message = "Недостаточно прав.") => new(BoardOutcome.Forbidden, Message: message);
    public static BoardResult<T> Bad(string message) => new(BoardOutcome.BadRequest, Message: message);
}

/// <summary>Чем закончилась попытка войти по ссылке.</summary>
public sealed record JoinAttempt(
    BoardOutcome Outcome,
    long BoardId,
    string BoardTitle,
    string? Role = null,
    string? GuestToken = null,
    string? RequestId = null,
    string? Message = null);

/// <summary>
/// Доски, ссылка на них и участники.
///
/// Права проверяются здесь, а не в интерфейсе: скрытая кнопка ничего не
/// запрещает, и наблюдатель, обратившийся к API напрямую, обязан получить
/// отказ (пункт 13.3 приёмки).
/// </summary>
public sealed class BoardService
{
    private const int MaxTitleLength = 200;
    private const int MaxGuestNameLength = 60;

    /// <summary>
    /// Сколько живёт ссылка, прежде чем перевыпуститься сама.
    ///
    /// Час — примерно занятие. Ссылка, разосланная в чат, за это время
    /// доходит до всех, кому предназначалась, а назавтра уже не открывает
    /// доску тому, кто её случайно сохранил.
    /// </summary>
    private static readonly TimeSpan LinkLifetime = TimeSpan.FromHours(1);

    private readonly AppDbContext _db;
    private readonly GuestTokenService _guestTokens;
    private readonly WaitingRoom _waiting;
    private readonly SubscriptionService _subscriptions;
    private readonly ILogger<BoardService> _logger;

    public BoardService(
        AppDbContext db,
        GuestTokenService guestTokens,
        WaitingRoom waiting,
        SubscriptionService subscriptions,
        ILogger<BoardService> logger)
    {
        _db = db;
        _guestTokens = guestTokens;
        _waiting = waiting;
        _subscriptions = subscriptions;
        _logger = logger;
    }

    // ---------- Доски ----------

    public async Task<BoardResult<Board>> CreateAsync(long userId, string? title, CancellationToken cancellationToken)
    {
        var name = (title ?? string.Empty).Trim();
        if (name.Length is 0 or > MaxTitleLength)
            return BoardResult<Board>.Bad($"Название доски — от 1 до {MaxTitleLength} символов.");

        // Предел тарифа проверяется только при создании: доски сверх предела
        // не пропадают, когда платный срок кончился, — новые просто не
        // заводятся, пока не станет меньше.
        var access = await _subscriptions.AccessAsync(userId, cancellationToken);
        var count = await _subscriptions.BoardCountAsync(userId, cancellationToken);

        if (count >= access.Plan.MaxBoards)
        {
            return BoardResult<Board>.Bad(
                $"На тарифе «{access.Plan.Name}» можно держать {access.Plan.MaxBoards} досок. "
                + "Удалите ненужную или перейдите на тариф побольше.");
        }

        var now = DateTime.UtcNow;

        var board = new Board
        {
            OwnerId = userId,
            Title = name,
            // Ссылка рождается вместе с доской: перед занятием не должно быть
            // лишнего шага «сначала создайте ссылку».
            LinkToken = SecurityTokens.Create(),
            LinkIssuedAt = now,
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.Boards.Add(board);
        await _db.SaveChangesAsync(cancellationToken);

        // Владелец — такой же участник, просто с ролью owner: тогда список
        // досок и проверки прав работают одним запросом, без особого случая.
        _db.BoardMembers.Add(new BoardMember
        {
            BoardId = board.Id,
            UserId = userId,
            Role = BoardMember.RoleOwner,
            Source = BoardMember.SourceOwner,
            JoinedAt = now
        });

        await _db.SaveChangesAsync(cancellationToken);

        return BoardResult<Board>.Ok(board);
    }

    /// <summary>Доски, где человек — участник: и свои, и те, куда его впустили.</summary>
    public async Task<List<(Board Board, BoardMember Member)>> ListAsync(long userId, CancellationToken cancellationToken)
    {
        var rows = await _db.BoardMembers
            .Include(x => x.Board)
            .Where(x => x.UserId == userId && x.BannedAt == null && x.Board!.DeletedAt == null)
            .OrderByDescending(x => x.Board!.UpdatedAt)
            .ToListAsync(cancellationToken);

        // Свои доски заодно обновляют ссылку, если та отжила час: список
        // досок — то место, откуда владелец её и копирует.
        foreach (var row in rows.Where(x => x.Role == BoardMember.RoleOwner))
            await RefreshLinkAsync(row.Board!, cancellationToken);

        return rows.Select(x => (x.Board!, x)).ToList();
    }

    public async Task<BoardResult<Board>> RenameAsync(long boardId, long userId, string? title, CancellationToken cancellationToken)
    {
        var name = (title ?? string.Empty).Trim();
        if (name.Length is 0 or > MaxTitleLength)
            return BoardResult<Board>.Bad($"Название доски — от 1 до {MaxTitleLength} символов.");

        var board = await OwnedAsync(boardId, userId, cancellationToken);
        if (board is null)
            return BoardResult<Board>.NotFound();

        board.Title = name;
        board.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        return BoardResult<Board>.Ok(board);
    }

    public async Task<BoardResult<Board>> SetLockedAsync(long boardId, long userId, bool locked, CancellationToken cancellationToken)
    {
        var board = await OwnedAsync(boardId, userId, cancellationToken);
        if (board is null)
            return BoardResult<Board>.NotFound();

        board.Locked = locked;
        board.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        return BoardResult<Board>.Ok(board);
    }

    public async Task<BoardResult<Board>> SetAutoAdmitAsync(long boardId, long userId, bool autoAdmit, CancellationToken cancellationToken)
    {
        var board = await OwnedAsync(boardId, userId, cancellationToken);
        if (board is null)
            return BoardResult<Board>.NotFound();

        board.AutoAdmit = autoAdmit;
        await _db.SaveChangesAsync(cancellationToken);

        return BoardResult<Board>.Ok(board);
    }

    public async Task<BoardResult<bool>> DeleteAsync(long boardId, long userId, CancellationToken cancellationToken)
    {
        var board = await OwnedAsync(boardId, userId, cancellationToken);
        if (board is null)
            return BoardResult<bool>.NotFound();

        // Помечаем, а не стираем: материалы занятий человек теряет один раз.
        board.DeletedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Доска {BoardId} помечена удалённой.", boardId);
        return BoardResult<bool>.Ok(true);
    }

    /// <summary>
    /// Новая ссылка вместо прежней. Старая перестаёт работать немедленно —
    /// это и есть ответ на «ссылка ушла не туда» (пункт 13.5 приёмки).
    /// </summary>
    public async Task<BoardResult<Board>> ReissueLinkAsync(long boardId, long userId, CancellationToken cancellationToken)
    {
        var board = await OwnedAsync(boardId, userId, cancellationToken);
        if (board is null)
            return BoardResult<Board>.NotFound();

        board.LinkToken = SecurityTokens.Create();
        board.LinkIssuedAt = DateTime.UtcNow;
        board.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Перевыпущена ссылка на доску {BoardId}.", boardId);
        return BoardResult<Board>.Ok(board);
    }

    /// <summary>
    /// Перевыпускает ссылку, если та отжила своё.
    ///
    /// Делается лениво, при чтении доски владельцем, а не по расписанию:
    /// фоновая задача перебирала бы все доски сервиса ради тех немногих,
    /// которые кто-то в этот час открыл. Просроченная ссылка всё равно
    /// никого не впустит — <see cref="FindByLinkAsync"/> её не найдёт, —
    /// так что до прихода владельца перевыпускать нечего.
    /// </summary>
    public async Task<Board> RefreshLinkAsync(Board board, CancellationToken cancellationToken)
    {
        if (DateTime.UtcNow - board.LinkIssuedAt < LinkLifetime)
            return board;

        board.LinkToken = SecurityTokens.Create();
        board.LinkIssuedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        return board;
    }

    // ---------- Вход по ссылке ----------

    /// <summary>Что за доска — видно и до входа: человек должен понимать, куда его зовут.</summary>
    public async Task<BoardResult<Board>> PeekAsync(string? token, CancellationToken cancellationToken)
    {
        var board = await FindByLinkAsync(token, cancellationToken);
        return board is null
            ? BoardResult<Board>.NotFound("Ссылка недействительна или её перевыпустили.")
            : BoardResult<Board>.Ok(board);
    }

    /// <summary>
    /// Гость просится на доску.
    ///
    /// Роль здесь не назначается: её задаёт владелец, когда впускает. Гость
    /// либо получает токен сразу (если доска пускает без спроса или его уже
    /// впускали недавно), либо встаёт в очередь.
    /// </summary>
    public async Task<JoinAttempt> RequestAsGuestAsync(
        string? token, string? displayName, string? guestId, CancellationToken cancellationToken)
    {
        var board = await FindByLinkAsync(token, cancellationToken);
        if (board is null)
            return new JoinAttempt(BoardOutcome.NotFound, 0, "", Message: "Ссылка недействительна или её перевыпустили.");

        var name = (displayName ?? string.Empty).Trim();
        if (name.Length is 0 or > MaxGuestNameLength)
            return new JoinAttempt(BoardOutcome.BadRequest, board.Id, board.Title,
                Message: $"Имя — от 1 до {MaxGuestNameLength} символов.");

        // Метка браузера переживает уход со страницы: без неё человек,
        // случайно закрывший вкладку, просился бы заново, а выгнанный —
        // обходил бы отказ обновлением.
        var marker = string.IsNullOrWhiteSpace(guestId) ? SecurityTokens.Create() : guestId;

        // Уже впущен и допуск не истёк — пускаем молча.
        var admitted = await _waiting.AdmittedRoleAsync(board.Id, marker);
        if (admitted is not null)
            return Admitted(board, admitted, name, marker);

        if (board.Locked)
            return new JoinAttempt(BoardOutcome.Locked, board.Id, board.Title,
                Message: "Доска закрыта: сейчас на неё не пускают.");

        if (board.AutoAdmit)
        {
            // Без спроса пускаем только смотреть: право рисовать выдаётся
            // осознанно, иначе ссылка, ушедшая в чат, дала бы его всем.
            await _waiting.AdmitAsync(board.Id, marker, name, BoardMember.RoleViewer);
            return Admitted(board, BoardMember.RoleViewer, name, marker);
        }

        await _waiting.ClearRejectionAsync(board.Id, marker);
        await _waiting.RequestAsync(board.Id, new WaitingRequest(marker, name, UserId: null, DateTime.UtcNow));

        return new JoinAttempt(BoardOutcome.Waiting, board.Id, board.Title, RequestId: marker,
            Message: "Ждём, пока преподаватель впустит вас на доску.");
    }

    /// <summary>
    /// Человек с учётной записью просится на доску.
    ///
    /// Уже участник — входит сразу со своей ролью: она сохранена за ним
    /// и повторного разрешения не требует.
    /// </summary>
    public async Task<JoinAttempt> RequestAsUserAsync(string? token, User user, CancellationToken cancellationToken)
    {
        var board = await FindByLinkAsync(token, cancellationToken);
        if (board is null)
            return new JoinAttempt(BoardOutcome.NotFound, 0, "", Message: "Ссылка недействительна или её перевыпустили.");

        var member = await _db.BoardMembers
            .FirstOrDefaultAsync(x => x.BoardId == board.Id && x.UserId == user.Id, cancellationToken);

        if (member is not null)
        {
            return member.BannedAt is not null
                ? new JoinAttempt(BoardOutcome.Forbidden, board.Id, board.Title,
                    Message: "Владелец закрыл вам доступ к этой доске.")
                : new JoinAttempt(BoardOutcome.Ok, board.Id, board.Title, Role: member.Role);
        }

        if (board.Locked)
            return new JoinAttempt(BoardOutcome.Locked, board.Id, board.Title,
                Message: "Доска закрыта: сейчас на неё не пускают.");

        var requestId = $"u{user.Id}";

        if (board.AutoAdmit)
        {
            await AddMemberAsync(board.Id, user.Id, BoardMember.RoleViewer, cancellationToken);
            return new JoinAttempt(BoardOutcome.Ok, board.Id, board.Title, Role: BoardMember.RoleViewer);
        }

        await _waiting.ClearRejectionAsync(board.Id, requestId);
        await _waiting.RequestAsync(board.Id, new WaitingRequest(requestId, user.DisplayName, user.Id, DateTime.UtcNow));

        return new JoinAttempt(BoardOutcome.Waiting, board.Id, board.Title, RequestId: requestId,
            Message: "Ждём, пока преподаватель впустит вас на доску.");
    }

    /// <summary>
    /// Что с моей заявкой. Опрашивается страницей ожидания, пока владелец
    /// не примет решение.
    /// </summary>
    public async Task<JoinAttempt> CheckRequestAsync(
        string? token, string requestId, string? displayName, long? userId, CancellationToken cancellationToken)
    {
        var board = await FindByLinkAsync(token, cancellationToken);
        if (board is null)
            return new JoinAttempt(BoardOutcome.NotFound, 0, "", Message: "Ссылка недействительна или её перевыпустили.");

        if (userId is not null)
        {
            var member = await _db.BoardMembers
                .FirstOrDefaultAsync(x => x.BoardId == board.Id && x.UserId == userId, cancellationToken);

            if (member is not null && member.BannedAt is null)
                return new JoinAttempt(BoardOutcome.Ok, board.Id, board.Title, Role: member.Role);
        }
        else
        {
            var admitted = await _waiting.AdmittedRoleAsync(board.Id, requestId);
            if (admitted is not null)
                return Admitted(board, admitted, displayName ?? "Гость", requestId);
        }

        if (await _waiting.IsRejectedAsync(board.Id, requestId))
            return new JoinAttempt(BoardOutcome.Rejected, board.Id, board.Title,
                Message: "Преподаватель не впустил вас на доску.");

        return await _waiting.IsWaitingAsync(board.Id, requestId)
            ? new JoinAttempt(BoardOutcome.Waiting, board.Id, board.Title, RequestId: requestId)
            : new JoinAttempt(BoardOutcome.Rejected, board.Id, board.Title,
                Message: "Заявка больше не действует. Откройте ссылку заново.");
    }

    // ---------- Комната ожидания глазами владельца ----------

    public async Task<BoardResult<List<WaitingRequest>>> ListWaitingAsync(long boardId, long userId, CancellationToken cancellationToken)
    {
        var board = await OwnedAsync(boardId, userId, cancellationToken);
        if (board is null)
            return BoardResult<List<WaitingRequest>>.NotFound();

        return BoardResult<List<WaitingRequest>>.Ok(await _waiting.ListAsync(boardId));
    }

    public async Task<BoardResult<bool>> AdmitAsync(
        long boardId, long userId, string requestId, string? role, CancellationToken cancellationToken)
    {
        if (role is not (BoardMember.RoleEditor or BoardMember.RoleViewer))
            return BoardResult<bool>.Bad("Роль — редактор или наблюдатель.");

        var board = await OwnedAsync(boardId, userId, cancellationToken);
        if (board is null)
            return BoardResult<bool>.NotFound();

        var request = await _waiting.FindAsync(boardId, requestId);
        if (request is null)
            return BoardResult<bool>.NotFound("Заявка уже неактуальна.");

        if (request.UserId is not null)
        {
            // У человека с учётной записью роль сохраняется навсегда: доска
            // остаётся у него в списке, и второй раз проситься не нужно.
            await AddMemberAsync(boardId, request.UserId.Value, role, cancellationToken);
        }
        else
        {
            await _waiting.AdmitAsync(boardId, requestId, request.DisplayName, role);
        }

        await _waiting.RemoveAsync(boardId, requestId);
        return BoardResult<bool>.Ok(true);
    }

    public async Task<BoardResult<bool>> RejectAsync(long boardId, long userId, string requestId, CancellationToken cancellationToken)
    {
        var board = await OwnedAsync(boardId, userId, cancellationToken);
        if (board is null)
            return BoardResult<bool>.NotFound();

        await _waiting.RejectAsync(boardId, requestId);
        await _waiting.RemoveAsync(boardId, requestId);

        return BoardResult<bool>.Ok(true);
    }

    // ---------- Участники ----------

    /// <summary>
    /// Список участников видит любой, кто на доске: понимать, с кем
    /// работаешь, нужно всем. Доступ здесь не проверяется — вызывающий
    /// (эндпойнт /state) уже прошёл через <see cref="ResolveActorAsync"/>,
    /// и гостя вторая проверка по <c>userId</c> только выгоняла бы напрасно.
    /// </summary>
    public Task<List<BoardMember>> ListMembersAsync(long boardId, CancellationToken cancellationToken)
        => _db.BoardMembers
            .Include(x => x.User)
            .Where(x => x.BoardId == boardId && x.BannedAt == null)
            .OrderBy(x => x.JoinedAt)
            .ToListAsync(cancellationToken);

    /// <summary>Гости, впущенные на доску и активные прямо сейчас.</summary>
    public Task<List<ActiveGuest>> ListActiveGuestsAsync(long boardId)
        => _waiting.ListActiveGuestsAsync(boardId);

    public async Task<BoardResult<bool>> SetMemberRoleAsync(
        long boardId, long userId, long memberUserId, string? role, CancellationToken cancellationToken)
    {
        if (role is not (BoardMember.RoleEditor or BoardMember.RoleViewer))
            return BoardResult<bool>.Bad("Роль — редактор или наблюдатель.");

        var member = await ManageableMemberAsync(boardId, userId, memberUserId, cancellationToken);
        if (member is null)
            return BoardResult<bool>.NotFound("Участник не найден.");

        member.Role = role;
        await _db.SaveChangesAsync(cancellationToken);

        return BoardResult<bool>.Ok(true);
    }

    /// <summary>
    /// Выгнать: участник уходит с доски, но не наказан — по действующей
    /// ссылке он попросится снова и, если владелец передумал, вернётся.
    /// Это ответ на «сейчас не нужен», а не на «больше не приходи».
    /// </summary>
    public async Task<BoardResult<bool>> KickMemberAsync(
        long boardId, long userId, long memberUserId, CancellationToken cancellationToken)
    {
        var member = await ManageableMemberAsync(boardId, userId, memberUserId, cancellationToken);
        if (member is null)
            return BoardResult<bool>.NotFound("Участник не найден.");

        _db.BoardMembers.Remove(member);
        await _db.SaveChangesAsync(cancellationToken);

        return BoardResult<bool>.Ok(true);
    }

    /// <summary>
    /// Забанить: доступ закрыт до отмены, ссылка не помогает. Только для
    /// тех, у кого есть учётная запись: гостя опознаёт лишь метка браузера,
    /// а она стирается вместе с данными сайта — запрет по ней был бы
    /// обещанием, которого сервис не сдержит.
    /// </summary>
    public async Task<BoardResult<bool>> BanMemberAsync(
        long boardId, long userId, long memberUserId, CancellationToken cancellationToken)
    {
        var member = await ManageableMemberAsync(boardId, userId, memberUserId, cancellationToken);
        if (member is null)
            return BoardResult<bool>.NotFound("Участник не найден.");

        member.BannedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        return BoardResult<bool>.Ok(true);
    }

    /// <summary>
    /// Роль гостя. Живёт в допуске, а не в базе, поэтому и меняется там же —
    /// и пропадает вместе с допуском, когда гость уходит с доски.
    /// </summary>
    public async Task<BoardResult<bool>> SetGuestRoleAsync(
        long boardId, long userId, string guestId, string? role, CancellationToken cancellationToken)
    {
        if (role is not (BoardMember.RoleEditor or BoardMember.RoleViewer))
            return BoardResult<bool>.Bad("Роль — редактор или наблюдатель.");

        var board = await OwnedAsync(boardId, userId, cancellationToken);
        if (board is null)
            return BoardResult<bool>.NotFound();

        return await _waiting.SetRoleAsync(boardId, guestId, role)
            ? BoardResult<bool>.Ok(true)
            : BoardResult<bool>.NotFound("Этого гостя уже нет на доске.");
    }

    /// <summary>
    /// Гость уходит сам: допуск отбирается сразу, а не по истечении срока.
    /// Для участника с учётной записью это не имеет смысла — доступ у него
    /// сохранён и без того, поэтому вызов для не-гостя просто ничего не делает.
    /// </summary>
    public Task LeaveAsGuestAsync(long boardId, string? guestToken, CancellationToken cancellationToken)
    {
        var guest = _guestTokens.Read(guestToken, boardId);
        return guest?.GuestId is null
            ? Task.CompletedTask
            : _waiting.RevokeAdmissionAsync(boardId, guest.GuestId);
    }

    /// <summary>Убрать гостя: допуск отбирается, и он снова просится в очередь.</summary>
    public async Task<BoardResult<bool>> RemoveGuestAsync(
        long boardId, long userId, string guestId, CancellationToken cancellationToken)
    {
        var board = await OwnedAsync(boardId, userId, cancellationToken);
        if (board is null)
            return BoardResult<bool>.NotFound();

        if (string.IsNullOrWhiteSpace(guestId))
            return BoardResult<bool>.Bad("Не указано, кого удалять.");

        await _waiting.RevokeAdmissionAsync(boardId, guestId);
        return BoardResult<bool>.Ok(true);
    }

    // ---------- Доступ ----------

    /// <summary>
    /// Кто обращается к доске. Единственное место, где решается вопрос
    /// доступа: и API, и хаб спрашивают здесь, чтобы правила не разошлись.
    /// </summary>
    public async Task<BoardActor?> ResolveActorAsync(
        long boardId, long? userId, string? guestToken, CancellationToken cancellationToken)
    {
        var board = await _db.Boards
            .FirstOrDefaultAsync(x => x.Id == boardId && x.DeletedAt == null, cancellationToken);

        if (board is null)
            return null;

        if (userId is not null)
        {
            var member = await _db.BoardMembers
                .Include(x => x.User)
                .FirstOrDefaultAsync(x => x.BoardId == boardId && x.UserId == userId, cancellationToken);

            if (member is null || member.BannedAt is not null)
                return null;

            return new BoardActor(boardId, member.Role, member.User?.DisplayName ?? "Участник", userId, GuestId: null);
        }

        var guest = _guestTokens.Read(guestToken, boardId);
        if (guest?.GuestId is null)
            return null;

        // Допуск проверяется на каждом обращении и заодно продлевается.
        // Токен гостя живёт двенадцать часов, но доска у него открыта ровно
        // столько, сколько владелец не передумал.
        var role = await _waiting.AdmittedRoleAsync(boardId, guest.GuestId);
        if (role is null)
            return null;

        // Роль берём из допуска, а не из токена: владелец мог её поменять
        // после того, как токен был выдан.
        return guest with { Role = role };
    }

    // ---------- Вспомогательное ----------

    private JoinAttempt Admitted(Board board, string role, string name, string marker)
        => new(BoardOutcome.Ok, board.Id, board.Title,
            Role: role,
            GuestToken: _guestTokens.Create(board.Id, role, name, marker),
            RequestId: marker);

    private async Task AddMemberAsync(long boardId, long userId, string role, CancellationToken cancellationToken)
    {
        var existing = await _db.BoardMembers
            .FirstOrDefaultAsync(x => x.BoardId == boardId && x.UserId == userId, cancellationToken);

        if (existing is not null)
        {
            existing.Role = role;
            existing.BannedAt = null;
        }
        else
        {
            _db.BoardMembers.Add(new BoardMember
            {
                BoardId = boardId,
                UserId = userId,
                Role = role,
                Source = BoardMember.SourceLink,
                JoinedAt = DateTime.UtcNow
            });
        }

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Уникальный индекс (board_id, user_id): два одновременных
            // принятия одной заявки. Второе просто ничего не добавляет.
            _db.ChangeTracker.Clear();
        }
    }

    private async Task<Board?> OwnedAsync(long boardId, long userId, CancellationToken cancellationToken)
        => await _db.Boards.FirstOrDefaultAsync(
            x => x.Id == boardId && x.OwnerId == userId && x.DeletedAt == null, cancellationToken);

    private async Task<BoardMember?> ManageableMemberAsync(
        long boardId, long userId, long memberUserId, CancellationToken cancellationToken)
    {
        var board = await OwnedAsync(boardId, userId, cancellationToken);
        if (board is null)
            return null;

        // Владельца нельзя понизить или убрать — в том числе самому себе:
        // доска осталась бы без хозяина.
        if (memberUserId == board.OwnerId)
            return null;

        return await _db.BoardMembers
            .FirstOrDefaultAsync(x => x.BoardId == boardId && x.UserId == memberUserId, cancellationToken);
    }

    private async Task<Board?> FindByLinkAsync(string? token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token))
            return null;

        // Просроченная ссылка не находится вовсе — для пришедшего по ней это
        // неотличимо от перевыпущенной, и правильно: в обоих случаях ответ
        // один — попросите новую.
        var issuedAfter = DateTime.UtcNow - LinkLifetime;

        return await _db.Boards.FirstOrDefaultAsync(
            x => x.LinkToken == token && x.DeletedAt == null && x.LinkIssuedAt > issuedAfter,
            cancellationToken);
    }
}
