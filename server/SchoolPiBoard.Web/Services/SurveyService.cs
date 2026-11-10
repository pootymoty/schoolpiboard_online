using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Configuration;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;

namespace SchoolPiBoard.Web.Services;

/// <summary>
/// Вопрос опроса. <c>Type</c> — <see cref="SurveyQuestionTypes.Scale"/>
/// (оценка 1..10) или <see cref="SurveyQuestionTypes.Text"/> (открытый
/// ответ). <c>Optional</c> у оценки — можно ответить «не пользовался»;
/// открытый ответ необязателен всегда. У опросов, отправленных до типов,
/// типа в снимке нет — это оценка.
/// </summary>
public sealed record SurveyQuestion(string Key, string Text, bool Optional, string Type = SurveyQuestionTypes.Scale)
{
    [JsonIgnore]
    public bool IsText => Type == SurveyQuestionTypes.Text;
}

public static class SurveyQuestionTypes
{
    public const string Scale = "scale";
    public const string Text = "text";
}

/// <summary>Вопрос, каким его прислал администратор: ключ ставит сервер.</summary>
public sealed record SurveyQuestionDraft(string? Text, string? Type, bool Optional);

/// <summary>
/// Вопросы по умолчанию — для самого первого опроса. Дальше форма берётся
/// от последнего отправленного (см. <see cref="SurveyService.TemplateAsync"/>).
///
/// Оценка от 1 до 10, где 1 — плохо, 10 — отлично. У функций, которыми
/// человек мог и не пользоваться, есть ответ «не пользовался»: иначе он
/// ставил бы наугад, и средняя оценка функции врала бы.
/// </summary>
public static class SurveyQuestions
{
    public static readonly IReadOnlyList<SurveyQuestion> Default = new SurveyQuestion[]
    {
        new("q1", "Насколько вам в целом нравится Доска Пи?", false),
        new("q2", "Насколько охотно вы посоветовали бы Доску Пи коллеге?", false),
        new("q3", "Насколько легко разобраться в интерфейсе?", false),
        new("q4", "Рисование пером и маркером, ластик", true),
        new("q5", "Фигуры, линии и стрелки", true),
        new("q6", "Готовые заготовки: координатная плоскость, числовая прямая, тела", true),
        new("q7", "Надписи и таблицы", true),
        new("q8", "Вставка PDF и картинок, библиотека файлов", true),
        new("q9", "Выделение, перемещение, поворот, отражение, группировка", true),
        new("q10", "Совместная работа: вход по ссылке, роли участников, курсоры", true),
        new("q11", "Страницы, закладки, таймер, фон доски", true),
        new("q12", "Запись занятия и конспект на почту", true),
        new("q13", "Работа с телефона и планшета", true),
        new("q14", "Скорость и стабильность, восстановление после обрыва связи", false),
        new("q15", "Что улучшить? Замечания, предложения, жалобы — всё, что хотите сказать", true, SurveyQuestionTypes.Text),
    };

    public const int MaxQuestions = 40;
    public const int MaxQuestionLength = 300;
    public const int MaxTextAnswerLength = 4000;
}

/// <summary>Сводка по вопросу. У открытого — только число ответов, сами тексты отдельно.</summary>
public sealed record SurveyQuestionResult(
    string Key, string Text, string Type, bool Optional, int Answered, int Skipped, double? Average, int[] Distribution);

public sealed record SurveyResults(long Id, int Responses, IReadOnlyList<SurveyQuestionResult> Questions);

public enum SurveyAnswerOutcome { Ok, NotFound, Closed, AlreadyAnswered, Invalid }

public enum SurveyCreateOutcome { Ok, Invalid }

public sealed record SurveyTemplateDto(long Id, string Name, DateTime UpdatedAt, IReadOnlyList<SurveyQuestion> Questions);

public enum SurveyTemplateOutcome { Created, Replaced, Invalid }

/// <summary>
/// Очередь рассылки опросов. Письма уходят в фоне (см. <see cref="SurveyMailer"/>):
/// отправлять их прямо из запроса значило бы держать администратора перед
/// крутящейся кнопкой, пока не уйдёт письмо последнему пользователю.
/// </summary>
public sealed class SurveyQueue
{
    private readonly Channel<long> _channel = Channel.CreateUnbounded<long>();

    public void Enqueue(long surveyId) => _channel.Writer.TryWrite(surveyId);

    public IAsyncEnumerable<long> ReadAllAsync(CancellationToken cancellationToken)
        => _channel.Reader.ReadAllAsync(cancellationToken);
}

