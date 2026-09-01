namespace SchoolPiBoard.Web.Data.Entities;

/// <summary>
/// Загруженный файл: либо документ в библиотеке пользователя, либо
/// картинка, положенная на доску.
///
/// Оба вида лежат в одной таблице намеренно: место считается общим на
/// человека, а разными таблицами это пришлось бы складывать двумя
/// запросами и не забывать про них в каждом новом месте.
///
/// Сами байты живут на диске, в базе только запись о файле: класть
/// мегабайты в jsonb — значит возить их в каждом ответе и в журнале
/// событий доски.
/// </summary>
public class StoredFile
{
    /// <summary>Документ в личной библиотеке: PDF или картинка.</summary>
    public const string KindLibrary = "library";

    /// <summary>Картинка, лежащая на доске: страница документа или вставка из буфера.</summary>
    public const string KindBoard = "board";

    /// <summary>Сколько всего места на одного человека.</summary>
    public const long QuotaPerOwner = 100L * 1024 * 1024;

    /// <summary>Предел на один файл.</summary>
    public const long MaxFileSize = 25L * 1024 * 1024;

    public long Id { get; set; }

    /// <summary>
    /// Чьё место занимает файл. Для картинки на доске это владелец
    /// доски, а не тот, кто её принёс: доска и всё на ней — его.
    /// </summary>
    public long OwnerId { get; set; }

    public string Kind { get; set; } = KindLibrary;

    /// <summary>Доска, если это картинка на доске. У библиотеки пусто.</summary>
    public long? BoardId { get; set; }

    /// <summary>Имя, под которым файл пришёл от человека.</summary>
    public string Name { get; set; } = string.Empty;

    public string ContentType { get; set; } = string.Empty;

    public long Size { get; set; }

    /// <summary>Путь внутри хранилища. Он же — неугадываемый ключ картинки.</summary>
    public string StorageKey { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }
}
