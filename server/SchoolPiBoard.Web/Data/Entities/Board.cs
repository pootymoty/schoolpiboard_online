namespace SchoolPiBoard.Web.Data.Entities;

/// <summary>Доска. Состав полей задан разделом 5.2.</summary>
public class Board
{
    public long Id { get; set; }

    public long OwnerId { get; set; }

    public string Title { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>
    /// Замок: новых на доску не впускать, даже по действующей ссылке.
    /// Тех, кто уже вошёл, не затрагивает — иначе замок выкидывал бы
    /// посреди занятия тех, ради кого доска и открыта.
    /// </summary>
    public bool Locked { get; set; }

    /// <summary>Сколько места заняли картинки. Наполняется на этапе 11d.</summary>
    public long BytesUsed { get; set; }

    /// <summary>
    /// Удалённая доска помечается, а не стирается: содержимое занятий
    /// человек теряет один раз и больше не возвращается.
    /// </summary>
    public DateTime? DeletedAt { get; set; }

    public User? Owner { get; set; }
}
