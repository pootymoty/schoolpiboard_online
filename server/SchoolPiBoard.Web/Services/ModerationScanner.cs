using System.Text.RegularExpressions;
using SchoolPiBoard.Web.Configuration;

namespace SchoolPiBoard.Web.Services;

/// <summary>
/// Грубая проверка текста, написанного на доске инструментом «текст».
///
/// Категория важна не меньше самого срабатывания: разговор о причинении
/// себе вреда и попытка продать оружие требуют разного ответа, и в списке
/// жалоб это должно быть видно сразу.
///
/// Рисунок пером эта проверка не видит вовсе: у штриха нет текста, только
/// координаты. Она находит ровно то, что набрано клавиатурой, — часть
/// картины, а не всю её целиком.
/// </summary>
public static class ModerationScanner
{
    // Телефон: 10-11 цифр, необязательно разбитых пробелами, дефисами или
    // скобками — обычный вид, в котором его пишут, чтобы продиктовать.
    private static readonly Regex Phone = new(
        @"(?:\+7|8)?[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}\b",
        RegexOptions.Compiled);

    // Ссылка или упоминание стороннего мессенджера/сети — обычный способ
    // увести разговор с площадки, где его не видно.
    private static readonly Regex Handle = new(
        @"t\.me/|wa\.me/|vk\.com/|@[a-zA-Z][a-zA-Z0-9_]{4,}|whatsapp|telegram|телеграм|ватсап|вотсап",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    /// <summary>Причина, по которой текст попал в список, или null, если ничего не нашлось.</summary>
    public static string? Scan(string text, ModerationOptions moderation)
    {
        // Причинение себе вреда — первым: если совпало и это, и что-то
        // ещё, ответ всё равно один и тот же — предложить помощь.
        if (Contains(text, moderation.SelfHarm))
            return "похоже на разговор о причинении себе вреда — здесь важна поддержка, а не разбор нарушения";

        if (Contains(text, moderation.Drugs))
            return "похоже на разговор о продаже или покупке наркотиков";

        if (Contains(text, moderation.Weapons))
            return "похоже на разговор об оружии или взрывчатке";

        if (Contains(text, moderation.Extremism))
            return "похоже на вербовку или призыв к насилию";

        if (Contains(text, moderation.Scam))
            return "похоже на финансовый обман";

        if (Contains(text, moderation.Extra))
            return "слово из добавленного списка (MODERATION_KEYWORDS)";

        if (Handle.IsMatch(text))
            return "похоже на попытку перевести разговор в другой мессенджер";

        if (Phone.IsMatch(text))
            return "похоже на номер телефона";

        return null;
    }

    private static bool Contains(string text, IReadOnlyList<string> words)
    {
        foreach (var word in words)
        {
            if (word.Length > 0 && text.Contains(word, StringComparison.OrdinalIgnoreCase))
                return true;
        }

        return false;
    }
}