public sealed class SurveyService
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly SurveyQueue _queue;

    public SurveyService(AppDbContext db, SurveyQueue queue)
    {
        _db = db;
        _queue = queue;
    }

    /// <summary>Кому уходит опрос: все с подтверждённой почтой, кроме удалённых.</summary>
    public IQueryable<User> Recipients()
        => _db.Users.Where(x => x.DeletedAt == null && x.EmailConfirmed);

    /// <summary>
    /// Проверяет и нумерует вопросы из формы. Пусто — форма неверна: нет
    /// ни одного вопроса, пустой или слишком длинный текст, неизвестный тип.
    /// </summary>
    public static IReadOnlyList<SurveyQuestion>? Normalize(IReadOnlyList<SurveyQuestionDraft>? drafts)
    {
        if (drafts is null || drafts.Count == 0 || drafts.Count > SurveyQuestions.MaxQuestions) return null;

        var questions = new List<SurveyQuestion>();

        foreach (var draft in drafts)
        {
            var text = draft.Text?.Trim();
            if (string.IsNullOrEmpty(text) || text.Length > SurveyQuestions.MaxQuestionLength) return null;

            var type = draft.Type ?? SurveyQuestionTypes.Scale;
            if (type is not (SurveyQuestionTypes.Scale or SurveyQuestionTypes.Text)) return null;

            // Открытый ответ необязателен всегда: заставлять писать текст —
            // верный способ получить «нет» или «.» вместо ответа.
            var optional = type == SurveyQuestionTypes.Text || draft.Optional;

            questions.Add(new SurveyQuestion($"q{questions.Count + 1}", text, optional, type));
        }

        return questions;
    }

    /// <summary>Заводит опрос с этими вопросами и ставит его рассылку в очередь.</summary>
    public async Task<(SurveyCreateOutcome Outcome, Survey? Survey)> CreateAsync(
        long createdBy, IReadOnlyList<SurveyQuestionDraft>? drafts, CancellationToken cancellationToken)
    {
        var questions = Normalize(drafts);
        if (questions is null) return (SurveyCreateOutcome.Invalid, null);

        var survey = new Survey
        {
            Questions = JsonSerializer.Serialize(questions, Json),
            Recipients = await Recipients().CountAsync(cancellationToken),
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
        };

        _db.Surveys.Add(survey);
        await _db.SaveChangesAsync(cancellationToken);

        _queue.Enqueue(survey.Id);
        return (SurveyCreateOutcome.Ok, survey);
    }

    /// <summary>
    /// С чего начинается форма нового опроса: вопросы последнего
    /// отправленного, а если опросов ещё не было — вопросы по умолчанию.
    /// </summary>
    public async Task<IReadOnlyList<SurveyQuestion>> TemplateAsync(CancellationToken cancellationToken)
    {
        var last = await _db.Surveys
            .OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id)
            .FirstOrDefaultAsync(cancellationToken);

        return last is null ? SurveyQuestions.Default : QuestionsOf(last);
    }

    public const int MaxTemplateNameLength = 100;

    /// <summary>Сохранённые шаблоны — свежие сверху.</summary>
    public async Task<IReadOnlyList<SurveyTemplateDto>> TemplatesAsync(CancellationToken cancellationToken)
    {
        var rows = await _db.SurveyTemplates
            .OrderByDescending(x => x.UpdatedAt)
            .ToListAsync(cancellationToken);

        return rows
            .Select(x => new SurveyTemplateDto(
                x.Id, x.Name, x.UpdatedAt,
                JsonSerializer.Deserialize<List<SurveyQuestion>>(x.Questions, Json) ?? new List<SurveyQuestion>()))
            .ToList();
    }

    /// <summary>
    /// Сохраняет вопросы шаблоном. То же имя (без учёта регистра) —
    /// заменяет вопросы у существующего, а не заводит второй с тем же именем.
    /// </summary>
    public async Task<SurveyTemplateOutcome> SaveTemplateAsync(
        string? name, IReadOnlyList<SurveyQuestionDraft>? drafts, CancellationToken cancellationToken)
    {
        var title = name?.Trim();
        var questions = Normalize(drafts);

        if (string.IsNullOrEmpty(title) || title.Length > MaxTemplateNameLength || questions is null)
            return SurveyTemplateOutcome.Invalid;

        var lower = title.ToLowerInvariant();
        var existing = await _db.SurveyTemplates
            .FirstOrDefaultAsync(x => x.Name.ToLower() == lower, cancellationToken);

        var json = JsonSerializer.Serialize(questions, Json);

        if (existing is not null)
        {
            existing.Name = title;
            existing.Questions = json;
            existing.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);
            return SurveyTemplateOutcome.Replaced;
        }

        _db.SurveyTemplates.Add(new SurveyTemplate { Name = title, Questions = json, UpdatedAt = DateTime.UtcNow });
        await _db.SaveChangesAsync(cancellationToken);
        return SurveyTemplateOutcome.Created;
    }

    public async Task<bool> DeleteTemplateAsync(long id, CancellationToken cancellationToken)
    {
        var template = await _db.SurveyTemplates.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (template is null) return false;

        _db.SurveyTemplates.Remove(template);
        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public static IReadOnlyList<SurveyQuestion> QuestionsOf(Survey survey)
        => JsonSerializer.Deserialize<List<SurveyQuestion>>(survey.Questions, Json) ?? new List<SurveyQuestion>();

    public Task<Survey?> FindAsync(long id, CancellationToken cancellationToken)
        => _db.Surveys.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

    public Task<bool> HasAnsweredAsync(long surveyId, long userId, CancellationToken cancellationToken)
        => _db.SurveyParticipants.AnyAsync(x => x.SurveyId == surveyId && x.UserId == userId, cancellationToken);

    /// <summary>
    /// Принимает ответ. Отметка «ответил» и сам ответ пишутся вместе, но
    /// ничем не связаны: по базе нельзя узнать, чей это ответ.
    /// </summary>
    public async Task<SurveyAnswerOutcome> AnswerAsync(
        long surveyId, long userId,
        IReadOnlyDictionary<string, int?>? scores, IReadOnlyDictionary<string, string?>? texts,
        CancellationToken cancellationToken)
    {
        var survey = await FindAsync(surveyId, cancellationToken);
        if (survey is null) return SurveyAnswerOutcome.NotFound;
        if (survey.ClosedAt is not null) return SurveyAnswerOutcome.Closed;

        if (await HasAnsweredAsync(surveyId, userId, cancellationToken))
            return SurveyAnswerOutcome.AlreadyAnswered;

        var cleanScores = new Dictionary<string, int?>();
        var cleanTexts = new Dictionary<string, string>();

        foreach (var question in QuestionsOf(survey))
        {
            if (question.IsText)
            {
                string? given = null;
                if (texts is not null && texts.TryGetValue(question.Key, out var raw)) given = raw?.Trim();
                if (string.IsNullOrEmpty(given)) continue;

                cleanTexts[question.Key] = given.Length > SurveyQuestions.MaxTextAnswerLength
                    ? given[..SurveyQuestions.MaxTextAnswerLength]
                    : given;
                continue;
            }

            int? value = null;
            if (scores is not null && scores.TryGetValue(question.Key, out var score)) value = score;

            if (value is null)
            {
                if (!question.Optional) return SurveyAnswerOutcome.Invalid;
            }
            else if (value is < 1 or > 10)
            {
                return SurveyAnswerOutcome.Invalid;
            }

            cleanScores[question.Key] = value;
        }

        _db.SurveyParticipants.Add(new SurveyParticipant { SurveyId = surveyId, UserId = userId });
        _db.SurveyResponses.Add(new SurveyResponse
        {
            SurveyId = surveyId,
            Scores = JsonSerializer.Serialize(cleanScores, Json),
            Texts = JsonSerializer.Serialize(cleanTexts, Json),
        });

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Два запроса одновременно: второй упёрся в ключ отметки.
            return SurveyAnswerOutcome.AlreadyAnswered;
        }

        return SurveyAnswerOutcome.Ok;
    }

    /// <summary>
    /// Сводка по опросу: у оценок — средняя и раскладка 1..10, у открытых
    /// вопросов — сколько ответили. Сами тексты — отдельно, по вопросу
    /// (<see cref="TextAnswersAsync"/>): их может быть много.
    /// </summary>
    public async Task<SurveyResults?> ResultsAsync(long surveyId, CancellationToken cancellationToken)
    {
        var survey = await FindAsync(surveyId, cancellationToken);
        if (survey is null) return null;

        var rows = await _db.SurveyResponses
            .Where(x => x.SurveyId == surveyId)
            .Select(x => new { x.Scores, x.Texts })
            .ToListAsync(cancellationToken);

        var scores = rows
            .Select(row => JsonSerializer.Deserialize<Dictionary<string, int?>>(row.Scores, Json) ?? new())
            .ToList();
        var texts = rows
            .Select(row => JsonSerializer.Deserialize<Dictionary<string, string>>(row.Texts, Json) ?? new())
            .ToList();

        var questions = QuestionsOf(survey).Select(question =>
        {
            if (question.IsText)
            {
                var answered = texts.Count(x => x.ContainsKey(question.Key));
                return new SurveyQuestionResult(
                    question.Key, question.Text, question.Type, question.Optional,
                    answered, rows.Count - answered, null, Array.Empty<int>());
            }

            var distribution = new int[10];
            var count = 0;
            var skipped = 0;
            var sum = 0;

            foreach (var row in scores)
            {
                if (row.TryGetValue(question.Key, out var value) && value is >= 1 and <= 10)
                {
                    distribution[value.Value - 1]++;
                    count++;
                    sum += value.Value;
                }
                else
                {
                    skipped++;
                }
            }

            return new SurveyQuestionResult(
                question.Key, question.Text, question.Type, question.Optional, count, skipped,
                count > 0 ? Math.Round((double)sum / count, 1) : null, distribution);
        }).ToList();

        return new SurveyResults(survey.Id, rows.Count, questions);
    }

    /// <summary>
    /// Открытые ответы на один вопрос — в случайном порядке, каждый раз
    /// заново: по порядку поступления ответ легко сопоставить с тем, кто,
    /// как известно, отвечал первым или последним.
    /// </summary>
    public async Task<IReadOnlyList<string>?> TextAnswersAsync(long surveyId, string key, CancellationToken cancellationToken)
    {
        var survey = await FindAsync(surveyId, cancellationToken);
        if (survey is null || !QuestionsOf(survey).Any(x => x.Key == key && x.IsText)) return null;

        var rows = await _db.SurveyResponses
            .Where(x => x.SurveyId == surveyId)
            .Select(x => x.Texts)
            .ToListAsync(cancellationToken);

        return rows
            .Select(row => JsonSerializer.Deserialize<Dictionary<string, string>>(row, Json) ?? new())
            .Where(x => x.TryGetValue(key, out var text) && !string.IsNullOrWhiteSpace(text))
            .Select(x => x[key])
            .OrderBy(_ => Random.Shared.Next())
            .ToList();
    }
}

