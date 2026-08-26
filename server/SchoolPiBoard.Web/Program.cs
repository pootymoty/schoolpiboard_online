using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Configuration;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Endpoints;
using SchoolPiBoard.Web.Services;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

// Под systemd служба сообщает о готовности сама, и юнит объявлен Type=notify.
// Вне systemd вызов ничего не делает, поэтому запуск из консоли не меняется.
builder.Host.UseSystemd();

// Настройки читаются один раз и сразу проверяются. Если ключа подписи нет
// или он похож на заглушку — служба не поднимается: пункт 13.6 приёмки.
var options = AppOptions.Load(builder.Configuration);
builder.Services.AddSingleton(options);

builder.Services.AddDbContext<AppDbContext>(db => db.UseNpgsql(options.DatabaseUrl));

builder.Services.AddSingleton<AuthTokenService>();
builder.Services.AddSingleton<GuestTokenService>();
builder.Services.AddSingleton<IEmailSender, SmtpEmailSender>();
builder.Services.AddScoped<AccountService>();
builder.Services.AddScoped<BoardService>();
builder.Services.AddHostedService<RetentionCleanupService>();

// Redis подключается при старте, а не при первом обращении: если он
// недоступен, узнать об этом надо сейчас, а не посреди занятия.
var redis = await ConnectionMultiplexer.ConnectAsync(options.RedisUrl);
builder.Services.AddSingleton<IConnectionMultiplexer>(redis);
builder.Services.AddSingleton<WaitingRoom>();

builder.Services.AddSignalR().AddStackExchangeRedis(options.RedisUrl);

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(jwt =>
    {
        // Претензии не переименовываются: в коде читается ровно «sub».
        jwt.MapInboundClaims = false;
        jwt.TokenValidationParameters = AuthTokenService.CreateValidationParameters(options);
    });

builder.Services.AddAuthorization();

// Сайт и API живут на одном домене, nginx проксирует /api в эту службу,
// поэтому запросы для браузера свои и CORS не нужен вовсе.
builder.Services.Configure<ForwardedHeadersOptions>(forwarded =>
{
    forwarded.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
});

builder.Services.AddRateLimiter(limiter =>
{
    limiter.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    // Ограничение на вход, регистрацию и письма — защита от перебора паролей
    // и от рассылки писем чужими руками.
    limiter.AddPolicy(AuthEndpoints.RateLimit, http =>
        RateLimitPartition.GetFixedWindowLimiter(
            http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
});

var app = builder.Build();

app.UseForwardedHeaders();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapAuthEndpoints();
app.MapBoardEndpoints();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

if (!options.Storage.IsConfigured)
{
    app.Logger.LogWarning(
        "Yandex Object Storage не настроен: загрузка картинок на доску работать не будет. " +
        "Это ожидаемо до этапа 11d.");
}

app.Run();
