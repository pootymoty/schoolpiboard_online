namespace SchoolPiBoard.Web.Data.Entities;

/// <summary>
/// Объект на доске: штрих, фигура, надпись, картинка.
///
/// Геометрия лежит в <see cref="Data"/> как jsonb, а не разложена по
/// колонкам: у штриха это массив точек, у прямоугольника — четыре числа,
/// и колонками это означало бы отдельную таблицу под каждый тип фигуры
/// (раздел 5.2).
/// </summary>
public class BoardItem
{
    public const string TypeStroke = "stroke";

    /// <summary>
    /// Все фигуры — один тип. Какая именно, сказано в <c>data.shape</c>:
    /// иначе каждая новая фигура требовала бы менять и сервер, и базу.
    /// </summary>
    public const string TypeShape = "shape";

    public const string TypeText = "text";
    public const string TypeImage = "image";

    /// <summary>Таблица: сетка и текст по ячейкам, один объект целиком.</summary>
    public const string TypeTable = "table";

    /// <summary>Типы, которые сервер принимает. Всё прочее — отказ.</summary>
    public static readonly string[] KnownTypes =
        { TypeStroke, TypeShape, TypeText, TypeImage, TypeTable };

    public long Id { get; set; }

    public long BoardId { get; set; }

    public string Type { get; set; } = string.Empty;

    /// <summary>Порядок отрисовки: больше — выше.</summary>
    public int Z { get; set; }

    /// <summary>Геометрия и оформление, как есть из браузера.</summary>
    public string Data { get; set; } = "{}";

    /// <summary>Ключ объекта в хранилище картинок. Наполняется на этапе 11d.</summary>
    public string? ImageRef { get; set; }

    /// <summary>Кто нарисовал. null — рисовал гость: его в базе нет.</summary>
    public long? CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>Идентификатор подключения, которое держит объект.</summary>
    public string? LockedBy { get; set; }

    /// <summary>
    /// Когда объект взяли. Замок протухает сам: без этого участник, у
    /// которого оборвалась связь, заблокировал бы фигуру навсегда.
    /// </summary>
    public DateTime? LockedAt { get; set; }

    public Board? Board { get; set; }
}
