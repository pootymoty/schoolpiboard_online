using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;

namespace SchoolPiBoard.Web.Services;

/// <summary>
/// История согласий на автоматические списания.
///
/// Требование платёжной системы, и требование разумное: спор о списании
/// решается ответом на вопрос «когда и на что человек соглашался».
/// Галочка в интерфейсе такого ответа не даёт — она показывает только
/// «сейчас», а к моменту спора её уже сняли.
///
/// Пишется и включение, и отзыв: без второго нельзя показать, что
/// согласие отозвали раньше списания. Текст согласия сохраняется вместе
/// с событием — формулировку на сайте когда-нибудь поменяют, а человек
/// соглашался под прежней.
/// </summary>
public sealed class ConsentService
{
    private readonly AppDbContext _db;

    public ConsentService(AppDbContext db) => _db = db;

    public Task GivenAsync(
        long userId, string source, string text, string planCode, int days, int amount, string? ip,
        CancellationToken cancellationToken)
        => AddAsync(ConsentEvent.KindAutoRenewOn, userId, source, text, planCode, days, amount, ip, cancellationToken);

    public Task WithdrawnAsync(long userId, string source, string? ip, CancellationToken cancellationToken)
        => AddAsync(
            ConsentEvent.KindAutoRenewOff, userId, source, string.Empty, string.Empty, 0, 0, ip, cancellationToken);

    /// <summary>Согласия одного человека, свежие сверху.</summary>
    public Task<List<ConsentEvent>> ListAsync(long userId, CancellationToken cancellationToken)
        => _db.ConsentEvents
            .Where(x => x.UserId == userId)
            .OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id)
            .Take(100)
            .ToListAsync(cancellationToken);

    private async Task AddAsync(
        string kind, long userId, string source, string text, string planCode, int days, int amount, string? ip,
        CancellationToken cancellationToken)
    {
        var trimmed = (text ?? string.Empty).Trim();
        if (trimmed.Length > ConsentEvent.MaxTextLength) trimmed = trimmed[..ConsentEvent.MaxTextLength];

        _db.ConsentEvents.Add(new ConsentEvent
        {
            UserId = userId,
            Kind = kind,
            Source = source,
            Text = trimmed,
            PlanCode = planCode ?? string.Empty,
            Days = days,
            Amount = amount,
            // Адрес обрезаем по длине, а не разбираем: нам нужна запись о
            // том, откуда пришло действие, а не разбор сетевой топологии.
            Ip = (ip ?? string.Empty).Length > 64 ? (ip ?? string.Empty)[..64] : ip ?? string.Empty,
            CreatedAt = DateTime.UtcNow,
        });

        await _db.SaveChangesAsync(cancellationToken);
    }
}
