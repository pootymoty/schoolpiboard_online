using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;

namespace SchoolPiBoard.Web.Services;

public enum SummaryOutcome
{
    Ok,
    BadEmail,
    TooManyPending,
    TooManySent,
    NothingToSend,
    TooBig,
    NotFound,
    NotSent,
}

/// <summary>
/// Конспект занятия по почте.
///
/// Порядок один и тот же в обе стороны: адрес называет участник, а
/// отправляет владелец. Без этого доска стала бы способом рассылать
/// письма с вложениями на любой адрес от нашего имени, и разбираться с
/// последствиями пришлось бы нам.
///
/// Рисует листы браузер: на сервере нет ни холста, ни шрифтов доски, и
/// заводить их там ради одного письма — значит держать вторую отрисовку,
/// которая рано или поздно разойдётся с первой.
/// </summary>
public sealed class SummaryService
{
    /// <summary>Сколько листов уходит одним письмом.</summary>
    public const int MaxPages = 12;

    /// <summary>Общий вес вложений. Больше почта на той стороне просто не примет.</summary>
    public const int MaxTotalBytes = 15 * 1024 * 1024;

    private readonly AppDbContext _db;
    private readonly IEmailSender _email;

    public SummaryService(AppDbContext db, IEmailSender email)
    {
        _db = db;
        _email = email;
    }

    /// <summary>Неразобранные просьбы по доске — их видит только владелец.</summary>
    public Task<List<SummaryRequest>> PendingAsync(long boardId, CancellationToken cancellationToken)
        => _db.SummaryRequests
            .Where(x => x.BoardId == boardId && x.Status == SummaryRequest.StatusPending)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync(cancellationToken);

    public async Task<SummaryOutcome> AskAsync(
        long boardId, string participantKey, string displayName, string? email,
        CancellationToken cancellationToken)
    {
        var address = Normalize(email);
        if (address is null) return SummaryOutcome.BadEmail;

        var pending = await _db.SummaryRequests
            .CountAsync(x => x.BoardId == boardId && x.Status == SummaryRequest.StatusPending, cancellationToken);

        if (pending >= SummaryRequest.MaxPending) return SummaryOutcome.TooManyPending;

        // Повторная просьба на тот же адрес не заводит вторую строку:
        // ученик, нажавший дважды, не должен превращаться в двух учеников
        // в списке у владельца.
        var already = await _db.SummaryRequests.AnyAsync(
            x => x.BoardId == boardId
                && x.Status == SummaryRequest.StatusPending
                && x.Email == address,
            cancellationToken);

        if (already) return SummaryOutcome.Ok;

        _db.SummaryRequests.Add(new SummaryRequest
        {
            BoardId = boardId,
            Email = address,
            AskedBy = participantKey,
            AskedName = displayName,
            Status = SummaryRequest.StatusPending,
            CreatedAt = DateTime.UtcNow,
        });

        await _db.SaveChangesAsync(cancellationToken);
        return SummaryOutcome.Ok;
    }

    public async Task<bool> DeclineAsync(long boardId, long requestId, CancellationToken cancellationToken)
    {
        var request = await _db.SummaryRequests.FirstOrDefaultAsync(
            x => x.Id == requestId && x.BoardId == boardId && x.Status == SummaryRequest.StatusPending,
            cancellationToken);

        if (request is null) return false;

        request.Status = SummaryRequest.StatusDeclined;
        request.ResolvedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    /// <summary>
    /// Отправляет конспект.
    ///
    /// Адрес берётся из просьбы, а не из запроса: иначе владелец мог бы
    /// подставить любой, и проверка «просил участник» ничего бы не значила.
    /// Отправка себе — единственное исключение, и адрес там свой.
    /// </summary>
    public async Task<SummaryOutcome> SendAsync(
        Board board, long? requestId, string ownerKey, string ownerEmail,
        IReadOnlyList<EmailAttachment> pages, CancellationToken cancellationToken)
    {
        if (pages.Count == 0) return SummaryOutcome.NothingToSend;
        if (pages.Count > MaxPages) return SummaryOutcome.TooBig;
        if (pages.Sum(x => (long)x.Content.Length) > MaxTotalBytes) return SummaryOutcome.TooBig;

        var hour = DateTime.UtcNow.AddHours(-1);
        var sent = await _db.SummaryRequests.CountAsync(
            x => x.BoardId == board.Id && x.Status == SummaryRequest.StatusSent && x.ResolvedAt >= hour,
            cancellationToken);

        if (sent >= SummaryRequest.MaxSentPerHour) return SummaryOutcome.TooManySent;

        SummaryRequest? request = null;
        string address;

        if (requestId is null)
        {
            address = Normalize(ownerEmail) ?? string.Empty;
            if (address.Length == 0) return SummaryOutcome.BadEmail;
        }
        else
        {
            request = await _db.SummaryRequests.FirstOrDefaultAsync(
                x => x.Id == requestId && x.BoardId == board.Id && x.Status == SummaryRequest.StatusPending,
                cancellationToken);

            if (request is null) return SummaryOutcome.NotFound;
            address = request.Email;
        }

        var letter = EmailTemplates.Summary(board.Title, pages.Count);
        var delivered = await _email.SendAsync(
            address, letter.Subject, letter.Html, letter.Text, pages, cancellationToken);

        if (!delivered) return SummaryOutcome.NotSent;

        if (request is null)
        {
            // Отправку себе тоже записываем: по этим строкам считается
            // предел, и без них его можно было бы обойти, отправляя себе.
            _db.SummaryRequests.Add(new SummaryRequest
            {
                BoardId = board.Id,
                Email = address,
                AskedBy = ownerKey,
                AskedName = "Себе",
                Status = SummaryRequest.StatusSent,
                CreatedAt = DateTime.UtcNow,
                ResolvedAt = DateTime.UtcNow,
            });
        }
        else
        {
            request.Status = SummaryRequest.StatusSent;
            request.ResolvedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(cancellationToken);
        return SummaryOutcome.Ok;
    }

    /// <summary>
    /// Адрес в пригодном для отправки виде — или ничего.
    ///
    /// Проверка нарочно грубая: единственная настоящая проверка адреса —
    /// письмо, которое до него дошло. Здесь отсекается явный мусор, чтобы
    /// он не доехал до SMTP и не вернулся оттуда исключением.
    /// </summary>
    private static string? Normalize(string? email)
    {
        var value = (email ?? string.Empty).Trim();

        if (value.Length == 0 || value.Length > SummaryRequest.MaxEmailLength) return null;
        if (value.Any(char.IsWhiteSpace)) return null;

        var at = value.IndexOf('@');
        if (at <= 0 || at != value.LastIndexOf('@')) return null;

        var domain = value[(at + 1)..];
        return domain.Length >= 3 && domain.Contains('.') && !domain.StartsWith('.') && !domain.EndsWith('.')
            ? value
            : null;
    }
}
