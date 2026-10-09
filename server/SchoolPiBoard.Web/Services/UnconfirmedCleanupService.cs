using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;

namespace SchoolPiBoard.Web.Services;

/// <summary>
/// Убирает учётные записи, почту которых так и не подтвердили, — как только
/// ссылка из письма перестала действовать.
///
/// Такой записью пользоваться нельзя (вход без подтверждения закрыт), досок,
/// подписок и файлов у неё нет — хранить нечего, и полгода, как после
/// удаления (см. <see cref="RetentionCleanupService"/>), она не лежит:
/// строка удаляется сразу, каскадом с кодами из писем и отметками согласия.
/// Адрес освобождается — по нему можно зарегистрироваться заново.
///
/// Запрос письма заново выпускает новую ссылку и тем самым продлевает срок:
/// запись живёт, пока у неё есть хоть одна действующая ссылка.
/// </summary>
public sealed class UnconfirmedCleanupService : BackgroundService
{
    /// <summary>Часто: удаление должно идти вскоре после истечения ссылки, а запрос дешёвый.</summary>
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(10);

    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<UnconfirmedCleanupService> _logger;

    public UnconfirmedCleanupService(IServiceScopeFactory scopes, ILogger<UnconfirmedCleanupService> logger)
    {
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);

        do
        {
            await RunOnceAsync(stoppingToken);
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task RunOnceAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = _scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var now = DateTime.UtcNow;

            // Свежую запись не трогаем, даже если ссылки у неё нет (письмо не
            // ушло): человек может запросить его заново. Сутки — срок жизни
            // самой ссылки.
            var settled = now.AddHours(-AccountService.TokenLifetimeHours);

            // Проверки досок, подписок, заказов и файлов — на всякий случай:
            // без подтверждения почты их не завести, но если что-то всё же
            // есть, молча стирать это нельзя.
            var stale = await db.Users
                .Where(user => !user.EmailConfirmed
                    && user.DeletedAt == null
                    && user.ExternalId == null
                    && user.CreatedAt < settled
                    && !db.EmailTokens.Any(token => token.UserId == user.Id
                        && token.Kind == EmailToken.KindConfirmEmail
                        && token.UsedAt == null
                        && token.ExpiresAt > now)
                    && !db.Boards.Any(board => board.OwnerId == user.Id)
                    && !db.Subscriptions.Any(subscription => subscription.UserId == user.Id)
                    && !db.BillingOrders.Any(order => order.UserId == user.Id)
                    && !db.StoredFiles.Any(file => file.OwnerId == user.Id))
                .ToListAsync(cancellationToken);

            if (stale.Count == 0)
                return;

            db.Users.RemoveRange(stale);
            await db.SaveChangesAsync(cancellationToken);

            _logger.LogInformation(
                "Удалено учётных записей с неподтверждённой почтой — {Count} (ссылка из письма истекла): {Ids}.",
                stale.Count, string.Join(", ", stale.Select(user => user.Id)));
        }
        catch (Exception ex)
        {
            // Одна неудачная попытка службу не останавливает — следующая через десять минут.
            _logger.LogError(ex, "Не удалось убрать учётные записи с неподтверждённой почтой.");
        }
    }
}
