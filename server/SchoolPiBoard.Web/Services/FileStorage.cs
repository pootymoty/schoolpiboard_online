using System.Security.Cryptography;
using SchoolPiBoard.Web.Configuration;

namespace SchoolPiBoard.Web.Services;

/// <summary>
/// Байты загруженных файлов — на диске рядом со службой.
///
/// Не в базе: мегабайты в jsonb возились бы в каждом ответе и оседали в
/// журнале событий доски. И не в объектном хранилище: за него нужно
/// платить и заводить ключи, а диск на сервере уже есть — при переезде
/// в S3 меняется только этот класс.
///
/// Папка живёт вне каталога с приложением: выкладка распаковывает архив
/// поверх /var/www, и хранилище внутри неё пропадало бы при каждом
/// обновлении.
/// </summary>
public sealed class FileStorage
{
    private readonly string _root;
    private readonly ILogger<FileStorage> _log;

    public FileStorage(AppOptions options, ILogger<FileStorage> log)
    {
        _root = options.FilesDir;
        _log = log;

        try
        {
            Directory.CreateDirectory(_root);
        }
        catch (Exception error)
        {
            // Не роняем службу: доска должна работать и без загрузки файлов.
            // Ошибку увидит тот, кто попробует что-то загрузить, а причина
            // (обычно — нет прав на каталог) окажется в журнале сразу.
            _log.LogError(error, "Хранилище файлов недоступно: {Dir}", _root);
        }
    }

    /// <summary>
    /// Ключ файла. Он же — адрес картинки на доске, поэтому его нельзя
    /// подобрать: доступ к картинке даёт знание ссылки, как и к самой доске.
    /// </summary>
    public static string NewKey(string extension)
        => Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant() + extension;

    /// <summary>Кладёт файл и возвращает, сколько байт легло.</summary>
    public async Task<long> SaveAsync(string key, Stream content, CancellationToken cancellationToken)
    {
        var path = PathOf(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);

        await using var target = File.Create(path);
        await content.CopyToAsync(target, cancellationToken);

        return target.Length;
    }

    public Stream? OpenRead(string key)
    {
        var path = PathOf(key);
        return File.Exists(path) ? File.OpenRead(path) : null;
    }

    public void Delete(string key)
    {
        try
        {
            var path = PathOf(key);
            if (File.Exists(path)) File.Delete(path);
        }
        catch (IOException error)
        {
            // Не находим повода ронять запрос: запись в базе уже удалена,
            // а осиротевший файл ничего не ломает и уйдёт при следующей
            // уборке каталога.
            _log.LogWarning(error, "Не удалось удалить файл {Key}", key);
        }
    }

    /// <summary>
    /// Полный путь к файлу. Ключ проверяется целиком: без этого «..» в
    /// нём вывел бы запись и чтение за пределы хранилища.
    /// </summary>
    private string PathOf(string key)
    {
        var full = Path.GetFullPath(Path.Combine(_root, key));
        var root = Path.GetFullPath(_root);

        if (!full.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.Ordinal))
            throw new InvalidOperationException("Ключ файла ведёт за пределы хранилища.");

        return full;
    }
}
