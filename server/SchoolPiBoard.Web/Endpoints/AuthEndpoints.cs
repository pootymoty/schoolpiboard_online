using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Data;
using SchoolPiBoard.Web.Data.Entities;
using SchoolPiBoard.Web.Services;

namespace SchoolPiBoard.Web.Endpoints;

public sealed record RegisterRequest(string? DisplayName, string? Email, string? Password, string? PasswordConfirm);
public sealed record LoginRequest(string? Email, string? Password);
public sealed record TokenRequest(string? Token);
public sealed record EmailRequest(string? Email);
public sealed record ResetPasswordRequest(string? Token, string? Password, string? PasswordConfirm);
public sealed record UpdateProfileRequest(string? DisplayName);
public sealed record DeleteAccountRequest(string? Password);

public sealed record UserDto(long Id, string Email, string DisplayName);

public static class AuthEndpoints
{
    public const string RateLimit = "auth";

    public static void MapAuthEndpoints(this WebApplication app)
    {
        var auth = app.MapGroup("/api/auth").RequireRateLimiting(RateLimit);

        auth.MapPost("/register", async (
            [FromBody] RegisterRequest request,
            AccountService accounts,
            CancellationToken cancellationToken) =>
        {
            var result = await accounts.RegisterAsync(
                request.DisplayName, request.Email, request.Password, request.PasswordConfirm, cancellationToken);

            return result.Outcome switch
            {
                AccountOutcome.Ok => Results.Ok(new
                {
                    status = "confirm_sent",
                    message = "Мы отправили письмо со ссылкой. Перейдите по ней, чтобы завершить регистрацию."
                }),
                AccountOutcome.EmailTaken => Results.Conflict(new { message = result.Message }),
                AccountOutcome.MailFailed => Results.Ok(new { status = "mail_failed", message = result.Message }),
                _ => Results.BadRequest(new { message = result.Message })
            };
        });

        auth.MapPost("/confirm", async (
            [FromBody] TokenRequest request,
            AccountService accounts,
            CancellationToken cancellationToken) =>
        {
            var result = await accounts.ConfirmEmailAsync(request.Token, cancellationToken);

            return result.Outcome == AccountOutcome.Ok && result.User is not null
                ? Results.Ok(new { token = accounts.CreateAuthToken(result.User), user = ToDto(result.User) })
                : Results.BadRequest(new { message = result.Message });
        });

        auth.MapPost("/login", async (
            [FromBody] LoginRequest request,
            AccountService accounts,
            CancellationToken cancellationToken) =>
        {
            var result = await accounts.LoginAsync(request.Email, request.Password, cancellationToken);

            return result.Outcome switch
            {
                AccountOutcome.Ok when result.User is not null =>
                    Results.Ok(new { token = accounts.CreateAuthToken(result.User), user = ToDto(result.User) }),
                AccountOutcome.EmailNotConfirmed =>
                    Results.Json(new { code = "email_not_confirmed", message = result.Message }, statusCode: 403),
                _ => Results.Json(new { message = result.Message }, statusCode: 401)
            };
        });

        // Обе формы отвечают одинаково независимо от того, есть такой адрес
        // или нет: иначе по ответу можно перебирать, кто зарегистрирован.
        auth.MapPost("/resend-confirmation", async (
            [FromBody] EmailRequest request,
            AccountService accounts,
            CancellationToken cancellationToken) =>
        {
            await accounts.ResendConfirmationAsync(request.Email, cancellationToken);
            return Results.Ok(new { message = "Если такая почта зарегистрирована, письмо отправлено." });
        });

        auth.MapPost("/forgot-password", async (
            [FromBody] EmailRequest request,
            AccountService accounts,
            CancellationToken cancellationToken) =>
        {
            await accounts.RequestPasswordResetAsync(request.Email, cancellationToken);
            return Results.Ok(new { message = "Если такая почта зарегистрирована, письмо отправлено." });
        });

        auth.MapPost("/reset-password", async (
            [FromBody] ResetPasswordRequest request,
            AccountService accounts,
            CancellationToken cancellationToken) =>
        {
            var result = await accounts.ResetPasswordAsync(
                request.Token, request.Password, request.PasswordConfirm, cancellationToken);

            return result.Outcome == AccountOutcome.Ok && result.User is not null
                ? Results.Ok(new { token = accounts.CreateAuthToken(result.User), user = ToDto(result.User) })
                : Results.BadRequest(new { message = result.Message });
        });

        app.MapGet("/api/auth/me", async (
            ClaimsPrincipal principal,
            AppDbContext db,
            CancellationToken cancellationToken) =>
        {
            var user = await CurrentUser(principal, db, cancellationToken);
            return user is null ? Results.Unauthorized() : Results.Ok(ToDto(user));
        }).RequireAuthorization();

        app.MapPatch("/api/auth/me", async (
            [FromBody] UpdateProfileRequest request,
            ClaimsPrincipal principal, AppDbContext db, AccountService accounts, CancellationToken ct) =>
        {
            var user = await CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await accounts.ChangeDisplayNameAsync(user.Id, request.DisplayName, ct);
            return result.Outcome == AccountOutcome.Ok && result.User is not null
                ? Results.Ok(ToDto(result.User))
                : Results.BadRequest(new { message = result.Message });
        }).RequireAuthorization();

        app.MapDelete("/api/auth/me", async (
            [FromBody] DeleteAccountRequest request,
            ClaimsPrincipal principal, AppDbContext db, AccountService accounts, CancellationToken ct) =>
        {
            var user = await CurrentUser(principal, db, ct);
            if (user is null) return Results.Unauthorized();

            var result = await accounts.DeleteAccountAsync(user.Id, request.Password, ct);

            return result.Outcome switch
            {
                AccountOutcome.Ok => Results.NoContent(),
                AccountOutcome.InvalidCredentials => Results.Json(new { message = result.Message }, statusCode: 401),
                _ => Results.BadRequest(new { message = result.Message })
            };
        }).RequireAuthorization();
    }

    public static UserDto ToDto(User user) => new(user.Id, user.Email, user.DisplayName);

    public static async Task<User?> CurrentUser(ClaimsPrincipal principal, AppDbContext db, CancellationToken cancellationToken)
    {
        var raw = principal.FindFirstValue("sub");

        return long.TryParse(raw, out var id)
            // Удалённый аккаунт не должен проходить по ещё живому токену:
            // без этого условия десятичасовой JWT продолжал бы работать
            // после того, как человек нажал «Удалить».
            ? await db.Users.FirstOrDefaultAsync(x => x.Id == id && x.DeletedAt == null, cancellationToken)
            : null;
    }
}
