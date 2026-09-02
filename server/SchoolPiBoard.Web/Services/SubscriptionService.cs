using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;

namespace SchoolPiBoard.Web.Services;

/// <summary>Что человеку доступно прямо сейчас: тариф и, если он платный, до какого числа.</summary>
public sealed record Access(Plan Plan, Subscription? Subscription)
{
    public bool IsFree => Subscription is null;

    /// <summary>До какого момента действует платный срок. У бесплатного — пусто.</summary>
    public DateTime? Until => Subscription?.EndsAt;
}

/// <summary>
/// Тарифы и сроки.
///
/// Бесплатный уровень — не подписка, а её отсутствие: строка с датой
/// окончания «никогда» однажды попросила бы её проверить, и кто-нибудь
/// однажды забыл бы. Нет действующей подписки — значит бесплатный тариф.
///
/// Окончание платного срока ничего не удаляет и ничего не запирает
/// задним числом: человек просто опускается на бесплатные пределы.
/// Созданное сверх них остаётся на месте — материалы занятий не должны
/// пропадать из-за пропущенного платежа.
/// </summary>
public sealed class SubscriptionService
{
    /// <summary>Периоды, которые продаются. Всё остальное — отказ, а не догадка.</summary>
    public static readonly int[] Periods = { 30, 90, 180, 365 };

    private readonly AppDbContext _db;

    public SubscriptionService(AppDbContext db) => _db = db;

    public Task<List<Plan>> ListAsync(CancellationToken cancellationToken)
        => _db.Plans.Where(x => x.Active).OrderBy(x => x.Sort).ToListAsync(cancellationToken);

    public Task<Plan?> FindPlanAsync(string code, CancellationToken cancellationToken)
        => _db.Plans.FirstOrDefaultAsync(x => x.Code == code, cancellationToken);

    /// <summary>
    /// Тариф пользователя сейчас.
    ///
    /// Если действующих подписок несколько (например, выдали руками
    /// поверх оплаченной), берётся та, что кончается позже: человек
    /// заплатил за большее, и отдать ему меньшее было бы обманом.
    /// </summary>
    public async Task<Access> AccessAsync(long userId, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;

        var current = await _db.Subscriptions
            .Include(x => x.Plan)
            .Where(x => x.UserId == userId && x.StartsAt <= now && x.EndsAt > now)
            .OrderByDescending(x => x.EndsAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (current?.Plan is not null) return new Access(current.Plan, current);

        var free = await FindPlanAsync(Plan.CodeFree, cancellationToken)
            ?? throw new InvalidOperationException(
                "В базе нет бесплатного тарифа. Он заводится миграцией и должен быть всегда.");

        return new Access(free, null);
    }

    /// <summary>
    /// Продлевает срок.
    ///
    /// Дни прибавляются к концу текущего срока, а не обнуляют его: тот,
    /// кто оплатил заранее, не должен терять уже оплаченное. По той же
    /// причине покупка во время пробного периода не съедает его остаток.
    /// </summary>
    public async Task<Subscription?> ExtendAsync(
        long userId, Plan plan, int days, string kind, string source, string? invoiceId,
        CancellationToken cancellationToken)
    {
        if (days <= 0) return null;

        // Тот же счёт уже продлевал — второй раз не считаем. Уникальный
        // индекс стережёт то же самое на случай двух одновременных вызовов.
        if (invoiceId is not null)
        {
            var known = await _db.Subscriptions
                .Include(x => x.Plan)
                .FirstOrDefaultAsync(x => x.InvoiceId == invoiceId, cancellationToken);

            if (known is not null) return known;
        }

        var now = DateTime.UtcNow;

        var last = await _db.Subscriptions
            .Where(x => x.UserId == userId && x.EndsAt > now)
            .OrderByDescending(x => x.EndsAt)
            .FirstOrDefaultAsync(cancellationToken);

        var startsAt = last?.EndsAt ?? now;

        var subscription = new Subscription
        {
            UserId = userId,
            PlanId = plan.Id,
            Kind = kind,
            StartsAt = startsAt,
            EndsAt = startsAt.AddDays(days),
            Source = source,
            InvoiceId = invoiceId,
            CreatedAt = now
        };

        _db.Subscriptions.Add(subscription);
        await _db.SaveChangesAsync(cancellationToken);

        subscription.Plan = plan;
        return subscription;
    }

    /// <summary>
    /// Выдаёт пробный период — один раз на учётную запись.
    ///
    /// Повторную выдачу отсекаем по любой прошлой подписке, а не только
    /// по действующей: иначе пробный можно было бы брать заново каждый
    /// раз, как он кончится.
    /// </summary>
    public async Task<Subscription?> StartTrialAsync(long userId, int days, CancellationToken cancellationToken)
    {
        var had = await _db.Subscriptions.AnyAsync(x => x.UserId == userId, cancellationToken);
        if (had) return null;

        var plan = await FindPlanAsync(Plan.CodeStandard, cancellationToken);
        if (plan is null) return null;

        return await ExtendAsync(
            userId, plan, days, Subscription.KindTrial, Subscription.SourceTrial, null, cancellationToken);
    }

    /// <summary>Сколько досок у человека сейчас. По ним считается предел тарифа.</summary>
    public Task<int> BoardCountAsync(long userId, CancellationToken cancellationToken)
        => _db.Boards.CountAsync(x => x.OwnerId == userId && x.DeletedAt == null, cancellationToken);
}
