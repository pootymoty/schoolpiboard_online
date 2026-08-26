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
    Kicked
}

public sealed record BoardResult<T>(BoardOutcome Outcome, T? Value = default, string? Message = null)
{
    public static BoardResult<T> Ok(T value) => new(BoardOutcome.Ok, value);
    public static BoardResult<T> NotFound(string message = "Доска не найдена.") => new(BoardOutcome.NotFound, Message: message);
    public static BoardResult<T> Forbidden(string message = "Недостаточно прав.") => new(BoardOutcome.Forbidden, Message: message);
    public static BoardResult<T> Bad(string message) => new(BoardOutcome.BadRequest, Message: message);
}

/// <summary>
/// Доски, ссылки на них и участники.
///
/// Права проверяются здесь, а не в интерфейсе: скрытая кнопка ничего не
/// запрещает, и наблюдатель, обратившийся к API напрямую, обязан получить
/// отказ (пункт 13.3 приёмки).
/// </summary>
public sealed class BoardService
{
    private const int MaxTitleLength = 200;
    private const int MaxGuestNameLength = 60;

    private readonly AppDbContext _db;
    private readonly GuestTokenService _guestTokens;
    private readonly KickList _kicks;
    private readonly ILogger<BoardService> _logger;

    public BoardService(
        AppDbContext db,
        GuestTokenService guestTokens,
        KickList kicks,
        ILogger<BoardService> logger)
    {
        _db = db;
        _guestTokens = guestTokens;
        _kicks = kicks;
        _logger = logger;
    }

    // ---------- Доски ----------

