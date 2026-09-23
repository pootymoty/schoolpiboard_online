namespace SchoolPiBoard.Web.Data.Entities;

/// <summary>
/// Один шаг записи — то же событие, что рассылается по доске
/// (<c>ItemBegan</c>, <c>ItemPoints</c>, <c>ItemCommitted</c> и прочие),
/// но с меткой времени. Порядок читается по <see cref="Id"/> — он растёт
/// сам и ничего дополнительно считать не нужно.
///
/// Своего номера события здесь нет: это не журнал для догона после
/// обрыва (<see cref="BoardEventLog"/>), а история занятия, и клиент,
/// который её воспроизводит, не подключён к доске вживую.
/// </summary>
public class BoardRecordingStep
{
    public long Id { get; set; }

    public long RecordingId { get; set; }

    /// <summary>Миллисекунды от начала записи, без учёта пауз.</summary>
    public long OffsetMs { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>Тот же payload, что уходил по SignalR — без изменений.</summary>
    public string Payload { get; set; } = "{}";

    public BoardRecording? Recording { get; set; }
}
