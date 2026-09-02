using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Configuration;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Endpoints;
using SchoolPiBoard.Web.Hubs;
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
builder.Services.AddScoped<BoardItemService>();
builder.Services.AddSingleton<FileStorage>();
builder.Services.AddScoped<LibraryService>();
builder.Services.AddScoped<SubscriptionService>();
builder.Services.AddHostedService<RetentionCleanupService>();

// Redis подключается при старте, а не при первом обращении: если он
// недоступен, узнать об этом надо сейчас, а не посреди занятия.
var redis = await ConnectionMultiplexer.ConnectAsync(options.RedisUrl);
builder.Services.AddSingleton<IConnectionMultiplexer>(redis);
builder.Services.AddSingleton<WaitingRoom>();
builder.Services.AddSingleton<BoardEventLog>();
builder.Services.AddSingleton<BoardPresence>();

// Сведение курсоров и продление допусков — одиночки со своей фоновой
// работой, поэтому регистрируются дважды: как служба и как зависимость.
builder.Services.AddSingleton<CursorRelay>();
builder.Services.AddHostedService(services => services.GetRequiredService<CursorRelay>());
builder.Services.AddHostedService<PresenceKeepAlive>();

builder.Services.AddSignalR().AddStackExchangeRedis(options.RedisUrl);

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(jwt =>
    {
        // Претензии не переименовываются: в коде читается ровно «sub».
        jwt.MapInboundClaims = false;
        jwt.TokenValidationParameters = AuthTokenService.CreateValidationParameters(options);

        jwt.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                // Веб-сокет не умеет присылать заголовок Authorization, и
                // SignalR передаёт токен строкой запроса. Читаем его только
                // для хаба: для обычных запросов токен в адресной строке
                // осел бы в логах nginx.
                var token = context.Request.Query["access_token"];

                if (!string.IsNullOrEmpty(token)
                    && context.HttpContext.Request.Path.StartsWithSegments("/api/hub"))
                {
                    context.Token = token;
                }

                return Task.CompletedTask;
            }
        };
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
app.MapFileEndpoints();
app.MapBillingEndpoints();

// Без RequireAuthorization: на доску пускают и гостя, у которого учётной
// записи нет. Кто он и что ему можно — выясняет сам хаб при входе.
app.MapHub<BoardHub>("/api/hub/board");

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

// Файлы лежат на диске рядом со службой, объектное хранилище не нужно:
// за него надо платить и заводить ключи, а диск на сервере уже есть.
// Настройки S3 остаются в конфигурации на случай переезда.
app.Logger.LogInformation("Хранилище файлов: {Dir}", options.FilesDir);

app.Run();