    public async Task<BoardResult<Board>> CreateAsync(long userId, string? title, CancellationToken cancellationToken)
    {
        var name = (title ?? string.Empty).Trim();
        if (name.Length is 0 or > MaxTitleLength)
            return BoardResult<Board>.Bad($"Название доски — от 1 до {MaxTitleLength} символов.");

        var now = DateTime.UtcNow;

        var board = new Board
        {
            OwnerId = userId,
            Title = name,
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

    /// <summary>Доски, где человек — участник: и свои, и те, куда он вошёл по ссылке.</summary>
    public async Task<List<(Board Board, BoardMember Member)>> ListAsync(long userId, CancellationToken cancellationToken)
    {
        var rows = await _db.BoardMembers
            .Include(x => x.Board)
            .Where(x => x.UserId == userId
                        && x.BannedAt == null
                        && x.Board!.DeletedAt == null)
            .OrderByDescending(x => x.Board!.UpdatedAt)
            .ToListAsync(cancellationToken);

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

    public async Task<BoardResult<bool>> SetLockedAsync(long boardId, long userId, bool locked, CancellationToken cancellationToken)
    {
        var board = await OwnedAsync(boardId, userId, cancellationToken);
        if (board is null)
            return BoardResult<bool>.NotFound();

        board.Locked = locked;
        board.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        return BoardResult<bool>.Ok(locked);
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

    // ---------- Ссылки ----------

    public async Task<BoardResult<BoardLink>> CreateLinkAsync(
        long boardId, long userId, string? role, string? label, int? lifetimeDays, CancellationToken cancellationToken)
    {
        if (role is not (BoardMember.RoleEditor or BoardMember.RoleViewer))
            return BoardResult<BoardLink>.Bad("Роль ссылки — editor или viewer.");

        var board = await OwnedAsync(boardId, userId, cancellationToken);
        if (board is null)
            return BoardResult<BoardLink>.NotFound();

        var now = DateTime.UtcNow;

        var link = new BoardLink
        {
            BoardId = boardId,
            Token = SecurityTokens.Create(),
            Role = role,
            Label = string.IsNullOrWhiteSpace(label) ? null : label.Trim(),
            CreatedAt = now,
            ExpiresAt = lifetimeDays is > 0 ? now.AddDays(lifetimeDays.Value) : null
        };

        _db.BoardLinks.Add(link);
        await _db.SaveChangesAsync(cancellationToken);

        return BoardResult<BoardLink>.Ok(link);
    }

    public async Task<BoardResult<List<BoardLink>>> ListLinksAsync(long boardId, long userId, CancellationToken cancellationToken)
    {
        var board = await OwnedAsync(boardId, userId, cancellationToken);
        if (board is null)
            return BoardResult<List<BoardLink>>.NotFound();

        var links = await _db.BoardLinks
            .Where(x => x.BoardId == boardId && x.RevokedAt == null)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync(cancellationToken);

        return BoardResult<List<BoardLink>>.Ok(links);
    }

    public async Task<BoardResult<bool>> RevokeLinkAsync(long boardId, long userId, long linkId, CancellationToken cancellationToken)
    {
        var board = await OwnedAsync(boardId, userId, cancellationToken);
        if (board is null)
            return BoardResult<bool>.NotFound();

        var link = await _db.BoardLinks
            .FirstOrDefaultAsync(x => x.Id == linkId && x.BoardId == boardId, cancellationToken);

        if (link is null)
            return BoardResult<bool>.NotFound("Ссылка не найдена.");

        // Отзыв действует немедленно: проверка идёт по этому полю при каждом
        // входе, кеша ссылок нигде нет. Пункт 13.5 приёмки.
        link.RevokedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Отозвана ссылка {LinkId} на доску {BoardId}.", linkId, boardId);
        return BoardResult<bool>.Ok(true);
    }

    // ---------- Вход по ссылке ----------

    /// <summary>Что за доска — видно и до входа: человек должен понимать, куда его зовут.</summary>
    public async Task<BoardResult<(Board Board, BoardLink Link)>> PeekLinkAsync(string? token, CancellationToken cancellationToken)
    {
        var link = await FindUsableLinkAsync(token, cancellationToken);
        if (link?.Board is null)
            return BoardResult<(Board, BoardLink)>.NotFound("Ссылка недействительна или отозвана.");

        return BoardResult<(Board, BoardLink)>.Ok((link.Board, link));
    }

    /// <summary>
    /// Вход по ссылке под своей учётной записью. Заводит участника: дальше
    /// доступ держится на нём, и отзыв ссылки доску уже не забирает.
    /// </summary>
    public async Task<BoardResult<Board>> JoinAsUserAsync(string? token, long userId, CancellationToken cancellationToken)
    {
        var link = await FindUsableLinkAsync(token, cancellationToken);
        if (link?.Board is null)
            return BoardResult<Board>.NotFound("Ссылка недействительна или отозвана.");

        var existing = await _db.BoardMembers
            .FirstOrDefaultAsync(x => x.BoardId == link.BoardId && x.UserId == userId, cancellationToken);

        if (existing is not null)
        {
            if (existing.BannedAt is not null)
                return BoardResult<Board>.Forbidden("Владелец закрыл вам доступ к этой доске.");

            // Уже участник — повторный переход по ссылке роль не меняет:
            // иначе понижённый в наблюдатели вернул бы себе право правки
            // сам, просто открыв ссылку ещё раз.
            return BoardResult<Board>.Ok(link.Board);
        }

        if (link.Board.Locked)
            return new BoardResult<Board>(BoardOutcome.Locked, Message: "Доска закрыта для новых участников.");

        _db.BoardMembers.Add(new BoardMember
        {
            BoardId = link.BoardId,
            UserId = userId,
            Role = link.Role,
            Source = BoardMember.SourceLink,
            LinkId = link.Id,
            JoinedAt = DateTime.UtcNow
        });

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Уникальный индекс (board_id, user_id):два одновременных перехода
            // по ссылке. Второй просто получает уже созданного участника.
            _db.ChangeTracker.Clear();
        }

        return BoardResult<Board>.Ok(link.Board);
    }

    /// <summary>
    /// Вход гостем. Ничего не сохраняет: всё, что о госте известно, уезжает
    /// в его токен. Возвращает этот токен и метку, по которой гостя можно
    /// выгнать.
    /// </summary>
    public async Task<BoardResult<(string Token, Board Board, string Role, string GuestId)>> JoinAsGuestAsync(
        string? token, string? displayName, string? previousGuestId, CancellationToken cancellationToken)
    {
        var name = (displayName ?? string.Empty).Trim();
        if (name.Length is 0 or > MaxGuestNameLength)
            return BoardResult<(string, Board, string, string)>.Bad($"Имя — от 1 до {MaxGuestNameLength} символов.");

        var link = await FindUsableLinkAsync(token, cancellationToken);
        if (link?.Board is null)
            return BoardResult<(string, Board, string, string)>.NotFound("Ссылка недействительна или отозвана.");

        // Метка сохраняется между заходами, если браузер её вернул: иначе
        // выгнанный обходил бы отказ простым обновлением страницы.
        var guestId = string.IsNullOrWhiteSpace(previousGuestId)
            ? SecurityTokens.Create()
            : previousGuestId;

        if (await _kicks.ContainsAsync(link.BoardId, guestId))
        {
            var left = await _kicks.RemainingAsync(link.BoardId, guestId);
            var minutes = left is null ? 15 : Math.Max(1, (int)Math.Ceiling(left.Value.TotalMinutes));

            return new BoardResult<(string, Board, string, string)>(
                BoardOutcome.Kicked,
                Message: $"Вас удалили с этой доски. Попробовать снова можно через {minutes} мин.");
        }

        if (link.Board.Locked)
            return new BoardResult<(string, Board, string, string)>(
                BoardOutcome.Locked, Message: "Доска закрыта для новых участников.");

        var guestToken = _guestTokens.Create(link.BoardId, link.Role, name, guestId);

        // Метка возвращается клиенту, чтобы он прислал её при следующем заходе:
        // без этого выгнанный обходил бы отказ обновлением страницы, получая
        // каждый раз новую метку.
        return BoardResult<(string, Board, string, string)>.Ok((guestToken, link.Board, link.Role, guestId));
    }

    // ---------- Участники ----------

    public async Task<BoardResult<List<BoardMember>>> ListMembersAsync(long boardId, long userId, CancellationToken cancellationToken)
    {
        var board = await OwnedAsync(boardId, userId, cancellationToken);
        if (board is null)
            return BoardResult<List<BoardMember>>.NotFound();

        var members = await _db.BoardMembers
            .Include(x => x.User)
            .Where(x => x.BoardId == boardId)
            .OrderBy(x => x.JoinedAt)
            .ToListAsync(cancellationToken);

        return BoardResult<List<BoardMember>>.Ok(members);
    }

    public async Task<BoardResult<BoardMember>> SetMemberRoleAsync(
        long boardId, long userId, long memberUserId, string? role, CancellationToken cancellationToken)
    {
        if (role is not (BoardMember.RoleEditor or BoardMember.RoleViewer))
            return BoardResult<BoardMember>.Bad("Роль — editor или viewer.");

        var member = await ManageableMemberAsync(boardId, userId, memberUserId, cancellationToken);
        if (member is null)
            return BoardResult<BoardMember>.NotFound("Участник не найден.");

        member.Role = role;
        await _db.SaveChangesAsync(cancellationToken);

        return BoardResult<BoardMember>.Ok(member);
    }

    public async Task<BoardResult<bool>> SetMemberBannedAsync(
        long boardId, long userId, long memberUserId, bool banned, CancellationToken cancellationToken)
    {
        var member = await ManageableMemberAsync(boardId, userId, memberUserId, cancellationToken);
        if (member is null)
            return BoardResult<bool>.NotFound("Участник не найден.");

        member.BannedAt = banned ? DateTime.UtcNow : null;
        await _db.SaveChangesAsync(cancellationToken);

        return BoardResult<bool>.Ok(banned);
    }

    /// <summary>Выгнать гостя: отключение плюс отказ на пятнадцать минут.</summary>
    public async Task<BoardResult<bool>> KickGuestAsync(long boardId, long userId, string guestId, CancellationToken cancellationToken)
    {
        var board = await OwnedAsync(boardId, userId, cancellationToken);
        if (board is null)
            return BoardResult<bool>.NotFound();

        if (string.IsNullOrWhiteSpace(guestId))
            return BoardResult<bool>.Bad("Не указано, кого удалять.");

        await _kicks.AddAsync(boardId, guestId);
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
        if (guest is null)
            return null;

        // Выгнанный гость перестаёт быть участником сразу, не дожидаясь
        // истечения токена: токен ему никто не отзывал, отказ живёт отдельно.
        if (guest.GuestId is not null && await _kicks.ContainsAsync(boardId, guest.GuestId))
            return null;

        return guest;
    }

    // ---------- Вспомогательное ----------

    private async Task<Board?> OwnedAsync(long boardId, long userId, CancellationToken cancellationToken)
        => await _db.Boards.FirstOrDefaultAsync(
            x => x.Id == boardId && x.OwnerId == userId && x.DeletedAt == null, cancellationToken);

    private async Task<BoardMember?> ManageableMemberAsync(
        long boardId, long userId, long memberUserId, CancellationToken cancellationToken)
    {
        var board = await OwnedAsync(boardId, userId, cancellationToken);
        if (board is null)
            return null;

        // Владельца нельзя понизить или закрыть ему доступ — в том числе
        // самому себе: доска осталась бы без хозяина.
        if (memberUserId == board.OwnerId)
            return null;

        return await _db.BoardMembers
            .FirstOrDefaultAsync(x => x.BoardId == boardId && x.UserId == memberUserId, cancellationToken);
    }

    private async Task<BoardLink?> FindUsableLinkAsync(string? token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token))
            return null;

        var link = await _db.BoardLinks
            .Include(x => x.Board)
            .FirstOrDefaultAsync(x => x.Token == token, cancellationToken);

        if (link?.Board is null || link.Board.DeletedAt is not null)
            return null;

        return link.IsUsable(DateTime.UtcNow) ? link : null;
    }
}
