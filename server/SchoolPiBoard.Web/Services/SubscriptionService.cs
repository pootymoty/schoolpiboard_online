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
/// Что вышло с бонусом за вход через «Школу π».
///
/// <c>Until</c> — до какого момента человек на «Расширенном» (с учётом
/// бонуса). <c>ResumesAt</c> и <c>PausedPlan</c> — если на время бонуса
/// встал на паузу тариф пониже: когда и какой продолжится.
/// </summary>
public sealed record SchoolBonus(string Kind, string PlanName, DateTime Until, DateTime? ResumesAt, string? PausedPlan)
{
    /// <summary>Бонус начался с нуля: подписки не было.</summary>
    public const string KindStarted = "started";

    /// <summary>Тариф пониже поставлен на паузу и продолжится после бонуса.</summary>
    public const string KindPaused = "paused";

    /// <summary>Уже был «Расширенный» — к нему прибавилась неделя.</summary>
    public const string KindExtended = "extended";
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
    /// <summary>
    /// Пределы администратора.
    ///
    /// Тариф ему не продают и не выдают: запись в таблице подписок
    /// означала бы, что однажды у неё кончится срок. Проще назвать
    /// пределы прямо здесь.
    ///
    /// Купленная раньше подписка при этом не трогается: она лежит в базе
    /// как лежала и снова начнёт действовать, если роль снимут.
    /// </summary>
    private static Plan AdminPlan() => new()
    {
        Id = 0,
        Code = "admin",
        Name = "Администратор",
        Sort = 1000,
        MaxBoards = int.MaxValue,
        MaxParticipants = int.MaxValue,
        MaxStorageBytes = long.MaxValue,
        HasLibrary = true,
        MaxRecordingsPerBoard = int.MaxValue,
        MaxRecordingMinutes = int.MaxValue,
    };

    public async Task<Access> AccessAsync(long userId, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;

        var admin = await _db.Users
            .Where(x => x.Id == userId)
            .Select(x => x.Role)
            .FirstOrDefaultAsync(cancellationToken) == User.RoleAdmin;

        if (admin) return new Access(AdminPlan(), null);

        var current = await CurrentAsync(userId, now, cancellationToken);

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
        CancellationToken cancellationToken, bool startNow = false)
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

        DateTime startsAt;

        if (startNow)
        {
            // Так выбрал покупатель, и выбор ему показали словами: остаток
            // текущего срока сгорает. Делаем это только с действующим
            // сроком — отложенные покупки трогать не за что.
            var running = await CurrentAsync(userId, now, cancellationToken);
            if (running is not null)
            {
                running.EndsAt = now;

                // Продлевать оборванный срок больше нечего, а списание по
                // нему выглядело бы как деньги ни за что.
                running.AutoRenew = false;
            }

            startsAt = now;
        }
        else
        {
            // Дни прибавляются к концу уже оплаченного, включая отложенные
            // покупки: заплативший вперёд ничего не теряет.
            var last = await _db.Subscriptions
                .Where(x => x.UserId == userId && x.EndsAt > now)
                .OrderByDescending(x => x.EndsAt)
                .FirstOrDefaultAsync(cancellationToken);

            startsAt = last?.EndsAt ?? now;
        }

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

    /// <summary>
    /// Бонус за вход через «Школу π»: неделя «Расширенного».
    ///
    /// Один раз на учётную запись доски и один раз на аккаунт школы.
    /// Если уже действует тариф выше «Расширенного» — бонус не выдаётся
    /// (и больше не предлагается: отметка пишется всё равно).
    ///
    /// Иначе бонус начинается сразу, а всё, что действовало, ставится на
    /// паузу: оставшиеся дни переезжают за конец бонуса, и всё, что стоит
    /// в очереди, сдвигается на ту же неделю. Для «Расширенного» это и
    /// есть «плюс семь дней» — тариф тот же, срок на неделю длиннее.
    ///
    /// Пауза сделана сдвигом, а не новой строкой с остатком: на строке
    /// лежат номер счёта и автопродление, по ним сервер ключей списывает
    /// следующий платёж, и переносить их было бы хрупко. Уже прожитая часть
    /// срока остаётся в истории отдельной строкой.
    /// </summary>
    public async Task<SchoolBonus?> GrantSchoolBonusAsync(
        long userId, string externalId, int days, CancellationToken cancellationToken)
    {
        if (days <= 0) return null;

        var given = await _db.SchoolPiBonuses
            .AnyAsync(x => x.UserId == userId || x.ExternalId == externalId, cancellationToken);
        if (given) return null;

        var plan = await FindPlanAsync(Plan.CodeExtended, cancellationToken);
        if (plan is null) return null;

        // Одной транзакцией: два одновременных входа (двойной щелчок,
        // повтор от браузера) иначе сдвинули бы сроки дважды. Второй
        // споткнётся об уникальный индекс отметки и откатится целиком.
        await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);

