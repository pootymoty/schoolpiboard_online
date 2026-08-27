using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;

namespace SchoolPiBoard.Web.Services;

/// <summary>
/// Содержимое доски: объекты и замки на них.
///
/// Замок нужен, чтобы двое не тащили одну фигуру в разные стороны. Он
/// протухает сам через десять секунд и продлевается, пока объект держат:
/// иначе участник, у которого оборвалась связь, заблокировал бы фигуру
/// навсегда (раздел 5.2).
/// </summary>
public sealed class BoardItemService
{
    /// <summary>Сколько живёт замок без продления.</summary>
    public static readonly TimeSpan LockLifetime = TimeSpan.FromSeconds(10);

    /// <summary>
    /// Предел на размер одного объекта. Длинный штрих — это тысячи точек,
    /// поэтому предел щедрый; он защищает не от рисования, а от того, кто
    /// решит положить в доску мегабайт своими руками.
    /// </summary>
    private const int MaxDataLength = 512 * 1024;

    /// <summary>Сколько объектов помещается на одну доску.</summary>
    private const int MaxItemsPerBoard = 20_000;

    private readonly AppDbContext _db;

    public BoardItemService(AppDbContext db) => _db = db;

    public Task<List<BoardItem>> ListAsync(long boardId, CancellationToken cancellationToken)
        => _db.BoardItems
            .Where(x => x.BoardId == boardId)
            .OrderBy(x => x.Z).ThenBy(x => x.Id)
            .ToListAsync(cancellationToken);

    /// <summary>Создаёт объект поверх остальных.</summary>
    public async Task<BoardItem?> CreateAsync(
        long boardId, string? type, string? data, long? createdBy, CancellationToken cancellationToken)
    {
        if (type is null || !BoardItem.KnownTypes.Contains(type))
            return null;

        if (string.IsNullOrWhiteSpace(data) || data.Length > MaxDataLength)
            return null;

        if (await _db.BoardItems.CountAsync(x => x.BoardId == boardId, cancellationToken) >= MaxItemsPerBoard)
            return null;

        var top = await _db.BoardItems
            .Where(x => x.BoardId == boardId)
            .MaxAsync(x => (int?)x.Z, cancellationToken) ?? 0;

        var now = DateTime.UtcNow;

        var item = new BoardItem
        {
            BoardId = boardId,
            Type = type,
            Z = top + 1,
            Data = data,
            CreatedBy = createdBy,
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.BoardItems.Add(item);
        await _db.SaveChangesAsync(cancellationToken);

        return item;
    }

    /// <summary>
    /// Взять объект. Отказ — если его уже держит кто-то другой и замок
    /// не протух.
    /// </summary>
    public async Task<bool> TryLockAsync(
        long boardId, long itemId, string connectionId, CancellationToken cancellationToken)
    {
        var item = await FindAsync(boardId, itemId, cancellationToken);
        if (item is null)
            return false;

        if (IsHeldByOther(item, connectionId))
            return false;

        item.LockedBy = connectionId;
        item.LockedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        return true;
    }

    /// <summary>
    /// Изменить взятый объект. Замок продлевается: пока фигуру двигают,
    /// срок не должен истекать под руками.
    /// </summary>
    public async Task<BoardItem?> UpdateAsync(
        long boardId, long itemId, string connectionId, string? data, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(data) || data.Length > MaxDataLength)
            return null;

        var item = await FindAsync(boardId, itemId, cancellationToken);
        if (item is null || IsHeldByOther(item, connectionId))
            return null;

        item.Data = data;
        item.UpdatedAt = DateTime.UtcNow;
        item.LockedBy = connectionId;
        item.LockedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(cancellationToken);
        return item;
    }

    public async Task<bool> UnlockAsync(
        long boardId, long itemId, string connectionId, CancellationToken cancellationToken)
    {
        var item = await FindAsync(boardId, itemId, cancellationToken);
        if (item is null || item.LockedBy != connectionId)
            return false;

        item.LockedBy = null;
        item.LockedAt = null;
        await _db.SaveChangesAsync(cancellationToken);

        return true;
    }

    /// <summary>Удаляет объекты. Возвращает те, что действительно были на доске.</summary>
    public async Task<List<long>> DeleteAsync(
        long boardId, IReadOnlyCollection<long> itemIds, CancellationToken cancellationToken)
    {
        if (itemIds.Count == 0)
            return new List<long>();

        var items = await _db.BoardItems
            .Where(x => x.BoardId == boardId && itemIds.Contains(x.Id))
            .ToListAsync(cancellationToken);

        if (items.Count == 0)
            return new List<long>();

        _db.BoardItems.RemoveRange(items);
        await _db.SaveChangesAsync(cancellationToken);

        return items.Select(x => x.Id).ToList();
    }

