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

        var survey = await CreateAsync();
        Assert.Equal(1, survey.Recipients);

        var mailer = new SurveyMailer(
            _services.GetRequiredService<SurveyQueue>(),
            _services.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<SurveyMailer>.Instance);

        await mailer.SendAsync(survey.Id, CancellationToken.None);

        Assert.Equal(new[] { "live@example.com" }, _sent);

        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(1, (await db.Surveys.SingleAsync()).Sent);
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
        Assert.DoesNotContain("live@example.com", response.Scores + response.Comment);
        Assert.Single(await db.SurveyParticipants.ToListAsync());

        // У ответа нет ни автора, ни времени — только оценки и текст.
        var columns = db.Model.FindEntityType(typeof(SurveyResponse))!.GetProperties().Select(x => x.Name).ToHashSet();
        Assert.Equal(new HashSet<string> { "Id", "SurveyId", "Scores", "Comment" }, columns);
    }

    [Fact]
    public async Task RequiredQuestionsMustBeAnsweredAndScoresInRange()
    {
        await AddUserAsync(1, "live@example.com", confirmed: true, deleted: false);
        var survey = await CreateAsync();

        var missing = Full(5);
        missing["overall"] = null;
        Assert.Equal(SurveyAnswerOutcome.Invalid, await AnswerAsync(survey.Id, 1, missing, null));

        var outOfRange = Full(5);
        outOfRange["pen"] = 11;
        Assert.Equal(SurveyAnswerOutcome.Invalid, await AnswerAsync(survey.Id, 1, outOfRange, null));

        // «Не пользовался» в необязательном вопросе — можно.
        var skipped = Full(5);
        skipped["recording"] = null;
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
        first["recording"] = null;
        await AnswerAsync(survey.Id, 1, first, "Отлично");
        await AnswerAsync(survey.Id, 2, Full(6), "   ");

        using var scope = _services.CreateScope();
        var results = await scope.ServiceProvider.GetRequiredService<SurveyService>().ResultsAsync(survey.Id, CancellationToken.None);

        Assert.NotNull(results);
        Assert.Equal(2, results!.Responses);

        var overall = results.Questions.Single(x => x.Key == "overall");
        Assert.Equal(8.0, overall.Average);
        Assert.Equal(1, overall.Distribution[5]);
        Assert.Equal(1, overall.Distribution[9]);

        var recording = results.Questions.Single(x => x.Key == "recording");
        Assert.Equal(1, recording.Answered);
        Assert.Equal(1, recording.Skipped);
        Assert.Equal(6.0, recording.Average);

        Assert.Equal(new[] { "Отлично" }, results.Comments);
    }

    private static Dictionary<string, int?> Full(int score)
        => SurveyQuestions.Current.ToDictionary(x => x.Key, _ => (int?)score);

    private async Task<Survey> CreateAsync()
    {
        using var scope = _services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SurveyService>().CreateAsync(1, CancellationToken.None);
    }

    private async Task<SurveyAnswerOutcome> AnswerAsync(long surveyId, long userId, Dictionary<string, int?> scores, string? comment)
    {
        using var scope = _services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SurveyService>()
            .AnswerAsync(surveyId, userId, scores, comment, CancellationToken.None);
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
