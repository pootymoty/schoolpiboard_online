using System.Text.Json;
using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Configuration;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;

namespace SchoolPiBoard.Web.Services;

/// <summary>Вопрос опроса. <c>Optional</c> — можно ответить «не пользовался».</summary>
public sealed record SurveyQuestion(string Key, string Text, bool Optional);

/// <summary>
/// Вопросы опроса о доске — только о самой доске, без главной платформы.
///
/// Оценка от 1 до 10, где 1 — плохо, 10 — отлично. У функций, которыми
/// человек мог и не пользоваться, есть ответ «не пользовался»: иначе он
/// ставил бы наугад, и средняя оценка функции врала бы.
/// </summary>
public static class SurveyQuestions
{
    public static readonly IReadOnlyList<SurveyQuestion> Current = new SurveyQuestion[]
    {
        new("overall", "Насколько вам в целом нравится Доска Пи?", false),
        new("recommend", "Насколько охотно вы посоветовали бы Доску Пи коллеге?", false),
        new("ease", "Насколько легко разобраться в интерфейсе?", false),
        new("pen", "Рисование пером и маркером, ластик", true),
        new("shapes", "Фигуры, линии и стрелки", true),
        new("templates", "Готовые заготовки: координатная плоскость, числовая прямая, тела", true),
        new("text", "Надписи и таблицы", true),
        new("documents", "Вставка PDF и картинок, библиотека файлов", true),
        new("editing", "Выделение, перемещение, поворот, отражение, группировка", true),
        new("collab", "Совместная работа: вход по ссылке, роли участников, курсоры", true),
        new("pages", "Страницы, закладки, таймер, фон доски", true),
        new("recording", "Запись занятия и конспект на почту", true),
        new("mobile", "Работа с телефона и планшета", true),
        new("stability", "Скорость и стабильность, восстановление после обрыва связи", false),
    };

    public const int MaxCommentLength = 4000;
}

/// <summary>Средняя и раскладка оценок по одному вопросу.</summary>
public sealed record SurveyQuestionResult(
    string Key, string Text, bool Optional, int Answered, int Skipped, double? Average, int[] Distribution);

public sealed record SurveyResults(long Id, int Responses, IReadOnlyList<SurveyQuestionResult> Questions, IReadOnlyList<string> Comments);

public enum SurveyAnswerOutcome { Ok, NotFound, Closed, AlreadyAnswered, Invalid }

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

    /// <summary>Заводит опрос и ставит его рассылку в очередь.</summary>
    public async Task<Survey> CreateAsync(long createdBy, CancellationToken cancellationToken)
    {
        var survey = new Survey
        {
            Questions = JsonSerializer.Serialize(SurveyQuestions.Current, Json),
            Recipients = await Recipients().CountAsync(cancellationToken),
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
        };

        _db.Surveys.Add(survey);
        await _db.SaveChangesAsync(cancellationToken);

        _queue.Enqueue(survey.Id);
        return survey;
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
        long surveyId, long userId, IReadOnlyDictionary<string, int?>? scores, string? comment,
        CancellationToken cancellationToken)
    {
        var survey = await FindAsync(surveyId, cancellationToken);
        if (survey is null) return SurveyAnswerOutcome.NotFound;
        if (survey.ClosedAt is not null) return SurveyAnswerOutcome.Closed;

        if (await HasAnsweredAsync(surveyId, userId, cancellationToken))
            return SurveyAnswerOutcome.AlreadyAnswered;

        var clean = new Dictionary<string, int?>();

        foreach (var question in QuestionsOf(survey))
        {
            int? value = null;
            if (scores is not null && scores.TryGetValue(question.Key, out var given)) value = given;

            if (value is null)
            {
                if (!question.Optional) return SurveyAnswerOutcome.Invalid;
            }
            else if (value is < 1 or > 10)
            {
                return SurveyAnswerOutcome.Invalid;
            }

            clean[question.Key] = value;
        }

        var text = comment?.Trim();
        if (string.IsNullOrEmpty(text)) text = null;
        else if (text.Length > SurveyQuestions.MaxCommentLength) text = text[..SurveyQuestions.MaxCommentLength];

        _db.SurveyParticipants.Add(new SurveyParticipant { SurveyId = surveyId, UserId = userId });
        _db.SurveyResponses.Add(new SurveyResponse
        {
            SurveyId = surveyId,
            Scores = JsonSerializer.Serialize(clean, Json),
            Comment = text,
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

    /// <summary>Сводка по опросу: средние, раскладка 1..10 и комментарии.</summary>
    public async Task<SurveyResults?> ResultsAsync(long surveyId, CancellationToken cancellationToken)
    {
        var survey = await FindAsync(surveyId, cancellationToken);
        if (survey is null) return null;

        var rows = await _db.SurveyResponses
            .Where(x => x.SurveyId == surveyId)
            .Select(x => new { x.Scores, x.Comment })
            .ToListAsync(cancellationToken);

        var parsed = rows
            .Select(row => JsonSerializer.Deserialize<Dictionary<string, int?>>(row.Scores, Json) ?? new())
            .ToList();

        var questions = QuestionsOf(survey).Select(question =>
        {
            var distribution = new int[10];
            var answered = 0;
            var skipped = 0;
            var sum = 0;

            foreach (var scores in parsed)
            {
                if (scores.TryGetValue(question.Key, out var value) && value is >= 1 and <= 10)
                {
                    distribution[value.Value - 1]++;
                    answered++;
                    sum += value.Value;
                }
                else
                {
                    skipped++;
                }
            }

            return new SurveyQuestionResult(
                question.Key, question.Text, question.Optional, answered, skipped,
                answered > 0 ? Math.Round((double)sum / answered, 1) : null, distribution);
        }).ToList();

        // Комментарии — по алфавиту, а не в порядке поступления: по порядку
        // легко сопоставить ответ с тем, кто, как известно, отвечал первым.
        var comments = rows
            .Select(x => x.Comment)
            .OfType<string>()
            .OrderBy(x => x, StringComparer.Ordinal)
            .ToList();

        return new SurveyResults(survey.Id, rows.Count, questions, comments);
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
