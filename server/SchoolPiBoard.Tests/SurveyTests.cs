using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using SchoolPiBoard.Web.Configuration;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;
using SchoolPiBoard.Web.Services;
using Xunit;

namespace SchoolPiBoard.Tests;

/// <summary>Опросы: кому уходят письма, один ответ на человека, обезличенность, сводка.</summary>
public sealed class SurveyTests : IDisposable
{
    private readonly ServiceProvider _services;
    private readonly List<string> _sent = new();

    public SurveyTests()
    {
        var name = Guid.NewGuid().ToString();

        _services = new ServiceCollection()
            .AddDbContext<AppDbContext>(options => options.UseInMemoryDatabase(name))
            .AddScoped<SurveyService>()
            .AddSingleton<SurveyQueue>()
            .AddSingleton(TestOptions.Create())
            .AddSingleton(typeof(Microsoft.Extensions.Logging.ILogger<>), typeof(NullLogger<>))
            .AddSingleton<IEmailSender>(services => new GuardedEmailSender(
                new ListSender(_sent),
                services.GetRequiredService<IServiceScopeFactory>(),
                NullLogger<GuardedEmailSender>.Instance))
            .BuildServiceProvider();

        SurveyMailer.Pause = TimeSpan.Zero;
    }

    public void Dispose() => _services.Dispose();

    [Fact]
    public async Task InviteGoesOnlyToConfirmedLiveUsers()
    {
        await AddUserAsync(1, "live@example.com", confirmed: true, deleted: false);
        await AddUserAsync(2, "unconfirmed@example.com", confirmed: false, deleted: false);
        await AddUserAsync(3, MailAddresses.Deleted(3), confirmed: true, deleted: true);

        Survey survey;
        using (var scope = _services.CreateScope())
        {
            (_, var created) = await scope.ServiceProvider.GetRequiredService<SurveyService>()
                .CreateAsync(1, Drafts(SurveyQuestions.Default), CancellationToken.None);
            survey = created!;
        }

        Assert.Equal(1, survey.Recipients);

        // До рассылки отвечать нельзя никому — письма ещё не ушли.
        Assert.Equal(SurveyAnswerOutcome.NotInvited, await AnswerAsync(survey.Id, 1, Full(8), null));

        var mailer = new SurveyMailer(
            _services.GetRequiredService<SurveyQueue>(),
            _services.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<SurveyMailer>.Instance);

        await mailer.SendAsync(survey.Id, CancellationToken.None);

        Assert.Equal(new[] { "live@example.com" }, _sent);

        using (var scope = _services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal(1, (await db.Surveys.SingleAsync()).Sent);
        }

        // Письмо ушло — теперь можно; повторный проход рассылки второе письмо не шлёт.
        Assert.Equal(SurveyAnswerOutcome.Ok, await AnswerAsync(survey.Id, 1, Full(8), null));
        await mailer.SendAsync(survey.Id, CancellationToken.None);
        Assert.Single(_sent);
    }

    [Fact]
    public async Task OnlyThoseWhoGotTheLetterCanAnswer()
    {
        await AddUserAsync(1, "live@example.com", confirmed: true, deleted: false);
        var survey = await CreateAsync();

        // Ссылку переслали — человек завёл учётную запись уже после рассылки.
        await AddUserAsync(2, "friend@example.com", confirmed: true, deleted: false);
        Assert.Equal(SurveyAnswerOutcome.NotInvited, await AnswerAsync(survey.Id, 2, Full(9), null));

        using (var scope = _services.CreateScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<SurveyService>();
            Assert.False(await service.IsInvitedAsync(survey.Id, 2, CancellationToken.None));
            Assert.True(await service.IsInvitedAsync(survey.Id, 1, CancellationToken.None));
        }

        Assert.Equal(SurveyAnswerOutcome.Ok, await AnswerAsync(survey.Id, 1, Full(9), null));
    }

    [Fact]
    public async Task OneAnswerPerUserAndAnswerIsNotLinkedToUser()
    {
        await AddUserAsync(1, "live@example.com", confirmed: true, deleted: false);
        var survey = await CreateAsync();

        Assert.Equal(SurveyAnswerOutcome.Ok, await AnswerAsync(survey.Id, 1, Full(8), "Хочется больше фигур"));
        Assert.Equal(SurveyAnswerOutcome.AlreadyAnswered, await AnswerAsync(survey.Id, 1, Full(3), null));

        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var response = await db.SurveyResponses.SingleAsync();
        Assert.DoesNotContain("live@example.com", response.Scores + response.Texts);
        Assert.Single(await db.SurveyParticipants.ToListAsync());

        // У ответа нет ни автора, ни времени — только оценки и текст.
        var columns = db.Model.FindEntityType(typeof(SurveyResponse))!.GetProperties().Select(x => x.Name).ToHashSet();
        Assert.Equal(new HashSet<string> { "Id", "SurveyId", "Scores", "Texts" }, columns);
    }

