namespace SchoolPiBoard.Web.Data.Entities;

/// <summary>
/// Запись занятия — не видео, а последовательность действий на доске со
/// своим таймингом: и то, что закрепилось, и сам процесс ведения пера.
/// На доске может быть несколько записей — разные занятия остаются
/// разными, а не затирают друг друга.
///
/// Пауза и продолжение не оставляют разрыва в кадре: <see cref="DurationMs"/>
/// копит только время реальной записи, а <see cref="LastResumedAt"/> —
/// когда начался текущий отрезок. Смещение нового шага считается от этой
/// пары, и пауза в записи просто не попадает в тайминг — без вставки
/// снимка состояния, которое рисовало бы штрихи заново на том же месте.
/// </summary>
public class BoardRecording
{
    public const string StatusRecording = "recording";
    public const string StatusPaused = "paused";
    public const string StatusStopped = "stopped";

    public long Id { get; set; }

    public long BoardId { get; set; }

    /// <summary>Кто начал запись. Начинать может только владелец, а он — всегда учётная запись.</summary>
    public long StartedByUserId { get; set; }

    /// <summary>Название занятия. Пусто — покажется датой начала.</summary>
    public string? Title { get; set; }

    public string Status { get; set; } = StatusRecording;

    public DateTime StartedAt { get; set; }

    /// <summary>null — запись ещё не остановлена.</summary>
    public DateTime? EndedAt { get; set; }

    /// <summary>Накопленное время реальной записи — без пауз.</summary>
    public long DurationMs { get; set; }

    /// <summary>
    /// Когда начался текущий отрезок. Пусто на паузе и после остановки —
    /// тогда всё время уже накоплено в <see cref="DurationMs"/>.
    /// </summary>
    public DateTime? LastResumedAt { get; set; }

    /// <summary>
    /// Потолок тарифа на момент старта. Берётся один раз: правило не
    /// должно меняться на середине записи, если тариф владельца сменится
    /// прямо во время занятия.
    /// </summary>
    public long MaxDurationMs { get; set; }

    public Board? Board { get; set; }
}
