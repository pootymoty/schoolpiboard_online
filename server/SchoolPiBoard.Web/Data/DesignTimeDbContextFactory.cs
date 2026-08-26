using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace SchoolPiBoard.Web.Data;

/// <summary>
/// Контекст для инструментов dotnet ef: генерации миграций, проверки их
/// соответствия модели и сборки bundle.
///
/// Без этой фабрики dotnet ef поднимает приложение целиком, чтобы добраться
/// до контекста, — а оно намеренно падает при старте, если не заданы боевые
/// переменные окружения. В сборке их нет и быть не должно, поэтому здесь
/// берётся строка подключения из DATABASE_URL, если она задана, и заведомо
/// нерабочая заглушка, если нет: командам выше нужна лишь форма модели,
/// к базе они не обращаются.
/// </summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("DATABASE_URL");

        if (string.IsNullOrWhiteSpace(connection))
            connection = "Host=localhost;Database=schoolpiboard;Username=postgres;Password=postgres";

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(connection)
            .Options;

        return new AppDbContext(options);
    }
}
