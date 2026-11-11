using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;
using SchoolPiBoard.Web.Services;
using Xunit;

namespace SchoolPiBoard.Tests;

/// <summary>
/// Рассылка конспекта участникам доски: кому уходит, а кому — нет.
/// </summary>
public sealed class SummaryMembersTests : IDisposable
{
    private readonly ServiceProvider _services;
    private readonly HiddenSender _smtp = new();

    public SummaryMembersTests()
    {
        var name = Guid.NewGuid().ToString();

        _services = new ServiceCollection()
            .AddDbContext<AppDbContext>(options => options.UseInMemoryDatabase(name))
            .AddScoped<SummaryService>()
            .AddSingleton<IEmailSender>(services => new GuardedEmailSender(
                _smtp,
                services.GetRequiredService<IServiceScopeFactory>(),
                NullLogger<GuardedEmailSender>.Instance))
            .BuildServiceProvider();
    }

    public void Dispose() => _services.Dispose();

    private static readonly EmailAttachment[] Page =
        { new("Лист 1.png", new byte[] { 1, 2, 3 }, "image/png") };

    [Fact]
    public async Task AllMembersExceptOwnerBannedDeletedAndUnconfirmed()
    {
        var board = await SeedAsync();

        var outcome = await Send(board, onlineOnly: false, online: Array.Empty<long>());

        Assert.Equal(SummaryOutcome.Ok, outcome);
        Assert.Single(_smtp.Letters);
        Assert.Equal(new[] { "a@example.com", "b@example.com" }, _smtp.Letters[0].OrderBy(x => x));
    }

    [Fact]
    public async Task OnlyThoseOnBoardNow()
    {
        var board = await SeedAsync();

        var outcome = await Send(board, onlineOnly: true, online: new long[] { 2, 4 });

        Assert.Equal(SummaryOutcome.Ok, outcome);
        Assert.Equal(new[] { "a@example.com" }, _smtp.Letters.Single());
    }

    [Fact]
    public async Task NobodyOnline()
    {
        var board = await SeedAsync();

        var outcome = await Send(board, onlineOnly: true, online: new long[] { 1 });

        Assert.Equal(SummaryOutcome.NoRecipients, outcome);
        Assert.Empty(_smtp.Letters);
    }

    [Fact]
    public async Task AudienceCounts()
    {
        var board = await SeedAsync();

        using var scope = _services.CreateScope();
        var audience = await scope.ServiceProvider.GetRequiredService<SummaryService>()
            .AudienceAsync(board, new long[] { 1, 2, 4 }, 3, CancellationToken.None);

        Assert.Equal(new SummaryAudience(1, 2, 3), audience);
    }

    private async Task<SummaryOutcome> Send(Board board, bool onlineOnly, IReadOnlyCollection<long> online)
    {
        using var scope = _services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SummaryService>().SendToMembersAsync(
            board, onlineOnly, online, "u1", "owner@example.com", Page, 1, CancellationToken.None);
    }

    /// <summary>
    /// 1 — владелец, 2 и 3 — обычные участники, 4 — заблокирован,
    /// 5 — удалён, 6 — не подтвердил почту.
    /// </summary>
    private async Task<Board> SeedAsync()
    {
        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var board = new Board { Id = 10, OwnerId = 1, Title = "Урок", LinkToken = "t", CreatedAt = DateTime.UtcNow };
        db.Boards.Add(board);

        void Member(long id, string email, bool confirmed = true, bool deleted = false, bool banned = false)
        {
            db.Users.Add(new User
            {
                Id = id,
                Email = email,
                DisplayName = "U",
                EmailConfirmed = confirmed,
                CreatedAt = DateTime.UtcNow,
                DeletedAt = deleted ? DateTime.UtcNow : null,
            });
            db.BoardMembers.Add(new BoardMember
            {
                BoardId = board.Id,
                UserId = id,
                Role = id == 1 ? BoardMember.RoleOwner : BoardMember.RoleEditor,
                Source = id == 1 ? BoardMember.SourceOwner : BoardMember.SourceLink,
                JoinedAt = DateTime.UtcNow,
                BannedAt = banned ? DateTime.UtcNow : null,
            });
        }

        Member(1, "owner@example.com");
        Member(2, "a@example.com");
        Member(3, "b@example.com");
        Member(4, "banned@example.com", banned: true);
        Member(5, "gone@example.com", deleted: true);
        Member(6, "new@example.com", confirmed: false);

        await db.SaveChangesAsync();
        return board;
    }

    /// <summary>Вместо SMTP: запоминает адресатов каждого письма со скрытой копией.</summary>
    private sealed class HiddenSender : IEmailSender
    {
        public List<string[]> Letters { get; } = new();

        public Task<bool> SendAsync(string to, string subject, string html, string text, CancellationToken cancellationToken)
            => SendAsync(to, subject, html, text, Array.Empty<EmailAttachment>(), cancellationToken);

        public Task<bool> SendAsync(
            string to, string subject, string html, string text,
            IReadOnlyList<EmailAttachment> attachments, CancellationToken cancellationToken)
        {
            Letters.Add(new[] { to });
            return Task.FromResult(true);
        }

        public Task<bool> SendHiddenAsync(
            IReadOnlyList<string> recipients, string subject, string html, string text,
            IReadOnlyList<EmailAttachment> attachments, CancellationToken cancellationToken)
        {
            Letters.Add(recipients.ToArray());
            return Task.FromResult(true);
        }
    }
}
