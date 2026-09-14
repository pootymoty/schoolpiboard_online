using SchoolPiBoard.Web.Configuration;

namespace SchoolPiBoard.Web.Endpoints;

/// <summary>
/// Согласие на куки браузера.
///
/// Сайт сегодня не ставит ни одной куки: вход хранится в localStorage, а
/// не в сессионной куке. Эта — первая и единственная, и хранит она только
/// сам выбор из баннера, ничего больше. Категорий «необходимые» и
/// «аналитика» здесь нет — заводить их ради симметрии с другим сайтом,
/// где они есть не просто так, значило бы придумывать несуществующее
/// разделение.
///
/// Кука HttpOnly: страница не может прочитать и подменить её через
/// document.cookie, значение отдаёт только сервер. Кнопки баннера —
/// обычная форма с обычной отправкой (адрес ниже отвечает редиректом,
/// а не JSON), поэтому согласие сохраняется, даже если скрипт
/// приложения на странице ещё не выполнился.
/// </summary>
public static class CookieConsentEndpoints
{
    public const string CookieName = "cookie_consent";
    public const string ValueAll = "all";
    public const string ValueRejected = "rejected";

    private static readonly string[] Values = { ValueAll, ValueRejected };

    // 182 дня — согласие переспрашивается раз в полгода, как на школе-пи.
    private static readonly TimeSpan MaxAge = TimeSpan.FromDays(182);

    public static void MapCookieConsentEndpoints(this WebApplication app)
    {
        // Читает страница при загрузке, чтобы решить, показывать ли баннер.
        // Значение куки не отдаётся напрямую — только то, что из него разрешено:
        // одно из двух состояний или «выбора ещё не было».
        app.MapGet("/api/cookie-consent", (HttpRequest http) =>
        {
            var value = http.Cookies[CookieName];
            return Results.Ok(new { consent = Array.IndexOf(Values, value) >= 0 ? value : null });
        });

        app.MapPost("/api/cookie-consent", async (HttpRequest http, AppOptions options) =>
        {
            var form = await http.ReadFormAsync();
            var choice = form["choice"].ToString();

            if (Array.IndexOf(Values, choice) < 0)
                return Results.BadRequest(new { message = "Неизвестное значение согласия." });

            http.HttpContext.Response.Cookies.Append(CookieName, choice, new CookieOptions
            {
                HttpOnly = true,
                SameSite = SameSiteMode.Lax,
                // На своём сервере адрес всегда https — секьюрность куки
                // отключается только у локального http для разработки.
                Secure = !options.PublicUrl.StartsWith("http://", StringComparison.Ordinal),
                MaxAge = MaxAge,
                Path = "/"
            });

            // На свой путь — пожалуйста; на чужой домен или адрес с протоколом —
            // нет, иначе форма стала бы открытой переадресацией.
            var next = form["next"].ToString();
            var target = !string.IsNullOrWhiteSpace(next) && next.StartsWith('/') && !next.StartsWith("//")
                ? next
                : "/";

            return Results.Redirect(target);
        });
    }
}
