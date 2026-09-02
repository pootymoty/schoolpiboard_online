using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using SchoolPiBoard.Web.Configuration;

namespace SchoolPiBoard.Web.Services;

/// <summary>Счёт, выставленный сервером ключей.</summary>
public sealed record Invoice(string InvoiceId, string PaymentUrl, string Amount);

/// <summary>
/// Связь с сервером ключей.
///
/// Доска не знает паролей Робокассы и никогда к ней не обращается — это
/// правило владельца. Она только просит счёт и получает сообщение об
/// оплате; всё платёжное живёт на сервере ключей.
///
/// Обе стороны подписывают тело запроса общим секретом из `.env`. В
/// подпись входит и время: без него однажды перехваченный запрос можно
/// было бы повторять сколько угодно.
/// </summary>
public sealed class KeyServerClient
{
    public const string TimestampHeader = "X-Timestamp";
    public const string SignatureHeader = "X-Signature";

    /// <summary>Насколько старую подпись ещё принимаем от сервера ключей.</summary>
    public static readonly TimeSpan SignatureLifetime = TimeSpan.FromMinutes(5);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly AppOptions _options;
    private readonly IHttpClientFactory _http;
    private readonly ILogger<KeyServerClient> _log;

    public KeyServerClient(AppOptions options, IHttpClientFactory http, ILogger<KeyServerClient> log)
    {
        _options = options;
        _http = http;
        _log = log;
    }

    public static string Sign(string secret, string timestamp, string body)
    {
        var key = Encoding.UTF8.GetBytes(secret);
        var payload = Encoding.UTF8.GetBytes(timestamp + "." + body);

        return Convert.ToHexString(HMACSHA256.HashData(key, payload)).ToLowerInvariant();
    }

    /// <summary>
    /// Проверяет подпись входящего сообщения об оплате.
    ///
    /// Сравнение постоянного времени: обычное посимвольное по времени
    /// ответа выдаёт, сколько первых знаков угадано.
    /// </summary>
    public bool Verify(string? timestamp, string? signature, string body)
    {
        if (string.IsNullOrWhiteSpace(_options.LicenseSharedSecret)
            || string.IsNullOrWhiteSpace(timestamp)
            || string.IsNullOrWhiteSpace(signature))
        {
            return false;
        }

        if (!long.TryParse(timestamp, out var unix)) return false;

        var moment = DateTimeOffset.FromUnixTimeSeconds(unix);
        if ((DateTimeOffset.UtcNow - moment).Duration() > SignatureLifetime) return false;

        var expected = Sign(_options.LicenseSharedSecret, timestamp, body);

        return CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(expected),
            Encoding.ASCII.GetBytes(signature.Trim().ToLowerInvariant()));
    }

    /// <summary>Просит счёт. Сумму считаем сами: цены лежат в нашей базе.</summary>
    public Task<Invoice?> CreateInvoiceAsync(
        long userId, string email, string planCode, string planName, int days, int amount, bool autoRenew,
        CancellationToken cancellationToken)
        => SendAsync<Invoice>("/board/invoice", new
        {
            userId,
            email,
            planCode,
            planName,
            days,
            amount,
            autoRenew
        }, cancellationToken);

    /// <summary>
    /// Просит списать повторно по ранее оплаченному счёту. Карта осталась
    /// у Робокассы — доска её не видела и не увидит.
    /// </summary>
    public Task<Invoice?> ChargeRecurringAsync(
        long userId, string planCode, string planName, int days, int amount, string previousInvoiceId,
        CancellationToken cancellationToken)
        => SendAsync<Invoice>("/board/recurring", new
        {
            userId,
            planCode,
            planName,
            days,
            amount,
            previousInvoiceId = long.TryParse(previousInvoiceId, out var number) ? number : 0
        }, cancellationToken);

    private async Task<T?> SendAsync<T>(string path, object payload, CancellationToken cancellationToken)
        where T : class
    {
        if (string.IsNullOrWhiteSpace(_options.LicenseSharedSecret))
        {
            _log.LogError("Общий секрет с сервером ключей не задан — оплата невозможна.");
            return null;
        }

        var body = JsonSerializer.Serialize(payload, Json);
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();

        using var request = new HttpRequestMessage(HttpMethod.Post, _options.LicenseServerUrl + path)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };

        request.Headers.Add(TimestampHeader, timestamp);
        request.Headers.Add(SignatureHeader, Sign(_options.LicenseSharedSecret, timestamp, body));

        try
        {
            using var response = await _http.CreateClient().SendAsync(request, cancellationToken);
            var answer = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                _log.LogError(
                    "Сервер ключей отказал по {Path}: {Status} {Body}",
                    path, (int)response.StatusCode, answer);
                return null;
            }

            return JsonSerializer.Deserialize<T>(answer, Json);
        }
        catch (Exception error)
        {
            _log.LogError(error, "Сервер ключей недоступен по {Path}.", path);
            return null;
        }
    }
}