    /// <summary>
    /// Сдвинуть объекты. Сдвиг применяется здесь, а не присылается готовой
    /// геометрией: перемещение десятка штрихов иначе означало бы переслать
    /// все их точки заново ради двух чисел.
    /// </summary>
    public async Task<List<BoardItem>> MoveAsync(
        long boardId, IReadOnlyCollection<long> itemIds, double dx, double dy, CancellationToken cancellationToken)
    {
        if (itemIds.Count == 0 || (dx == 0 && dy == 0))
            return new List<BoardItem>();

        var items = await _db.BoardItems
            .Where(x => x.BoardId == boardId && itemIds.Contains(x.Id))
            .ToListAsync(cancellationToken);

        var now = DateTime.UtcNow;
        var moved = new List<BoardItem>();

        foreach (var item in items)
        {
            var shifted = Translate(item.Data, dx, dy);
            if (shifted is null) continue;

            item.Data = shifted;
            item.UpdatedAt = now;
            moved.Add(item);
        }

        if (moved.Count > 0)
            await _db.SaveChangesAsync(cancellationToken);

        return moved;
    }

    /// <summary>Сдвигает всю геометрию объекта: и точки штриха, и углы фигуры.</summary>
    private static string? Translate(string data, double dx, double dy)
    {
        try
        {
            var root = JsonNode.Parse(data)?.AsObject();
            if (root is null) return null;

            if (root["points"] is JsonArray points)
            {
                foreach (var point in points)
                {
                    if (point is not JsonObject node) continue;

                    node["x"] = (node["x"]?.GetValue<double>() ?? 0) + dx;
                    node["y"] = (node["y"]?.GetValue<double>() ?? 0) + dy;
                }
            }

            foreach (var (name, delta) in new[] { ("x1", dx), ("y1", dy), ("x2", dx), ("y2", dy) })
            {
                if (root[name] is not null)
                    root[name] = root[name]!.GetValue<double>() + delta;
            }

            return root.ToJsonString();
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException or FormatException)
        {
            // Объект с неожиданной геометрией просто не двигаем: уронить
            // перемещение всей выборки из-за одного такого нельзя.
            return null;
        }
    }

    /// <summary>
    /// Переложить объекты вперёд или назад. Порядок задаётся полем z:
    /// пересчитывать его у всей доски незачем — достаточно вынести
    /// переложенные за её нынешние границы.
    /// </summary>
    public async Task<List<BoardItem>> ReorderAsync(
        long boardId, IReadOnlyCollection<long> itemIds, bool toFront, CancellationToken cancellationToken)
    {
        if (itemIds.Count == 0)
            return new List<BoardItem>();

        var items = await _db.BoardItems
            .Where(x => x.BoardId == boardId && itemIds.Contains(x.Id))
            .OrderBy(x => x.Z)
            .ToListAsync(cancellationToken);

        if (items.Count == 0)
            return new List<BoardItem>();

        var edge = toFront
            ? await _db.BoardItems.Where(x => x.BoardId == boardId).MaxAsync(x => (int?)x.Z, cancellationToken) ?? 0
            : await _db.BoardItems.Where(x => x.BoardId == boardId).MinAsync(x => (int?)x.Z, cancellationToken) ?? 0;

        // Взаимный порядок внутри выборки сохраняем: перекладывают группу
        // целиком, а не перемешивают её.
        for (var index = 0; index < items.Count; index += 1)
        {
            items[index].Z = toFront
                ? edge + 1 + index
                : edge - items.Count + index;
        }

        await _db.SaveChangesAsync(cancellationToken);
        return items;
    }

    public async Task ClearAsync(long boardId, CancellationToken cancellationToken)
        => await _db.BoardItems.Where(x => x.BoardId == boardId).ExecuteDeleteAsync(cancellationToken);

    /// <summary>
    /// Снять все замки подключения. Вызывается при отключении: ушедший не
    /// должен держать фигуру до истечения срока, если про его уход уже
    /// известно наверняка.
    /// </summary>
    public async Task<List<long>> ReleaseLocksAsync(string connectionId, CancellationToken cancellationToken)
    {
        var held = await _db.BoardItems
            .Where(x => x.LockedBy == connectionId)
            .ToListAsync(cancellationToken);

        if (held.Count == 0)
            return new List<long>();

        foreach (var item in held)
        {
            item.LockedBy = null;
            item.LockedAt = null;
        }

        await _db.SaveChangesAsync(cancellationToken);
        return held.Select(x => x.Id).ToList();
    }

    /// <summary>Отметить, что доску меняли: по этому времени сортируется список досок.</summary>
    public async Task TouchBoardAsync(long boardId, CancellationToken cancellationToken)
        => await _db.Boards
            .Where(x => x.Id == boardId)
            .ExecuteUpdateAsync(set => set.SetProperty(x => x.UpdatedAt, DateTime.UtcNow), cancellationToken);

    private Task<BoardItem?> FindAsync(long boardId, long itemId, CancellationToken cancellationToken)
        => _db.BoardItems.FirstOrDefaultAsync(x => x.Id == itemId && x.BoardId == boardId, cancellationToken);

    /// <summary>Держит ли объект кто-то другой — с поправкой на протухший замок.</summary>
    private static bool IsHeldByOther(BoardItem item, string connectionId)
        => item.LockedBy is not null
           && item.LockedBy != connectionId
           && item.LockedAt is not null
           && DateTime.UtcNow - item.LockedAt.Value < LockLifetime;
}