/// <summary>
/// Рассылает приглашения в опрос: по одному письму, с паузой — почтовый
/// сервер не любит сотню писем за секунду и может принять это за спам.
/// </summary>
public sealed class SurveyMailer : BackgroundService
{
    /// <summary>Пауза между письмами.</summary>
    public static TimeSpan Pause { get; set; } = TimeSpan.FromSeconds(1.5);

    private readonly SurveyQueue _queue;
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<SurveyMailer> _logger;

    public SurveyMailer(SurveyQueue queue, IServiceScopeFactory scopes, ILogger<SurveyMailer> logger)
    {
        _queue = queue;
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var surveyId in _queue.ReadAllAsync(stoppingToken))
        {
            try
            {
                await SendAsync(surveyId, stoppingToken);
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                _logger.LogError(error, "Рассылка опроса {SurveyId} прервалась.", surveyId);
            }
        }
    }

    public async Task SendAsync(long surveyId, CancellationToken cancellationToken)
    {
        using var scope = _scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var email = scope.ServiceProvider.GetRequiredService<IEmailSender>();
        var options = scope.ServiceProvider.GetRequiredService<AppOptions>();
        var surveys = scope.ServiceProvider.GetRequiredService<SurveyService>();

        var survey = await db.Surveys.FirstOrDefaultAsync(x => x.Id == surveyId, cancellationToken);
        if (survey is null) return;

        var addresses = await surveys.Recipients()
            .OrderBy(x => x.Id)
            .Select(x => x.Email)
            .ToListAsync(cancellationToken);

        var letter = EmailTemplates.SurveyInvite($"{options.PublicUrl}/survey/{survey.Id}");
        var sent = 0;

        foreach (var address in addresses)
        {
            if (await email.SendAsync(address, letter.Subject, letter.Html, letter.Text, cancellationToken))
            {
                sent++;
                survey.Sent = sent;
                await db.SaveChangesAsync(cancellationToken);
            }

            if (Pause > TimeSpan.Zero) await Task.Delay(Pause, cancellationToken);
        }

        _logger.LogInformation("Опрос {SurveyId}: писем отправлено — {Sent} из {Total}.", survey.Id, sent, addresses.Count);
    }
}