        var now = DateTime.UtcNow;
        var record = new SchoolPiBonus { ExternalId = externalId, UserId = userId, CreatedAt = now };

        var running = await _db.Subscriptions
            .Include(x => x.Plan)
            .Where(x => x.UserId == userId && x.StartsAt <= now && x.EndsAt > now)
            .ToListAsync(cancellationToken);

        if (running.Any(x => x.Plan is not null && x.Plan.Sort > plan.Sort))
        {
            _db.SchoolPiBonuses.Add(record);
            await _db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return null;
        }

        var shift = TimeSpan.FromDays(days);

        // Что было «на ходу» до бонуса — для рассказа человеку, что встало
        // на паузу. Берётся та же, что решает тариф сейчас: кончается позже.
        var current = running.OrderByDescending(x => x.EndsAt).FirstOrDefault();

        var queued = await _db.Subscriptions
            .Where(x => x.UserId == userId && x.StartsAt > now)
            .ToListAsync(cancellationToken);

        foreach (var subscription in running)
        {
            // Прожитая часть — в историю. Без счёта и без автопродления:
            // они остаются на основной строке, которая продолжится позже.
            _db.Subscriptions.Add(new Subscription
            {
                UserId = userId,
                PlanId = subscription.PlanId,
                Kind = subscription.Kind,
                StartsAt = subscription.StartsAt,
                EndsAt = now,
                Source = subscription.Source,
                CreatedAt = subscription.CreatedAt
            });

            subscription.StartsAt = now + shift;
            subscription.EndsAt += shift;
            subscription.RenewalNoticeAt = null;
        }

        foreach (var subscription in queued)
        {
            subscription.StartsAt += shift;
            subscription.EndsAt += shift;
            subscription.RenewalNoticeAt = null;
        }

        var bonus = new Subscription
        {
            UserId = userId,
            PlanId = plan.Id,
            Kind = Subscription.KindTrial,
            StartsAt = now,
            EndsAt = now + shift,
            Source = Subscription.SourceSchoolPi,
            CreatedAt = now
        };

        _db.Subscriptions.Add(bonus);
        await _db.SaveChangesAsync(cancellationToken);

        record.SubscriptionId = bonus.Id;
        _db.SchoolPiBonuses.Add(record);
        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        if (current?.Plan is null)
            return new SchoolBonus(SchoolBonus.KindStarted, plan.Name, bonus.EndsAt, null, null);

        if (current.Plan.Sort == plan.Sort)
            return new SchoolBonus(SchoolBonus.KindExtended, plan.Name, current.EndsAt, null, null);

