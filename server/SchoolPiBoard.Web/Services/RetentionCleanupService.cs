using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Data;

namespace SchoolPiBoard.Web.Services;

/// <summary>
/// Раз в сутки забирает учётные записи, удалённые больше полугода назад.
///
/// Полгода — не техническая пауза, а обещание из правил хранения: доски
/// удалившегося преподавателя остаются рабочими для остальных участников
/// весь этот срок. Строка пользователя всё это время просто помечена
/// <see cref="Data.Entities.User.DeletedAt"/> и не трогается; когда срок
/// истекает, удаление строки каскадом забирает её доски и участия в чужих —
/// внешние ключи на это уже настроены, отдельный код для них не нужен.
/// </summary>
public sealed class RetentionCleanupService : BackgroundService
{
    private static readonly TimeSpan RetentionPeriod = TimeSpan.FromDays(182);
    private static readonly TimeSpan Interval = TimeSpan.FromHours(24);

    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<RetentionCleanupService> _logger;

    public RetentionCleanupService(IServiceScopeFactory scopes, ILogger<RetentionCleanupService> logger)
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

            var cutoff = DateTime.UtcNow - RetentionPeriod;

            var expired = await db.Users
                .Where(x => x.DeletedAt != null && x.DeletedAt < cutoff)
                .ToListAsync(cancellationToken);

            if (expired.Count == 0)
                return;

            // Файлы уходят вместе с человеком: связи с пользователем у них
            // нет намеренно (они должны были пережить само удаление), и
            // каскад их не заберёт — убираем руками, вместе с байтами.
            var storage = scope.ServiceProvider.GetRequiredService<FileStorage>();
            var owners = expired.Select(user => user.Id).ToList();

            var files = await db.StoredFiles
                .Where(x => owners.Contains(x.OwnerId))
                .ToListAsync(cancellationToken);

            db.StoredFiles.RemoveRange(files);
            db.Users.RemoveRange(expired);
            await db.SaveChangesAsync(cancellationToken);

            foreach (var file in files) storage.Delete(file.StorageKey);

            _logger.LogInformation(
                "Зачистка хранения: удалено учётных записей — {Count}, файлов — {Files} "
                + "(истёк срок в полгода после удаления).",
                expired.Count, files.Count);
        }
        catch (Exception ex)
        {
            // Одна неудачная попытка не должна останавливать службу насовсем —
            // следующая пройдёт через сутки.
            _logger.LogError(ex, "Зачистка хранения не выполнена.");
        }
    }
}
