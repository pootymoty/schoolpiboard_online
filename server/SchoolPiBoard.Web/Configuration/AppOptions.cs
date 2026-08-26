namespace SchoolPiBoard.Web.Configuration;

/// <summary>
/// Настройки службы. Читаются один раз при старте и сразу проверяются.
///
/// Имена переменных заданы разделом 10.3 задания и совпадают с теми, что
/// лежат в .env на сервере. Значения берутся только из окружения: файла с
/// настройками в репозитории нет намеренно, чтобы секрет нельзя было
/// закоммитить по невнимательности.
/// </summary>
public sealed class AppOptions
{
    /// <summary>
    /// Значения, которые нельзя принимать за настоящий ключ подписи.
    ///
    /// На сайте однажды в бою подпись оказалась заглушкой, и обнаружилось это
    /// только при проверке. Пустую строку такая ошибка обходит редко, а вот
    /// «change-me» из примера конфигурации — сплошь и рядом, поэтому список
    /// заглушек проверяется наравне с пустотой.
    /// </summary>
    private static readonly string[] PlaceholderKeys =
    {
        "change-me", "changeme", "secret", "dev", "development",
        "test", "example", "placeholder", "todo", "xxx"
    };

    /// <summary>Минимальная длина ключа подписи в символах.</summary>
    /// <remarks>
    /// HS256 берёт ключ как есть, поэтому короткий ключ подбирается перебором.
    /// 32 символа соответствуют 32 байтам, которые даёт `openssl rand -hex 32`
    /// в виде 64 символов — то есть с запасом.
    /// </remarks>
    private const int MinSigningKeyLength = 32;

    public required string DatabaseUrl { get; init; }
    public required string RedisUrl { get; init; }
    public required string JwtSigningKey { get; init; }
    public required string PublicUrl { get; init; }

    public required string LicenseServerUrl { get; init; }
    public required string LicenseSharedSecret { get; init; }

    public required MailOptions Mail { get; init; }
    public required StorageOptions Storage { get; init; }

    public required int TrialDays { get; init; }
    public required int GraceDays { get; init; }

    public static AppOptions Load(IConfiguration configuration)
    {
        var missing = new List<string>();

        string Required(string name)
        {
            var value = configuration[name];
            if (string.IsNullOrWhiteSpace(value))
            {
                missing.Add(name);
                return string.Empty;
            }

            return value.Trim();
        }

        int Number(string name, int fallback)
            => int.TryParse(configuration[name], out var parsed) ? parsed : fallback;

        var options = new AppOptions
        {
            DatabaseUrl = Required("DATABASE_URL"),
            RedisUrl = Required("REDIS_URL"),
            JwtSigningKey = Required("JWT_SIGNING_KEY"),
            PublicUrl = Required("PUBLIC_URL").TrimEnd('/'),

            LicenseServerUrl = Required("LICENSE_SERVER_URL").TrimEnd('/'),
            LicenseSharedSecret = Required("LICENSE_SHARED_SECRET"),

            Mail = new MailOptions
            {
                Server = Required("MAIL_SERVER"),
                Port = Number("MAIL_PORT", 465),
                Username = Required("MAIL_USERNAME"),
                Password = Required("MAIL_PASSWORD"),
                From = Required("MAIL_FROM")
            },

            Storage = new StorageOptions
            {
                Endpoint = configuration["S3_ENDPOINT"]?.Trim() ?? string.Empty,
                Bucket = configuration["S3_BUCKET"]?.Trim() ?? string.Empty,
                AccessKey = configuration["S3_ACCESS_KEY"]?.Trim() ?? string.Empty,
                SecretKey = configuration["S3_SECRET_KEY"]?.Trim() ?? string.Empty
            },

            TrialDays = Number("TRIAL_DAYS", 7),
            GraceDays = Number("GRACE_DAYS", 60)
        };

        if (missing.Count > 0)
        {
            throw new InvalidOperationException(
                "Служба не запущена: не заданы обязательные переменные окружения — " +
                string.Join(", ", missing) + ". Они живут в .env на сервере, " +
                "их состав описан в DEPLOY.md.");
        }

        ValidateSigningKey(options.JwtSigningKey);

        return options;
    }

    /// <summary>
    /// Роняет службу, если ключ подписи короткий или похож на заглушку.
    ///
    /// Пункт 13.6 приёмки: служба не поднимается с пустым ключом подписи.
    /// Падение при старте — единственный способ узнать об этом до того,
    /// как токены начнут подписываться предсказуемым ключом.
    /// </summary>
    private static void ValidateSigningKey(string key)
    {
        if (key.Length < MinSigningKeyLength)
        {
            throw new InvalidOperationException(
                $"Служба не запущена: JWT_SIGNING_KEY короче {MinSigningKeyLength} символов. " +
                "Короткий ключ подбирается перебором, и все токены входа станут поддельными. " +
                "Сгенерируйте новый: openssl rand -hex 32");
        }

        var normalized = key.Trim().ToLowerInvariant();

        if (PlaceholderKeys.Any(placeholder => normalized.Contains(placeholder, StringComparison.Ordinal)))
        {
            throw new InvalidOperationException(
                "Служба не запущена: JWT_SIGNING_KEY похож на заглушку из примера конфигурации. " +
                "Сгенерируйте настоящий: openssl rand -hex 32");
        }
    }
}

public sealed class MailOptions
{
    public required string Server { get; init; }
    public required int Port { get; init; }
    public required string Username { get; init; }
    public required string Password { get; init; }
    public required string From { get; init; }
}

/// <summary>
/// Yandex Object Storage. Заполняется на этапе 11d, поэтому обязательным
/// при старте пока не является: служба должна подниматься и без картинок.
/// </summary>
public sealed class StorageOptions
{
    public required string Endpoint { get; init; }
    public required string Bucket { get; init; }
    public required string AccessKey { get; init; }
    public required string SecretKey { get; init; }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(Endpoint) &&
        !string.IsNullOrWhiteSpace(Bucket) &&
        !string.IsNullOrWhiteSpace(AccessKey) &&
        !string.IsNullOrWhiteSpace(SecretKey);
}
