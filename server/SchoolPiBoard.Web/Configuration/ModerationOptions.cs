namespace SchoolPiBoard.Web.Configuration;

/// <summary>
/// Слова и фразы для грубой проверки текста, написанного на досках.
///
/// Списки разложены по смыслу, а не свалены в один: у флажка «похоже на
/// разговор о причинении себе вреда» должен быть другой ответ — участие,
/// а не наказание, — и в списке жалоб это должно быть видно сразу, не
/// дожидаясь, что администратор откроет и прочитает сам.
///
/// Списки предпочитают однозначные слова и фразы обычным словам с
/// бытовым смыслом: «скорость», «соль», «трава», «микс» на учебной доске
/// встречаются постоянно — в физике, химии, биологии, — и как раз
/// поэтому не годятся сами по себе, без остального контекста фразы.
///
/// Встроенный список — стартовый набор, а не исчерпывающий перечень:
/// он расширяется без пересборки через переменную окружения
/// <c>MODERATION_KEYWORDS</c> (через запятую) — то, что владелец сервиса
/// не хочет держать в открытом репозитории или хочет добавить не дожидаясь
/// следующего релиза.
/// </summary>
public sealed class ModerationOptions
{
    public IReadOnlyList<string> Drugs { get; init; } = DefaultDrugs;
    public IReadOnlyList<string> Weapons { get; init; } = DefaultWeapons;
    public IReadOnlyList<string> Extremism { get; init; } = DefaultExtremism;
    public IReadOnlyList<string> Scam { get; init; } = DefaultScam;

    /// <summary>
    /// Разговор о причинении себе вреда — распознаётся отдельно от
    /// прочих категорий: правильный ответ на него — предложить помощь,
    /// а не разбирать как нарушение правил.
    /// </summary>
    public IReadOnlyList<string> SelfHarm { get; init; } = DefaultSelfHarm;

    /// <summary>Добавка сверху встроенного списка — из MODERATION_KEYWORDS.</summary>
    public IReadOnlyList<string> Extra { get; init; } = Array.Empty<string>();

    private static readonly string[] DefaultDrugs =
    {
        "закладка наркотиков", "кладмен", "куплю наркотики", "продам наркотики",
        "почём грамм", "куплю кокс", "продам гашиш", "продам план", "купить мефедрон",
        "мефедрон", "спайс", "соли для курения", "героин", "амфетамин", "экстази",
        "продам шишки", "курительные смеси", "закладки соль скорость",
    };

    private static readonly string[] DefaultWeapons =
    {
        "продам оружие", "куплю оружие", "продам ствол", "куплю патроны",
        "купить взрывчатку", "сделать бомбу", "самодельное взрывное устройство",
        "продам гранату", "травматик без справки", "глушитель на пистолет",
    };

    private static readonly string[] DefaultExtremism =
    {
        "вступай в наш отряд", "присоединяйся к джихаду", "оружие против власти",
        "ищем добровольцев для диверсии", "вооружённое восстание",
        "устроить взрыв в школе", "устроить стрельбу в школе",
    };

    private static readonly string[] DefaultScam =
    {
        "переведи предоплату", "гарантированный доход без риска",
        "верни долг переводом на карту", "пришли код из смс", "продам аккаунт с гарантией",
        "инвестируй и получи", "казино без вложений",
    };

    private static readonly string[] DefaultSelfHarm =
    {
        "хочу умереть", "не хочу жить", "порезал себя", "как покончить с собой",
        "нет смысла жить", "лучше бы меня не было",
    };

    public static ModerationOptions Load(IConfiguration configuration)
    {
        var raw = configuration["MODERATION_KEYWORDS"] ?? string.Empty;

        var extra = raw
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToArray();

        return new ModerationOptions { Extra = extra };
    }
}
