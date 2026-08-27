namespace SchoolPiBoard.Web.Data.Entities;

/// <summary>Доска.</summary>
public class Board
{
    public long Id { get; set; }

    public long OwnerId { get; set; }

    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// Ссылка на доску — одна и без роли.
    ///
    /// Роль назначает владелец, когда впускает человека, а не сама ссылка:
    /// иначе для редактора и наблюдателя пришлось бы держать разные ссылки
    /// и следить, кому какую отправил. Ссылка рождается вместе с доской,
    /// чтобы перед занятием не было лишнего шага, и перевыпускается кнопкой,
    /// если утекла.
    /// </summary>
    public string LinkToken { get; set; } = string.Empty;

    /// <summary>
    /// Когда ссылка выпущена. Она живёт час и после этого перевыпускается
    /// сама: ссылка, отправленная в чат полгода назад, не должна открывать
    /// занятие сегодня, а следить за этим вручную никто не будет.
    /// </summary>
    public DateTime LinkIssuedAt { get; set; }

    /// <summary>
    /// Впускать по ссылке сразу, без комнаты ожидания, с правом только
    /// смотреть.
    ///
    /// По умолчанию выключено: обычное занятие — это два-три человека,
    /// и принять каждого недолго. Нужно для лекций, где принимать сорок
    /// человек по одному дольше, чем идёт сама лекция.
    /// </summary>
    public bool AutoAdmit { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>
    /// Замок: новых не впускать вовсе, даже по действующей ссылке.
    /// Тех, кто уже на доске, не затрагивает — иначе замок выкидывал бы
    /// посреди занятия тех, ради кого доска и открыта.
    /// </summary>
    public bool Locked { get; set; }

    /// <summary>Цвет холста.</summary>
    public string Background { get; set; } = "#FFFDF8";

    /// <summary>Разлиновка: none, dot, square, graph, rhombus.</summary>
    public string GridStyle { get; set; } = "none";

    public string GridColor { get; set; } = "#D9CFC0";

    /// <summary>Сколько места заняли картинки. Наполняется на этапе 11d.</summary>
    public long BytesUsed { get; set; }

    /// <summary>
    /// Удалённая доска помечается, а не стирается: содержимое занятий
    /// человек теряет один раз и больше не возвращается.
    /// </summary>
    public DateTime? DeletedAt { get; set; }

    public User? Owner { get; set; }
}
