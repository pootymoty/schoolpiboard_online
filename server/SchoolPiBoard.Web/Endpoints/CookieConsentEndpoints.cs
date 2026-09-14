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

        app.MapPost("/api/cookie-consent", async (HttpRequest http, AppOptions options, ILoggerFactory loggers) =>
        {
            // На свой путь — пожалуйста; на чужой домен или адрес с протоколом —
            // нет, иначе форма стала бы открытой переадресацией. Адрес всегда
            // собирается абсолютным, от PublicUrl: относительный Location
            // формально допустим (RFC 7231), но не все прокси и старые браузеры
            // его понимают правильно, а от абсолютного зависеть незачем.
            string BuildTarget(string? next)
                => options.PublicUrl + (!string.IsNullOrWhiteSpace(next)
                    && next.StartsWith('/') && !next.StartsWith("//") ? next : "/");

            // Здесь не JSON, а обычная форма браузера: упасть с голой
            // ошибкой 400/500 значило бы показать её вместо страницы,
            // с которой пришли, — при любом сбое лучше вернуть человека
            // туда же, чем оставить его смотреть на пустой ответ сервера.
            try
            {
                var form = await http.ReadFormAsync();
                var choice = form["choice"].ToString();
                var target = BuildTarget(form["next"].ToString());

                if (Array.IndexOf(Values, choice) < 0)
                    return Results.Redirect(target);

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

                return Results.Redirect(target);
            }
            catch (Exception exception)
            {
                loggers.CreateLogger("CookieConsent").LogError(exception, "Согласие на куки не сохранилось.");
                return Results.Redirect(options.PublicUrl + "/");
            }
        });
    }
}
