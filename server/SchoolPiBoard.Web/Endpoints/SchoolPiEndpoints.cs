using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using SchoolPiBoard.Web.Configuration;
using SchoolPiBoard.Web.Services;

namespace SchoolPiBoard.Web.Endpoints;

public sealed record SchoolPiStartRequest(string? Mode);
public sealed record SchoolPiTicketRequest(string? Ticket, string? Password);

/// <summary>Бонус в том виде, в каком его показывает браузер.</summary>
public sealed record SchoolBonusDto(
    string Kind, string PlanName, int Days, DateTime Until, DateTime? ResumesAt, string? PausedPlan);

/// <summary>
/// Вход через «Школу π» (OAuth 2.0, код авторизации).
///
/// Путь браузера: кнопка → <c>POST /start</c> (кладёт служебную куку с
/// меткой и отдаёт адрес школы) → страница входа школы → возврат на
/// <c>GET /callback</c> → переадресация на страницу доски
/// <c>/auth/schoolpi</c>, которая забирает итог из части адреса после
/// «#». Эта часть не уходит на сервер и не оседает в логах nginx — токен
/// входа через неё передавать можно.
/// </summary>
public static class SchoolPiEndpoints
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static void MapSchoolPiEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/auth/schoolpi").RequireRateLimiting(AuthEndpoints.RateLimit);

        group.MapPost("/start", (
            [FromBody] SchoolPiStartRequest request,
            HttpContext http,
            ClaimsPrincipal principal,
            SchoolPiAuthService school,
            AppOptions options) =>
        {
            if (!school.IsConfigured)
                return Results.Json(new { message = "Вход через Школу π пока не настроен." }, statusCode: 503);

            var mode = request.Mode == SchoolPiAuthService.ModeLink
                ? SchoolPiAuthService.ModeLink
                : SchoolPiAuthService.ModeLogin;

            long? userId = null;

            if (mode == SchoolPiAuthService.ModeLink)
            {
                // Привязывают только к той учётной записи, в которую вошли.
                if (!long.TryParse(principal.FindFirstValue("sub"), out var id))
                    return Results.Json(new { message = "Войдите на доску, чтобы привязать аккаунт." }, statusCode: 401);

                userId = id;
            }

            var (url, nonce) = school.Begin(mode, userId);

            http.Response.Cookies.Append(SchoolPiAuthService.NonceCookie, nonce, new CookieOptions
            {
                HttpOnly = true,
                Secure = options.PublicUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase),
                // Lax: кука должна прийти с возвратом из школы — это
                // переход верхнего уровня с другого сайта.
                SameSite = SameSiteMode.Lax,
                Path = "/api/auth/schoolpi",
                MaxAge = SchoolPiAuthService.StateLifetime
            });

            return Results.Ok(new { url });
        });

        group.MapGet("/callback", async (
            HttpContext http,
            SchoolPiAuthService school,
            AccountService accounts,
            AppOptions options,
            CancellationToken ct) =>
        {
            var query = http.Request.Query;
            var page = $"{options.PublicUrl}/auth/schoolpi";

            IResult Back(params (string Key, string? Value)[] values)
            {
                var hash = string.Join("&", values
                    .Where(x => x.Value is not null)
                    .Select(x => $"{x.Key}={Uri.EscapeDataString(x.Value!)}"));

                return Results.Redirect($"{page}#{hash}");
            }

            IResult Fail(string error, string message) => Back(("error", error), ("message", message));

            var cookie = http.Request.Cookies[SchoolPiAuthService.NonceCookie];
            http.Response.Cookies.Delete(SchoolPiAuthService.NonceCookie, new CookieOptions { Path = "/api/auth/schoolpi" });

            if (!school.IsConfigured)
                return Fail("not_configured", "Вход через Школу π пока не настроен.");

            // Человек нажал «Отмена» на стороне школы.
            if (!string.IsNullOrEmpty(query["error"]))
                return Fail("cancelled", "Вход через Школу π отменён.");

            var state = school.ReadState(query["state"], cookie);
            if (state is null)
                return Fail("expired", "Вход устарел или начат в другом браузере. Попробуйте ещё раз.");

            var code = query["code"].ToString();
            if (string.IsNullOrEmpty(code))
                return Fail("failed", "Школа π не вернула код входа. Попробуйте ещё раз.");

            var profile = await school.FetchProfileAsync(code, ct);
            if (profile is null)
                return Fail("failed", "Не удалось получить данные из Школы π. Попробуйте ещё раз чуть позже.");

            var result = state.Mode == SchoolPiAuthService.ModeLink && state.UserId is { } userId
                ? await school.LinkAsync(userId, profile, ct)
                : await school.SignInAsync(profile, ct);

            return result.Outcome switch
            {
                SchoolPiOutcome.SignedIn when result.User is not null => Back(
                    ("result", "signed_in"),
                    ("token", accounts.CreateAuthToken(result.User)),
                    ("bonus", BonusJson(result.Bonus, options))),

                SchoolPiOutcome.Linked => Back(
                    ("result", "linked"),
                    ("bonus", BonusJson(result.Bonus, options))),

                SchoolPiOutcome.NeedsConfirmation when result.User is not null => Back(
                    ("result", "confirm"),
                    ("ticket", result.Ticket),
                    ("email", result.User.Email)),

                _ => Fail(result.Error ?? "failed", result.Message ?? "Не получилось войти через Школу π.")
            };
        });

        // Склейка с уже заведённой учётной записью — паролем от доски.
        group.MapPost("/confirm-password", async (
            [FromBody] SchoolPiTicketRequest request,
            SchoolPiAuthService school, AccountService accounts, AppOptions options, CancellationToken ct) =>
            SignedIn(await school.ConfirmByPasswordAsync(request.Ticket, request.Password, ct), accounts, options));

        // …или письмом на её почту.
        group.MapPost("/send-confirmation", async (
            [FromBody] SchoolPiTicketRequest request,
            SchoolPiAuthService school, CancellationToken ct) =>
        {
            var result = await school.SendConfirmationAsync(request.Ticket, ct);

            return result.Outcome == SchoolPiOutcome.Failed
                ? Results.BadRequest(new { code = result.Error, message = result.Message })
                : Results.Ok(new { message = "Письмо отправлено. Откройте ссылку из него в этом браузере." });
        });

        group.MapPost("/confirm-mail", async (
            [FromBody] SchoolPiTicketRequest request,
            SchoolPiAuthService school, AccountService accounts, AppOptions options, CancellationToken ct) =>
            SignedIn(await school.ConfirmByMailAsync(request.Ticket, ct), accounts, options));
    }

    private static IResult SignedIn(SchoolPiResult result, AccountService accounts, AppOptions options)
    {
        if (result.Outcome == SchoolPiOutcome.SignedIn && result.User is not null)
        {
            return Results.Ok(new
            {
                token = accounts.CreateAuthToken(result.User),
                user = AuthEndpoints.ToDto(result.User),
                bonus = ToDto(result.Bonus, options)
            });
        }

        var status = result.Error == "bad_password" ? 401 : 400;
        return Results.Json(new { code = result.Error, message = result.Message }, statusCode: status);
    }

    private static SchoolBonusDto? ToDto(SchoolBonus? bonus, AppOptions options)
        => bonus is null
            ? null
            : new SchoolBonusDto(
                bonus.Kind, bonus.PlanName, options.SchoolPi.BonusDays, bonus.Until, bonus.ResumesAt, bonus.PausedPlan);

    private static string? BonusJson(SchoolBonus? bonus, AppOptions options)
        => ToDto(bonus, options) is { } dto ? JsonSerializer.Serialize(dto, Json) : null;
}
