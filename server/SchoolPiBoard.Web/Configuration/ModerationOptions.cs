namespace SchoolPiBoard.Web.Configuration;

/// <summary>
/// Слова для грубой проверки текста, написанного на досках.
///
/// Список пуст по умолчанию, и это нормальное состояние: что считать
/// запрещённым — решение владельца сервиса, а не код, который его
/// применяет. Список задаётся переменной окружения <c>MODERATION_KEYWORDS</c>
/// через запятую и правится без пересборки — правкой .env и перезапуском
/// службы.
/// </summary>
public sealed class ModerationOptions
{
    public string[] Keywords { get; init; } = Array.Empty<string>();

    public static ModerationOptions Load(IConfiguration configuration)
    {
        var raw = configuration["MODERATION_KEYWORDS"] ?? string.Empty;

        var keywords = raw
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToArray();

        return new ModerationOptions { Keywords = keywords };
    }
}
