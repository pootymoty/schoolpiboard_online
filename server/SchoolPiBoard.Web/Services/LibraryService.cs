using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;

namespace SchoolPiBoard.Web.Services;

/// <summary>Что пошло не так при загрузке. Текст ответа собирается по этому.</summary>
public enum UploadOutcome
{
    Ok,
    TooLarge,
    QuotaExceeded,
    BadType,
    Empty,
    /// <summary>Библиотека документов есть не на всяком тарифе.</summary>
    NotOnPlan
}

public sealed record UploadResult(UploadOutcome Outcome, StoredFile? File = null);

/// <summary>
/// Библиотека файлов и картинки досок.
///
/// Место считается общим на человека: библиотека и картинки, которые он
/// положил на свои доски, живут в одной квоте — иначе пришлось бы
/// объяснять, почему свободного места вроде бы много, а положить нечего.
/// </summary>
public sealed class LibraryService
{
    /// <summary>
    /// Что принимаем. PDF — потому что из него режут страницы; картинки —
    /// потому что их вставляют из буфера и кладут на доску как есть.
    /// Word здесь нет намеренно: в браузере его не отрисовать, а ставить
    /// на сервер конвертер ради этого мы не стали.
    /// </summary>
    private static readonly Dictionary<string, string> Extensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ["application/pdf"] = ".pdf",
        ["image/png"] = ".png",
        ["image/jpeg"] = ".jpg",
        ["image/webp"] = ".webp"
    };

    private readonly AppDbContext _db;
    private readonly FileStorage _storage;
    private readonly SubscriptionService _subscriptions;

    public LibraryService(AppDbContext db, FileStorage storage, SubscriptionService subscriptions)
    {
        _db = db;
        _storage = storage;
        _subscriptions = subscriptions;
    }

    public Task<List<StoredFile>> ListAsync(long ownerId, CancellationToken cancellationToken)
        => _db.StoredFiles
            .Where(x => x.OwnerId == ownerId && x.Kind == StoredFile.KindLibrary)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync(cancellationToken);

    /// <summary>Сколько места занято — по обоим видам файлов сразу.</summary>
    public async Task<long> UsedAsync(long ownerId, CancellationToken cancellationToken)
        => await _db.StoredFiles
            .Where(x => x.OwnerId == ownerId)
            .SumAsync(x => (long?)x.Size, cancellationToken) ?? 0;

    public async Task<UploadResult> AddAsync(
        long ownerId,
        string kind,
        long? boardId,
        string? name,
        string? contentType,
        long declaredSize,
        Stream content,
        CancellationToken cancellationToken)
    {
        if (contentType is null || !Extensions.TryGetValue(contentType, out var extension))
            return new UploadResult(UploadOutcome.BadType);

        if (declaredSize <= 0)
            return new UploadResult(UploadOutcome.Empty);

        if (declaredSize > StoredFile.MaxFileSize)
            return new UploadResult(UploadOutcome.TooLarge);

        var access = await _subscriptions.AccessAsync(ownerId, cancellationToken);

        // Библиотека — платная возможность. Картинку из буфера на доску
        // кладут и на бесплатном: она мелкая и живёт вместе с доской.
        if (kind == StoredFile.KindLibrary && !access.Plan.HasLibrary)
            return new UploadResult(UploadOutcome.NotOnPlan);

        var quota = access.Plan.MaxStorageBytes;

        var used = await UsedAsync(ownerId, cancellationToken);
        if (used + declaredSize > quota)
            return new UploadResult(UploadOutcome.QuotaExceeded);

        var folder = kind == StoredFile.KindBoard ? $"boards/{boardId}" : $"library/{ownerId}";
        var key = $"{folder}/{FileStorage.NewKey(extension)}";

        var size = await _storage.SaveAsync(key, content, cancellationToken);

        // Заявленный размер приходит от браузера, настоящий известен только
        // после записи. Если файл оказался больше предела — убираем его, а не
        // оставляем лежать сверх квоты.
        if (size > StoredFile.MaxFileSize || used + size > quota)
        {
            _storage.Delete(key);
            return new UploadResult(size > StoredFile.MaxFileSize
                ? UploadOutcome.TooLarge
                : UploadOutcome.QuotaExceeded);
        }

        var file = new StoredFile
        {
            OwnerId = ownerId,
            Kind = kind,
            BoardId = boardId,
            Name = Trim(name, contentType),
            ContentType = contentType,
            Size = size,
            StorageKey = key,
            CreatedAt = DateTime.UtcNow
        };

        _db.StoredFiles.Add(file);
        await _db.SaveChangesAsync(cancellationToken);

        return new UploadResult(UploadOutcome.Ok, file);
    }

    public Task<StoredFile?> FindAsync(long id, long ownerId, CancellationToken cancellationToken)
        => _db.StoredFiles
            .FirstOrDefaultAsync(x => x.Id == id && x.OwnerId == ownerId, cancellationToken);

    /// <summary>Картинка ищется по ключу: он и есть пропуск к ней.</summary>
    public Task<StoredFile?> FindByKeyAsync(string key, CancellationToken cancellationToken)
        => _db.StoredFiles.FirstOrDefaultAsync(x => x.StorageKey == key, cancellationToken);

    public async Task<bool> DeleteAsync(long id, long ownerId, CancellationToken cancellationToken)
    {
        var file = await FindAsync(id, ownerId, cancellationToken);
        if (file is null) return false;

        _db.StoredFiles.Remove(file);
        await _db.SaveChangesAsync(cancellationToken);

        _storage.Delete(file.StorageKey);
        return true;
    }

    /// <summary>Уносит картинки удалённой доски: без доски они никому не нужны.</summary>
    public async Task DeleteBoardFilesAsync(long boardId, CancellationToken cancellationToken)
    {
        var files = await _db.StoredFiles
            .Where(x => x.BoardId == boardId)
            .ToListAsync(cancellationToken);

        if (files.Count == 0) return;

        _db.StoredFiles.RemoveRange(files);
        await _db.SaveChangesAsync(cancellationToken);

        foreach (var file in files) _storage.Delete(file.StorageKey);
    }

    /// <summary>Имя для списка: без пути, не пустое и не бесконечное.</summary>
    private static string Trim(string? name, string contentType)
    {
        var clean = Path.GetFileName(name ?? string.Empty).Trim();

        if (clean.Length == 0)
            clean = contentType == "application/pdf" ? "Документ.pdf" : "Картинка";

        return clean.Length > 200 ? clean[..200] : clean;
    }
}