    [Fact]
    public async Task RequiredQuestionsMustBeAnsweredAndScoresInRange()
    {
        await AddUserAsync(1, "live@example.com", confirmed: true, deleted: false);
        var survey = await CreateAsync();

        var missing = Full(5);
        missing[SurveyQuestions.Default[0].Key] = null;
        Assert.Equal(SurveyAnswerOutcome.Invalid, await AnswerAsync(survey.Id, 1, missing, null));

        var outOfRange = Full(5);
        outOfRange[SurveyQuestions.Default[3].Key] = 11;
        Assert.Equal(SurveyAnswerOutcome.Invalid, await AnswerAsync(survey.Id, 1, outOfRange, null));

        // «Не пользовался» в необязательном вопросе — можно.
        var skipped = Full(5);
        skipped[Recording] = null;
        Assert.Equal(SurveyAnswerOutcome.Ok, await AnswerAsync(survey.Id, 1, skipped, null));
    }

    [Fact]
    public async Task ClosedSurveyTakesNoAnswers()
    {
        await AddUserAsync(1, "live@example.com", confirmed: true, deleted: false);
        var survey = await CreateAsync();

        using (var scope = _services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.Surveys.SingleAsync()).ClosedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }

        Assert.Equal(SurveyAnswerOutcome.Closed, await AnswerAsync(survey.Id, 1, Full(7), null));
    }

    [Fact]
    public async Task ResultsCountAveragesDistributionAndComments()
    {
        await AddUserAsync(1, "a@example.com", confirmed: true, deleted: false);
        await AddUserAsync(2, "b@example.com", confirmed: true, deleted: false);
        var survey = await CreateAsync();

        var first = Full(10);
        first[Recording] = null;
        await AnswerAsync(survey.Id, 1, first, "Отлично");
        await AnswerAsync(survey.Id, 2, Full(6), "   ");

        using var scope = _services.CreateScope();
        var results = await scope.ServiceProvider.GetRequiredService<SurveyService>().ResultsAsync(survey.Id, CancellationToken.None);

        Assert.NotNull(results);
        Assert.Equal(2, results!.Responses);

        var overall = results.Questions.First();
        Assert.Equal(8.0, overall.Average);
        Assert.Equal(1, overall.Distribution[5]);
        Assert.Equal(1, overall.Distribution[9]);

        var recording = results.Questions.Single(x => x.Key == Recording);
        Assert.Equal(1, recording.Answered);
        Assert.Equal(1, recording.Skipped);
        Assert.Equal(6.0, recording.Average);

        var text = results.Questions.Single(x => x.Key == TextKey);
        Assert.Equal(1, text.Answered);

        var answers = await scope.ServiceProvider.GetRequiredService<SurveyService>()
            .TextAnswersAsync(survey.Id, TextKey, CancellationToken.None);
        Assert.Equal(new[] { "Отлично" }, answers);
    }

    [Fact]
    public async Task CustomQuestionsAreNumberedAndValidated()
    {
        await AddUserAsync(1, "live@example.com", confirmed: true, deleted: false);

        using var scope = _services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<SurveyService>();

        var (bad, _) = await service.CreateAsync(1, new List<SurveyQuestionDraft> { new("   ", "scale", false) }, CancellationToken.None);
        Assert.Equal(SurveyCreateOutcome.Invalid, bad);

        var (empty, _) = await service.CreateAsync(1, new List<SurveyQuestionDraft>(), CancellationToken.None);
        Assert.Equal(SurveyCreateOutcome.Invalid, empty);

        var (ok, survey) = await service.CreateAsync(1, new List<SurveyQuestionDraft>
        {
            new("Как вам таймер?", "scale", false),
            new("Что добавить?", "text", false),
        }, CancellationToken.None);

        Assert.Equal(SurveyCreateOutcome.Ok, ok);
        var questions = SurveyService.QuestionsOf(survey!);
        Assert.Equal(new[] { "q1", "q2" }, questions.Select(x => x.Key));
        Assert.True(questions[1].Optional);

        // Следующая форма начинается с вопросов этого опроса.
        var template = await service.TemplateAsync(CancellationToken.None);
        Assert.Equal(new[] { "Как вам таймер?", "Что добавить?" }, template.Select(x => x.Text));
    }

    [Fact]
    public void QuestionWithoutTypeFromOldSurveyIsScale()
    {
        // Так лежат вопросы опросов, отправленных до появления типов.
        var old = new Survey { Questions = """[{"key":"overall","text":"Как вам?","optional":false}]""" };

        var question = Assert.Single(SurveyService.QuestionsOf(old));
        Assert.Equal(SurveyQuestionTypes.Scale, question.Type);
        Assert.False(question.IsText);
    }

    [Fact]
    public async Task TemplatesAreSavedReplacedByNameAndDeleted()
    {
        using var scope = _services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<SurveyService>();

        var first = new List<SurveyQuestionDraft> { new("Вопрос А", "scale", false) };
        var second = new List<SurveyQuestionDraft> { new("Вопрос Б", "text", false), new("Вопрос В", "scale", true) };

        Assert.Equal(SurveyTemplateOutcome.Created, await service.SaveTemplateAsync("Ежемесячный", first, CancellationToken.None));
        Assert.Equal(SurveyTemplateOutcome.Replaced, await service.SaveTemplateAsync("ежемесячный ", second, CancellationToken.None));
        Assert.Equal(SurveyTemplateOutcome.Invalid, await service.SaveTemplateAsync("", second, CancellationToken.None));

        var templates = await service.TemplatesAsync(CancellationToken.None);
        var only = Assert.Single(templates);
        Assert.Equal(new[] { "Вопрос Б", "Вопрос В" }, only.Questions.Select(x => x.Text));

        Assert.True(await service.DeleteTemplateAsync(only.Id, CancellationToken.None));
        Assert.Empty(await service.TemplatesAsync(CancellationToken.None));
    }

    private static Dictionary<string, int?> Full(int score)
        => SurveyQuestions.Default.Where(x => !x.IsText).ToDictionary(x => x.Key, _ => (int?)score);

    private static List<SurveyQuestionDraft> Drafts(IEnumerable<SurveyQuestion> questions)
        => questions.Select(x => new SurveyQuestionDraft(x.Text, x.Type, x.Optional)).ToList();

    /// <summary>Ключ открытого вопроса в опросе по умолчанию.</summary>
    private static string TextKey => SurveyQuestions.Default.Single(x => x.IsText).Key;

    /// <summary>Ключ вопроса про запись занятия — необязательная оценка.</summary>
    private static string Recording => SurveyQuestions.Default.Single(x => x.Text.StartsWith("Запись занятия")).Key;

    private async Task<Survey> CreateAsync()
    {
        using var scope = _services.CreateScope();
        var (_, survey) = await scope.ServiceProvider.GetRequiredService<SurveyService>()
            .CreateAsync(1, Drafts(SurveyQuestions.Default), CancellationToken.None);

        // Как после рассылки: письма ушли всем адресатам.
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        foreach (var recipient in db.SurveyRecipients.Where(x => x.SurveyId == survey!.Id)) recipient.SentAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return survey!;
    }

    private async Task<SurveyAnswerOutcome> AnswerAsync(long surveyId, long userId, Dictionary<string, int?> scores, string? comment)
    {
        using var scope = _services.CreateScope();
        var texts = new Dictionary<string, string?> { [TextKey] = comment };
        return await scope.ServiceProvider.GetRequiredService<SurveyService>()
            .AnswerAsync(surveyId, userId, scores, texts, CancellationToken.None);
    }

    private async Task AddUserAsync(long id, string email, bool confirmed, bool deleted)
    {
        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        db.Users.Add(new User
        {
            Id = id,
            Email = email,
            DisplayName = "User",
            EmailConfirmed = confirmed,
            CreatedAt = DateTime.UtcNow.AddDays(-30),
            DeletedAt = deleted ? DateTime.UtcNow.AddDays(-1) : null,
        });

        await db.SaveChangesAsync();
    }

    private sealed class ListSender : IEmailSender
    {
        private readonly List<string> _sent;

        public ListSender(List<string> sent) => _sent = sent;

        public Task<bool> SendAsync(string to, string subject, string html, string text, CancellationToken cancellationToken)
            => SendAsync(to, subject, html, text, Array.Empty<EmailAttachment>(), cancellationToken);

        public Task<bool> SendAsync(
            string to, string subject, string html, string text,
            IReadOnlyList<EmailAttachment> attachments, CancellationToken cancellationToken)
        {
            _sent.Add(to);
            return Task.FromResult(true);
        }
    }
}

/// <summary>Настройки для тестов — заглушки, ни к чему не подключаются.</summary>
internal static class TestOptions
{
    public static AppOptions Create() => new()
    {
        DatabaseUrl = "Host=unused",
        RedisUrl = "unused",
        JwtSigningKey = new string('k', 64),
        PublicUrl = "https://board.example.com",
        LicenseServerUrl = "https://keys.example.com",
        LicenseSharedSecret = "unused",
        Mail = new MailOptions { Server = "smtp.example.com", Port = 465, Username = "u", Password = "p", From = "info@example.com" },
        Storage = new StorageOptions { Endpoint = "unused", Bucket = "unused", AccessKey = "unused", SecretKey = "unused" },
        FilesDir = Path.GetTempPath(),
        AdminEmails = Array.Empty<string>(),
        SchoolPi = new SchoolPiOptions { BaseUrl = "https://school.example.com", ClientId = "id", ClientSecret = "secret", BonusDays = 7 },
        TrialDays = 7,
        GraceDays = 3,
    };
}
