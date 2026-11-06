using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using SchoolPiBoard.Web.Configuration;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;
using SchoolPiBoard.Web.Services;
using Xunit;

namespace SchoolPiBoard.Tests;

/// <summary>
/// Удалённой учётной записи сервис не пишет ничего и ничего не продлевает.
///
/// Повод — настоящий случай: предупреждение о продлении подписки ушло на
/// обезличенный адрес удалённого пользователя (deleted-2@deleted.invalid),
/// и почта вернула отказ.
/// </summary>
public sealed class DeletedUserMailTests : IDisposable
{
    private readonly ServiceProvider _services;
    private readonly RecordingSender _smtp = new();

    public DeletedUserMailTests()
    {
        var name = Guid.NewGuid().ToString();

        _services = new ServiceCollection()
            .AddDbContext<AppDbContext>(options => options.UseInMemoryDatabase(name))
            .AddScoped<SubscriptionService>()
            .AddScoped<AccountService>()
            .AddSingleton(Options())
            .AddSingleton<AuthTokenService>()
            .AddSingleton(typeof(Microsoft.Extensions.Logging.ILogger<>), typeof(NullLogger<>))
            .AddSingleton<IEmailSender>(services => new GuardedEmailSender(
                _smtp,
                services.GetRequiredService<IServiceScopeFactory>(),
                NullLogger<GuardedEmailSender>.Instance))
            .BuildServiceProvider();
    }

    public void Dispose() => _services.Dispose();

    [Theory]
    [InlineData("deleted-2@deleted.invalid")]
    [InlineData("DELETED-2@Deleted.Invalid")]
    [InlineData("someone@example.invalid")]
    [InlineData("")]
    public async Task NoLetterToUndeliverableAddress(string address)
    {
        var sent = await Sender().SendAsync(address, "Тема", "<p>Текст</p>", "Текст", CancellationToken.None);

        Assert.False(sent);
        Assert.Empty(_smtp.Sent);
    }

    [Fact]
    public async Task NoLetterToAddressOfDeletedUser()
    {
        // Даже если адрес почему-то остался прежним — запись удалена, писать ей нельзя.
        await AddUserAsync(1, "teacher@example.com", deleted: true);

        var sent = await Sender().SendAsync("teacher@example.com", "Тема", "<p>Текст</p>", "Текст", CancellationToken.None);

        Assert.False(sent);
        Assert.Empty(_smtp.Sent);
    }

    [Fact]
    public async Task LetterToLiveUserAndToAddressWithoutAccountGoesOut()
    {
        await AddUserAsync(1, "teacher@example.com", deleted: false);

        Assert.True(await Sender().SendAsync("teacher@example.com", "Тема", "<p>Текст</p>", "Текст", CancellationToken.None));
        Assert.True(await Sender().SendAsync("student@example.com", "Конспект", "<p>Текст</p>", "Текст", CancellationToken.None));

        Assert.Equal(new[] { "teacher@example.com", "student@example.com" }, _smtp.Sent);
    }

    [Fact]
    public async Task DeletingAccountTurnsOffRenewalAndNoNoticeIsDue()
    {
        await AddUserAsync(2, "teacher@example.com", deleted: false);
        await AddRenewingSubscriptionAsync(2);

        using (var scope = _services.CreateScope())
        {
            var subscriptions = scope.ServiceProvider.GetRequiredService<SubscriptionService>();
            Assert.Single(await subscriptions.DueForNoticeAsync(TimeSpan.FromDays(3), CancellationToken.None));
        }

        using (var scope = _services.CreateScope())
        {
            var accounts = scope.ServiceProvider.GetRequiredService<AccountService>();
            var result = await accounts.DeleteAccountAsync(2, CancellationToken.None);
            Assert.Equal(AccountOutcome.Ok, result.Outcome);
        }

        using (var scope = _services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var subscriptions = scope.ServiceProvider.GetRequiredService<SubscriptionService>();

            Assert.False((await db.Subscriptions.SingleAsync(x => x.UserId == 2)).AutoRenew);
            Assert.Empty(await subscriptions.DueForNoticeAsync(TimeSpan.FromDays(3), CancellationToken.None));
            Assert.Empty(await subscriptions.DueForRenewalAsync(TimeSpan.FromDays(3), CancellationToken.None));
        }
    }

    [Fact]
    public async Task DeletedUserIsSkippedEvenIfRenewalWasLeftOn()
    {
        // Так лежат данные удалённых до этой правки: автопродление осталось включённым.
        await AddUserAsync(2, MailAddresses.Deleted(2), deleted: true);
        await AddRenewingSubscriptionAsync(2);

        using var scope = _services.CreateScope();
        var subscriptions = scope.ServiceProvider.GetRequiredService<SubscriptionService>();

        Assert.Empty(await subscriptions.DueForNoticeAsync(TimeSpan.FromDays(3), CancellationToken.None));
        Assert.Empty(await subscriptions.DueForRenewalAsync(TimeSpan.FromDays(3), CancellationToken.None));
    }

    private IEmailSender Sender() => _services.GetRequiredService<IEmailSender>();

    private async Task AddUserAsync(long id, string email, bool deleted)
    {
        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        db.Users.Add(new User
        {
            Id = id,
            Email = email,
            DisplayName = "Teacher",
            EmailConfirmed = true,
            CreatedAt = DateTime.UtcNow.AddDays(-30),
            DeletedAt = deleted ? DateTime.UtcNow.AddDays(-1) : null,
        });

        await db.SaveChangesAsync();
    }

    private async Task AddRenewingSubscriptionAsync(long userId)
    {
        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var plan = new Plan { Id = 900, Code = "test-plan", Name = "Тест", Sort = 1, Price30 = 100 };
        db.Plans.Add(plan);

        db.Subscriptions.Add(new Subscription
        {
            UserId = userId,
            PlanId = plan.Id,
            Kind = Subscription.KindPaid,
            Source = Subscription.SourceKeys,
            StartsAt = DateTime.UtcNow.AddDays(-28),
            EndsAt = DateTime.UtcNow.AddDays(2),
            InvoiceId = "inv-1",
            AutoRenew = true,
            CreatedAt = DateTime.UtcNow.AddDays(-28),
        });

        await db.SaveChangesAsync();
    }

    private static AppOptions Options() => new()
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

    /// <summary>Вместо SMTP: запоминает, кому письмо ушло бы на самом деле.</summary>
    private sealed class RecordingSender : IEmailSender
    {
        public List<string> Sent { get; } = new();

        public Task<bool> SendAsync(string to, string subject, string html, string text, CancellationToken cancellationToken)
            => SendAsync(to, subject, html, text, Array.Empty<EmailAttachment>(), cancellationToken);

        public Task<bool> SendAsync(
            string to, string subject, string html, string text,
            IReadOnlyList<EmailAttachment> attachments, CancellationToken cancellationToken)
        {
            Sent.Add(to);
            return Task.FromResult(true);
        }
    }
}
