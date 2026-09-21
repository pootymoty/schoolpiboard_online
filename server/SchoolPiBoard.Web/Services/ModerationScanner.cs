using System.Text.RegularExpressions;

namespace SchoolPiBoard.Web.Services;

/// <summary>
/// Грубая проверка текста, написанного на доске инструментом «текст».
///
/// Ловит то, что достаточно бесспорно само по себе: попытку увести
/// разговор в другой мессенджер — уже повод присмотреться, даже без слов
/// из списка, — и совпадение со словом из списка в настройках. Список не
/// зашит в код: какие слова считать запрещёнкой, решает владелец сервиса,
/// а не тот, кто писал механизм проверки.
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
    public static string? Scan(string text, IReadOnlyCollection<string> keywords)
    {
        foreach (var word in keywords)
        {
            if (word.Length > 0 && text.Contains(word, StringComparison.OrdinalIgnoreCase))
                return $"слово из списка: «{word}»";
        }

        if (Handle.IsMatch(text))
            return "похоже на попытку перевести разговор в другой мессенджер";

        if (Phone.IsMatch(text))
            return "похоже на номер телефона";

        return null;
    }
}
