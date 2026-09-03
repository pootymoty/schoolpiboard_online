using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;

namespace SchoolPiBoard.Web.Services;

/// <summary>
/// Страницы доски и то, кому какая открыта.
///
/// Видимость проверяется здесь и только здесь: у страницы её спрашивают
/// и при входе, и при переключении, и при каждом изменении объекта, и
/// три разных ответа на один вопрос — это дыра, которую однажды найдут.
/// </summary>
public sealed class PageService
{
    private readonly AppDbContext _db;

    public PageService(AppDbContext db) => _db = db;

    /// <summary>Ключ участника: у гостя учётной записи нет, и номера тоже.</summary>
    public static string KeyOf(long? userId, string? guestId)
        => userId is not null
            ? BoardPageViewer.ForUser(userId.Value)
            : BoardPageViewer.ForGuest(guestId ?? string.Empty);

    public Task<List<BoardPage>> AllAsync(long boardId, CancellationToken cancellationToken)
        => _db.BoardPages
            .Where(x => x.BoardId == boardId)
            .OrderBy(x => x.Sort)
            .ThenBy(x => x.Id)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// Страницы, которые этот участник вправе открыть.
    ///
    /// Владелец видит все — иначе он не мог бы вести занятие. Остальные
    /// видят общие и те, куда их позвали поимённо.
    /// </summary>
    public async Task<List<BoardPage>> VisibleAsync(
        long boardId, bool canManage, long? userId, string? guestId, CancellationToken cancellationToken)
    {
        var pages = await AllAsync(boardId, cancellationToken);
        if (canManage) return pages;

        var key = KeyOf(userId, guestId);

        // Список номеров готовим заранее: выражение по коллекции в памяти
        // база не переведёт, а страниц у доски десятки, не тысячи.
        var ids = pages.Select(page => page.Id).ToList();

        var invited = await _db.BoardPageViewers
            .Where(x => x.ParticipantKey == key && ids.Contains(x.PageId))
            .Select(x => x.PageId)
            .ToListAsync(cancellationToken);

        return pages
            .Where(page => page.Visibility == BoardPage.VisibilityAll
                || (page.Visibility == BoardPage.VisibilitySelected && invited.Contains(page.Id)))
            .ToList();
    }

    /// <summary>Открыта ли участнику именно эта страница.</summary>
    public async Task<BoardPage?> OpenAsync(
        long boardId, long pageId, bool canManage, long? userId, string? guestId,
        CancellationToken cancellationToken)
    {
        var page = await _db.BoardPages
            .FirstOrDefaultAsync(x => x.Id == pageId && x.BoardId == boardId, cancellationToken);

        if (page is null) return null;
        if (canManage || page.Visibility == BoardPage.VisibilityAll) return page;
        if (page.Visibility == BoardPage.VisibilityOwner) return null;

        var key = KeyOf(userId, guestId);

        var invited = await _db.BoardPageViewers
            .AnyAsync(x => x.PageId == pageId && x.ParticipantKey == key, cancellationToken);

        return invited ? page : null;
    }

    /// <summary>
    /// Первая страница, доступная участнику. Ей открывается доска.
    ///
    /// Доска без страниц не бывает: у самых старых её завела миграция, у
    /// новых — создание доски. Но участнику может быть не открыто ничего,
    /// и тогда честный ответ — пусто, а не чужая страница.
    /// </summary>
    public async Task<BoardPage?> FirstAsync(
        long boardId, bool canManage, long? userId, string? guestId, CancellationToken cancellationToken)
    {
        var visible = await VisibleAsync(boardId, canManage, userId, guestId, cancellationToken);
        return visible.FirstOrDefault();
    }

