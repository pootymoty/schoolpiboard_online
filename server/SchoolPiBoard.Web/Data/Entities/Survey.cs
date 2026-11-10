namespace SchoolPiBoard.Web.Data.Entities;

/// <summary>
/// Опрос пользователей о доске — одна рассылка.
///
/// Каждая отправка — отдельный опрос со своими ответами: так видно, как
/// оценки меняются от раза к разу. Вопросы хранятся снимком вместе с
/// опросом (<see cref="Questions"/>): список в коде когда-нибудь поменяют,
/// а старые результаты должны читаться так, как их тогда спрашивали.
/// </summary>
public class Survey
{
    public long Id { get; set; }

    /// <summary>Вопросы на момент отправки, JSON (см. SurveyQuestions).</summary>
    public string Questions { get; set; } = "[]";

    /// <summary>Скольким пользователям опрос предназначен.</summary>
    public int Recipients { get; set; }

    /// <summary>Скольким письмо уже ушло. Рассылка идёт в фоне.</summary>
    public int Sent { get; set; }

    public long CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>Закрыт — ответы больше не принимаются.</summary>
    public DateTime? ClosedAt { get; set; }
}

/// <summary>
/// Отметка «этот человек уже ответил» — только чтобы не отвечали дважды.
///
/// С ответом она не связана никак: ни ссылки на ответ, ни времени. Кто
/// ответил — известно, что именно ответил — нет.
/// </summary>
public class SurveyParticipant
{
    public long SurveyId { get; set; }

    public long UserId { get; set; }
}

/// <summary>Обезличенный ответ: оценки и тексты, без автора и без времени.</summary>
public class SurveyResponse
{
    public long Id { get; set; }

    public long SurveyId { get; set; }

    /// <summary>Оценки: ключ вопроса → 1..10, или null — «не пользовался». JSON.</summary>
    public string Scores { get; set; } = "{}";

    /// <summary>Открытые ответы: ключ вопроса → текст. Пустые не хранятся. JSON.</summary>
    public string Texts { get; set; } = "{}";
}

/// <summary>
/// Сохранённый набор вопросов — чтобы повторяющийся опрос не собирать
/// заново. Имя уникально: сохранение под тем же именем заменяет вопросы.
/// </summary>
public class SurveyTemplate
{
    public long Id { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>Вопросы в том же виде, что у опроса (см. SurveyQuestions), JSON.</summary>
    public string Questions { get; set; } = "[]";

    public DateTime UpdatedAt { get; set; }
}