        return new SchoolBonus(SchoolBonus.KindPaused, plan.Name, bonus.EndsAt, current.StartsAt, current.Plan.Name);
    }

    /// <summary>
    /// На сколько дней покупался срок — по нему продлевают.
    ///
    /// Берётся из заказа, а не из длины строки: строку бонус за вход через
    /// «Школу π» сдвигает и укорачивает (прожитая часть уходит в историю),
    /// и по длине вышло бы «23 дня» — срок, который не продаётся.
    /// </summary>
    public async Task<int> PeriodDaysAsync(Subscription subscription, CancellationToken cancellationToken)
    {
        if (subscription.InvoiceId is not null)
        {
            var ordered = await _db.BillingOrders
                .Where(x => x.InvoiceId == subscription.InvoiceId)
                .Select(x => (int?)x.Days)
                .FirstOrDefaultAsync(cancellationToken);

            if (ordered is > 0) return ordered.Value;
        }

        return (int)Math.Round((subscription.EndsAt - subscription.StartsAt).TotalDays);
    }

    /// <summary>
    /// Включает или выключает автопродление у действующей подписки.
    ///
    /// На бесплатном продлевать нечего, и включить его там нельзя: списание
    /// возможно только по счёту, который человек однажды оплатил сам.
    /// </summary>
    public async Task<bool> SetAutoRenewAsync(long userId, bool value, CancellationToken cancellationToken)
    {
        // Именно последний оплаченный срок, а не действующий: продлевать
        // нужно от конца всего оплаченного. Стой флаг на текущем сроке,
        // а за ним в очереди другой — списание пришло бы за время, которое
        // уже оплачено.
        var last = await LastPaidAsync(userId, cancellationToken);
        if (last is null) return false;

        await ApplyAutoRenewAsync(userId, last.Id, value, cancellationToken);
        return true;
    }

    /// <summary>
    /// Последний из оплаченных сроков — тот, что кончается позже всех.
    /// На нём и живёт автопродление: оно продлевает всё оплаченное, а не
    /// ближайший к концу кусок.
    /// </summary>
    public Task<Subscription?> LastPaidAsync(long userId, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;

        return _db.Subscriptions
            .Include(x => x.Plan)
            .Where(x => x.UserId == userId && x.EndsAt > now)
            .OrderByDescending(x => x.EndsAt)
            .FirstOrDefaultAsync(cancellationToken);
    }

    /// <summary>Подписка, действующая прямо сейчас.</summary>
    private Task<Subscription?> CurrentAsync(long userId, DateTime now, CancellationToken cancellationToken)
        => _db.Subscriptions
            .Include(x => x.Plan)
            .Where(x => x.UserId == userId && x.StartsAt <= now && x.EndsAt > now)
            .OrderByDescending(x => x.EndsAt)
            .FirstOrDefaultAsync(cancellationToken);

    /// <summary>
    /// Оплаченные сроки, которые ещё не начались.
    ///
    /// Без них покупка второго тарифа поверх действующего выглядит как
    /// пропавшие деньги: человек заплатил, а на странице всё прежнее.
    /// </summary>
    public Task<List<Subscription>> UpcomingAsync(long userId, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;

        return _db.Subscriptions
            .Include(x => x.Plan)
            .Where(x => x.UserId == userId && x.StartsAt > now)
            .OrderBy(x => x.StartsAt)
            .ToListAsync(cancellationToken);
    }

    /// <summary>
    /// Переносит ближайшую отложенную покупку на «сейчас».
    ///
    /// Только вверх по уровню и только в одну сторону: остаток текущего
    /// срока при этом сгорает, и вернуть его назад уже нельзя. Поэтому
    /// понижение сюда не пускается вовсе — это была бы потеря денег без
    /// всякой выгоды.
    /// </summary>
    public async Task<bool> StartUpcomingNowAsync(long userId, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;

        var next = await _db.Subscriptions
            .Include(x => x.Plan)
            .Where(x => x.UserId == userId && x.StartsAt > now)
            .OrderBy(x => x.StartsAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (next?.Plan is null) return false;

        var running = await CurrentAsync(userId, now, cancellationToken);
        if (running?.Plan is null) return false;

        if (next.Plan.Sort <= running.Plan.Sort) return false;

        // Насколько сдвигаем начало. На столько же уезжают и все сроки,
        // стоящие в очереди за ним: иначе между концом перенесённого и
        // началом следующего образовалась бы дыра, в которой человек с
        // оплаченной подпиской вдруг оказался бы на бесплатном тарифе.
        var shift = next.StartsAt - now;

        var later = await _db.Subscriptions
            .Where(x => x.UserId == userId && x.StartsAt > next.StartsAt)
            .ToListAsync(cancellationToken);

        running.EndsAt = now;
        running.AutoRenew = false;

        next.StartsAt -= shift;
        next.EndsAt -= shift;

        foreach (var queued in later)
        {
            queued.StartsAt -= shift;
            queued.EndsAt -= shift;
        }

        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    // ---------- Заказы ----------

    /// <summary>
    /// Запоминает заказ, уходящий на оплату: выбор покупателя нужен потом,
    /// когда придёт подтверждение, а история — ему самому.
    /// </summary>
    public async Task<BillingOrder> RememberOrderAsync(
        long userId, string invoiceId, Plan plan, int days, int amount, bool autoRenew, bool startNow,
        CancellationToken cancellationToken)
    {
        var order = new BillingOrder
        {
            UserId = userId,
            InvoiceId = invoiceId,
            PlanCode = plan.Code,
            PlanName = plan.Name,
            Days = days,
            Amount = amount,
            AutoRenew = autoRenew,
            StartNow = startNow,
            Status = BillingOrder.StatusPending,
            CreatedAt = DateTime.UtcNow
        };

        _db.BillingOrders.Add(order);
        await _db.SaveChangesAsync(cancellationToken);

        return order;
    }

    public Task<BillingOrder?> FindOrderAsync(string invoiceId, CancellationToken cancellationToken)
        => _db.BillingOrders.FirstOrDefaultAsync(x => x.InvoiceId == invoiceId, cancellationToken);

    /// <summary>Отмечает заказ оплаченным. Повторное подтверждение ничего не меняет.</summary>
    public async Task MarkOrderPaidAsync(BillingOrder order, DateTime paidAt, CancellationToken cancellationToken)
    {
        if (order.Status == BillingOrder.StatusPaid) return;

        order.Status = BillingOrder.StatusPaid;
        order.PaidAt = paidAt;

        await _db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>История покупок, свежие сверху.</summary>
    public Task<List<BillingOrder>> OrdersAsync(long userId, CancellationToken cancellationToken)
        => _db.BillingOrders
            .Where(x => x.UserId == userId)
            .OrderByDescending(x => x.CreatedAt)
            .Take(50)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// Переносит автопродление на только что оплаченный срок.
    ///
    /// Флаг снимается со всех прочих сроков и ставится (или не ставится)
    /// на новый: автопродление — свойство учётной записи, а не каждой
    /// покупки по отдельности. Списание должно быть одно, и решает его
    /// последняя оплата; иначе у купившего второй срок осталась бы
    /// галочка от первой покупки, о которой он уже забыл.
    ///
    /// Ставится именно на новый срок ещё и потому, что он всегда последний
    /// в очереди: продлевать нужно от конца всего оплаченного, а не от
    /// конца того, что кончается раньше.
    /// </summary>
    public async Task ApplyAutoRenewAsync(
        long userId, long subscriptionId, bool autoRenew, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;

        var mine = await _db.Subscriptions
            .Where(x => x.UserId == userId && x.EndsAt > now)
            .ToListAsync(cancellationToken);

        foreach (var subscription in mine)
        {
            var wanted = subscription.Id == subscriptionId && autoRenew;
            if (subscription.AutoRenew == wanted) continue;

            subscription.AutoRenew = wanted;

            // Предупреждение относилось к прежнему решению: если продление
            // включили заново, о новом списании нужно сообщить снова.
            if (!wanted) subscription.RenewalNoticeAt = null;
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Подписки, которые пора продлевать: с автопродлением и кончающиеся
    /// в ближайшие сутки.
    /// </summary>
    public Task<List<Subscription>> DueForRenewalAsync(TimeSpan ahead, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var edge = now + ahead;

        // Администраторов пропускаем: пределы у них свои, подписка не
        // действует, и списывать за неё деньги — значит брать плату за
        // то, чем человек не пользуется.
        var admins = _db.Users.Where(x => x.Role == User.RoleAdmin).Select(x => x.Id);

        return _db.Subscriptions
            .Include(x => x.Plan)
            .Where(x => x.AutoRenew && x.EndsAt > now && x.EndsAt <= edge && x.InvoiceId != null
                && !admins.Contains(x.UserId))
            .ToListAsync(cancellationToken);
    }

    /// <summary>
    /// Подписки, о списании по которым пора предупредить: с автопродлением,
    /// кончающиеся в ближайшие дни и ещё не предупреждённые.
    ///
    /// Списание без предупреждения — то, из-за чего люди пишут в банк
    /// «я этого не заказывал», даже когда заказывали. Письмо за несколько
    /// дней стоит дешевле любого такого разбирательства.
    /// </summary>
    public Task<List<Subscription>> DueForNoticeAsync(TimeSpan ahead, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var edge = now + ahead;

        var admins = _db.Users.Where(x => x.Role == User.RoleAdmin).Select(x => x.Id);

        return _db.Subscriptions
            .Include(x => x.Plan)
            .Where(x => x.AutoRenew && x.EndsAt > now && x.EndsAt <= edge
                && x.InvoiceId != null && x.RenewalNoticeAt == null
                && !admins.Contains(x.UserId))
            .ToListAsync(cancellationToken);
    }

    /// <summary>Отмечает, что о списании предупредили. Второй раз писать незачем.</summary>
    public async Task MarkNoticedAsync(long subscriptionId, CancellationToken cancellationToken)
    {
        var subscription = await _db.Subscriptions.FindAsync(new object[] { subscriptionId }, cancellationToken);
        if (subscription is null) return;

        subscription.RenewalNoticeAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Сколько досок у человека сейчас. По ним считается предел тарифа.</summary>
    public Task<int> BoardCountAsync(long userId, CancellationToken cancellationToken)
        => _db.Boards.CountAsync(x => x.OwnerId == userId && x.DeletedAt == null, cancellationToken);
}