    /// <summary>Заводит страницу в конце полосы.</summary>
    public async Task<BoardPage?> AddAsync(long boardId, string? title, CancellationToken cancellationToken)
    {
        var pages = await AllAsync(boardId, cancellationToken);
        if (pages.Count >= BoardPage.MaxPerBoard) return null;

        var page = new BoardPage
        {
            BoardId = boardId,
            Title = Clean(title) ?? $"Страница {pages.Count + 1}",
            Sort = pages.Count == 0 ? 1 : pages[^1].Sort + 1,
            Visibility = BoardPage.VisibilityAll,
            CreatedAt = DateTime.UtcNow
        };

        _db.BoardPages.Add(page);
        await _db.SaveChangesAsync(cancellationToken);

        return page;
    }

    public async Task<bool> RenameAsync(
        long boardId, long pageId, string? title, CancellationToken cancellationToken)
    {
        var clean = Clean(title);
        if (clean is null) return false;

        var page = await _db.BoardPages
            .FirstOrDefaultAsync(x => x.Id == pageId && x.BoardId == boardId, cancellationToken);

        if (page is null) return false;

        page.Title = clean;
        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    /// <summary>
    /// Удаляет страницу вместе со всем, что на ней. Последнюю удалить
    /// нельзя: доска без страниц — доска, которую негде показать.
    /// </summary>
    public async Task<bool> DeleteAsync(long boardId, long pageId, CancellationToken cancellationToken)
    {
        var pages = await AllAsync(boardId, cancellationToken);
        if (pages.Count <= 1) return false;

        var page = pages.FirstOrDefault(x => x.Id == pageId);
        if (page is null) return false;

        _db.BoardPages.Remove(page);
        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    /// <summary>Новый порядок страниц. Неупомянутые остаются в конце.</summary>
    public async Task<bool> ReorderAsync(long boardId, long[] order, CancellationToken cancellationToken)
    {
        var pages = await AllAsync(boardId, cancellationToken);
        if (pages.Count == 0) return false;

        var sort = 1;

        foreach (var id in order)
        {
            var page = pages.FirstOrDefault(x => x.Id == id);
            if (page is null) continue;

            page.Sort = sort++;
        }

        foreach (var page in pages.Where(x => !order.Contains(x.Id))) page.Sort = sort++;

        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    /// <summary>
    /// Меняет видимость. Список участников имеет смысл только у выборочной
    /// видимости, поэтому в остальных случаях он очищается: оставленный
    /// список однажды сработал бы при возврате к «выбранным», хотя звали
    /// туда совсем других.
    /// </summary>
    public async Task<bool> SetVisibilityAsync(
        long boardId, long pageId, string? visibility, string[] keys, CancellationToken cancellationToken)
    {
        if (visibility is null || !BoardPage.Visibilities.Contains(visibility)) return false;

        var page = await _db.BoardPages
            .FirstOrDefaultAsync(x => x.Id == pageId && x.BoardId == boardId, cancellationToken);

        if (page is null) return false;

        page.Visibility = visibility;

        var old = await _db.BoardPageViewers.Where(x => x.PageId == pageId).ToListAsync(cancellationToken);
        _db.BoardPageViewers.RemoveRange(old);

        if (visibility == BoardPage.VisibilitySelected)
        {
            foreach (var key in keys.Where(IsKey).Distinct().Take(64))
                _db.BoardPageViewers.Add(new BoardPageViewer { PageId = pageId, ParticipantKey = key });
        }

        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    /// <summary>Кому открыта страница — для панели страниц у владельца.</summary>
    public Task<List<string>> ViewersAsync(long pageId, CancellationToken cancellationToken)
        => _db.BoardPageViewers
            .Where(x => x.PageId == pageId)
            .Select(x => x.ParticipantKey)
            .ToListAsync(cancellationToken);

    /// <summary>Ключ участника выглядит как «u:12» или «g:abc» — прочее не берём.</summary>
    private static bool IsKey(string key)
        => key.Length is > 2 and < 128 && (key.StartsWith("u:") || key.StartsWith("g:"));

    private static string? Clean(string? title)
    {
        var value = (title ?? string.Empty).Trim();
        if (value.Length == 0) return null;

        return value.Length > 60 ? value[..60] : value;
    }
}
