var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server.mjs";
import { createContext, useState, useCallback, useEffect, useMemo, useContext, useRef, useLayoutEffect } from "react";
import { useLocation, Link, useNavigate, useSearchParams, useParams, Routes, Route, Navigate } from "react-router-dom";
import { HubConnectionBuilder, LogLevel, HubConnectionState } from "@microsoft/signalr";
const API_URL = "http://localhost:5000";
const TOKEN_KEY = "schoolpiboard.token";
function readToken() {
  return localStorage.getItem(TOKEN_KEY);
}
function writeToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}
class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    __publicField(this, "status");
    __publicField(this, "code");
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}
async function api(path, options = {}) {
  const token = readToken();
  const headers = {};
  if (options.body !== void 0) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (options.guestToken) {
    headers["X-Guest-Token"] = options.guestToken;
  }
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === void 0 ? void 0 : JSON.stringify(options.body),
      signal: options.signal
    });
  } catch {
    throw new ApiError(0, "network", "Сервер не отвечает. Проверьте подключение.");
  }
  if (response.status === 204) {
    return void 0;
  }
  const text = await response.text();
  const payload = text ? safeParse(text) : null;
  if (!response.ok) {
    const details = payload ?? {};
    throw new ApiError(
      response.status,
      details.error ?? "error",
      details.message ?? defaultMessage(response.status)
    );
  }
  return payload;
}
function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
function defaultMessage(status) {
  if (status === 401) return "Нужно войти заново.";
  if (status === 403) return "Недостаточно прав.";
  if (status === 404) return "Не найдено.";
  if (status === 429) return "Слишком много попыток. Подождите минуту.";
  return "Что-то пошло не так. Попробуйте ещё раз.";
}
const AuthContext = createContext(null);
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading2, setLoading] = useState(() => typeof window !== "undefined");
  const refresh = useCallback(async () => {
    setUser(await api("/auth/me"));
  }, []);
  useEffect(() => {
    if (!readToken()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    refresh().catch(() => {
      if (!cancelled) writeToken(null);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);
  const accept = useCallback((result) => {
    writeToken(result.token);
    setUser(result.user);
  }, []);
  const login = useCallback(
    async (email, password) => {
      accept(await api("/auth/login", { method: "POST", body: { email, password } }));
    },
    [accept]
  );
  const logout = useCallback(() => {
    writeToken(null);
    setUser(null);
  }, []);
  const value = useMemo(
    () => ({ user, loading: loading2, login, logout, accept, refresh }),
    [user, loading2, login, logout, accept, refresh]
  );
  return /* @__PURE__ */ jsx(AuthContext.Provider, { value, children });
}
function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth вызван вне AuthProvider");
  }
  return context;
}
const SITE_URL = "https://board.school-pi.online";
const PUBLIC_PAGES = {
  "/": {
    title: "Онлайн-доска для репетитора — SchoolPiBoard",
    description: "Доска для занятий в браузере: пишите пером, разбирайте задачи, вставляйте страницы учебника. Ученик заходит по ссылке без регистрации. Бесплатный тариф без срока."
  },
  "/features": {
    title: "Возможности доски — SchoolPiBoard",
    description: "Перо с нажимом, частичный ластик, фигуры и надписи, страницы PDF на доску с обрезкой, роли участников, таймер, сохранение доски картинкой."
  },
  "/pricing": {
    title: "Тарифы и цены — SchoolPiBoard",
    description: "Бесплатный тариф без срока и платные от 190 ₽ в месяц. Платит только преподаватель: ученики заходят по ссылке и не платят ничего."
  },
  "/faq": {
    title: "Вопросы и ответы — SchoolPiBoard",
    description: "Нужна ли ученику регистрация, сколько стоит, что будет после окончания подписки, как вставить страницу учебника и сохранится ли доска после занятия."
  },
  "/about": {
    title: "О сервисе и контакты — SchoolPiBoard",
    description: "Кто делает SchoolPiBoard, зачем и как с нами связаться."
  },
  "/login": {
    title: "Вход — SchoolPiBoard",
    description: "Вход в личный кабинет SchoolPiBoard."
  },
  "/register": {
    title: "Регистрация — SchoolPiBoard",
    description: "Создайте учётную запись и первую доску. Первые семь дней — тариф «Стандартный»."
  },
  "/legal/terms": {
    title: "Пользовательское соглашение — SchoolPiBoard",
    description: "Условия, на которых можно пользоваться онлайн-доской: учётная запись, доски и ссылки, тарифы, правила поведения."
  },
  "/legal/offer": {
    title: "Оферта на подписку — SchoolPiBoard",
    description: "Публичная оферта о предоставлении права использования онлайн-доски на условиях подписки: предмет, сроки, оплата, автопродление, возврат."
  },
  "/legal/privacy": {
    title: "Обработка персональных данных — SchoolPiBoard",
    description: "Какие данные сервис обрабатывает, зачем, сколько хранит и как ими управлять."
  }
};
const DEFAULT_META = {
  title: "SchoolPiBoard — доска для занятий",
  description: "Онлайн-доска для занятий: рисуйте и объясняйте вместе, на одном холсте."
};
function metaFor(path) {
  return PUBLIC_PAGES[path] ?? DEFAULT_META;
}
const COMPANY = {
  /** Как продавец называется в документах. */
  name: "Урвачев Роман Сергеевич",
  /** Правовой статус: самозанятый (НПД), ИП, организация. */
  status: "самозанятый (налог на профессиональный доход)",
  inn: "775105390760",
  /** Почта для покупателей: возвраты, вопросы, отказ от подписки. */
  email: "info@school-pi.online",
  site: "board.school-pi.online",
  /** Сколько ждать ответа на обращение. Обещание, которое придётся держать. */
  replyDays: 3,
  /** Срок возврата денег по заявлению, в рабочих днях. */
  refundDays: 10
};
const HAS_COMPANY_DETAILS = !COMPANY.name.startsWith("ЗАГЛУШКА");
function Svg$1({ size = 18, title, children }) {
  return /* @__PURE__ */ jsxs(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": title ? void 0 : true,
      role: title ? "img" : void 0,
      children: [
        title ? /* @__PURE__ */ jsx("title", { children: title }) : null,
        children
      ]
    }
  );
}
const IconOwner = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsx("path", { d: "M3 7l4 4 5-7 5 7 4-4v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" }) });
const IconEditor = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("path", { d: "M12 20h9" }),
  /* @__PURE__ */ jsx("path", { d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" })
] }) });
const IconViewer = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }),
  /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "3" })
] }) });
const IconGuest = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("path", { d: "M3 10h18" }),
  /* @__PURE__ */ jsx("path", { d: "M6 10V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3" }),
  /* @__PURE__ */ jsx("circle", { cx: "7.5", cy: "15.5", r: "2.5" }),
  /* @__PURE__ */ jsx("circle", { cx: "16.5", cy: "15.5", r: "2.5" }),
  /* @__PURE__ */ jsx("path", { d: "M10 15.5h4" })
] }) });
const IconLockClosed = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("rect", { x: "4", y: "11", width: "16", height: "10", rx: "2" }),
  /* @__PURE__ */ jsx("path", { d: "M8 11V7a4 4 0 0 1 8 0v4" })
] }) });
const IconLockOpen = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("rect", { x: "4", y: "11", width: "16", height: "10", rx: "2" }),
  /* @__PURE__ */ jsx("path", { d: "M8 11V7a4 4 0 0 1 7.5-2" })
] }) });
const IconLink = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("path", { d: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" }),
  /* @__PURE__ */ jsx("path", { d: "M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" })
] }) });
const IconPeople = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("path", { d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" }),
  /* @__PURE__ */ jsx("circle", { cx: "9", cy: "7", r: "4" }),
  /* @__PURE__ */ jsx("path", { d: "M23 21v-2a4 4 0 0 0-3-3.87" })
] }) });
const IconHelp = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "9" }),
  /* @__PURE__ */ jsx("path", { d: "M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.7.2-1.2.9-1.2 1.6v.5" }),
  /* @__PURE__ */ jsx("path", { d: "M12 17h.01" })
] }) });
const IconTimer = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("circle", { cx: "12", cy: "13", r: "8" }),
  /* @__PURE__ */ jsx("path", { d: "M12 9v4l3 2" }),
  /* @__PURE__ */ jsx("path", { d: "M9 2h6" })
] }) });
const IconDownload = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("path", { d: "M12 3v12" }),
  /* @__PURE__ */ jsx("path", { d: "M7 11l5 5 5-5" }),
  /* @__PURE__ */ jsx("path", { d: "M4 21h16" })
] }) });
const IconGrid = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }),
  /* @__PURE__ */ jsx("path", { d: "M3 9h18M3 15h18M9 3v18M15 3v18" })
] }) });
const IconCopy = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("rect", { x: "9", y: "9", width: "11", height: "11", rx: "2" }),
  /* @__PURE__ */ jsx("path", { d: "M5 15V6a1 1 0 0 1 1-1h9" })
] }) });
const IconToFront = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("rect", { x: "8", y: "3", width: "13", height: "13", rx: "2" }),
  /* @__PURE__ */ jsx("path", { d: "M16 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h3" })
] }) });
const IconToBack = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("rect", { x: "3", y: "8", width: "13", height: "13", rx: "2" }),
  /* @__PURE__ */ jsx("path", { d: "M8 8V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-3" })
] }) });
const IconMarker = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("path", { d: "M4 20h6l9.5-9.5a2.5 2.5 0 0 0-3.5-3.5L6 16.5z" }),
  /* @__PURE__ */ jsx("path", { d: "M3 20h4" })
] }) });
const IconShapes = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("rect", { x: "3", y: "10", width: "11", height: "11", rx: "1" }),
  /* @__PURE__ */ jsx("circle", { cx: "16", cy: "7", r: "4" })
] }) });
const IconText = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("path", { d: "M5 6V4h14v2" }),
  /* @__PURE__ */ jsx("path", { d: "M12 4v16" }),
  /* @__PURE__ */ jsx("path", { d: "M9 20h6" })
] }) });
const IconCursor = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsx("path", { d: "M5 3l14 8-6 1.5L10 19z" }) });
const IconUndo = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("path", { d: "M3 8h11a6 6 0 0 1 0 12H8" }),
  /* @__PURE__ */ jsx("path", { d: "M7 4L3 8l4 4" })
] }) });
const IconRedo = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("path", { d: "M21 8H10a6 6 0 0 0 0 12h6" }),
  /* @__PURE__ */ jsx("path", { d: "M17 4l4 4-4 4" })
] }) });
const IconHand = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsx("path", { d: "M8 13V5.5a1.5 1.5 0 0 1 3 0V12m0-1.5a1.5 1.5 0 0 1 3 0V12m0-1a1.5 1.5 0 0 1 3 0v1m0 0a1.5 1.5 0 0 1 3 0v3a6 6 0 0 1-6 6h-2a6 6 0 0 1-5.2-3L5 15.5a1.5 1.5 0 0 1 2.6-1.5l.9 1.5" }) });
const IconEraser = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("path", { d: "M4 16.5 12.5 8a2.1 2.1 0 0 1 3 0l4 4a2.1 2.1 0 0 1 0 3L15 20H8z" }),
  /* @__PURE__ */ jsx("path", { d: "M9 13.5 15.5 20" }),
  /* @__PURE__ */ jsx("path", { d: "M4 20h16" })
] }) });
const IconTrash = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("path", { d: "M4 7h16" }),
  /* @__PURE__ */ jsx("path", { d: "M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" }),
  /* @__PURE__ */ jsx("path", { d: "M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" })
] }) });
const IconMore = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("circle", { cx: "12", cy: "5", r: "1" }),
  /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "1" }),
  /* @__PURE__ */ jsx("circle", { cx: "12", cy: "19", r: "1" })
] }) });
const IconChevronLeft = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsx("path", { d: "M15 18l-6-6 6-6" }) });
const IconChevronRight = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsx("path", { d: "M9 18l6-6-6-6" }) });
const IconCheck = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsx("path", { d: "M20 6L9 17l-5-5" }) });
const IconClose = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("path", { d: "M18 6L6 18" }),
  /* @__PURE__ */ jsx("path", { d: "M6 6l12 12" })
] }) });
const IconImage = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("rect", { x: "3", y: "4", width: "18", height: "16", rx: "2" }),
  /* @__PURE__ */ jsx("circle", { cx: "8.5", cy: "9.5", r: "1.5" }),
  /* @__PURE__ */ jsx("path", { d: "M21 16l-5-5-6 6-3-3-4 4" })
] }) });
const IconMenu = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("path", { d: "M3 6h18" }),
  /* @__PURE__ */ jsx("path", { d: "M3 12h18" }),
  /* @__PURE__ */ jsx("path", { d: "M3 18h18" })
] }) });
const IconTable = (props) => /* @__PURE__ */ jsx(Svg$1, { ...props, children: /* @__PURE__ */ jsxs("g", { children: [
  /* @__PURE__ */ jsx("rect", { x: "3", y: "4", width: "18", height: "16", rx: "2" }),
  /* @__PURE__ */ jsx("path", { d: "M3 10h18" }),
  /* @__PURE__ */ jsx("path", { d: "M3 15h18" }),
  /* @__PURE__ */ jsx("path", { d: "M9 4v16" }),
  /* @__PURE__ */ jsx("path", { d: "M15 4v16" })
] }) });
function Menu({ label, children, trigger, triggerClassName = "btn-tool" }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event) => {
      if (box.current && !box.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return /* @__PURE__ */ jsxs("div", { className: "menu", ref: box, children: [
    /* @__PURE__ */ jsx(
      "button",
      {
        className: triggerClassName,
        type: "button",
        onClick: () => setOpen((current) => !current),
        "aria-label": label,
        "aria-expanded": open,
        children: trigger ?? /* @__PURE__ */ jsx(IconMore, {})
      }
    ),
    open ? (
      // Щелчок по любому пункту закрывает меню: иначе после
      // «Переименовать» оно осталось бы поверх открывшегося окна.
      /* @__PURE__ */ jsx("div", { className: "menu__list", role: "menu", onClick: () => setOpen(false), children })
    ) : null
  ] });
}
function useTheme() {
  const [theme, setTheme] = useState(() => typeof document === "undefined" ? "light" : document.documentElement.getAttribute("data-theme") || "light");
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
    }
    setTheme(next);
  };
  return { theme, toggle };
}
function ThemeSwitch({ theme, toggle }) {
  return /* @__PURE__ */ jsxs("label", { className: "theme-switch", title: theme === "dark" ? "Светлая тема" : "Тёмная тема", children: [
    /* @__PURE__ */ jsx(
      "input",
      {
        type: "checkbox",
        checked: theme === "dark",
        onChange: toggle,
        "aria-label": theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"
      }
    ),
    /* @__PURE__ */ jsx("span", { className: "theme-switch__track", children: /* @__PURE__ */ jsx("span", { className: "theme-switch__thumb" }) })
  ] });
}
function useScrollLock(locked) {
  useEffect(() => {
    if (!locked) return;
    document.body.classList.add("no-scroll");
    return () => document.body.classList.remove("no-scroll");
  }, [locked]);
}
function Header() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cabinetOpen, setCabinetOpen] = useState(false);
  useScrollLock(mobileOpen);
  useEffect(() => {
    setMobileOpen(false);
    setCabinetOpen(false);
  }, [location.pathname]);
  const closeMobile = () => setMobileOpen(false);
  return /* @__PURE__ */ jsxs("header", { className: "header", children: [
    /* @__PURE__ */ jsx(Link, { className: "header__brand", to: user ? "/boards" : "/", children: "SchoolPiBoard" }),
    /* @__PURE__ */ jsx("span", { className: "header__spacer" }),
    /* @__PURE__ */ jsx("nav", { className: "desktop-menu", "aria-label": "Разделы сайта", children: user ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Link, { to: "/", children: "Главная" }),
      /* @__PURE__ */ jsx(Link, { to: "/features", children: "Возможности" }),
      /* @__PURE__ */ jsx(Link, { to: "/pricing", children: "Тарифы" }),
      /* @__PURE__ */ jsx(Link, { to: "/boards", children: "Мои доски" }),
      /* @__PURE__ */ jsxs(
        Menu,
        {
          label: "Личный кабинет",
          trigger: "Личный кабинет",
          triggerClassName: "btn-tool btn-tool--wide",
          children: [
            /* @__PURE__ */ jsx(Link, { className: "btn btn-quiet menu__item", to: "/plan", children: "Мой тариф" }),
            /* @__PURE__ */ jsx(Link, { className: "btn btn-quiet menu__item", to: "/profile", children: "Настройки" }),
            /* @__PURE__ */ jsx("button", { className: "btn-quiet menu__item menu__item--danger", type: "button", onClick: logout, children: "Выйти" })
          ]
        }
      )
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Link, { to: "/", children: "Главная" }),
      /* @__PURE__ */ jsx(Link, { to: "/features", children: "Возможности" }),
      /* @__PURE__ */ jsx(Link, { to: "/pricing", children: "Тарифы" }),
      /* @__PURE__ */ jsx(Link, { to: "/faq", children: "Вопросы" }),
      /* @__PURE__ */ jsx(Link, { to: "/login", children: "Войти" })
    ] }) }),
    /* @__PURE__ */ jsx("span", { className: "theme-switch--header", children: /* @__PURE__ */ jsx(ThemeSwitch, { theme, toggle }) }),
    /* @__PURE__ */ jsx(
      "button",
      {
        className: "hamburger btn-tool",
        type: "button",
        onClick: () => setMobileOpen((current) => !current),
        "aria-expanded": mobileOpen,
        "aria-controls": "navbar",
        "aria-label": mobileOpen ? "Закрыть меню" : "Открыть меню",
        children: /* @__PURE__ */ jsx(IconMenu, {})
      }
    ),
    /* @__PURE__ */ jsx("div", { id: "navbar", className: mobileOpen ? "navbar navbar--show" : "navbar", children: /* @__PURE__ */ jsx("ul", { children: user ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(Link, { to: "/", onClick: closeMobile, children: "Главная" }) }),
      /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(Link, { to: "/features", onClick: closeMobile, children: "Возможности" }) }),
      /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(Link, { to: "/pricing", onClick: closeMobile, children: "Тарифы" }) }),
      /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(Link, { to: "/faq", onClick: closeMobile, children: "Вопросы" }) }),
      /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(Link, { to: "/about", onClick: closeMobile, children: "О нас" }) }),
      /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(Link, { to: "/boards", onClick: closeMobile, children: "Мои доски" }) }),
      /* @__PURE__ */ jsxs("li", { className: cabinetOpen ? "navbar-dropdown navbar-dropdown--active" : "navbar-dropdown", children: [
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "navbar-dropdown__toggle",
            onClick: () => setCabinetOpen((current) => !current),
            children: "Личный кабинет"
          }
        ),
        /* @__PURE__ */ jsxs("ul", { className: "navbar-submenu", children: [
          /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(Link, { to: "/plan", onClick: closeMobile, children: "Мой тариф" }) }),
          /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(Link, { to: "/profile", onClick: closeMobile, children: "Настройки" }) }),
          /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx("button", { className: "btn-quiet menu__item menu__item--danger", type: "button", onClick: () => {
            closeMobile();
            logout();
          }, children: "Выйти" }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("li", { className: "navbar-item--switch", children: [
        /* @__PURE__ */ jsx("span", { className: "navbar-item__label", children: "Тёмная тема" }),
        /* @__PURE__ */ jsx(ThemeSwitch, { theme, toggle })
      ] })
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(Link, { to: "/", onClick: closeMobile, children: "Главная" }) }),
      /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(Link, { to: "/features", onClick: closeMobile, children: "Возможности" }) }),
      /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(Link, { to: "/pricing", onClick: closeMobile, children: "Тарифы" }) }),
      /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(Link, { to: "/faq", onClick: closeMobile, children: "Вопросы" }) }),
      /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(Link, { to: "/about", onClick: closeMobile, children: "О нас" }) }),
      /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(Link, { to: "/login", onClick: closeMobile, children: "Войти" }) }),
      /* @__PURE__ */ jsxs("li", { className: "navbar-item--switch", children: [
        /* @__PURE__ */ jsx("span", { className: "navbar-item__label", children: "Тёмная тема" }),
        /* @__PURE__ */ jsx(ThemeSwitch, { theme, toggle })
      ] })
    ] }) }) })
  ] });
}
function Footer() {
  return /* @__PURE__ */ jsxs("footer", { className: "app__footer", children: [
    /* @__PURE__ */ jsxs("div", { className: "row", children: [
      /* @__PURE__ */ jsx(Link, { to: "/legal/terms", children: "Соглашение" }),
      /* @__PURE__ */ jsx(Link, { to: "/legal/privacy", children: "Персональные данные" }),
      /* @__PURE__ */ jsx(Link, { to: "/legal/offer", children: "Оферта" }),
      /* @__PURE__ */ jsx(Link, { to: "/about", children: "Контакты" })
    ] }),
    /* @__PURE__ */ jsx("p", { className: "small", style: { margin: 0 }, children: HAS_COMPANY_DETAILS ? `SchoolPiBoard · ${COMPANY.name}, ${COMPANY.status}, ИНН ${COMPANY.inn} · ${COMPANY.email}` : "SchoolPiBoard · board.school-pi.online · ЗАГЛУШКА: реквизиты продавца" })
  ] });
}
function Page({ children, narrow }) {
  return /* @__PURE__ */ jsxs("div", { className: "app", children: [
    /* @__PURE__ */ jsx(Header, {}),
    /* @__PURE__ */ jsx("main", { className: narrow ? "app__main app__main--narrow" : "app__main", children }),
    /* @__PURE__ */ jsx(Footer, {})
  ] });
}
function BoardShell({ children }) {
  return /* @__PURE__ */ jsxs("div", { className: "app app--board", children: [
    /* @__PURE__ */ jsx(Header, {}),
    /* @__PURE__ */ jsx("main", { className: "app__main app__main--board", children })
  ] });
}
function LandingPage() {
  const { user } = useAuth();
  return /* @__PURE__ */ jsxs(Page, { children: [
    /* @__PURE__ */ jsxs("section", { className: "card hero", children: [
      /* @__PURE__ */ jsx("h1", { children: "Онлайн-доска для репетитора" }),
      /* @__PURE__ */ jsx("p", { className: "reading hero__lead", children: "Объясняйте на доске, как на бумаге: пишите пером, разбирайте задачи, вставляйте страницы учебника. Ученик заходит по ссылке — без регистрации, установки и лишних вопросов." }),
      /* @__PURE__ */ jsx("div", { className: "row hero__actions", children: user ? /* @__PURE__ */ jsx(Link, { className: "btn btn-primary btn-lg", to: "/boards", children: "Мои доски" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Link, { className: "btn btn-primary btn-lg", to: "/register", children: "Начать бесплатно" }),
        /* @__PURE__ */ jsx(Link, { className: "btn btn-outline btn-lg", to: "/pricing", children: "Тарифы" })
      ] }) }),
      /* @__PURE__ */ jsx("p", { className: "text-muted small hero__note", children: "Бесплатный тариф без срока и без карты. Первые семь дней — «Стандартный», чтобы попробовать всё." })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "stack", children: [
      /* @__PURE__ */ jsxs("article", { className: "card", children: [
        /* @__PURE__ */ jsxs("h2", { className: "card-title", children: [
          /* @__PURE__ */ jsx(IconGuest, {}),
          " Ученику не нужна регистрация"
        ] }),
        /* @__PURE__ */ jsx("p", { children: "Вы отправляете ссылку, ученик открывает её и называет имя — чтобы вы видели, чей курсор на доске. Ни учётной записи, ни установки, ни оплаты: платит только преподаватель, и только за себя." })
      ] }),
      /* @__PURE__ */ jsxs("article", { className: "card", children: [
        /* @__PURE__ */ jsxs("h2", { className: "card-title", children: [
          /* @__PURE__ */ jsx(IconEditor, {}),
          " Перо, а не мышь"
        ] }),
        /* @__PURE__ */ jsx("p", { children: "Доска рассчитана на планшет с пером: линия слушается нажима, ладонь на экране следа не оставляет, а пальцем двигается сам холст. Три пера с разными настройками, маркер и ластик, который стирает задетое, а не весь штрих целиком." })
      ] }),
      /* @__PURE__ */ jsxs("article", { className: "card", children: [
        /* @__PURE__ */ jsxs("h2", { className: "card-title", children: [
          /* @__PURE__ */ jsx(IconImage, {}),
          " Учебник — прямо на доску"
        ] }),
        /* @__PURE__ */ jsx("p", { children: "Загрузите PDF, выберите нужные страницы и вставьте их на холст. Можно обрезать рамкой один пример и разобрать его крупно. Загруженное остаётся в вашей библиотеке: второй раз тот же учебник загружать не придётся." })
      ] }),
      /* @__PURE__ */ jsxs("article", { className: "card", children: [
        /* @__PURE__ */ jsxs("h2", { className: "card-title", children: [
          /* @__PURE__ */ jsx(IconPeople, {}),
          " Вы решаете, кто и что может"
        ] }),
        /* @__PURE__ */ jsx("p", { children: "Пришедшего по ссылке видно в списке ожидающих: впустите нужного и задайте роль — работать на доске или только смотреть. Ссылку можно перевыпустить, если она ушла не туда, а доску — закрыть для новых." })
      ] }),
      /* @__PURE__ */ jsxs("article", { className: "card", children: [
        /* @__PURE__ */ jsxs("h2", { className: "card-title", children: [
          /* @__PURE__ */ jsx(IconTimer, {}),
          " Мелочи, которые экономят занятие"
        ] }),
        /* @__PURE__ */ jsx("p", { children: "Таймер на самостоятельную работу, сохранение доски картинкой на память ученику, разлиновка в клетку и линейку, вставка из буфера обмена. Всё, что нарисовано, сохраняется само — доска не пропадёт, если закрыть вкладку." })
      ] }),
      /* @__PURE__ */ jsxs("article", { className: "card", children: [
        /* @__PURE__ */ jsxs("h2", { className: "card-title", children: [
          /* @__PURE__ */ jsx(IconViewer, {}),
          " Занятие не рвётся"
        ] }),
        /* @__PURE__ */ jsx("p", { children: "Связь пропала на минуту — нарисованное не потеряется: доска догонит пропущенное, когда сеть вернётся. До двадцати человек одновременно, если ведёте не одного, а группу." })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "card", children: [
      /* @__PURE__ */ jsx("h2", { className: "card-title", children: "Как начать" }),
      /* @__PURE__ */ jsxs("ol", { className: "reading", children: [
        /* @__PURE__ */ jsx("li", { children: "Зарегистрируйтесь и подтвердите почту — это одна минута." }),
        /* @__PURE__ */ jsx("li", { children: "Создайте доску: ссылка на неё появится сразу." }),
        /* @__PURE__ */ jsx("li", { children: "Отправьте ссылку ученику перед занятием." }),
        /* @__PURE__ */ jsx("li", { children: "Впустите его и работайте вместе." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "row", children: [
        user ? /* @__PURE__ */ jsx(Link, { className: "btn btn-primary", to: "/boards", children: "Перейти к доскам" }) : /* @__PURE__ */ jsx(Link, { className: "btn btn-primary", to: "/register", children: "Создать первую доску" }),
        /* @__PURE__ */ jsx(Link, { className: "btn btn-quiet", to: "/faq", children: "Частые вопросы" })
      ] })
    ] })
  ] });
}
function AboutPage() {
  return /* @__PURE__ */ jsxs(Page, { children: [
    /* @__PURE__ */ jsxs("article", { className: "card reading", children: [
      /* @__PURE__ */ jsx("h1", { children: "О сервисе" }),
      /* @__PURE__ */ jsx("p", { children: "SchoolPiBoard — онлайн-доска для занятий. Её делали не как ещё одну доску для совещаний, а как замену тетради и маркерной доски на уроке: чтобы преподаватель писал пером, разбирал задачи по учебнику и объяснял, а ученик просто открывал ссылку и работал рядом." }),
      /* @__PURE__ */ jsx("p", { children: "Отсюда и решения, которые в других досках выглядят странно. Ученику не нужна учётная запись — регистрация в начале каждого занятия отнимает время у обоих. Платит только преподаватель, и только за себя. Ладонь, лежащая на планшете, не оставляет следа, потому что иначе пером не пишут." }),
      /* @__PURE__ */ jsx("p", { children: "Сервис продолжает настольную программу SchoolPiBoard — ту же доску, но для занятий за одним компьютером. Онлайн-версия делает то же самое для занятий на расстоянии." })
    ] }),
    /* @__PURE__ */ jsxs("article", { className: "card reading", children: [
      /* @__PURE__ */ jsx("h2", { className: "card-title", children: "Контакты" }),
      HAS_COMPANY_DETAILS ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("p", { children: [
          "По вопросам работы сервиса, оплаты и возвратов пишите на",
          " ",
          /* @__PURE__ */ jsx("a", { href: `mailto:${COMPANY.email}`, children: COMPANY.email }),
          ". Отвечаем в течение ",
          COMPANY.replyDays,
          " рабочих дней."
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "text-muted small", children: [
          COMPANY.name,
          ", ",
          COMPANY.status,
          ", ИНН ",
          COMPANY.inn,
          "."
        ] })
      ] }) : /* @__PURE__ */ jsx("p", { className: "text-muted", children: "ЗАГЛУШКА: контакты и реквизиты продавца." }),
      /* @__PURE__ */ jsxs("p", { className: "text-muted small", children: [
        /* @__PURE__ */ jsx(Link, { to: "/legal/terms", children: "Пользовательское соглашение" }),
        " · ",
        /* @__PURE__ */ jsx(Link, { to: "/legal/offer", children: "Оферта" }),
        " · ",
        /* @__PURE__ */ jsx(Link, { to: "/legal/privacy", children: "Персональные данные" })
      ] })
    ] })
  ] });
}
const SHOWN_PLANS = [
  {
    code: "free",
    sort: 1,
    name: "Бесплатный",
    price30: 0,
    price90: 0,
    price180: 0,
    price365: 0,
    maxBoards: 30,
    maxStorageBytes: 52428800,
    maxParticipants: 2,
    hasLibrary: false
  },
  {
    code: "standard",
    sort: 2,
    name: "Стандартный",
    price30: 190,
    price90: 490,
    price180: 950,
    price365: 1690,
    maxBoards: 100,
    maxStorageBytes: 524288e3,
    maxParticipants: 5,
    hasLibrary: true
  },
  {
    code: "extended",
    sort: 3,
    name: "Расширенный",
    price30: 490,
    price90: 1290,
    price180: 2490,
    price365: 4390,
    maxBoards: 200,
    maxStorageBytes: 2147483648,
    maxParticipants: 10,
    hasLibrary: true
  },
  {
    code: "deep",
    sort: 4,
    name: "Углублённый",
    price30: 990,
    price90: 2690,
    price180: 4990,
    price365: 8900,
    maxBoards: 500,
    maxStorageBytes: 5368709120,
    maxParticipants: 20,
    hasLibrary: true
  }
];
const PERIODS$1 = [
  { days: 30, title: "30 дней", field: "price30" },
  { days: 90, title: "90 дней", field: "price90" },
  { days: 180, title: "180 дней", field: "price180" },
  { days: 365, title: "365 дней", field: "price365" }
];
function storage(bytes) {
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1024 ? `${Math.round(megabytes / 1024)} ГБ` : `${Math.round(megabytes)} МБ`;
}
function PricingPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState(SHOWN_PLANS);
  const [period, setPeriod] = useState(PERIODS$1[0]);
  const [error, setError] = useState(null);
  useEffect(() => {
    api("/plans").then(setPlans).catch((reason) => setError(
      reason instanceof ApiError ? reason.message : "Не удалось загрузить тарифы."
    ));
  }, []);
  return /* @__PURE__ */ jsxs(Page, { children: [
    /* @__PURE__ */ jsxs("section", { className: "card", style: { textAlign: "center" }, children: [
      /* @__PURE__ */ jsx("h1", { children: "Тарифы" }),
      /* @__PURE__ */ jsx("p", { className: "reading", style: { margin: "0 auto var(--sp-4)" }, children: "Платит только преподаватель. Ученикам регистрация не нужна: они заходят по ссылке и ничего не платят." }),
      /* @__PURE__ */ jsx("div", { className: "row", style: { justifyContent: "center" }, children: PERIODS$1.map((option) => /* @__PURE__ */ jsx(
        "button",
        {
          className: option.days === period.days ? "btn-primary btn-sm" : "btn-quiet btn-sm",
          type: "button",
          onClick: () => setPeriod(option),
          children: option.title
        },
        option.days
      )) })
    ] }),
    error ? /* @__PURE__ */ jsx("p", { className: "note note-danger", children: error }) : null,
    /* @__PURE__ */ jsx("div", { className: "plans", children: plans.map((plan) => {
      const price = plan[period.field];
      return /* @__PURE__ */ jsxs("article", { className: "plan", children: [
        /* @__PURE__ */ jsx("h2", { className: "plan__name", children: plan.name }),
        /* @__PURE__ */ jsxs("p", { className: "plan__price", children: [
          price === 0 ? "Бесплатно" : `${price} ₽`,
          price === 0 ? null : /* @__PURE__ */ jsxs("span", { className: "plan__period", children: [
            " / ",
            period.title
          ] })
        ] }),
        /* @__PURE__ */ jsxs("ul", { className: "plan__list", children: [
          /* @__PURE__ */ jsxs("li", { children: [
            plan.maxBoards,
            " досок"
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            "до ",
            plan.maxParticipants,
            " человек на доске"
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            storage(plan.maxStorageBytes),
            " под файлы"
          ] }),
          /* @__PURE__ */ jsxs("li", { className: plan.hasLibrary ? void 0 : "plan__no", children: [
            plan.hasLibrary ? /* @__PURE__ */ jsx(IconCheck, { size: 16 }) : /* @__PURE__ */ jsx(IconClose, { size: 16 }),
            " ",
            "библиотека документов и страницы PDF"
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx(IconCheck, { size: 16 }),
            " сохранение доски картинкой"
          ] })
        ] }),
        price === 0 ? /* @__PURE__ */ jsx(Link, { className: "btn btn-outline btn-block", to: user ? "/boards" : "/register", children: user ? "Мои доски" : "Начать бесплатно" }) : /* @__PURE__ */ jsx(Link, { className: "btn btn-primary btn-block", to: user ? "/plan" : "/register", children: user ? "Выбрать" : "Попробовать" })
      ] }, plan.code);
    }) }),
    /* @__PURE__ */ jsxs("section", { className: "card", children: [
      /* @__PURE__ */ jsx("h2", { className: "card-title", children: "Что важно знать" }),
      /* @__PURE__ */ jsxs("ul", { className: "reading", children: [
        /* @__PURE__ */ jsx("li", { children: "Первые 7 дней после подтверждения почты — «Стандартный», без привязки карты." }),
        /* @__PURE__ */ jsx("li", { children: "Оплата разовая за выбранный срок. Продление прибавляет дни к концу текущего, а не обнуляет его." }),
        /* @__PURE__ */ jsx("li", { children: "Когда оплаченный срок кончается, ничего не удаляется: доски и файлы остаются на месте, аккаунт просто возвращается к бесплатным пределам." }),
        /* @__PURE__ */ jsx("li", { children: "Ученики и коллеги, которых вы позвали по ссылке, не платят ничего и никогда." })
      ] })
    ] })
  ] });
}
const BLOCKS = [
  {
    title: "Рисование",
    items: [
      "Три пера с независимыми настройками цвета, толщины и прозрачности — например, чёрное для условия, красное для ошибок, маркер для выделения.",
      "Нажим пера: линия толще там, где сильнее нажали.",
      "Ластик стирает задетое место штриха, а не весь штрих целиком.",
      "Фигуры: линия, стрелка, прямоугольник, эллипс, треугольник, трапеция, параллелограмм, ромб — со сплошным, пунктирным и штрихпунктирным контуром.",
      "Надписи прямо на холсте, с выбором размера и цвета.",
      "Отмена и повтор действия, дублирование, порядок слоёв."
    ]
  },
  {
    title: "Материалы занятия",
    items: [
      "Загрузка PDF и картинок в личную библиотеку — файл хранится один раз и вставляется на любую доску.",
      "Выбор нужных страниц PDF миниатюрами: можно вставить несколько разом.",
      "Обрезка страницы рамкой — вынести на доску один пример, а не весь разворот.",
      "Вставка из буфера обмена: скопированная картинка ложится картинкой, текст — надписью.",
      "Перетаскивание файла прямо на холст.",
      "Сохранение доски картинкой — отдать ученику конспект занятия."
    ]
  },
  {
    title: "Совместная работа",
    items: [
      "Ученик входит по ссылке без регистрации: называет имя, чтобы вы видели, чей курсор.",
      "Комната ожидания: пришедшего видно, вы решаете, впустить и с какой ролью.",
      "Роли: редактор рисует, наблюдатель только смотрит — и не может изменить доску никаким способом.",
      "Курсоры участников подписаны именами и подсвечены разными цветами.",
      "Щелчок по имени в списке участников переносит холст к его курсору — быстро найти друг друга.",
      "Ссылка обновляется сама раз в час; можно перевыпустить вручную или закрыть доску для новых."
    ]
  },
  {
    title: "Холст",
    items: [
      "Бесконечное полотно с масштабом от 2 % до 2000 %.",
      "Фон и разлиновка: клетка, линейка, точки, ромб — или чистый лист.",
      "Пан и зум двумя пальцами на планшете, колесом и пробелом на компьютере.",
      "Таймер на самостоятельную работу.",
      "Всё нарисованное сохраняется само; обрыв связи не теряет работу."
    ]
  },
  {
    title: "Устройства",
    items: [
      "Работает в браузере: ничего не устанавливать ни вам, ни ученику.",
      "Планшет с пером — основной сценарий: ладонь следа не оставляет.",
      "Компьютер и телефон тоже работают; на телефоне панели складываются в прокручиваемые полосы.",
      "Светлая и тёмная тема."
    ]
  }
];
function FeaturesPage() {
  return /* @__PURE__ */ jsxs(Page, { children: [
    /* @__PURE__ */ jsxs("section", { className: "card", children: [
      /* @__PURE__ */ jsx("h1", { children: "Возможности" }),
      /* @__PURE__ */ jsx("p", { className: "reading", children: "Доска сделана для занятий, а не для совещаний: здесь пишут от руки, разбирают задачи по учебнику и объясняют, а не двигают стикеры." })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "stack", children: BLOCKS.map((block) => /* @__PURE__ */ jsxs("article", { className: "card", children: [
      /* @__PURE__ */ jsx("h2", { className: "card-title", children: block.title }),
      /* @__PURE__ */ jsx("ul", { className: "reading", children: block.items.map((item) => /* @__PURE__ */ jsx("li", { children: item }, item)) })
    ] }, block.title)) }),
    /* @__PURE__ */ jsxs("section", { className: "card", style: { textAlign: "center" }, children: [
      /* @__PURE__ */ jsx("h2", { className: "card-title", children: "Попробовать ничего не стоит" }),
      /* @__PURE__ */ jsx("p", { className: "reading", style: { margin: "0 auto var(--sp-4)" }, children: "Бесплатный тариф без срока, а первые семь дней открыт «Стандартный» целиком — с библиотекой документов." }),
      /* @__PURE__ */ jsxs("div", { className: "row", style: { justifyContent: "center" }, children: [
        /* @__PURE__ */ jsx(Link, { className: "btn btn-primary btn-lg", to: "/register", children: "Начать бесплатно" }),
        /* @__PURE__ */ jsx(Link, { className: "btn btn-outline btn-lg", to: "/pricing", children: "Тарифы" })
      ] })
    ] })
  ] });
}
const QUESTIONS = [
  {
    q: "Нужно ли ученику регистрироваться?",
    a: "Нет. Вы отправляете ссылку, ученик открывает её и называет имя — это нужно только чтобы вы понимали, чей курсор на доске. Ни учётной записи, ни установки, ни оплаты с его стороны."
  },
  {
    q: "Сколько платят ученики?",
    a: "Нисколько. Подписку оплачивает только тот, кто создаёт доски. Сколько бы человек ни пришло по ссылке, они не платят никогда."
  },
  {
    q: "Что нужно установить?",
    a: "Ничего. Доска работает в браузере на компьютере, планшете и телефоне. Планшет с пером — самый удобный вариант для преподавателя."
  },
  {
    q: "Что будет, когда закончится оплаченный срок?",
    a: "Ничего не удаляется. Учётная запись возвращается к бесплатным пределам: доски и файлы остаются на месте, но новые доски не создаются и новые файлы не загружаются, пока занятого не станет меньше предела. Материалы занятий не пропадают из-за пропущенного платежа."
  },
  {
    q: "Можно ли пользоваться бесплатно?",
    a: "Да, без срока. Бесплатный тариф даёт 30 досок, до двух человек на доске одновременно и 50 МБ под файлы. Этого хватает на занятия один на один. Библиотека документов и группы больше двух человек — на платных тарифах."
  },
  {
    q: "Что даёт пробный период?",
    a: "Первые семь дней после подтверждения почты открыт тариф «Стандартный» целиком — с библиотекой PDF и группами до пяти человек. Карту привязывать не нужно, и по окончании ничего не списывается: аккаунт просто переходит на бесплатный."
  },
  {
    q: "Как вставить страницу учебника?",
    a: "Загрузите PDF в библиотеку, выберите страницы миниатюрами и вставьте их на доску. Можно обрезать рамкой один пример. Файл хранится один раз и доступен на любой вашей доске."
  },
  {
    q: "Сохранится ли доска после занятия?",
    a: "Да. Всё нарисованное сохраняется само и остаётся на доске. К следующему занятию можно вернуться к той же доске или сохранить её картинкой и отдать ученику."
  },
  {
    q: "Что будет, если пропадёт интернет?",
    a: "Нарисованное не потеряется. Когда связь вернётся, доска догонит пропущенное — и у вас, и у ученика."
  },
  {
    q: "Можно ли отключить автопродление?",
    a: "Да, в любой момент — в личном кабинете, в разделе «Мой тариф». Уже оплаченные дни при этом сохраняются полностью."
  },
  {
    q: "Сколько человек помещается на доске?",
    a: "Зависит от тарифа: от двух на бесплатном до двадцати на «Углублённом». Считая вас."
  }
];
function FaqPage() {
  return /* @__PURE__ */ jsxs(Page, { children: [
    /* @__PURE__ */ jsx("section", { className: "card", children: /* @__PURE__ */ jsx("h1", { children: "Вопросы и ответы" }) }),
    /* @__PURE__ */ jsx("div", { className: "stack", children: QUESTIONS.map((item) => /* @__PURE__ */ jsxs("article", { className: "card", children: [
      /* @__PURE__ */ jsx("h2", { className: "card-title", children: item.q }),
      /* @__PURE__ */ jsx("p", { className: "reading", children: item.a })
    ] }, item.q)) }),
    /* @__PURE__ */ jsxs("section", { className: "card", style: { textAlign: "center" }, children: [
      /* @__PURE__ */ jsx("p", { className: "reading", style: { margin: "0 auto var(--sp-4)" }, children: "Не нашли ответа? Напишите — разберёмся." }),
      /* @__PURE__ */ jsxs("div", { className: "row", style: { justifyContent: "center" }, children: [
        /* @__PURE__ */ jsx(Link, { className: "btn btn-primary", to: "/register", children: "Начать бесплатно" }),
        /* @__PURE__ */ jsx(Link, { className: "btn btn-outline", to: "/about", children: "Контакты" })
      ] })
    ] })
  ] });
}
async function send(path, form, guestToken) {
  const headers = {};
  const token = readToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (guestToken) headers["X-Guest-Token"] = guestToken;
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { method: "POST", headers, body: form });
  } catch {
    throw new ApiError(0, "network", "Сервер не отвечает. Проверьте подключение.");
  }
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const details = payload ?? {};
    throw new ApiError(response.status, "error", details.message ?? "Не удалось загрузить файл.");
  }
  return payload;
}
function uploadToLibrary(file) {
  const form = new FormData();
  form.append("file", file, file.name);
  return send("/files", form);
}
function uploadBoardImage(boardId, blob, name, guestToken) {
  const form = new FormData();
  form.append("file", blob, name);
  return send(`/boards/${boardId}/images`, form, guestToken);
}
async function readLibraryFile(fileId) {
  const headers = {};
  const token = readToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const response = await fetch(`${API_URL}/files/${fileId}/raw`, { headers });
  if (!response.ok) throw new ApiError(response.status, "error", "Не удалось прочитать файл.");
  return response.arrayBuffer();
}
function imageUrl(imageRef) {
  return `${API_URL}/images/${imageRef}`;
}
function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
const PERIODS = [
  { days: 30, title: "30 дней", field: "price30" },
  { days: 90, title: "90 дней", field: "price90" },
  { days: 180, title: "180 дней", field: "price180" },
  { days: 365, title: "365 дней", field: "price365" }
];
function Bar({ used, total }) {
  const share = total > 0 ? Math.min(1, used / total) : 0;
  return /* @__PURE__ */ jsx("div", { className: "files__bar", children: /* @__PURE__ */ jsx("span", { style: { width: `${share * 100}%` } }) });
}
function PlanPage() {
  const [mine, setMine] = useState(null);
  const [plans, setPlans] = useState([]);
  const [orders, setOrders] = useState([]);
  const [now, setNow] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [code, setCode] = useState(null);
  const [period, setPeriod] = useState(PERIODS[0]);
  const [renew, setRenew] = useState(false);
  const loadOrders = () => {
    api("/billing/history").then(setOrders).catch(() => void 0);
  };
  const load = () => {
    api("/billing/me").then(setMine).catch((reason) => setError(
      reason instanceof ApiError ? reason.message : "Не удалось загрузить тариф."
    ));
  };
  useEffect(() => {
    if (pathname !== "/plan/paid" && pathname !== "/plan/failed") return;
    setOutcome(pathname === "/plan/paid" ? "paid" : "failed");
    navigate("/plan", { replace: true });
  }, []);
  useEffect(() => {
    if (outcome !== "paid") return;
    let alive = true;
    let attempts = 0;
    let timer;
    const check = async () => {
      if (!alive) return;
      attempts += 1;
      try {
        const answer = await api("/billing/me");
        if (!alive) return;
        setMine(answer);
        if (answer.kind === "paid") {
          loadOrders();
          return;
        }
      } catch {
      }
      if (alive && attempts < 6) timer = setTimeout(() => void check(), 3e3);
    };
    timer = setTimeout(() => void check(), 2e3);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [outcome]);
  useEffect(() => {
    load();
    loadOrders();
    api("/plans").then((rows) => {
      const paid = rows.filter((row) => row.price30 > 0);
      setPlans(paid);
      setCode((current) => {
        var _a;
        return current ?? ((_a = paid[0]) == null ? void 0 : _a.code) ?? null;
      });
    }).catch(() => void 0);
  }, []);
  const chosen = plans.find((plan) => plan.code === code) ?? null;
  const price = chosen ? chosen[period.field] : 0;
  const upgrade = Boolean(
    chosen && mine && mine.kind !== "free" && mine.upcoming.length === 0 && chosen.sort > mine.plan.sort
  );
  const pay = async () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const answer = await api("/billing/checkout", {
        method: "POST",
        body: { planCode: chosen.code, days: period.days, autoRenew: renew, startNow: now && upgrade }
      });
      window.location.href = answer.paymentUrl;
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось перейти к оплате.");
      setBusy(false);
    }
  };
  const startNow = async () => {
    const next = mine == null ? void 0 : mine.upcoming[0];
    if (!next) return;
    const sure = window.confirm(
      `Перейти на «${next.planName}» прямо сейчас? Оставшиеся дни текущего тарифа сгорят, и вернуть их будет нельзя.`
    );
    if (!sure) return;
    try {
      await api("/billing/start-now", { method: "POST" });
      load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось перейти досрочно.");
    }
  };
  const toggleRenew = async (value) => {
    try {
      await api("/billing/auto-renew", { method: "POST", body: { value } });
      load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось изменить автопродление.");
    }
  };
  const day = (value) => new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const until = (mine == null ? void 0 : mine.until) ? new Date(mine.until).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : null;
  return /* @__PURE__ */ jsxs(Page, { narrow: true, children: [
    /* @__PURE__ */ jsx("div", { className: "page-header", children: /* @__PURE__ */ jsx("h1", { children: "Мой тариф" }) }),
    outcome === "paid" ? /* @__PURE__ */ jsx("p", { className: "note note-info", children: "Оплата принята. Срок обновится в течение минуты — страница сама покажет новый." }) : null,
    outcome === "failed" ? /* @__PURE__ */ jsx("p", { className: "note note-danger", children: "Оплата не прошла, деньги не списаны. Можно попробовать ещё раз." }) : null,
    error ? /* @__PURE__ */ jsx("p", { className: "note note-danger", children: error }) : null,
    mine ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("section", { className: "card", children: [
        /* @__PURE__ */ jsx("h2", { className: "card-title", children: mine.plan.name }),
        mine.kind === "trial" && until ? /* @__PURE__ */ jsxs("p", { className: "note note-info", children: [
          "Пробный период до ",
          until,
          ". Дальше аккаунт вернётся к бесплатным пределам — ничего не пропадёт."
        ] }) : null,
        mine.kind === "paid" && until ? /* @__PURE__ */ jsxs("p", { className: "text-muted", children: [
          "Оплачено до ",
          until,
          "."
        ] }) : null,
        mine.kind === "free" ? /* @__PURE__ */ jsx("p", { className: "text-muted", children: "Бесплатный тариф — без срока. Платный расширяет пределы и открывает библиотеку документов." }) : null,
        mine.upcoming.length > 0 ? /* @__PURE__ */ jsxs("div", { className: "note note-info", style: { marginTop: "var(--sp-3)" }, children: [
          /* @__PURE__ */ jsx("p", { style: { margin: "0 0 var(--sp-2)" }, children: /* @__PURE__ */ jsx("strong", { children: "Уже оплачено дальше." }) }),
          mine.upcoming.map((next) => /* @__PURE__ */ jsxs("p", { style: { margin: "0 0 4px" }, children: [
            next.planName,
            ": с ",
            day(next.startsAt),
            " до ",
            day(next.endsAt),
            "."
          ] }, next.startsAt)),
          mine.canStartUpcomingNow ? /* @__PURE__ */ jsx(
            "button",
            {
              className: "btn-quiet btn-sm",
              type: "button",
              onClick: () => void startNow(),
              style: { marginTop: "var(--sp-2)" },
              children: "Перейти сейчас"
            }
          ) : null
        ] }) : null,
        /* @__PURE__ */ jsxs("div", { className: "stack", style: { marginTop: "var(--sp-4)" }, children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("p", { className: "small", style: { margin: "0 0 2px" }, children: [
              "Доски: ",
              mine.boards,
              " из ",
              mine.plan.maxBoards
            ] }),
            /* @__PURE__ */ jsx(Bar, { used: mine.boards, total: mine.plan.maxBoards })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("p", { className: "small", style: { margin: "0 0 2px" }, children: [
              "Файлы: ",
              humanSize(mine.storageUsed),
              " из ",
              humanSize(mine.plan.maxStorageBytes)
            ] }),
            /* @__PURE__ */ jsx(Bar, { used: mine.storageUsed, total: mine.plan.maxStorageBytes })
          ] }),
          /* @__PURE__ */ jsxs("p", { className: "text-muted small", style: { margin: 0 }, children: [
            "На доске одновременно — до ",
            mine.plan.maxParticipants,
            " человек, считая вас. Библиотека документов ",
            mine.plan.hasLibrary ? "доступна" : "на платных тарифах",
            "."
          ] })
        ] })
      ] }),
      mine.kind === "paid" ? /* @__PURE__ */ jsxs("section", { className: "card", children: [
        /* @__PURE__ */ jsx("h2", { className: "card-title", children: "Автопродление" }),
        mine.canAutoRenew || mine.autoRenew ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { className: "check", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                id: "autoRenew",
                type: "checkbox",
                checked: mine.autoRenew,
                onChange: (event) => void toggleRenew(event.target.checked)
              }
            ),
            /* @__PURE__ */ jsx("label", { htmlFor: "autoRenew", children: "Продлевать подписку автоматически" })
          ] }),
          /* @__PURE__ */ jsx("p", { className: "text-muted small", children: "Списываем с той же карты за сутки до конца срока. Выключить можно в любой момент — оплаченные дни остаются при вас." })
        ] }) : /* @__PURE__ */ jsx("p", { className: "text-muted small", children: "При оплате этой подписки автопродление не выбиралось, и включить его задним числом нельзя: платёжная система разрешает повторные списания только по счёту, помеченному в момент оплаты. Отметьте «продлевать автоматически» при следующей покупке." })
      ] }) : null,
      /* @__PURE__ */ jsxs("section", { className: "card", children: [
        /* @__PURE__ */ jsx("h2", { className: "card-title", children: mine.kind === "free" ? "Выбрать тариф" : "Продлить или сменить" }),
        plans.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-muted", children: "Загружаем тарифы…" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("p", { className: "params__label", children: "Тариф" }),
          /* @__PURE__ */ jsx("div", { className: "row", children: plans.map((plan) => /* @__PURE__ */ jsx(
            "button",
            {
              className: plan.code === code ? "btn-primary btn-sm" : "btn-quiet btn-sm",
              type: "button",
              onClick: () => setCode(plan.code),
              children: plan.name
            },
            plan.code
          )) }),
          /* @__PURE__ */ jsx("p", { className: "params__label", children: "Срок" }),
          /* @__PURE__ */ jsx("div", { className: "row", children: PERIODS.map((option) => /* @__PURE__ */ jsx(
            "button",
            {
              className: option.days === period.days ? "btn-primary btn-sm" : "btn-quiet btn-sm",
              type: "button",
              onClick: () => setPeriod(option),
              children: option.title
            },
            option.days
          )) }),
          upgrade ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("p", { className: "params__label", children: "Когда начать" }),
            /* @__PURE__ */ jsxs("div", { className: "check", children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  id: "startLater",
                  type: "radio",
                  checked: !now,
                  onChange: () => setNow(false)
                }
              ),
              /* @__PURE__ */ jsx("label", { htmlFor: "startLater", children: "После текущего срока — ни один его день не теряется" })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "check", children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  id: "startNow",
                  type: "radio",
                  checked: now,
                  onChange: () => setNow(true)
                }
              ),
              /* @__PURE__ */ jsxs("label", { htmlFor: "startNow", children: [
                "Сразу — оставшиеся дни «",
                mine.plan.name,
                "» сгорят, вернуть их будет нельзя"
              ] })
            ] })
          ] }) : null,
          chosen && mine && mine.kind !== "free" && !upgrade ? /* @__PURE__ */ jsxs("p", { className: "text-muted small", children: [
            "Срок встанет в очередь и начнётся",
            " ",
            mine.upcoming.length > 0 ? day(mine.upcoming[mine.upcoming.length - 1].endsAt) : until ?? "после текущего",
            ":",
            " ",
            "ни один оплаченный день не пропадает."
          ] }) : null,
          /* @__PURE__ */ jsxs("div", { className: "check", style: { marginTop: "var(--sp-3)" }, children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                id: "renewOnBuy",
                type: "checkbox",
                checked: renew,
                onChange: (event) => setRenew(event.target.checked)
              }
            ),
            /* @__PURE__ */ jsx("label", { htmlFor: "renewOnBuy", children: "Продлевать автоматически" })
          ] }),
          /* @__PURE__ */ jsx(
            "button",
            {
              className: "btn-primary btn-block",
              type: "button",
              disabled: !chosen || busy,
              onClick: () => void pay(),
              style: { marginTop: "var(--sp-4)" },
              children: busy ? "Готовим оплату…" : `Оплатить ${price} ₽`
            }
          ),
          /* @__PURE__ */ jsx("p", { className: "text-muted small", children: "Оплата через Робокассу. Оплаченные дни прибавляются к концу текущего срока — ничего не пропадает." })
        ] }),
        /* @__PURE__ */ jsx(Link, { className: "btn btn-quiet btn-sm", to: "/pricing", children: "Сравнить тарифы" })
      ] }),
      orders.length > 0 ? /* @__PURE__ */ jsxs("section", { className: "card", children: [
        /* @__PURE__ */ jsx("h2", { className: "card-title", children: "История покупок" }),
        /* @__PURE__ */ jsx("div", { className: "stack", children: orders.map((order) => /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs("p", { style: { margin: 0 }, children: [
            order.planName,
            ", ",
            order.days,
            " дн. — ",
            order.amount,
            " ₽"
          ] }),
          /* @__PURE__ */ jsxs("p", { className: "text-muted small", style: { margin: 0 }, children: [
            "Счёт № ",
            order.invoiceId,
            " от ",
            day(order.createdAt),
            " · ",
            order.status === "paid" ? "оплачен" : null,
            order.status === "pending" ? "ожидает оплаты" : null,
            order.status === "abandoned" ? "не завершён" : null
          ] })
        ] }, order.invoiceId)) }),
        /* @__PURE__ */ jsx("p", { className: "text-muted small", children: "Платёжная система сообщает нам только об успешной оплате. Поэтому неоплаченный счёт остаётся ожидающим и через сутки помечается незавершённым — это не отказ банка, а просто неоконченная покупка. Если деньги списались, а счёт всё ещё не оплачен, напишите нам." })
      ] }) : null
    ] }) : error ? null : /* @__PURE__ */ jsx("p", { className: "text-muted", children: "Загружаем…" })
  ] });
}
function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const next = params.get("next");
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    setNeedsConfirmation(false);
    try {
      await login(email, password);
      navigate(next ?? "/boards");
    } catch (reason) {
      if (reason instanceof ApiError) {
        setError(reason.message);
        if (reason.code === "email_not_confirmed") setNeedsConfirmation(true);
      } else {
        setError("Не удалось войти.");
      }
    } finally {
      setBusy(false);
    }
  };
  const resend = async () => {
    setBusy(true);
    try {
      const result = await api("/auth/resend-confirmation", {
        method: "POST",
        body: { email }
      });
      setError(null);
      setNeedsConfirmation(false);
      setNotice(result.message);
    } catch {
      setError("Не удалось отправить письмо. Попробуйте позже.");
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsx(Page, { narrow: true, children: /* @__PURE__ */ jsxs("form", { className: "card", onSubmit: submit, children: [
    /* @__PURE__ */ jsx("h1", { children: "Вход" }),
    /* @__PURE__ */ jsx("label", { htmlFor: "email", children: "Почта" }),
    /* @__PURE__ */ jsx(
      "input",
      {
        id: "email",
        type: "email",
        required: true,
        autoComplete: "email",
        value: email,
        onChange: (event) => setEmail(event.target.value)
      }
    ),
    /* @__PURE__ */ jsx("label", { htmlFor: "password", children: "Пароль" }),
    /* @__PURE__ */ jsx(
      "input",
      {
        id: "password",
        type: "password",
        required: true,
        autoComplete: "current-password",
        value: password,
        onChange: (event) => setPassword(event.target.value)
      }
    ),
    error ? /* @__PURE__ */ jsx("p", { className: "note note-danger", children: error }) : null,
    notice ? /* @__PURE__ */ jsx("p", { className: "text-muted", children: notice }) : null,
    needsConfirmation ? /* @__PURE__ */ jsx("button", { className: "btn-quiet", type: "button", onClick: resend, disabled: busy, children: "Выслать письмо ещё раз" }) : null,
    /* @__PURE__ */ jsx("button", { className: "btn-primary", type: "submit", disabled: busy, children: busy ? "Входим…" : "Войти" }),
    /* @__PURE__ */ jsx("p", { className: "text-muted small", children: /* @__PURE__ */ jsx(Link, { to: "/forgot-password", children: "Забыли пароль?" }) }),
    /* @__PURE__ */ jsxs("p", { className: "text-muted small", children: [
      "Нет учётной записи? ",
      /* @__PURE__ */ jsx(Link, { to: "/register", children: "Зарегистрироваться" })
    ] })
  ] }) });
}
const MIN_PASSWORD_LENGTH$1 = 8;
function RegisterPage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH$1) {
      setError(`Пароль должен быть не короче ${MIN_PASSWORD_LENGTH$1} символов.`);
      return;
    }
    if (password !== passwordConfirm) {
      setError("Пароли не совпадают.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api("/auth/register", {
        method: "POST",
        body: { displayName, email, password, passwordConfirm }
      });
      setDone(result.message);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось зарегистрироваться.");
    } finally {
      setBusy(false);
    }
  };
  if (done) {
    return /* @__PURE__ */ jsx(Page, { narrow: true, children: /* @__PURE__ */ jsxs("div", { className: "card", children: [
      /* @__PURE__ */ jsx("h1", { children: "Проверьте почту" }),
      /* @__PURE__ */ jsx("p", { children: done }),
      /* @__PURE__ */ jsx("p", { className: "text-muted small", children: "Письмо не пришло? Загляните в «Спам», а затем запросите его заново на странице входа." }),
      /* @__PURE__ */ jsx(Link, { className: "btn btn-primary", to: "/login", children: "На страницу входа" })
    ] }) });
  }
  return /* @__PURE__ */ jsx(Page, { narrow: true, children: /* @__PURE__ */ jsxs("form", { className: "card", onSubmit: submit, children: [
    /* @__PURE__ */ jsx("h1", { children: "Регистрация" }),
    /* @__PURE__ */ jsx("p", { className: "text-muted", children: "Учётная запись нужна преподавателю — тому, кто создаёт доски. Обучающемуся регистрироваться не нужно: он заходит по ссылке." }),
    /* @__PURE__ */ jsx("label", { htmlFor: "displayName", children: "Как вас называть" }),
    /* @__PURE__ */ jsx(
      "input",
      {
        id: "displayName",
        type: "text",
        required: true,
        maxLength: 100,
        autoComplete: "name",
        placeholder: "Имя, которое увидят на доске",
        value: displayName,
        onChange: (event) => setDisplayName(event.target.value)
      }
    ),
    /* @__PURE__ */ jsx("label", { htmlFor: "email", children: "Почта" }),
    /* @__PURE__ */ jsx(
      "input",
      {
        id: "email",
        type: "email",
        required: true,
        autoComplete: "email",
        value: email,
        onChange: (event) => setEmail(event.target.value)
      }
    ),
    /* @__PURE__ */ jsx("label", { htmlFor: "password", children: "Пароль" }),
    /* @__PURE__ */ jsx(
      "input",
      {
        id: "password",
        type: "password",
        required: true,
        minLength: MIN_PASSWORD_LENGTH$1,
        autoComplete: "new-password",
        value: password,
        onChange: (event) => setPassword(event.target.value)
      }
    ),
    /* @__PURE__ */ jsx("label", { htmlFor: "passwordConfirm", children: "Пароль ещё раз" }),
    /* @__PURE__ */ jsx(
      "input",
      {
        id: "passwordConfirm",
        type: "password",
        required: true,
        minLength: MIN_PASSWORD_LENGTH$1,
        autoComplete: "new-password",
        value: passwordConfirm,
        onChange: (event) => setPasswordConfirm(event.target.value)
      }
    ),
    error ? /* @__PURE__ */ jsx("p", { className: "note note-danger", children: error }) : null,
    /* @__PURE__ */ jsx("button", { className: "btn-primary", type: "submit", disabled: busy, children: busy ? "Отправляем…" : "Зарегистрироваться" }),
    /* @__PURE__ */ jsxs("p", { className: "text-muted small", children: [
      "Уже есть учётная запись? ",
      /* @__PURE__ */ jsx(Link, { to: "/login", children: "Войти" })
    ] })
  ] }) });
}
function ConfirmPage() {
  const [params] = useSearchParams();
  const { accept } = useAuth();
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setError("Ссылка неполная. Откройте её из письма целиком.");
      return;
    }
    if (started.current) return;
    started.current = true;
    api("/auth/confirm", { method: "POST", body: { token } }).then((result) => {
      accept(result);
      setDone(true);
    }).catch((reason) => {
      setError(reason instanceof ApiError ? reason.message : "Не удалось подтвердить почту.");
    });
  }, [params, accept]);
  return /* @__PURE__ */ jsx(Page, { narrow: true, children: /* @__PURE__ */ jsxs("div", { className: "card", children: [
    /* @__PURE__ */ jsx("h1", { children: "Подтверждение почты" }),
    done ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { children: "Почта подтверждена, вы вошли." }),
      /* @__PURE__ */ jsx(Link, { className: "btn btn-primary", to: "/boards", children: "К доскам" })
    ] }) : error ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { className: "note note-danger", children: error }),
      /* @__PURE__ */ jsx("p", { className: "text-muted small", children: "Ссылка действует сутки и срабатывает один раз. Если срок вышел, запросите новое письмо на странице входа." }),
      /* @__PURE__ */ jsx(Link, { className: "btn btn-primary", to: "/login", children: "На страницу входа" })
    ] }) : /* @__PURE__ */ jsx("p", { className: "text-muted", children: "Подтверждаем…" })
  ] }) });
}
function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api("/auth/forgot-password", {
        method: "POST",
        body: { email }
      });
      setSent(result.message);
    } catch {
      setSent("Если такая почта зарегистрирована, письмо отправлено.");
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsx(Page, { narrow: true, children: sent ? /* @__PURE__ */ jsxs("div", { className: "card", children: [
    /* @__PURE__ */ jsx("h1", { children: "Проверьте почту" }),
    /* @__PURE__ */ jsx("p", { children: sent }),
    /* @__PURE__ */ jsx(Link, { className: "btn btn-primary", to: "/login", children: "На страницу входа" })
  ] }) : /* @__PURE__ */ jsxs("form", { className: "card", onSubmit: submit, children: [
    /* @__PURE__ */ jsx("h1", { children: "Восстановление пароля" }),
    /* @__PURE__ */ jsx("p", { className: "text-muted", children: "Пришлём ссылку, по которой можно задать новый пароль." }),
    /* @__PURE__ */ jsx("label", { htmlFor: "email", children: "Почта" }),
    /* @__PURE__ */ jsx(
      "input",
      {
        id: "email",
        type: "email",
        required: true,
        autoComplete: "email",
        value: email,
        onChange: (event) => setEmail(event.target.value)
      }
    ),
    /* @__PURE__ */ jsx("button", { className: "btn-primary", type: "submit", disabled: busy, children: busy ? "Отправляем…" : "Прислать ссылку" }),
    /* @__PURE__ */ jsx("p", { className: "text-muted small", children: /* @__PURE__ */ jsx(Link, { to: "/login", children: "Вернуться ко входу" }) })
  ] }) });
}
const MIN_PASSWORD_LENGTH = 8;
function ResetPasswordPage() {
  const [params] = useSearchParams();
  const { accept } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const token = params.get("token");
  const submit = async (event) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.`);
      return;
    }
    if (password !== passwordConfirm) {
      setError("Пароли не совпадают.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api("/auth/reset-password", {
        method: "POST",
        body: { token, password, passwordConfirm }
      });
      accept(result);
      navigate("/boards", { replace: true });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось сменить пароль.");
    } finally {
      setBusy(false);
    }
  };
  if (!token) {
    return /* @__PURE__ */ jsx(Page, { narrow: true, children: /* @__PURE__ */ jsxs("div", { className: "card", children: [
      /* @__PURE__ */ jsx("h1", { children: "Новый пароль" }),
      /* @__PURE__ */ jsx("p", { className: "note note-danger", children: "Ссылка неполная. Откройте её из письма целиком." }),
      /* @__PURE__ */ jsx(Link, { className: "btn btn-primary", to: "/forgot-password", children: "Запросить ссылку заново" })
    ] }) });
  }
  return /* @__PURE__ */ jsx(Page, { narrow: true, children: /* @__PURE__ */ jsxs("form", { className: "card", onSubmit: submit, children: [
    /* @__PURE__ */ jsx("h1", { children: "Новый пароль" }),
    /* @__PURE__ */ jsx("label", { htmlFor: "password", children: "Пароль" }),
    /* @__PURE__ */ jsx(
      "input",
      {
        id: "password",
        type: "password",
        required: true,
        minLength: MIN_PASSWORD_LENGTH,
        autoComplete: "new-password",
        value: password,
        onChange: (event) => setPassword(event.target.value)
      }
    ),
    /* @__PURE__ */ jsx("label", { htmlFor: "passwordConfirm", children: "Пароль ещё раз" }),
    /* @__PURE__ */ jsx(
      "input",
      {
        id: "passwordConfirm",
        type: "password",
        required: true,
        minLength: MIN_PASSWORD_LENGTH,
        autoComplete: "new-password",
        value: passwordConfirm,
        onChange: (event) => setPasswordConfirm(event.target.value)
      }
    ),
    error ? /* @__PURE__ */ jsx("p", { className: "note note-danger", children: error }) : null,
    /* @__PURE__ */ jsx("button", { className: "btn-primary", type: "submit", disabled: busy, children: busy ? "Сохраняем…" : "Задать пароль" })
  ] }) });
}
function Modal({ title, onClose, children }) {
  const backdrop = useRef(null);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: "modal__backdrop",
      ref: backdrop,
      onMouseDown: (event) => {
        if (event.target === backdrop.current) onClose();
      },
      role: "presentation",
      children: /* @__PURE__ */ jsxs("div", { className: "modal", role: "dialog", "aria-modal": "true", "aria-label": title, children: [
        /* @__PURE__ */ jsxs("div", { className: "row row--between", children: [
          /* @__PURE__ */ jsx("h2", { className: "modal__title", children: title }),
          /* @__PURE__ */ jsx("button", { className: "btn-tool", type: "button", onClick: onClose, "aria-label": "Закрыть", children: /* @__PURE__ */ jsx(IconClose, {}) })
        ] }),
        children
      ] })
    }
  );
}
function BoardsPage() {
  const navigate = useNavigate();
  const [boards, setBoards] = useState([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState(null);
  const [loading2, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const load = useCallback(async () => {
    try {
      setBoards(await api("/boards"));
      setError(null);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось загрузить доски.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const create = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const board = await api("/boards", { method: "POST", body: { title } });
      navigate(`/boards/${board.id}`, { state: { openLink: true } });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось создать доску.");
      setBusy(false);
    }
  };
  const rename = async (event) => {
    event.preventDefault();
    if (!renaming) return;
    try {
      await api(`/boards/${renaming.id}`, { method: "PATCH", body: { title: newTitle } });
      setRenaming(null);
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось переименовать.");
    }
  };
  const remove = async (board) => {
    if (!window.confirm(`Удалить доску «${board.title}»? Она пропадёт у всех участников.`)) return;
    try {
      await api(`/boards/${board.id}`, { method: "DELETE" });
      setBoards((current) => current.filter((item) => item.id !== board.id));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось удалить доску.");
    }
  };
  return /* @__PURE__ */ jsxs(Page, { children: [
    /* @__PURE__ */ jsx("div", { className: "page-header", children: /* @__PURE__ */ jsx("h1", { children: "Мои доски" }) }),
    /* @__PURE__ */ jsx("form", { className: "card", onSubmit: create, children: /* @__PURE__ */ jsxs("div", { className: "field", children: [
      /* @__PURE__ */ jsx("label", { htmlFor: "title", children: "Новая доска" }),
      /* @__PURE__ */ jsxs("div", { className: "link-box", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            id: "title",
            type: "text",
            required: true,
            maxLength: 200,
            value: title,
            onChange: (event) => setTitle(event.target.value)
          }
        ),
        /* @__PURE__ */ jsx("button", { className: "btn-primary", type: "submit", disabled: busy, children: "Создать" })
      ] })
    ] }) }),
    error ? /* @__PURE__ */ jsx("p", { className: "note note-danger", children: error }) : null,
    loading2 ? /* @__PURE__ */ jsx("p", { className: "text-muted", children: "Загружаем…" }) : boards.length === 0 ? /* @__PURE__ */ jsx("p", { className: "empty", children: "Досок пока нет. Создайте первую — ссылка на неё появится сразу, останется только отправить её тем, кого ждёте на занятии." }) : /* @__PURE__ */ jsx("ul", { className: "board-list", children: boards.map((board) => /* @__PURE__ */ jsxs("li", { className: "board-item", children: [
      /* @__PURE__ */ jsx("span", { className: "people__icon", title: roleTitle$1(board.role), children: /* @__PURE__ */ jsx(RoleIcon$1, { role: board.role }) }),
      /* @__PURE__ */ jsx(Link, { className: "board-item__title", to: `/boards/${board.id}`, children: board.title }),
      board.locked ? /* @__PURE__ */ jsx("span", { className: "badge badge-warning", children: "закрыта" }) : null,
      board.canManage ? /* @__PURE__ */ jsxs(Menu, { label: "Действия с доской", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            className: "btn-quiet menu__item",
            type: "button",
            onClick: () => {
              setRenaming(board);
              setNewTitle(board.title);
            },
            children: "Переименовать"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            className: "btn-quiet menu__item menu__item--danger",
            type: "button",
            onClick: () => remove(board),
            children: "Удалить"
          }
        )
      ] }) : null
    ] }, board.id)) }),
    renaming ? /* @__PURE__ */ jsx(Modal, { title: "Переименовать доску", onClose: () => setRenaming(null), children: /* @__PURE__ */ jsxs("form", { onSubmit: rename, children: [
      /* @__PURE__ */ jsxs("div", { className: "field", children: [
        /* @__PURE__ */ jsx("label", { htmlFor: "newTitle", children: "Название" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            id: "newTitle",
            type: "text",
            required: true,
            maxLength: 200,
            autoFocus: true,
            value: newTitle,
            onChange: (event) => setNewTitle(event.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsx("button", { className: "btn-primary btn-block", type: "submit", children: "Сохранить" })
    ] }) }) : null
  ] });
}
function RoleIcon$1({ role }) {
  if (role === "owner") return /* @__PURE__ */ jsx(IconOwner, {});
  if (role === "editor") return /* @__PURE__ */ jsx(IconEditor, {});
  return /* @__PURE__ */ jsx(IconViewer, {});
}
function roleTitle$1(role) {
  if (role === "owner") return "Ваша доска";
  if (role === "editor") return "Вы можете работать на доске";
  return "Вы можете только смотреть";
}
function ProfilePage() {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return /* @__PURE__ */ jsx(Page, { narrow: true, children: /* @__PURE__ */ jsx("p", { className: "text-muted", children: "Загружаем…" }) });
  return /* @__PURE__ */ jsxs(Page, { narrow: true, children: [
    /* @__PURE__ */ jsx("h1", { children: "Профиль" }),
    /* @__PURE__ */ jsx(NameCard, { user, onSaved: refresh }),
    /* @__PURE__ */ jsx(PasswordCard, { email: user.email }),
    /* @__PURE__ */ jsx(DangerCard, { onDeleted: () => {
      logout();
      navigate("/", { replace: true });
    } })
  ] });
}
function NameCard({ user, onSaved }) {
  const [name, setName] = useState(user.displayName);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/me", { method: "PATCH", body: { displayName: name } });
      await onSaved();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2e3);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось сохранить.");
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs("form", { className: "card", onSubmit: submit, children: [
    /* @__PURE__ */ jsx("h2", { className: "card-title", children: "Имя" }),
    /* @__PURE__ */ jsx("p", { className: "text-muted small", children: "Так вас видят на досках." }),
    /* @__PURE__ */ jsxs("div", { className: "field", children: [
      /* @__PURE__ */ jsx("label", { htmlFor: "displayName", children: "Имя" }),
      /* @__PURE__ */ jsx(
        "input",
        {
          id: "displayName",
          type: "text",
          required: true,
          maxLength: 100,
          value: name,
          onChange: (event) => setName(event.target.value)
        }
      )
    ] }),
    error ? /* @__PURE__ */ jsx("p", { className: "note note-danger", children: error }) : null,
    /* @__PURE__ */ jsx("button", { className: "btn-primary", type: "submit", disabled: busy || name.trim() === user.displayName, children: busy ? "Сохраняем…" : saved ? "Сохранено" : "Сохранить" })
  ] });
}
function PasswordCard({ email }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = async () => {
    setBusy(true);
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email } });
    } finally {
      setBusy(false);
      setSent(true);
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "card", children: [
    /* @__PURE__ */ jsx("h2", { className: "card-title", children: "Пароль" }),
    /* @__PURE__ */ jsxs("p", { className: "text-muted small", children: [
      "Пришлём на ",
      email,
      " ссылку для смены."
    ] }),
    sent ? /* @__PURE__ */ jsx("p", { className: "note note-success", children: "Письмо отправлено — проверьте почту." }) : /* @__PURE__ */ jsx("button", { className: "btn-outline", type: "button", onClick: request, disabled: busy, children: busy ? "Отправляем…" : "Сменить пароль" })
  ] });
}
function DangerCard({ onDeleted }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (!window.confirm("Удалить аккаунт? Войти в него станет нельзя.")) return;
    setBusy(true);
    setError(null);
    try {
      await api("/auth/me", { method: "DELETE", body: { password } });
      onDeleted();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось удалить аккаунт.");
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "card", children: [
    /* @__PURE__ */ jsx("h2", { className: "card-title", children: "Удаление аккаунта" }),
    /* @__PURE__ */ jsx("p", { className: "text-muted small", children: "Войти станет нельзя. Ваши доски проработают у остальных участников ещё полгода." }),
    open ? /* @__PURE__ */ jsxs("form", { onSubmit: submit, children: [
      /* @__PURE__ */ jsxs("div", { className: "field", children: [
        /* @__PURE__ */ jsx("label", { htmlFor: "deletePassword", children: "Подтвердите паролем" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            id: "deletePassword",
            type: "password",
            required: true,
            autoComplete: "current-password",
            value: password,
            onChange: (event) => setPassword(event.target.value)
          }
        )
      ] }),
      error ? /* @__PURE__ */ jsx("p", { className: "note note-danger", children: error }) : null,
      /* @__PURE__ */ jsxs("div", { className: "row", children: [
        /* @__PURE__ */ jsx("button", { className: "btn-danger", type: "submit", disabled: busy, children: busy ? "Удаляем…" : "Удалить аккаунт насовсем" }),
        /* @__PURE__ */ jsx("button", { className: "btn-quiet", type: "button", onClick: () => setOpen(false), disabled: busy, children: "Отмена" })
      ] })
    ] }) : /* @__PURE__ */ jsx("button", { className: "btn-danger", type: "button", onClick: () => setOpen(true), children: "Удалить аккаунт" })
  ] });
}
const TOKEN_PREFIX = "schoolpiboard.guest.";
const MARKER_KEY = "schoolpiboard.guestMarker";
function readGuestToken(boardId) {
  try {
    return localStorage.getItem(TOKEN_PREFIX + boardId);
  } catch {
    return null;
  }
}
function writeGuestToken(boardId, token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_PREFIX + boardId, token);
    } else {
      localStorage.removeItem(TOKEN_PREFIX + boardId);
    }
  } catch {
  }
}
function readGuestMarker() {
  try {
    return localStorage.getItem(MARKER_KEY);
  } catch {
    return null;
  }
}
function writeGuestMarker(marker) {
  try {
    localStorage.setItem(MARKER_KEY, marker);
  } catch {
  }
}
function CanvasPanel({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return /* @__PURE__ */ jsxs(
    "aside",
    {
      className: open ? "canvas-panel canvas-panel--open" : "canvas-panel",
      role: "dialog",
      "aria-label": title,
      "aria-hidden": !open,
      children: [
        /* @__PURE__ */ jsxs("div", { className: "canvas-panel__head", children: [
          /* @__PURE__ */ jsx("h2", { className: "canvas-panel__title", children: title }),
          /* @__PURE__ */ jsx("button", { className: "btn-tool", type: "button", onClick: onClose, "aria-label": "Закрыть", children: /* @__PURE__ */ jsx(IconClose, {}) })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "canvas-panel__body", children })
      ]
    }
  );
}
const PAGE_SIZE = 5;
function PeoplePanel({
  boardId,
  canManage,
  members,
  guests,
  guestName,
  queue,
  present,
  cursors,
  onGoTo,
  meConnectionId,
  onChanged
}) {
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const waiting = queue.waiting;
  const admit = async (requestId, role) => {
    try {
      await api(`/boards/${boardId}/waiting/admit`, { method: "POST", body: { requestId, role } });
      queue.forget(requestId);
      onChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось впустить.");
    }
  };
  const reject = async (requestId) => {
    try {
      await api(`/boards/${boardId}/waiting/reject`, { method: "POST", body: { requestId } });
      queue.forget(requestId);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось отклонить.");
    }
  };
  const changeRole = async (userId, role) => {
    try {
      await api(`/boards/${boardId}/members/${userId}`, { method: "PATCH", body: { role } });
      onChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось изменить роль.");
    }
  };
  const kickMember = async (userId, name) => {
    if (!window.confirm(`Выгнать ${name}? По ссылке он сможет попроситься снова.`)) return;
    try {
      await api(`/boards/${boardId}/members/${userId}`, { method: "DELETE" });
      onChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось выгнать участника.");
    }
  };
  const banMember = async (userId, name) => {
    if (!window.confirm(`Забанить ${name}? Он больше не войдёт на доску, даже по ссылке.`)) return;
    try {
      await api(`/boards/${boardId}/members/${userId}/ban`, { method: "POST" });
      onChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось забанить участника.");
    }
  };
  const changeGuestRole = async (guestId, role) => {
    try {
      await api(`/boards/${boardId}/guests/role`, { method: "POST", body: { guestId, role } });
      onChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось изменить роль.");
    }
  };
  const removeGuest = async (guestId, name) => {
    if (!window.confirm(`Выгнать ${name} с доски?`)) return;
    try {
      await api(`/boards/${boardId}/guests/remove`, { method: "POST", body: { requestId: guestId } });
      onChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось выгнать гостя.");
    }
  };
  const memberRows = members.map((member) => /* @__PURE__ */ jsxs("li", { className: "people__item", children: [
    /* @__PURE__ */ jsx("span", { className: "people__icon", title: roleTitle(member.role), children: /* @__PURE__ */ jsx(RoleIcon, { role: member.role }) }),
    /* @__PURE__ */ jsx("span", { className: "people__name", children: member.displayName }),
    canManage && member.role !== "owner" ? /* @__PURE__ */ jsxs(Menu, { label: `Действия: ${member.displayName}`, children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn-quiet menu__item",
          type: "button",
          onClick: () => changeRole(member.userId, member.role === "editor" ? "viewer" : "editor"),
          children: member.role === "editor" ? "Сделать наблюдателем" : "Сделать редактором"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn-quiet menu__item",
          type: "button",
          onClick: () => kickMember(member.userId, member.displayName),
          children: "Выгнать"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn-quiet menu__item menu__item--danger",
          type: "button",
          onClick: () => banMember(member.userId, member.displayName),
          children: "Забанить"
        }
      )
    ] }) : null
  ] }, `m-${member.userId}`));
  const guestRows = guests.map((guest) => /* @__PURE__ */ jsxs("li", { className: "people__item", children: [
    /* @__PURE__ */ jsx("span", { className: "people__icon", title: "Гость: зашёл по ссылке, без учётной записи", children: /* @__PURE__ */ jsx(IconGuest, {}) }),
    /* @__PURE__ */ jsx("span", { className: "people__name", children: guest.displayName }),
    /* @__PURE__ */ jsx("span", { className: "people__icon", title: roleTitle(guest.role), children: /* @__PURE__ */ jsx(RoleIcon, { role: guest.role }) }),
    canManage ? /* @__PURE__ */ jsxs(Menu, { label: `Действия: ${guest.displayName}`, children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn-quiet menu__item",
          type: "button",
          onClick: () => changeGuestRole(guest.guestId, guest.role === "editor" ? "viewer" : "editor"),
          children: guest.role === "editor" ? "Сделать наблюдателем" : "Сделать редактором"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn-quiet menu__item menu__item--danger",
          type: "button",
          onClick: () => removeGuest(guest.guestId, guest.displayName),
          children: "Выгнать"
        }
      )
    ] }) : null
  ] }, `g-${guest.guestId}`));
  const selfRow = guestName ? /* @__PURE__ */ jsxs("li", { className: "people__item", children: [
    /* @__PURE__ */ jsx("span", { className: "people__icon", title: "Вы зашли по ссылке, без учётной записи", children: /* @__PURE__ */ jsx(IconGuest, {}) }),
    /* @__PURE__ */ jsxs("span", { className: "people__name", children: [
      guestName,
      " — это вы"
    ] })
  ] }, "self") : null;
  const others = present.filter((person) => person.connectionId !== meConnectionId);
  const cursorOf = (connectionId) => cursors.find((cursor) => cursor.id === connectionId);
  const allRows = [...memberRows, ...guestRows, ...selfRow ? [selfRow] : []];
  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = allRows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  return /* @__PURE__ */ jsxs("div", { children: [
    error ? /* @__PURE__ */ jsx("p", { className: "note note-danger", children: error }) : null,
    others.length > 0 ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { className: "people__group", children: "Сейчас на доске" }),
      /* @__PURE__ */ jsx("ul", { className: "people", children: others.map((person) => {
        const at = cursorOf(person.connectionId);
        return /* @__PURE__ */ jsxs("li", { className: "people__item", children: [
          /* @__PURE__ */ jsx("span", { className: "people__icon", title: roleTitle(person.role), children: person.isGuest ? /* @__PURE__ */ jsx(IconGuest, {}) : /* @__PURE__ */ jsx(RoleIcon, { role: person.role }) }),
          /* @__PURE__ */ jsx(
            "button",
            {
              className: "people__goto",
              type: "button",
              disabled: !at,
              onClick: () => onGoTo(person.connectionId),
              title: at ? "Показать, где он сейчас" : "Пока не видно: он ещё не двигал указателем",
              children: person.displayName
            }
          )
        ] }, person.connectionId);
      }) })
    ] }) : null,
    canManage && waiting.length > 0 ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { className: "people__group", children: "Просятся на доску" }),
      /* @__PURE__ */ jsx("ul", { className: "people", children: waiting.map((request) => /* @__PURE__ */ jsxs("li", { className: "people__item people__item--waiting", children: [
        /* @__PURE__ */ jsxs("div", { className: "people__row", children: [
          /* @__PURE__ */ jsx("span", { className: "people__icon", children: request.isGuest ? /* @__PURE__ */ jsx(IconGuest, {}) : /* @__PURE__ */ jsx(IconViewer, {}) }),
          /* @__PURE__ */ jsx("span", { className: "people__name", children: request.displayName })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "people__row people__row--actions", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              className: "btn-primary btn-sm",
              type: "button",
              onClick: () => admit(request.requestId, "editor"),
              children: [
                /* @__PURE__ */ jsx(IconCheck, { size: 16 }),
                " Редактор"
              ]
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              className: "btn-quiet btn-sm",
              type: "button",
              onClick: () => admit(request.requestId, "viewer"),
              children: "Наблюдатель"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              className: "btn-tool",
              type: "button",
              onClick: () => reject(request.requestId),
              "aria-label": `Отклонить: ${request.displayName}`,
              title: "Отклонить",
              children: /* @__PURE__ */ jsx(IconClose, { size: 16 })
            }
          )
        ] })
      ] }, request.requestId)) })
    ] }) : null,
    /* @__PURE__ */ jsxs("p", { className: "people__group", children: [
      "На доске · ",
      allRows.length
    ] }),
    /* @__PURE__ */ jsx("ul", { className: "people", children: pageRows }),
    totalPages > 1 ? /* @__PURE__ */ jsxs("div", { className: "people__pager", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn-tool",
          type: "button",
          onClick: () => setPage((p2) => Math.max(0, p2 - 1)),
          disabled: currentPage === 0,
          "aria-label": "Предыдущая страница",
          children: /* @__PURE__ */ jsx(IconChevronLeft, { size: 16 })
        }
      ),
      /* @__PURE__ */ jsxs("span", { className: "text-muted small", children: [
        currentPage + 1,
        " / ",
        totalPages
      ] }),
      /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn-tool",
          type: "button",
          onClick: () => setPage((p2) => Math.min(totalPages - 1, p2 + 1)),
          disabled: currentPage === totalPages - 1,
          "aria-label": "Следующая страница",
          children: /* @__PURE__ */ jsx(IconChevronRight, { size: 16 })
        }
      )
    ] }) : null
  ] });
}
function RoleIcon({ role }) {
  if (role === "owner") return /* @__PURE__ */ jsx(IconOwner, {});
  if (role === "editor") return /* @__PURE__ */ jsx(IconEditor, {});
  return /* @__PURE__ */ jsx(IconViewer, {});
}
function roleTitle(role) {
  if (role === "owner") return "Владелец доски";
  if (role === "editor") return "Может рисовать";
  return "Только смотрит";
}
const CURSOR_COLORS = [
  "#C0392B",
  "#E67E22",
  "#D68910",
  "#B7950B",
  "#7D8C1F",
  "#4E9A2F",
  "#1E8449",
  "#149174",
  "#12877F",
  "#1595A6",
  "#1F78A8",
  "#2471A3",
  "#2E5FA3",
  "#4A4FA8",
  "#6C4AA8",
  "#8E44AD",
  "#A63A8F",
  "#B03A6E",
  "#B03A4E",
  "#8C5B3F"
];
function cursorColor(connectionId) {
  let hash = 0;
  for (let index = 0; index < connectionId.length; index += 1) {
    hash = hash * 31 + connectionId.charCodeAt(index) | 0;
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}
const cache = /* @__PURE__ */ new Map();
const listeners = /* @__PURE__ */ new Set();
function onImageLoaded(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function imageFor(ref) {
  const found = cache.get(ref);
  if (found) {
    return found.complete && found.naturalWidth > 0 ? found : null;
  }
  const image = new Image();
  cache.set(ref, image);
  image.onload = () => {
    for (const listener of listeners) listener();
  };
  image.onerror = () => {
    cache.delete(ref);
  };
  image.src = imageUrl(ref);
  return null;
}
function preload(refs) {
  const pending = refs.filter((ref) => imageFor(ref) === null);
  if (pending.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      if (pending.every((ref) => imageFor(ref) !== null)) {
        stop();
        resolve();
      }
    };
    const stop = onImageLoaded(done);
    window.setTimeout(() => {
      stop();
      resolve();
    }, 3e3);
  });
}
const MAX_ROWS = 20;
const MAX_COLS = 12;
const DEFAULT_ROWS = 3;
const DEFAULT_COLS = 3;
const MIN_CELL = 24;
function clampRows(value) {
  return Math.max(1, Math.min(MAX_ROWS, Math.round(value)));
}
function clampCols(value) {
  return Math.max(1, Math.min(MAX_COLS, Math.round(value)));
}
function tableBox(data) {
  const x1 = data.x1 ?? 0;
  const y1 = data.y1 ?? 0;
  const x2 = data.x2 ?? x1;
  const y2 = data.y2 ?? y1;
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.max(MIN_CELL, Math.abs(x2 - x1)),
    height: Math.max(MIN_CELL, Math.abs(y2 - y1)),
    rows: clampRows(data.rows ?? DEFAULT_ROWS),
    cols: clampCols(data.cols ?? DEFAULT_COLS)
  };
}
function cellRect(box, row, col) {
  const width = box.width / box.cols;
  const height = box.height / box.rows;
  return { x: box.x + col * width, y: box.y + row * height, width, height };
}
function cellAt(data, point) {
  const box = tableBox(data);
  if (point.x < box.x || point.x > box.x + box.width) return null;
  if (point.y < box.y || point.y > box.y + box.height) return null;
  const col = Math.min(box.cols - 1, Math.floor((point.x - box.x) / (box.width / box.cols)));
  const row = Math.min(box.rows - 1, Math.floor((point.y - box.y) / (box.height / box.rows)));
  return { row, col };
}
function cellText(data, row, col) {
  var _a;
  const box = tableBox(data);
  return ((_a = data.cells) == null ? void 0 : _a[row * box.cols + col]) ?? "";
}
function withCell(data, row, col, text) {
  const box = tableBox(data);
  const cells = normalizeCells(data.cells, box.rows, box.cols);
  cells[row * box.cols + col] = text;
  return { ...data, rows: box.rows, cols: box.cols, cells };
}
function normalizeCells(cells, rows, cols) {
  const result = new Array(rows * cols).fill("");
  if (!cells) return result;
  for (let index = 0; index < Math.min(cells.length, result.length); index += 1) {
    result[index] = cells[index] ?? "";
  }
  return result;
}
function resized$1(data, rows, cols) {
  const box = tableBox(data);
  const nextRows = clampRows(rows);
  const nextCols = clampCols(cols);
  const before = normalizeCells(data.cells, box.rows, box.cols);
  const after = new Array(nextRows * nextCols).fill("");
  for (let row = 0; row < Math.min(box.rows, nextRows); row += 1) {
    for (let col = 0; col < Math.min(box.cols, nextCols); col += 1) {
      after[row * nextCols + col] = before[row * box.cols + col];
    }
  }
  return { ...data, rows: nextRows, cols: nextCols, cells: after };
}
function dashOf(style, width) {
  const unit = Math.max(1, width);
  if (style === "dash") return [unit * 3, unit * 2];
  if (style === "dot") return [unit * 0.1, unit * 2];
  if (style === "dashdot") return [unit * 3, unit * 1.5, unit * 0.1, unit * 1.5];
  return [];
}
function applyStyle(context, data) {
  context.strokeStyle = data.color;
  context.fillStyle = data.color;
  context.lineWidth = data.width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalAlpha = data.opacity ?? 1;
  context.setLineDash(dashOf(data.lineStyle, data.width));
}
function cornersOf(data) {
  const x1 = data.x1 ?? 0;
  const y1 = data.y1 ?? 0;
  const x2 = data.x2 ?? 0;
  const y2 = data.y2 ?? 0;
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  const midX = (left + right) / 2;
  const inset = (right - left) * 0.25;
  const at = (x, y) => ({ x, y, p: 1 });
  switch (data.shape) {
    case "triangle":
      return [at(midX, top), at(right, bottom), at(left, bottom)];
    case "trapezoid":
      return [at(left + inset, top), at(right - inset, top), at(right, bottom), at(left, bottom)];
    case "parallelogram":
      return [at(left + inset, top), at(right, top), at(right - inset, bottom), at(left, bottom)];
    case "rhombus":
      return [at(midX, top), at(right, (top + bottom) / 2), at(midX, bottom), at(left, (top + bottom) / 2)];
    default:
      return [at(left, top), at(right, top), at(right, bottom), at(left, bottom)];
  }
}
function drawStroke(context, data) {
  const points = data.points;
  if (!points || points.length === 0) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  if (points.length === 1) context.lineTo(points[0].x + 0.01, points[0].y);
  context.stroke();
}
function drawArrowHead(context, data) {
  const x1 = data.x1 ?? 0;
  const y1 = data.y1 ?? 0;
  const x2 = data.x2 ?? 0;
  const y2 = data.y2 ?? 0;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = Math.max(data.width * 3, 8);
  context.save();
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(x2, y2);
  context.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6));
  context.moveTo(x2, y2);
  context.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6));
  context.stroke();
  context.restore();
}
function drawShape(context, data) {
  if (data.shape === "line" || data.shape === "arrow") {
    context.beginPath();
    context.moveTo(data.x1 ?? 0, data.y1 ?? 0);
    context.lineTo(data.x2 ?? 0, data.y2 ?? 0);
    context.stroke();
    if (data.shape === "arrow") drawArrowHead(context, data);
    return;
  }
  if (data.shape === "ellipse") {
    const x1 = data.x1 ?? 0;
    const y1 = data.y1 ?? 0;
    const x2 = data.x2 ?? 0;
    const y2 = data.y2 ?? 0;
    context.beginPath();
    context.ellipse(
      (x1 + x2) / 2,
      (y1 + y2) / 2,
      Math.abs(x2 - x1) / 2,
      Math.abs(y2 - y1) / 2,
      0,
      0,
      Math.PI * 2
    );
    context.stroke();
    return;
  }
  const corners = cornersOf(data);
  context.beginPath();
  context.moveTo(corners[0].x, corners[0].y);
  for (const corner of corners.slice(1)) context.lineTo(corner.x, corner.y);
  context.closePath();
  context.stroke();
}
function fontOf(data) {
  return `${data.fontSize ?? 24}px Manrope, system-ui, sans-serif`;
}
function drawText(context, data) {
  if (!data.text) return;
  context.setLineDash([]);
  context.font = fontOf(data);
  context.textBaseline = "top";
  const lineHeight = (data.fontSize ?? 24) * 1.25;
  data.text.split("\n").forEach((line, index) => {
    context.fillText(line, data.x1 ?? 0, (data.y1 ?? 0) + index * lineHeight);
  });
}
function drawGrid(context, style, color, width, height, offsetX, offsetY, scale) {
  if (style === "none") return;
  let step = 32 * scale;
  while (step < 12) step *= 4;
  while (step > 160) step /= 2;
  const startX = offsetX % step;
  const startY = offsetY % step;
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 1;
  if (style === "dot") {
    for (let x = startX; x < width; x += step) {
      for (let y = startY; y < height; y += step) {
        context.beginPath();
        context.arc(x, y, 1.2, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
    return;
  }
  const diagonals = (down) => {
    context.beginPath();
    for (let x = startX - height; x < width + height; x += step) {
      context.moveTo(x, down ? 0 : height);
      context.lineTo(x + height, down ? height : 0);
    }
    context.stroke();
  };
  const ruled = (spacing) => {
    context.lineWidth = 0.8;
    context.beginPath();
    for (let y = offsetY % spacing; y < height; y += spacing) {
      context.moveTo(0, y);
      context.lineTo(width, y);
    }
    context.stroke();
  };
  if (style === "rhombus") {
    diagonals(true);
    diagonals(false);
    context.restore();
    return;
  }
  if (style === "triangle") {
    ruled(step);
    context.lineWidth = 1;
    diagonals(true);
    diagonals(false);
    context.restore();
    return;
  }
  if (style === "line") {
    ruled(step);
    context.restore();
    return;
  }
  if (style === "wide") {
    ruled(step * 2);
    context.restore();
    return;
  }
  const bold = style === "graph" ? 5 : 0;
  const line = (from, limit, vertical, index2) => {
    context.beginPath();
    context.lineWidth = bold > 0 && index2 % bold === 0 ? 1.5 : 0.6;
    if (vertical) {
      context.moveTo(from, 0);
      context.lineTo(from, limit);
    } else {
      context.moveTo(0, from);
      context.lineTo(limit, from);
    }
    context.stroke();
  };
  let index = 0;
  for (let x = startX; x < width; x += step) line(x, height, true, index++);
  index = 0;
  for (let y = startY; y < height; y += step) line(y, width, false, index++);
  if (style === "hybrid") {
    context.lineWidth = 0.6;
    diagonals(true);
  }
  context.restore();
}
function drawImage(context, data, imageRef) {
  const x = Math.min(data.x1 ?? 0, data.x2 ?? 0);
  const y = Math.min(data.y1 ?? 0, data.y2 ?? 0);
  const width = Math.abs((data.x2 ?? 0) - (data.x1 ?? 0));
  const height = Math.abs((data.y2 ?? 0) - (data.y1 ?? 0));
  const loaded = imageRef ? imageFor(imageRef) : null;
  if (loaded) {
    context.drawImage(loaded, x, y, width, height);
    return;
  }
  context.save();
  context.globalAlpha = 0.5;
  context.setLineDash([6, 6]);
  context.lineWidth = 1;
  context.strokeRect(x, y, width, height);
  context.restore();
}
function drawTable(context, data) {
  var _a;
  const box = tableBox(data);
  context.setLineDash([]);
  context.lineWidth = Math.max(1, data.width / 2);
  context.beginPath();
  for (let col = 0; col <= box.cols; col += 1) {
    const x = box.x + box.width / box.cols * col;
    context.moveTo(x, box.y);
    context.lineTo(x, box.y + box.height);
  }
  for (let row = 0; row <= box.rows; row += 1) {
    const y = box.y + box.height / box.rows * row;
    context.moveTo(box.x, y);
    context.lineTo(box.x + box.width, y);
  }
  context.stroke();
  if (!((_a = data.cells) == null ? void 0 : _a.length)) return;
  context.font = fontOf(data);
  context.textBaseline = "middle";
  const padding = Math.min(6, box.width / box.cols / 6);
  for (let row = 0; row < box.rows; row += 1) {
    for (let col = 0; col < box.cols; col += 1) {
      const text = data.cells[row * box.cols + col];
      if (!text) continue;
      const cell = cellRect(box, row, col);
      context.save();
      context.beginPath();
      context.rect(cell.x, cell.y, cell.width, cell.height);
      context.clip();
      context.fillText(text, cell.x + padding, cell.y + cell.height / 2);
      context.restore();
    }
  }
}
function drawItem(context, type, data, imageRef = null) {
  context.save();
  applyStyle(context, data);
  if (type === "text") drawText(context, data);
  else if (type === "table") drawTable(context, data);
  else if (type === "shape") drawShape(context, data);
  else if (type === "image") drawImage(context, data, imageRef);
  else drawStroke(context, data);
  context.restore();
}
function translate(data, dx, dy) {
  var _a;
  return {
    ...data,
    points: (_a = data.points) == null ? void 0 : _a.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })),
    x1: data.x1 === void 0 ? void 0 : data.x1 + dx,
    y1: data.y1 === void 0 ? void 0 : data.y1 + dy,
    x2: data.x2 === void 0 ? void 0 : data.x2 + dx,
    y2: data.y2 === void 0 ? void 0 : data.y2 + dy
  };
}
function pointsOf(data) {
  var _a;
  if ((_a = data.points) == null ? void 0 : _a.length) return data.points;
  if (data.x1 === void 0 || data.y1 === void 0) return [];
  if (data.text !== void 0) {
    const x2 = data.x2 ?? data.x1;
    const y2 = data.y2 ?? data.y1;
    return [
      { x: data.x1, y: data.y1, p: 1 },
      { x: x2, y: data.y1, p: 1 },
      { x: x2, y: y2, p: 1 },
      { x: data.x1, y: y2, p: 1 }
    ];
  }
  if (data.x2 === void 0 || data.y2 === void 0) return [];
  if (data.shape === "line" || data.shape === "arrow") {
    return [
      { x: data.x1, y: data.y1, p: 1 },
      { x: data.x2, y: data.y2, p: 1 }
    ];
  }
  const corners = cornersOf(data);
  return data.shape ? [...corners, corners[0]] : corners;
}
function boundsOf(items) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of items) {
    const pad = item.data.width / 2;
    for (const point of pointsOf(item.data)) {
      minX = Math.min(minX, point.x - pad);
      minY = Math.min(minY, point.y - pad);
      maxX = Math.max(maxX, point.x + pad);
      maxY = Math.max(maxY, point.y + pad);
    }
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
function distanceToSegment(point, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}
function hits(item, point, radius) {
  const points = pointsOf(item.data);
  const reach = radius + item.data.width / 2;
  if (item.type === "text" || item.type === "image" || item.type === "table" || item.data.shape === "ellipse") {
    const box = boundsOf([item]);
    return Boolean(box) && point.x >= box.x - radius && point.x <= box.x + box.width + radius && point.y >= box.y - radius && point.y <= box.y + box.height + radius;
  }
  if (points.length === 1) return distanceToSegment(point, points[0], points[0]) <= reach;
  for (let index = 1; index < points.length; index += 1) {
    if (distanceToSegment(point, points[index - 1], points[index]) <= reach) return true;
  }
  return false;
}
function topmostAt(items, point, radius) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (hits(items[index], point, radius)) return items[index];
  }
  return null;
}
function within(items, area) {
  return items.filter((item) => {
    const points = pointsOf(item.data);
    if (points.length === 0) return false;
    return points.every((point) => point.x >= area.x && point.x <= area.x + area.width && point.y >= area.y && point.y <= area.y + area.height);
  });
}
function rectFrom(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  };
}
function measureText(text, fontSize) {
  const context = document.createElement("canvas").getContext("2d");
  const lines = text.split("\n");
  const lineHeight = fontSize * 1.25;
  if (!context) return { width: fontSize * lines[0].length * 0.6, height: lines.length * lineHeight };
  context.font = `${fontSize}px Manrope, system-ui, sans-serif`;
  return {
    width: Math.max(...lines.map((line) => context.measureText(line).width), 1),
    height: lines.length * lineHeight
  };
}
const HANDLE_SIZE = 9;
function handlesFor(item, box) {
  if (item.type === "stroke") return [];
  if (item.data.shape === "line" || item.data.shape === "arrow") {
    return [
      { id: "p1", x: item.data.x1 ?? 0, y: item.data.y1 ?? 0, cursor: "move" },
      { id: "p2", x: item.data.x2 ?? 0, y: item.data.y2 ?? 0, cursor: "move" }
    ];
  }
  const { x, y, width, height } = box;
  const midX = x + width / 2;
  const midY = y + height / 2;
  return [
    { id: "nw", x, y, cursor: "nwse-resize" },
    { id: "n", x: midX, y, cursor: "ns-resize" },
    { id: "ne", x: x + width, y, cursor: "nesw-resize" },
    { id: "e", x: x + width, y: midY, cursor: "ew-resize" },
    { id: "se", x: x + width, y: y + height, cursor: "nwse-resize" },
    { id: "s", x: midX, y: y + height, cursor: "ns-resize" },
    { id: "sw", x, y: y + height, cursor: "nesw-resize" },
    { id: "w", x, y: midY, cursor: "ew-resize" }
  ];
}
function resized(data, origin, handle, dx, dy) {
  if (handle === "p1") return { ...data, x1: (data.x1 ?? 0) + dx, y1: (data.y1 ?? 0) + dy };
  if (handle === "p2") return { ...data, x2: (data.x2 ?? 0) + dx, y2: (data.y2 ?? 0) + dy };
  const left = origin.x + (handle.includes("w") ? dx : 0);
  const right = origin.x + origin.width + (handle.includes("e") ? dx : 0);
  const top = origin.y + (handle.startsWith("n") ? dy : 0);
  const bottom = origin.y + origin.height + (handle.startsWith("s") ? dy : 0);
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  if (data.ratio !== void 0 && data.ratio > 0) {
    const byWidth = origin.width > 0 ? width / origin.width : 1;
    const byHeight = origin.height > 0 ? height / origin.height : 1;
    const horizontal = handle === "e" || handle === "w";
    const vertical = handle === "n" || handle === "s";
    const factor = horizontal ? byWidth : vertical ? byHeight : Math.max(byWidth, byHeight);
    const nextWidth = Math.max(8, origin.width * factor);
    const nextHeight = nextWidth / data.ratio;
    const x = handle.includes("w") ? origin.x + origin.width - nextWidth : origin.x;
    const y = handle.startsWith("n") ? origin.y + origin.height - nextHeight : origin.y;
    return { ...data, x1: x, y1: y, x2: x + nextWidth, y2: y + nextHeight };
  }
  if (data.text !== void 0) {
    const byWidth = origin.width > 0 ? width / origin.width : 1;
    const byHeight = origin.height > 0 ? height / origin.height : 1;
    const horizontal = handle === "e" || handle === "w";
    const vertical = handle === "n" || handle === "s";
    const factor = horizontal ? byWidth : vertical ? byHeight : Math.max(byWidth, byHeight);
    const fontSize = Math.max(6, (data.fontSize ?? 24) * factor);
    const box = measureText(data.text ?? "", fontSize);
    return {
      ...data,
      x1: handle.includes("w") ? origin.x + origin.width - box.width : left,
      y1: handle.startsWith("n") ? origin.y + origin.height - box.height : top,
      x2: (handle.includes("w") ? origin.x + origin.width - box.width : left) + box.width,
      y2: (handle.startsWith("n") ? origin.y + origin.height - box.height : top) + box.height,
      fontSize
    };
  }
  return { ...data, x1: left, y1: top, x2: left + width, y2: top + height };
}
const MIN_SCALE = 0.02;
const MAX_SCALE = 20;
const INITIAL_VIEWPORT = { x: 0, y: 0, scale: 1 };
function toWorld(viewport, screenX, screenY) {
  return {
    x: (screenX - viewport.x) / viewport.scale,
    y: (screenY - viewport.y) / viewport.scale
  };
}
function toScreen(viewport, worldX, worldY) {
  return {
    x: worldX * viewport.scale + viewport.x,
    y: worldY * viewport.scale + viewport.y
  };
}
function clampScale(scale) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}
function zoomAt(viewport, screenX, screenY, factor) {
  const scale = clampScale(viewport.scale * factor);
  const world = toWorld(viewport, screenX, screenY);
  return {
    scale,
    x: screenX - world.x * scale,
    y: screenY - world.y * scale
  };
}
function centerOn(viewport, worldX, worldY, width, height, scale = viewport.scale) {
  return {
    scale,
    x: width / 2 - worldX * scale,
    y: height / 2 - worldY * scale
  };
}
function fitToContent(points, width, height, padding = 48) {
  if (points.length === 0 || width <= 0 || height <= 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const contentWidth = Math.max(1, maxX - minX);
  const contentHeight = Math.max(1, maxY - minY);
  const scale = clampScale(Math.min(
    (width - padding * 2) / contentWidth,
    (height - padding * 2) / contentHeight
  ));
  return {
    scale,
    x: width / 2 - (minX + maxX) / 2 * scale,
    y: height / 2 - (minY + maxY) / 2 * scale
  };
}
const CURSOR_INTERVAL_MS = 50;
const POINT_BATCH_MS = 50;
const ERASE_RADIUS = 8;
function BoardCanvas({
  hub,
  tool,
  settings,
  viewport,
  background,
  selection,
  onViewport,
  onSize,
  onSelection,
  onMoved,
  onCommit,
  onDrawStart,
  onTextAt,
  onCellAt,
  onErase,
  onEraseEnd
}) {
  const canvas = useRef(null);
  const box = useRef(null);
  const drawing = useRef(null);
  const panning = useRef(null);
  const pointers = useRef(/* @__PURE__ */ new Map());
  const pinch = useRef(null);
  const blockUntilRelease = useRef(false);
  const penSeen = useRef(false);
  const marquee = useRef(null);
  const moving = useRef(null);
  const erasing = useRef(null);
  const tapping = useRef(null);
  const resizing = useRef(null);
  const lastCursor = useRef(0);
  const lastBatch = useRef(0);
  const frame = useRef(0);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const drawnBy = () => {
    const { tool: active, settings: current } = latest.current;
    if (active === "table") {
      const it = current.table;
      return {
        type: "table",
        data: {
          color: it.color,
          width: it.width,
          fontSize: it.fontSize,
          rows: it.rows,
          cols: it.cols,
          cells: []
        }
      };
    }
    if (active === "shapes") {
      const it = current.shapes;
      return {
        type: "shape",
        data: {
          color: it.color,
          width: it.width,
          opacity: it.opacity / 100,
          shape: it.shape,
          lineStyle: it.lineStyle
        }
      };
    }
    const pen = active === "pen2" ? current.pen2 : active === "marker" ? current.marker : current.pen1;
    return { type: "stroke", data: { color: pen.color, width: pen.width, opacity: pen.opacity / 100 } };
  };
  const latest = useRef({ viewport, tool, settings, spaceHeld, selection, background, items: hub.items });
  latest.current = { viewport, tool, settings, spaceHeld, selection, background, items: hub.items };
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      setSize(next);
      onSize(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [onSize]);
  useEffect(() => {
    const down = (event) => {
      if (event.code !== "Space" || event.repeat) return;
      const target = event.target;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      event.preventDefault();
      setSpaceHeld(true);
    };
    const up = (event) => {
      if (event.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  const redraw = useCallback(() => {
    var _a;
    const element = canvas.current;
    const context = element == null ? void 0 : element.getContext("2d");
    if (!element || !context) return;
    const ratio2 = window.devicePixelRatio || 1;
    const view = latest.current.viewport;
    context.setTransform(ratio2, 0, 0, ratio2, 0, 0);
    context.clearRect(0, 0, element.width, element.height);
    const view0 = latest.current.background;
    context.fillStyle = view0.background;
    context.fillRect(0, 0, element.width / ratio2, element.height / ratio2);
    drawGrid(
      context,
      view0.gridStyle,
      view0.gridColor,
      element.width / ratio2,
      element.height / ratio2,
      view.x,
      view.y,
      view.scale
    );
    context.setTransform(
      ratio2 * view.scale,
      0,
      0,
      ratio2 * view.scale,
      ratio2 * view.x,
      ratio2 * view.y
    );
    const drag = moving.current;
    const chosen = new Set(latest.current.selection);
    for (const item of hub.items) {
      const grip = resizing.current;
      const shifted = (grip == null ? void 0 : grip.itemId) === item.id ? grip.data : drag && chosen.has(item.id) ? translate(item.data, drag.dx, drag.dy) : item.data;
      drawItem(context, item.type, shifted, item.imageRef);
    }
    for (const stroke of hub.live.values()) drawItem(context, stroke.type, stroke.data);
    if (drawing.current) {
      const brush = drawnBy();
      drawItem(context, brush.type, { ...brush.data, ...drawing.current.preview() });
    }
    const hair = 1 / view.scale;
    const selected = hub.items.filter((item) => chosen.has(item.id));
    const box2 = boundsOf(selected.map((item) => drag ? { ...item, data: translate(item.data, drag.dx, drag.dy) } : item));
    if (box2) outline(context, box2, "#2E5FA3", hair, [6 * hair, 4 * hair]);
    if (marquee.current) {
      outline(context, rectFrom(marquee.current.from, marquee.current.to), "#2E5FA3", hair, [4 * hair, 3 * hair]);
    }
    if (selected.length === 1 && !drag) {
      const single = selected[0];
      const preview = ((_a = resizing.current) == null ? void 0 : _a.itemId) === single.id ? resizing.current.data : single.data;
      const grips = handlesFor(single, boundsOf([{ ...single, data: preview }]));
      for (const grip of grips) {
        const half = HANDLE_SIZE / 2 / view.scale;
        context.save();
        context.setLineDash([]);
        context.fillStyle = "#fff";
        context.strokeStyle = "#2E5FA3";
        context.lineWidth = hair * 1.5;
        context.beginPath();
        context.rect(grip.x - half, grip.y - half, half * 2, half * 2);
        context.fill();
        context.stroke();
        context.restore();
      }
    }
  }, [hub.items, hub.live]);
  const schedule = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(redraw);
  }, [redraw]);
  useEffect(() => {
    schedule();
    return () => cancelAnimationFrame(frame.current);
  }, [schedule, size, viewport, settings, tool, background]);
  useEffect(() => onImageLoaded(schedule), [schedule]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const onWheel = (event) => {
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 15e-4);
      onViewport(zoomAt(
        latest.current.viewport,
        event.clientX - bounds.left,
        event.clientY - bounds.top,
        factor
      ));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [onViewport]);
  const screenPoint = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const worldPoint = (event) => {
    const screen = screenPoint(event);
    const world = toWorld(latest.current.viewport, screen.x, screen.y);
    return {
      x: world.x,
      y: world.y,
      // Нажим есть только у пера. У мыши браузер отдаёт 0.5 при нажатой
      // кнопке — принимать это за половинный нажим значило бы рисовать
      // мышью вдвое тоньше, чем просили.
      p: event.pointerType === "pen" ? event.pressure || 0.5 : 1
    };
  };
  const cancelStroke = () => {
    const stroke = drawing.current;
    if (!stroke) return;
    drawing.current = null;
    hub.cancelItem(stroke.tempId);
    schedule();
  };
  const touches = () => [...pointers.current.entries()].filter(([, p2]) => p2.type === "touch");
  const startPinch = () => {
    const [first, second] = touches().slice(0, 2).map(([, p2]) => p2);
    if (!first || !second) return;
    pinch.current = {
      distance: Math.hypot(second.x - first.x, second.y - first.y),
      centerX: (first.x + second.x) / 2,
      centerY: (first.y + second.y) / 2,
      origin: latest.current.viewport
    };
  };
  const wantsPan = (event) => latest.current.tool === "hand" || latest.current.spaceHeld || event.button === 1 || !hub.canEdit || event.pointerType === "touch" && penSeen.current;
  const onPointerDown = (event) => {
    event.preventDefault();
    if (event.pointerType === "pen") penSeen.current = true;
    if (pointers.current.size === 0) blockUntilRelease.current = false;
    const screen = screenPoint(event);
    pointers.current.set(event.pointerId, { ...screen, type: event.pointerType });
    if (touches().length >= 2) {
      cancelStroke();
      panning.current = null;
      erasing.current = null;
      tapping.current = null;
      blockUntilRelease.current = true;
      startPinch();
      return;
    }
    if (blockUntilRelease.current) return;
    if (wantsPan(event)) {
      event.currentTarget.setPointerCapture(event.pointerId);
      panning.current = {
        pointerId: event.pointerId,
        startX: screen.x,
        startY: screen.y,
        origin: latest.current.viewport
      };
      return;
    }
    if (!hub.canEdit) return;
    const point = worldPoint(event);
    const reach = latest.current.tool === "eraser" ? latest.current.settings.eraser.size / 2 : ERASE_RADIUS / latest.current.viewport.scale;
    if (latest.current.tool === "eraser") {
      event.currentTarget.setPointerCapture(event.pointerId);
      erasing.current = event.pointerId;
      onErase(point, reach);
      return;
    }
    if (latest.current.tool === "select") {
      event.currentTarget.setPointerCapture(event.pointerId);
      const chosen = latest.current.selection;
      if (chosen.length === 1) {
        const single = latest.current.items.find((item) => item.id === chosen[0]);
        const bounds = single ? boundsOf([single]) : null;
        if (single && bounds) {
          const grip = handlesFor(single, bounds).find((candidate) => Math.abs(candidate.x - point.x) <= HANDLE_SIZE / latest.current.viewport.scale && Math.abs(candidate.y - point.y) <= HANDLE_SIZE / latest.current.viewport.scale);
          if (grip) {
            resizing.current = {
              pointerId: event.pointerId,
              itemId: single.id,
              handle: grip.id,
              origin: rawBounds(single.data, bounds),
              from: point,
              data: single.data
            };
            return;
          }
        }
      }
      const hit = topmostAt(hub.items, point, reach);
      if (!hit) {
        if (!event.ctrlKey && !event.metaKey) onSelection([]);
        marquee.current = { pointerId: event.pointerId, from: point, to: point };
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        onSelection(chosen.includes(hit.id) ? chosen.filter((id) => id !== hit.id) : [...chosen, hit.id]);
        return;
      }
      const repeat = chosen.length === 1 && chosen[0] === hit.id;
      if (!chosen.includes(hit.id)) onSelection([hit.id]);
      moving.current = {
        pointerId: event.pointerId,
        from: point,
        dx: 0,
        dy: 0,
        cell: hit.type === "table" && repeat ? hit.id : null
      };
      return;
    }
    if (latest.current.tool === "text") {
      event.currentTarget.setPointerCapture(event.pointerId);
      tapping.current = { pointerId: event.pointerId, at: point, screen: screenPoint(event) };
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    onDrawStart();
    const tempId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const brush = drawnBy();
    const record = {
      pointerId: event.pointerId,
      tempId,
      points: [point],
      sent: 0,
      from: point,
      to: point,
      preview: () => brush.type === "shape" || brush.type === "table" ? { x1: record.from.x, y1: record.from.y, x2: record.to.x, y2: record.to.y } : { points: record.points }
    };
    drawing.current = record;
    if (brush.type === "stroke") {
      hub.beginItem(tempId, brush.type, { ...brush.data, points: [point] });
    }
  };
  const onPointerMove = (event) => {
    var _a;
    pointers.current.set(event.pointerId, { ...screenPoint(event), type: event.pointerType });
    if (!pinch.current && touches().length >= 2) {
      cancelStroke();
      panning.current = null;
      erasing.current = null;
      tapping.current = null;
      blockUntilRelease.current = true;
      startPinch();
      return;
    }
    const gesture = pinch.current;
    if (gesture) {
      const [first, second] = touches().slice(0, 2).map(([, p2]) => p2);
      if (!first || !second) return;
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      if (gesture.distance <= 0) return;
      const scale = clampScale(gesture.origin.scale * (distance / gesture.distance));
      const world = toWorld(gesture.origin, gesture.centerX, gesture.centerY);
      onViewport({
        scale,
        x: (first.x + second.x) / 2 - world.x * scale,
        y: (first.y + second.y) / 2 - world.y * scale
      });
      return;
    }
    if (blockUntilRelease.current) return;
    const pan = panning.current;
    if (pan && pan.pointerId === event.pointerId) {
      const screen = screenPoint(event);
      onViewport({
        ...pan.origin,
        x: pan.origin.x + (screen.x - pan.startX),
        y: pan.origin.y + (screen.y - pan.startY)
      });
      return;
    }
    const point = worldPoint(event);
    if (((_a = marquee.current) == null ? void 0 : _a.pointerId) === event.pointerId) {
      marquee.current.to = point;
      schedule();
      return;
    }
    if (erasing.current === event.pointerId) {
      onErase(point, latest.current.settings.eraser.size / 2);
      return;
    }
    const grip = resizing.current;
    if ((grip == null ? void 0 : grip.pointerId) === event.pointerId) {
      const source = latest.current.items.find((item) => item.id === grip.itemId);
      if (source) {
        grip.data = resized(source.data, grip.origin, grip.handle, point.x - grip.from.x, point.y - grip.from.y);
      }
      schedule();
      return;
    }
    const drag = moving.current;
    if ((drag == null ? void 0 : drag.pointerId) === event.pointerId) {
      drag.dx = point.x - drag.from.x;
      drag.dy = point.y - drag.from.y;
      schedule();
      return;
    }
    const now = performance.now();
    if (now - lastCursor.current >= CURSOR_INTERVAL_MS) {
      lastCursor.current = now;
      hub.sendCursor(point.x, point.y);
    }
    const stroke = drawing.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    if (latest.current.tool === "shapes" || latest.current.tool === "table") {
      stroke.to = shiftAware(event, stroke.from, point);
      schedule();
      return;
    }
    stroke.points.push(point);
    if (now - lastBatch.current >= POINT_BATCH_MS) {
      lastBatch.current = now;
      const fresh = stroke.points.slice(stroke.sent);
      stroke.sent = stroke.points.length;
      if (fresh.length > 0) hub.appendPoints(stroke.tempId, fresh);
    }
    schedule();
  };
  const finish = (event) => {
    pointers.current.delete(event.pointerId);
    if (touches().length < 2) pinch.current = null;
    if (pointers.current.size === 0) blockUntilRelease.current = false;
    panning.current = null;
    if (erasing.current === event.pointerId) {
      erasing.current = null;
      onEraseEnd();
      return;
    }
    const tap = tapping.current;
    if ((tap == null ? void 0 : tap.pointerId) === event.pointerId) {
      tapping.current = null;
      const moved = Math.hypot(
        screenPoint(event).x - tap.screen.x,
        screenPoint(event).y - tap.screen.y
      );
      if (!blockUntilRelease.current && pointers.current.size === 0 && moved < 12) {
        onTextAt(tap.at);
      }
      return;
    }
    const band = marquee.current;
    if ((band == null ? void 0 : band.pointerId) === event.pointerId) {
      marquee.current = null;
      const chosen = within(latest.current.items, rectFrom(band.from, band.to));
      if (chosen.length > 0) onSelection(chosen.map((item) => item.id));
      schedule();
      return;
    }
    const grip = resizing.current;
    if ((grip == null ? void 0 : grip.pointerId) === event.pointerId) {
      resizing.current = null;
      hub.updateItem(grip.itemId, grip.data);
      schedule();
      return;
    }
    const drag = moving.current;
    if ((drag == null ? void 0 : drag.pointerId) === event.pointerId) {
      moving.current = null;
      if (drag.dx !== 0 || drag.dy !== 0) {
        onMoved(latest.current.selection, drag.dx, drag.dy);
      } else if (drag.cell !== null) {
        onCellAt(drag.cell, drag.from);
      }
      schedule();
      return;
    }
    const stroke = drawing.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    drawing.current = null;
    const brush = drawnBy();
    const geometry = stroke.preview();
    const meaningful = brush.type === "shape" || brush.type === "table" ? Math.hypot(stroke.to.x - stroke.from.x, stroke.to.y - stroke.from.y) > 2 : stroke.points.length > 1;
    if (meaningful) {
      onCommit(brush.type, { ...brush.data, ...geometry }, stroke.tempId);
    } else if (brush.type === "stroke") {
      hub.cancelItem(stroke.tempId);
    }
    schedule();
  };
  const ratio = window.devicePixelRatio || 1;
  const panMode = tool === "hand" || spaceHeld || !hub.canEdit;
  return /* @__PURE__ */ jsxs("div", { className: "canvas-host", ref: box, children: [
    /* @__PURE__ */ jsx(
      "canvas",
      {
        ref: canvas,
        width: Math.max(1, Math.round(size.width * ratio)),
        height: Math.max(1, Math.round(size.height * ratio)),
        style: { width: size.width, height: size.height },
        className: `canvas-host__surface canvas-host__surface--${panMode ? "hand" : tool}`,
        onPointerDown,
        onPointerMove,
        onPointerUp: finish,
        onPointerCancel: finish,
        onContextMenu: (event) => event.preventDefault()
      }
    ),
    hub.cursors.filter((cursor) => cursor.id !== hub.me).map((cursor) => {
      const screen = toScreen(viewport, cursor.x, cursor.y);
      const tint = cursorColor(cursor.id);
      return /* @__PURE__ */ jsxs("span", { className: "canvas-cursor", style: { left: screen.x, top: screen.y }, children: [
        /* @__PURE__ */ jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", "aria-hidden": "true", children: /* @__PURE__ */ jsx("path", { d: "M5 3l14 8-6 1.5L10 19z", fill: tint, stroke: "#fff", strokeWidth: "1.5" }) }),
        /* @__PURE__ */ jsx("span", { className: "canvas-cursor__name", style: { background: tint }, children: cursor.name })
      ] }, cursor.id);
    })
  ] });
}
function outline(context, box, color, lineWidth, dash) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.setLineDash(dash);
  context.strokeRect(box.x, box.y, box.width, box.height);
  context.restore();
}
function rawBounds(data, fallback) {
  if (data.x1 === void 0 || data.y1 === void 0) return fallback;
  const x2 = data.x2 ?? data.x1;
  const y2 = data.y2 ?? data.y1;
  return {
    x: Math.min(data.x1, x2),
    y: Math.min(data.y1, y2),
    width: Math.abs(x2 - data.x1),
    height: Math.abs(y2 - data.y1)
  };
}
function shiftAware(event, from, to) {
  if (!event.shiftKey) return to;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return to;
  const step = Math.PI / 12;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length, p: 1 };
}
let loading = null;
async function pdfjs() {
  if (!loading) {
    loading = (async () => {
      const library = await import("pdfjs-dist");
      const worker = await import("./assets/pdf.worker.min-VwjnofJe.js");
      library.GlobalWorkerOptions.workerSrc = worker.default;
      return library;
    })();
  }
  return loading;
}
async function openDocument(bytes) {
  const library = await pdfjs();
  return library.getDocument({ data: bytes.slice(0) }).promise;
}
async function renderPage(document2, pageNumber, targetWidth) {
  const page = await document2.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: targetWidth / base.width });
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Холст недоступен.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}
function cropCanvas(source, area) {
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(area.width));
  canvas.height = Math.max(1, Math.round(area.height));
  const context = canvas.getContext("2d");
  if (context) {
    context.drawImage(
      source,
      Math.round(area.x),
      Math.round(area.y),
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height
    );
  }
  return canvas;
}
function toPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Не удалось получить картинку.")),
      "image/png"
    );
  });
}
function canvasFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      var _a;
      const canvas = window.document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      (_a = canvas.getContext("2d")) == null ? void 0 : _a.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Это не картинка."));
    };
    image.src = url;
  });
}
const INSERT_WIDTH = 1600;
const CROP_WIDTH = 1100;
const PAGE_STEP = 60;
function FilesPanel({ onInsert, onClose }) {
  const [library, setLibrary] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [keep, setKeep] = useState(true);
  const [view, setView] = useState("library");
  const [document2, setDocument] = useState(null);
  const [documentName, setDocumentName] = useState("");
  const [thumbs, setThumbs] = useState([]);
  const [shown, setShown] = useState(PAGE_STEP);
  const [selected, setSelected] = useState([]);
  const [source, setSource] = useState(null);
  const [area, setArea] = useState(null);
  const sourceUrl = useMemo(() => (source == null ? void 0 : source.toDataURL()) ?? "", [source]);
  const preview = useRef(null);
  const dragFrom = useRef(null);
  const load = useCallback(async () => {
    try {
      setLibrary(await api("/files"));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось открыть библиотеку.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!document2) return;
    let alive = true;
    (async () => {
      const limit = Math.min(shown, document2.numPages);
      for (let page = thumbs.length + 1; page <= limit; page += 1) {
        if (!alive) return;
        try {
          const canvas = await renderPage(document2, page, 150);
          if (!alive) return;
          setThumbs((current) => current.length === page - 1 ? [...current, canvas.toDataURL()] : current);
        } catch {
          return;
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [document2, shown, thumbs.length]);
  const fail = (reason, fallback) => {
    setError(reason instanceof ApiError ? reason.message : fallback);
    setBusy(null);
  };
  const open = async (bytes, name, type) => {
    setBusy("Открываем файл…");
    setError(null);
    try {
      if (type === "application/pdf") {
        const opened = await openDocument(bytes);
        setDocument(opened);
        setDocumentName(name);
        setThumbs([]);
        setShown(PAGE_STEP);
        setSelected([]);
        setView("pages");
      } else {
        const canvas = await canvasFromFile(new Blob([bytes], { type }));
        setSource(canvas);
        setDocumentName(name);
        setArea(null);
        setView("crop");
      }
      setBusy(null);
    } catch (reason) {
      fail(reason, "Не удалось открыть файл.");
    }
  };
  const pick = async (file) => {
    setError(null);
    try {
      const bytes = await file.arrayBuffer();
      if (keep && (library == null ? void 0 : library.allowed) !== false) {
        setBusy("Загружаем в библиотеку…");
        await uploadToLibrary(file);
        await load();
      }
      await open(bytes, file.name, file.type);
    } catch (reason) {
      fail(reason, "Не удалось загрузить файл.");
    }
  };
  const openFromLibrary = async (file) => {
    setBusy("Читаем файл…");
    setError(null);
    try {
      const bytes = await readLibraryFile(file.id);
      await open(bytes, file.name, file.contentType);
    } catch (reason) {
      fail(reason, "Не удалось прочитать файл.");
    }
  };
  const remove = async (file) => {
    if (!window.confirm(`Удалить «${file.name}» из библиотеки?`)) return;
    try {
      await api(`/files/${file.id}`, { method: "DELETE" });
      await load();
    } catch (reason) {
      fail(reason, "Не удалось удалить файл.");
    }
  };
  const insert = async (canvas, name) => {
    const blob = await toPng(canvas);
    await onInsert(blob, name, canvas.width / canvas.height);
  };
  const insertPages = async () => {
    if (!document2 || selected.length === 0) return;
    setBusy("Готовим страницы…");
    setError(null);
    try {
      for (const page of [...selected].sort((a, b) => a - b)) {
        const canvas = await renderPage(document2, page, INSERT_WIDTH);
        await insert(canvas, `${documentName} — с. ${page}`);
      }
      onClose();
    } catch (reason) {
      fail(reason, "Не удалось вставить страницы.");
    }
  };
  const startCrop = async (page) => {
    if (!document2) return;
    setBusy("Готовим страницу…");
    setError(null);
    try {
      setSource(await renderPage(document2, page, CROP_WIDTH));
      setDocumentName(`${documentName} — с. ${page}`);
      setArea(null);
      setView("crop");
      setBusy(null);
    } catch (reason) {
      fail(reason, "Не удалось открыть страницу.");
    }
  };
  const insertCrop = async (whole) => {
    if (!source) return;
    setBusy("Вставляем…");
    setError(null);
    try {
      await insert(whole || !area ? source : cropCanvas(source, area), documentName);
      onClose();
    } catch (reason) {
      fail(reason, "Не удалось вставить картинку.");
    }
  };
  const toSource = (event) => {
    const image = preview.current;
    if (!image || !source) return null;
    const box = image.getBoundingClientRect();
    const scale = source.width / box.width;
    return {
      x: Math.max(0, Math.min(source.width, (event.clientX - box.left) * scale)),
      y: Math.max(0, Math.min(source.height, (event.clientY - box.top) * scale))
    };
  };
  const onCropDown = (event) => {
    const point = toSource(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragFrom.current = point;
    setArea({ x: point.x, y: point.y, width: 0, height: 0 });
  };
  const onCropMove = (event) => {
    const from = dragFrom.current;
    const point = from ? toSource(event) : null;
    if (!from || !point) return;
    setArea({
      x: Math.min(from.x, point.x),
      y: Math.min(from.y, point.y),
      width: Math.abs(point.x - from.x),
      height: Math.abs(point.y - from.y)
    });
  };
  const onCropUp = () => {
    dragFrom.current = null;
  };
  const percent = (value, total) => `${value / total * 100}%`;
  return /* @__PURE__ */ jsxs("div", { className: "files", role: "dialog", "aria-label": "Файлы", children: [
    /* @__PURE__ */ jsxs("div", { className: "files__head", children: [
      /* @__PURE__ */ jsx("h2", { className: "files__title", children: view === "library" ? "Файлы" : view === "pages" ? "Страницы" : "Обрезка" }),
      view !== "library" ? /* @__PURE__ */ jsx("button", { className: "btn-quiet btn-sm", type: "button", onClick: () => setView("library"), children: "Назад" }) : null,
      /* @__PURE__ */ jsx("button", { className: "btn-tool", type: "button", onClick: onClose, "aria-label": "Закрыть", children: /* @__PURE__ */ jsx(IconClose, {}) })
    ] }),
    error ? /* @__PURE__ */ jsx("p", { className: "note note-danger", children: error }) : null,
    busy ? /* @__PURE__ */ jsx("p", { className: "text-muted small", children: busy }) : null,
    view === "library" ? /* @__PURE__ */ jsxs("div", { className: "files__body", children: [
      library && !library.allowed ? /* @__PURE__ */ jsx("p", { className: "note note-info", children: "Библиотека документов и страницы PDF — на платных тарифах. Картинки из буфера можно вставлять на любом." }) : null,
      library && !library.allowed ? null : /* @__PURE__ */ jsxs("label", { className: "btn btn-primary files__upload", children: [
        "Выбрать файл",
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "file",
            accept: "application/pdf,image/png,image/jpeg,image/webp",
            onChange: (event) => {
              var _a;
              const file = (_a = event.target.files) == null ? void 0 : _a[0];
              event.target.value = "";
              if (file) void pick(file);
            }
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "check", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            id: "keepFile",
            type: "checkbox",
            checked: keep,
            onChange: (event) => setKeep(event.target.checked)
          }
        ),
        /* @__PURE__ */ jsx("label", { htmlFor: "keepFile", children: "Сохранить в библиотеку" })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-muted small", children: "PDF — можно выбрать страницы и обрезать. Картинки вставляются как есть." }),
      library ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "files__quota", children: [
          /* @__PURE__ */ jsx("div", { className: "files__bar", children: /* @__PURE__ */ jsx("span", { style: { width: percent(Math.min(library.used, library.quota), library.quota) } }) }),
          /* @__PURE__ */ jsxs("p", { className: "text-muted small", children: [
            "Занято ",
            humanSize(library.used),
            " из ",
            humanSize(library.quota)
          ] })
        ] }),
        library.files.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-muted small", children: "Библиотека пока пуста." }) : /* @__PURE__ */ jsx("ul", { className: "files__list", children: library.files.map((file) => /* @__PURE__ */ jsxs("li", { className: "files__item", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              className: "files__name",
              type: "button",
              onClick: () => void openFromLibrary(file),
              title: "Открыть",
              children: file.name
            }
          ),
          /* @__PURE__ */ jsx("span", { className: "text-muted small", children: humanSize(file.size) }),
          /* @__PURE__ */ jsx(
            "button",
            {
              className: "btn-tool",
              type: "button",
              onClick: () => void remove(file),
              "aria-label": `Удалить ${file.name}`,
              children: /* @__PURE__ */ jsx(IconTrash, {})
            }
          )
        ] }, file.id)) })
      ] }) : null
    ] }) : null,
    view === "pages" && document2 ? /* @__PURE__ */ jsxs("div", { className: "files__body", children: [
      /* @__PURE__ */ jsx("p", { className: "text-muted small", children: "Отметьте страницы — их вставим целиком. Обрезать можно любую, по одной." }),
      /* @__PURE__ */ jsx("div", { className: "files__pages", children: thumbs.map((thumb, index) => {
        const page = index + 1;
        const chosen = selected.includes(page);
        return /* @__PURE__ */ jsxs("div", { className: chosen ? "files__page files__page--on" : "files__page", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              className: "files__thumb",
              onClick: () => setSelected((current) => chosen ? current.filter((value) => value !== page) : [...current, page]),
              children: [
                /* @__PURE__ */ jsx("img", { src: thumb, alt: `Страница ${page}` }),
                /* @__PURE__ */ jsx("span", { children: page })
              ]
            }
          ),
          /* @__PURE__ */ jsx("button", { className: "btn-quiet btn-sm", type: "button", onClick: () => void startCrop(page), children: "Обрезать" })
        ] }, page);
      }) }),
      shown < document2.numPages ? /* @__PURE__ */ jsxs(
        "button",
        {
          className: "btn-quiet btn-sm",
          type: "button",
          onClick: () => setShown((current) => current + PAGE_STEP),
          children: [
            "Показать ещё (",
            document2.numPages - shown,
            ")"
          ]
        }
      ) : null,
      /* @__PURE__ */ jsxs(
        "button",
        {
          className: "btn-primary btn-block",
          type: "button",
          disabled: selected.length === 0 || busy !== null,
          onClick: () => void insertPages(),
          children: [
            "Вставить ",
            selected.length > 0 ? `(${selected.length})` : ""
          ]
        }
      )
    ] }) : null,
    view === "crop" && source ? /* @__PURE__ */ jsxs("div", { className: "files__body", children: [
      /* @__PURE__ */ jsx("p", { className: "text-muted small", children: "Обведите нужный кусок — или вставьте целиком." }),
      /* @__PURE__ */ jsxs(
        "div",
        {
          className: "files__crop",
          onPointerDown: onCropDown,
          onPointerMove: onCropMove,
          onPointerUp: onCropUp,
          children: [
            /* @__PURE__ */ jsx("img", { ref: preview, src: sourceUrl, alt: documentName }),
            area && area.width > 2 && area.height > 2 ? /* @__PURE__ */ jsx(
              "span",
              {
                className: "files__frame",
                style: {
                  left: percent(area.x, source.width),
                  top: percent(area.y, source.height),
                  width: percent(area.width, source.width),
                  height: percent(area.height, source.height)
                }
              }
            ) : null
          ]
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "row", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            className: "btn-primary",
            type: "button",
            disabled: !area || area.width < 4 || busy !== null,
            onClick: () => void insertCrop(false),
            children: "Вставить фрагмент"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            className: "btn-outline",
            type: "button",
            disabled: busy !== null,
            onClick: () => void insertCrop(true),
            children: "Вставить целиком"
          }
        )
      ] })
    ] }) : null
  ] });
}
const DRAWING_TOOLS = ["pen1", "pen2", "marker", "eraser", "shapes", "text", "table"];
const SIZES = [1, 5, 10, 15, 20, 30];
const OPACITIES = [20, 40, 50, 70, 100];
const ERASER_SIZES = [8, 16, 26, 60, 120];
const SHAPES = [
  { kind: "line", label: "Линия" },
  { kind: "arrow", label: "Стрелка" },
  { kind: "rect", label: "Прямоугольник" },
  { kind: "ellipse", label: "Эллипс" },
  { kind: "triangle", label: "Треугольник" },
  { kind: "trapezoid", label: "Трапеция" },
  { kind: "parallelogram", label: "Параллелограмм" },
  { kind: "rhombus", label: "Ромб" }
];
const LINE_STYLES = [
  { kind: "solid", label: "Сплошная" },
  { kind: "dash", label: "Штрих" },
  { kind: "dashdot", label: "Штрихпунктир" },
  { kind: "dot", label: "Пунктир" }
];
const PALETTE = [
  "#2A211C",
  "#7F8C8D",
  "#B03A2E",
  "#E67E22",
  "#B7950B",
  "#1E8449",
  "#1F618D",
  "#8E44AD",
  "#FFFFFF",
  "#C0392B",
  "#D35400",
  "#F1C40F",
  "#27AE60",
  "#16A085",
  "#2E86C1",
  "#C2185B"
];
const DEFAULT_SETTINGS = {
  pen1: { color: "#2A211C", width: 5, opacity: 100 },
  pen2: { color: "#B03A2E", width: 5, opacity: 100 },
  // Маркер полупрозрачен и толст по умолчанию — им выделяют, а не пишут.
  marker: { color: "#B7950B", width: 20, opacity: 40 },
  shapes: { color: "#1F618D", width: 5, opacity: 100, shape: "rect", lineStyle: "solid" },
  text: { color: "#2A211C", fontSize: 24 },
  table: { color: "#2A211C", width: 3, fontSize: 20, rows: 3, cols: 3 },
  eraser: { size: 26 }
};
function toolColor(tool, settings) {
  if (tool === "pen1" || tool === "pen2" || tool === "marker") return settings[tool].color;
  if (tool === "shapes") return settings.shapes.color;
  if (tool === "text") return settings.text.color;
  if (tool === "table") return settings.table.color;
  return null;
}
function DrawToolbar({
  tool,
  settings,
  canEdit,
  canUndo,
  canRedo,
  onTool,
  onUndo,
  onRedo
}) {
  const pick = (which, icon, title, needsEdit = true) => {
    const dot = toolColor(which, settings);
    return /* @__PURE__ */ jsxs(
      "button",
      {
        className: "btn-tool",
        type: "button",
        "aria-pressed": tool === which,
        onClick: () => onTool(which),
        disabled: needsEdit && !canEdit,
        title: needsEdit && !canEdit ? "Доступно редактору" : title,
        children: [
          icon,
          dot ? /* @__PURE__ */ jsx("span", { className: "tool-dot", style: { background: dot }, "aria-hidden": "true" }) : null
        ]
      }
    );
  };
  return /* @__PURE__ */ jsxs("div", { className: "toolbar toolbar--vertical", role: "toolbar", "aria-label": "Инструменты рисования", children: [
    /* @__PURE__ */ jsx(
      "button",
      {
        className: "btn-tool",
        type: "button",
        onClick: onUndo,
        disabled: !canEdit || !canUndo,
        title: "Отменить (Ctrl+Z)",
        "aria-label": "Отменить",
        children: /* @__PURE__ */ jsx(IconUndo, {})
      }
    ),
    /* @__PURE__ */ jsx(
      "button",
      {
        className: "btn-tool",
        type: "button",
        onClick: onRedo,
        disabled: !canEdit || !canRedo,
        title: "Повторить (Ctrl+Y)",
        "aria-label": "Повторить",
        children: /* @__PURE__ */ jsx(IconRedo, {})
      }
    ),
    /* @__PURE__ */ jsx("span", { className: "toolbar__divider", "aria-hidden": "true" }),
    pick("select", /* @__PURE__ */ jsx(IconCursor, {}), "Выделять и перемещать"),
    pick("hand", /* @__PURE__ */ jsx(IconHand, {}), "Двигать холст. То же — пробел или средняя кнопка", false),
    pick("pen1", /* @__PURE__ */ jsx(IconEditor, {}), "Перо 1"),
    pick("pen2", /* @__PURE__ */ jsx(IconEditor, {}), "Перо 2"),
    pick("marker", /* @__PURE__ */ jsx(IconMarker, {}), "Маркер"),
    pick("eraser", /* @__PURE__ */ jsx(IconEraser, {}), "Ластик"),
    pick("text", /* @__PURE__ */ jsx(IconText, {}), "Текст"),
    pick("shapes", /* @__PURE__ */ jsx(IconShapes, {}), "Фигуры"),
    pick("table", /* @__PURE__ */ jsx(IconTable, {}), "Таблица")
  ] });
}
function ViewToolbar({
  canManage,
  canUpload,
  scale,
  onZoom,
  onResetZoom,
  onFit,
  onBackground,
  onFiles,
  onTimer,
  onHelp,
  onExport,
  onClear
}) {
  return /* @__PURE__ */ jsxs("div", { className: "toolbar toolbar--view", role: "toolbar", "aria-label": "Масштаб и вид", children: [
    /* @__PURE__ */ jsxs("div", { className: "zoom", children: [
      /* @__PURE__ */ jsx("button", { className: "btn-tool", type: "button", onClick: () => onZoom(1 / 1.15), "aria-label": "Отдалить", children: "−" }),
      /* @__PURE__ */ jsxs("button", { className: "zoom__value", type: "button", onClick: onResetZoom, title: "Вернуть 100 %", children: [
        Math.round(scale * 100),
        " %"
      ] }),
      /* @__PURE__ */ jsx("button", { className: "btn-tool", type: "button", onClick: () => onZoom(1.15), "aria-label": "Приблизить", children: "+" }),
      /* @__PURE__ */ jsx("button", { className: "btn-tool", type: "button", onClick: onFit, title: "Показать всё нарисованное", children: "⤢" })
    ] }),
    /* @__PURE__ */ jsx("span", { className: "toolbar__divider", "aria-hidden": "true" }),
    /* @__PURE__ */ jsx("button", { className: "btn-tool", type: "button", onClick: onHelp, title: "Что умеет доска", children: /* @__PURE__ */ jsx(IconHelp, {}) }),
    /* @__PURE__ */ jsx("button", { className: "btn-tool", type: "button", onClick: onTimer, title: "Таймер", children: /* @__PURE__ */ jsx(IconTimer, {}) }),
    canUpload ? /* @__PURE__ */ jsx("button", { className: "btn-tool", type: "button", onClick: onFiles, title: "Вставить файл или страницу PDF", children: /* @__PURE__ */ jsx(IconImage, {}) }) : null,
    /* @__PURE__ */ jsx("button", { className: "btn-tool", type: "button", onClick: onExport, title: "Сохранить картинкой", children: /* @__PURE__ */ jsx(IconDownload, {}) }),
    canManage ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("button", { className: "btn-tool", type: "button", onClick: onBackground, title: "Фон и разлиновка", children: /* @__PURE__ */ jsx(IconGrid, {}) }),
      /* @__PURE__ */ jsx("button", { className: "btn-tool", type: "button", onClick: onClear, title: "Очистить доску", children: /* @__PURE__ */ jsx(IconTrash, {}) })
    ] }) : null
  ] });
}
function Svg({ children }) {
  return /* @__PURE__ */ jsx(
    "svg",
    {
      width: "22",
      height: "22",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children
    }
  );
}
function ShapeIcon({ kind }) {
  switch (kind) {
    case "line":
      return /* @__PURE__ */ jsx(Svg, { children: /* @__PURE__ */ jsx("path", { d: "M4 19L20 5" }) });
    case "arrow":
      return /* @__PURE__ */ jsx(Svg, { children: /* @__PURE__ */ jsxs("g", { children: [
        /* @__PURE__ */ jsx("path", { d: "M4 19L20 5" }),
        /* @__PURE__ */ jsx("path", { d: "M20 11V5h-6" })
      ] }) });
    case "ellipse":
      return /* @__PURE__ */ jsx(Svg, { children: /* @__PURE__ */ jsx("ellipse", { cx: "12", cy: "12", rx: "9", ry: "6.5" }) });
    case "triangle":
      return /* @__PURE__ */ jsx(Svg, { children: /* @__PURE__ */ jsx("path", { d: "M12 4L21 20H3z" }) });
    case "trapezoid":
      return /* @__PURE__ */ jsx(Svg, { children: /* @__PURE__ */ jsx("path", { d: "M7 5h10l4 14H3z" }) });
    case "parallelogram":
      return /* @__PURE__ */ jsx(Svg, { children: /* @__PURE__ */ jsx("path", { d: "M8 5h13l-5 14H3z" }) });
    case "rhombus":
      return /* @__PURE__ */ jsx(Svg, { children: /* @__PURE__ */ jsx("path", { d: "M12 3l9 9-9 9-9-9z" }) });
    default:
      return /* @__PURE__ */ jsx(Svg, { children: /* @__PURE__ */ jsx("rect", { x: "3", y: "6", width: "18", height: "12", rx: "1" }) });
  }
}
function LineStyleIcon({ kind }) {
  const dash = {
    solid: void 0,
    dash: "7 4",
    dashdot: "7 3 1 3",
    dot: "1 4"
  }[kind];
  return /* @__PURE__ */ jsx(
    "svg",
    {
      width: "34",
      height: "22",
      viewBox: "0 0 34 22",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsx("path", { d: "M3 11h28", strokeDasharray: dash })
    }
  );
}
function ToolSettingsPanel({ tool, settings, onChange, onClose }) {
  if (tool === "select" || tool === "hand") return null;
  const pen = tool === "pen1" || tool === "pen2" || tool === "marker" ? settings[tool] : null;
  const patchPen = (patch) => {
    if (!pen) return;
    onChange({ ...settings, [tool]: { ...pen, ...patch } });
  };
  const shapes = tool === "shapes" ? settings.shapes : null;
  const patchShape = (patch) => {
    onChange({ ...settings, shapes: { ...settings.shapes, ...patch } });
  };
  const swatches = (current, apply) => /* @__PURE__ */ jsxs("div", { className: "params__row", children: [
    PALETTE.map((value) => /* @__PURE__ */ jsx(
      "button",
      {
        className: "swatch",
        type: "button",
        "aria-pressed": current === value,
        "aria-label": `Цвет ${value}`,
        style: { background: value },
        onClick: () => apply(value)
      },
      value
    )),
    /* @__PURE__ */ jsx("label", { className: "swatch swatch--custom", title: "Свой цвет", children: /* @__PURE__ */ jsx(
      "input",
      {
        type: "color",
        value: current,
        onChange: (event) => apply(event.target.value),
        "aria-label": "Свой цвет"
      }
    ) })
  ] });
  return /* @__PURE__ */ jsxs("div", { className: "params", role: "dialog", "aria-label": "Параметры инструмента", children: [
    /* @__PURE__ */ jsxs("div", { className: "params__head", children: [
      /* @__PURE__ */ jsx("span", { className: "params__title", children: titleOf(tool) }),
      /* @__PURE__ */ jsx("button", { className: "btn-quiet btn-sm", type: "button", onClick: onClose, children: "Готово" })
    ] }),
    pen ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { className: "params__label", children: "Размер" }),
      /* @__PURE__ */ jsx("div", { className: "params__row", children: SIZES.map((value) => /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn-tool",
          type: "button",
          "aria-pressed": pen.width === value,
          "aria-label": `Размер ${value}`,
          onClick: () => patchPen({ width: value }),
          children: /* @__PURE__ */ jsx(
            "span",
            {
              className: "width-dot",
              style: { width: Math.min(24, value), height: Math.min(24, value) }
            }
          )
        },
        value
      )) }),
      /* @__PURE__ */ jsx("p", { className: "params__label", children: "Прозрачность" }),
      /* @__PURE__ */ jsx("div", { className: "params__row", children: OPACITIES.map((value) => /* @__PURE__ */ jsxs(
        "button",
        {
          className: "btn-quiet btn-sm",
          type: "button",
          "aria-pressed": pen.opacity === value,
          onClick: () => patchPen({ opacity: value }),
          children: [
            value,
            " %"
          ]
        },
        value
      )) }),
      /* @__PURE__ */ jsx("div", { className: "params__preview", children: /* @__PURE__ */ jsx(
        "span",
        {
          style: {
            background: pen.color,
            opacity: pen.opacity / 100,
            height: Math.max(1, Math.min(30, pen.width))
          }
        }
      ) }),
      /* @__PURE__ */ jsx("p", { className: "params__label", children: "Цвет" }),
      swatches(pen.color, (color) => patchPen({ color }))
    ] }) : null,
    shapes ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { className: "params__label", children: "Фигура" }),
      /* @__PURE__ */ jsx("div", { className: "params__row", children: SHAPES.map((item) => /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn-tool",
          type: "button",
          "aria-pressed": shapes.shape === item.kind,
          "aria-label": item.label,
          title: item.label,
          onClick: () => patchShape({ shape: item.kind }),
          children: /* @__PURE__ */ jsx(ShapeIcon, { kind: item.kind })
        },
        item.kind
      )) }),
      /* @__PURE__ */ jsx("p", { className: "params__label", children: "Толщина" }),
      /* @__PURE__ */ jsx("div", { className: "params__row", children: SIZES.map((value) => /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn-tool",
          type: "button",
          "aria-pressed": shapes.width === value,
          "aria-label": `Толщина ${value}`,
          onClick: () => patchShape({ width: value }),
          children: /* @__PURE__ */ jsx(
            "span",
            {
              className: "width-dot",
              style: { width: Math.min(24, value), height: Math.min(24, value) }
            }
          )
        },
        value
      )) }),
      /* @__PURE__ */ jsx("p", { className: "params__label", children: "Тип линии" }),
      /* @__PURE__ */ jsx("div", { className: "params__row", children: LINE_STYLES.map((item) => /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn-tool btn-tool--line",
          type: "button",
          "aria-pressed": shapes.lineStyle === item.kind,
          "aria-label": item.label,
          title: item.label,
          onClick: () => patchShape({ lineStyle: item.kind }),
          children: /* @__PURE__ */ jsx(LineStyleIcon, { kind: item.kind })
        },
        item.kind
      )) }),
      /* @__PURE__ */ jsx("p", { className: "params__label", children: "Цвет" }),
      swatches(shapes.color, (color) => patchShape({ color }))
    ] }) : null,
    tool === "eraser" ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { className: "params__label", children: "Размер" }),
      /* @__PURE__ */ jsx("div", { className: "params__row", children: ERASER_SIZES.map((value) => /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn-quiet btn-sm",
          type: "button",
          "aria-pressed": settings.eraser.size === value,
          onClick: () => onChange({ ...settings, eraser: { size: value } }),
          children: value
        },
        value
      )) })
    ] }) : null,
    tool === "text" ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { className: "params__label", children: "Размер шрифта" }),
      /* @__PURE__ */ jsx("div", { className: "params__row", children: [16, 20, 24, 32, 48, 64].map((value) => /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn-quiet btn-sm",
          type: "button",
          "aria-pressed": settings.text.fontSize === value,
          onClick: () => onChange({ ...settings, text: { ...settings.text, fontSize: value } }),
          children: value
        },
        value
      )) }),
      /* @__PURE__ */ jsx("p", { className: "params__label", children: "Цвет" }),
      swatches(settings.text.color, (color) => onChange({ ...settings, text: { ...settings.text, color } }))
    ] }) : null,
    tool === "table" ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("p", { className: "params__label", children: "Строк" }),
      /* @__PURE__ */ jsx("div", { className: "params__row", children: [2, 3, 4, 5, 6, 8, 10].map((value) => /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn-quiet btn-sm",
          type: "button",
          "aria-pressed": settings.table.rows === value,
          onClick: () => onChange({ ...settings, table: { ...settings.table, rows: value } }),
          children: value
        },
        value
      )) }),
      /* @__PURE__ */ jsx("p", { className: "params__label", children: "Столбцов" }),
      /* @__PURE__ */ jsx("div", { className: "params__row", children: [2, 3, 4, 5, 6, 8].map((value) => /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn-quiet btn-sm",
          type: "button",
          "aria-pressed": settings.table.cols === value,
          onClick: () => onChange({ ...settings, table: { ...settings.table, cols: value } }),
          children: value
        },
        value
      )) }),
      /* @__PURE__ */ jsx("p", { className: "params__label", children: "Размер шрифта" }),
      /* @__PURE__ */ jsx("div", { className: "params__row", children: [14, 16, 20, 24, 32].map((value) => /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn-quiet btn-sm",
          type: "button",
          "aria-pressed": settings.table.fontSize === value,
          onClick: () => onChange({ ...settings, table: { ...settings.table, fontSize: value } }),
          children: value
        },
        value
      )) }),
      /* @__PURE__ */ jsx("p", { className: "params__label", children: "Цвет" }),
      swatches(settings.table.color, (color) => onChange({ ...settings, table: { ...settings.table, color } })),
      /* @__PURE__ */ jsx("p", { className: "text-muted small", style: { margin: "var(--sp-2) 0 0" }, children: "Растяните рамку на доске. Чтобы заполнить ячейку — выберите таблицу и нажмите на ячейку ещё раз." })
    ] }) : null
  ] });
}
function titleOf(tool) {
  if (tool === "pen1") return "Перо 1";
  if (tool === "pen2") return "Перо 2";
  if (tool === "marker") return "Маркер";
  if (tool === "eraser") return "Ластик";
  if (tool === "text") return "Текст";
  if (tool === "table") return "Таблица";
  return "Фигуры";
}
function erase(item, at, radius) {
  if (item.type === "image") return { kind: "keep" };
  const reach = radius + item.data.width / 2;
  if (item.type !== "stroke") {
    return hitsAnySegment(item, at, reach) ? { kind: "delete" } : { kind: "keep" };
  }
  const points = item.data.points ?? [];
  if (points.length === 0) return { kind: "keep" };
  const survives = points.map((point) => Math.hypot(point.x - at.x, point.y - at.y) > reach);
  if (survives.every(Boolean)) {
    return crossesSegment(points, at, reach) ? splitBySegment(item.data, points, at, reach) : { kind: "keep" };
  }
  const parts = [];
  let run = [];
  for (let index = 0; index < points.length; index += 1) {
    if (survives[index]) {
      run.push(points[index]);
    } else if (run.length > 0) {
      parts.push({ ...item.data, points: run });
      run = [];
    }
  }
  if (run.length > 0) parts.push({ ...item.data, points: run });
  const kept = parts.filter((part) => {
    var _a;
    return (((_a = part.points) == null ? void 0 : _a.length) ?? 0) > 1;
  });
  return kept.length === 0 ? { kind: "delete" } : { kind: "split", parts: kept };
}
function hitsAnySegment(item, at, reach) {
  const x1 = item.data.x1 ?? 0;
  const y1 = item.data.y1 ?? 0;
  const x2 = item.data.x2 ?? x1;
  const y2 = item.data.y2 ?? y1;
  return at.x >= Math.min(x1, x2) - reach && at.x <= Math.max(x1, x2) + reach && at.y >= Math.min(y1, y2) - reach && at.y <= Math.max(y1, y2) + reach;
}
function crossesSegment(points, at, reach) {
  for (let index = 1; index < points.length; index += 1) {
    if (distanceToSegment(at, points[index - 1], points[index]) <= reach) return true;
  }
  return false;
}
function splitBySegment(data, points, at, reach) {
  for (let index = 1; index < points.length; index += 1) {
    if (distanceToSegment(at, points[index - 1], points[index]) > reach) continue;
    const before = points.slice(0, index);
    const after = points.slice(index);
    const parts = [before, after].filter((part) => part.length > 1).map((part) => ({ ...data, points: part }));
    return parts.length === 0 ? { kind: "delete" } : { kind: "split", parts };
  }
  return { kind: "keep" };
}
const MIN_WIDTH = 96;
function TextInput({
  at,
  viewport,
  bounds,
  settings,
  initial,
  onCommit,
  onCancel
}) {
  const [value, setValue] = useState(initial ?? "");
  const [size, setSize] = useState({ width: MIN_WIDTH, height: 0 });
  const field = useRef(null);
  useEffect(() => {
    var _a;
    return (_a = field.current) == null ? void 0 : _a.focus();
  }, []);
  const screen = toScreen(viewport, at.x, at.y);
  const fontSize = Math.max(16, settings.fontSize * viewport.scale);
  const maxWidth = Math.max(MIN_WIDTH, bounds.width - screen.x - 16);
  useLayoutEffect(() => {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return;
    context.font = `${fontSize}px Manrope, system-ui, sans-serif`;
    const lines = value.split("\n");
    const widest = Math.max(...lines.map((line) => context.measureText(line).width), 0);
    const width = Math.min(maxWidth, Math.max(MIN_WIDTH, widest + fontSize));
    const element = field.current;
    if (element) {
      element.style.height = "auto";
      setSize({ width, height: element.scrollHeight });
    } else {
      setSize({ width, height: fontSize * 1.25 });
    }
  }, [value, fontSize, maxWidth]);
  return /* @__PURE__ */ jsx(
    "textarea",
    {
      ref: field,
      className: "text-input",
      value,
      onChange: (event) => setValue(event.target.value),
      onBlur: () => onCommit(value),
      onKeyDown: (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          onCommit(value);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      },
      style: {
        left: screen.x,
        top: screen.y,
        width: size.width,
        height: size.height || void 0,
        color: settings.color,
        fontSize,
        lineHeight: 1.25
      },
      placeholder: "Текст"
    }
  );
}
const WIDTH = 260;
const HEIGHT = 48;
const LEFT_GUTTER = 72;
const BOTTOM_GUTTER = 60;
const NARROW = 720;
function SelectionPanel({
  items,
  bounds,
  viewport,
  canvas,
  onColor,
  onDuplicate,
  onDelete,
  onReorder,
  onCopyText,
  onDone,
  onTable
}) {
  const text = items.length === 1 && items[0].type === "text" ? items[0].data.text ?? "" : null;
  const table = items.length === 1 && items[0].type === "table" ? items[0] : null;
  const rows = table ? clampRows(table.data.rows ?? DEFAULT_ROWS) : 0;
  const cols = table ? clampCols(table.data.cols ?? DEFAULT_COLS) : 0;
  const docked = canvas.width > 0 && canvas.width < NARROW;
  const corner = toScreen(viewport, bounds.x, bounds.y);
  const width = bounds.width * viewport.scale;
  const above = corner.y - 8 - HEIGHT >= 8;
  const left = Math.max(
    LEFT_GUTTER + WIDTH / 2,
    Math.min(corner.x + width / 2, canvas.width - WIDTH / 2 - 8)
  );
  const top = Math.max(
    8,
    Math.min(
      above ? corner.y - 8 - HEIGHT : corner.y + bounds.height * viewport.scale + 8,
      canvas.height - BOTTOM_GUTTER - HEIGHT
    )
  );
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: docked ? "selection-panel selection-panel--docked" : "selection-panel",
      style: docked ? void 0 : { left, top, transform: "translateX(-50%)" },
      role: "toolbar",
      "aria-label": "Действия с выделенным",
      children: [
        /* @__PURE__ */ jsx("div", { className: "selection-panel__colors", children: PALETTE.slice(0, 6).map((value) => /* @__PURE__ */ jsx(
          "button",
          {
            className: "swatch swatch--sm",
            type: "button",
            "aria-label": `Цвет ${value}`,
            style: { background: value },
            onClick: () => onColor(value)
          },
          value
        )) }),
        table ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("span", { className: "toolbar__divider", "aria-hidden": "true" }),
          /* @__PURE__ */ jsxs("div", { className: "selection-panel__table", children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                className: "btn-tool btn-tool--tiny",
                type: "button",
                title: "Убрать строку",
                disabled: rows <= 1,
                onClick: () => onTable(rows - 1, cols),
                children: "−"
              }
            ),
            /* @__PURE__ */ jsxs("span", { className: "selection-panel__count", children: [
              rows,
              "×",
              cols
            ] }),
            /* @__PURE__ */ jsx(
              "button",
              {
                className: "btn-tool btn-tool--tiny",
                type: "button",
                title: "Добавить строку",
                disabled: rows >= MAX_ROWS,
                onClick: () => onTable(rows + 1, cols),
                children: "+"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "selection-panel__table", children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                className: "btn-tool btn-tool--tiny",
                type: "button",
                title: "Убрать столбец",
                disabled: cols <= 1,
                onClick: () => onTable(rows, cols - 1),
                children: "−"
              }
            ),
            /* @__PURE__ */ jsx("span", { className: "selection-panel__count", children: "столбцы" }),
            /* @__PURE__ */ jsx(
              "button",
              {
                className: "btn-tool btn-tool--tiny",
                type: "button",
                title: "Добавить столбец",
                disabled: cols >= MAX_COLS,
                onClick: () => onTable(rows, cols + 1),
                children: "+"
              }
            )
          ] })
        ] }) : null,
        /* @__PURE__ */ jsx("span", { className: "toolbar__divider", "aria-hidden": "true" }),
        /* @__PURE__ */ jsx("button", { className: "btn-tool", type: "button", onClick: onDuplicate, title: "Дублировать (Ctrl+D)", children: /* @__PURE__ */ jsx(IconCopy, {}) }),
        /* @__PURE__ */ jsx("button", { className: "btn-tool", type: "button", onClick: onDelete, title: "Удалить (Delete)", children: /* @__PURE__ */ jsx(IconTrash, {}) }),
        docked ? (
          // На телефоне три точки только путали: на что там жать, было не
          // понять без подписи. Кнопки столбиком — тот же приём, что уже
          // прижился в панели инструментов.
          /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("button", { className: "btn-tool", type: "button", onClick: () => onReorder(true), title: "На передний план", children: /* @__PURE__ */ jsx(IconToFront, {}) }),
            /* @__PURE__ */ jsx("button", { className: "btn-tool", type: "button", onClick: () => onReorder(false), title: "На задний план", children: /* @__PURE__ */ jsx(IconToBack, {}) }),
            text ? /* @__PURE__ */ jsx("button", { className: "btn-tool", type: "button", onClick: () => onCopyText(text), title: "Скопировать текст", children: /* @__PURE__ */ jsx(IconCopy, {}) }) : null,
            /* @__PURE__ */ jsx("span", { className: "toolbar__divider", "aria-hidden": "true" }),
            /* @__PURE__ */ jsx("button", { className: "btn-tool", type: "button", onClick: onDone, title: "Готово — снять выделение", children: /* @__PURE__ */ jsx(IconCheck, {}) })
          ] })
        ) : (
          // На ПК места хватает — а вот словесная подпись читается быстрее,
          // чем два похожих значка «вперёд»/«назад» по слою.
          /* @__PURE__ */ jsxs(Menu, { label: "Ещё действия", children: [
            /* @__PURE__ */ jsx("button", { className: "btn-quiet menu__item", type: "button", onClick: () => onReorder(true), children: "На передний план" }),
            /* @__PURE__ */ jsx("button", { className: "btn-quiet menu__item", type: "button", onClick: () => onReorder(false), children: "На задний план" }),
            /* @__PURE__ */ jsx("button", { className: "btn-quiet menu__item", type: "button", onClick: onDuplicate, children: "Дублировать" }),
            text ? /* @__PURE__ */ jsx("button", { className: "btn-quiet menu__item", type: "button", onClick: () => onCopyText(text), children: "Скопировать текст" }) : null,
            /* @__PURE__ */ jsx("button", { className: "btn-quiet menu__item menu__item--danger", type: "button", onClick: onDelete, children: "Удалить" })
          ] })
        ),
        items.length > 1 ? /* @__PURE__ */ jsx("span", { className: "selection-panel__count", children: items.length }) : null
      ]
    }
  );
}
const COLORS = [
  "#FFFDF8",
  "#FFFFFF",
  "#F4F1E8",
  "#FDF3C6",
  "#FBE0D2",
  "#F9D5DC",
  "#E5D9F2",
  "#EAF2F8",
  "#EAF6EE",
  "#F1F1F1",
  "#2A211C",
  "#17171B",
  "#0B2545",
  "#14342B",
  "#2A1B3D"
];
const GRIDS = [
  { kind: "none", label: "Без сетки" },
  { kind: "line", label: "Узкая линейка" },
  { kind: "wide", label: "Широкая линейка" },
  { kind: "dot", label: "Точка" },
  { kind: "square", label: "Клетка" },
  { kind: "graph", label: "График" },
  { kind: "hybrid", label: "Гибридная" },
  { kind: "rhombus", label: "Ромб" },
  { kind: "triangle", label: "Треугольник" }
];
const GRID_COLORS = [
  "#D9CFC0",
  "#C7D6E5",
  "#CFE0D2",
  "#E0CFCF",
  "#D5D5DC",
  "#5A4A3E",
  "#3E4A5A",
  "#8C8C99"
];
function BackgroundPanel({ value, onChange, onClose }) {
  return /* @__PURE__ */ jsxs("div", { className: "params params--right", role: "dialog", "aria-label": "Оформление фона", children: [
    /* @__PURE__ */ jsxs("div", { className: "params__head", children: [
      /* @__PURE__ */ jsx("span", { className: "params__title", children: "Фон доски" }),
      /* @__PURE__ */ jsx("button", { className: "btn-quiet btn-sm", type: "button", onClick: onClose, children: "Готово" })
    ] }),
    /* @__PURE__ */ jsx("p", { className: "params__label", children: "Цвет" }),
    /* @__PURE__ */ jsxs("div", { className: "params__row", children: [
      COLORS.map((color) => /* @__PURE__ */ jsx(
        "button",
        {
          className: "swatch",
          type: "button",
          "aria-pressed": value.background === color,
          "aria-label": `Фон ${color}`,
          style: { background: color },
          onClick: () => onChange({ ...value, background: color })
        },
        color
      )),
      /* @__PURE__ */ jsx("label", { className: "swatch swatch--custom", title: "Свой цвет фона", children: /* @__PURE__ */ jsx(
        "input",
        {
          type: "color",
          value: value.background,
          onChange: (event) => onChange({ ...value, background: event.target.value }),
          "aria-label": "Свой цвет фона"
        }
      ) })
    ] }),
    /* @__PURE__ */ jsx("p", { className: "params__label", children: "Разлиновка" }),
    /* @__PURE__ */ jsx("div", { className: "params__row", children: GRIDS.map((grid) => /* @__PURE__ */ jsx(
      "button",
      {
        className: "btn-quiet btn-sm",
        type: "button",
        "aria-pressed": value.gridStyle === grid.kind,
        onClick: () => onChange({ ...value, gridStyle: grid.kind }),
        children: grid.label
      },
      grid.kind
    )) }),
    /* @__PURE__ */ jsx("p", { className: "params__label", children: "Цвет разлиновки" }),
    /* @__PURE__ */ jsxs("div", { className: "params__row", children: [
      GRID_COLORS.map((color) => /* @__PURE__ */ jsx(
        "button",
        {
          className: "swatch",
          type: "button",
          "aria-pressed": value.gridColor === color,
          "aria-label": `Разлиновка ${color}`,
          style: { background: color },
          onClick: () => onChange({ ...value, gridColor: color })
        },
        color
      )),
      /* @__PURE__ */ jsx("label", { className: "swatch swatch--custom", title: "Свой цвет разлиновки", children: /* @__PURE__ */ jsx(
        "input",
        {
          type: "color",
          value: value.gridColor,
          onChange: (event) => onChange({ ...value, gridColor: event.target.value }),
          "aria-label": "Свой цвет разлиновки"
        }
      ) })
    ] })
  ] });
}
const MAX_MINUTES = 180;
function clamp(raw, limit) {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? Math.max(0, Math.min(limit, value)) : 0;
}
function TimerPanel({ onClose }) {
  const [total, setTotal] = useState(10 * 60);
  const [left, setLeft] = useState(10 * 60);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const endsAt = useRef(0);
  useEffect(() => {
    if (!running) return;
    endsAt.current = Date.now() + left * 1e3;
    const tick = () => {
      const rest = Math.max(0, Math.round((endsAt.current - Date.now()) / 1e3));
      setLeft(rest);
      if (rest === 0) {
        setRunning(false);
        setDone(true);
      }
    };
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [running]);
  const set = (seconds2) => {
    const value = Math.max(0, Math.min(MAX_MINUTES * 60, seconds2));
    setTotal(value);
    setLeft(value);
    setRunning(false);
    setDone(false);
  };
  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  const progress = total > 0 ? left / total : 0;
  return /* @__PURE__ */ jsxs("div", { className: "params params--right timer", role: "dialog", "aria-label": "Таймер", children: [
    /* @__PURE__ */ jsxs("div", { className: "params__head", children: [
      /* @__PURE__ */ jsx("span", { className: "params__title", children: "Таймер" }),
      /* @__PURE__ */ jsx("button", { className: "btn-quiet btn-sm", type: "button", onClick: onClose, children: "Готово" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "timer__dial", style: { ["--progress"]: progress }, children: /* @__PURE__ */ jsxs("span", { className: "timer__value", children: [
      minutes,
      ":",
      seconds.toString().padStart(2, "0")
    ] }) }),
    done ? /* @__PURE__ */ jsx("p", { className: "note note-warning", children: "Время вышло" }) : null,
    /* @__PURE__ */ jsxs("div", { className: "timer__fields", children: [
      /* @__PURE__ */ jsxs("label", { className: "timer__field", children: [
        /* @__PURE__ */ jsx("span", { className: "params__label", children: "Мин" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "number",
            inputMode: "numeric",
            min: 0,
            max: MAX_MINUTES,
            value: minutes,
            onChange: (event) => set(clamp(event.target.value, MAX_MINUTES) * 60 + seconds)
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("label", { className: "timer__field", children: [
        /* @__PURE__ */ jsx("span", { className: "params__label", children: "Сек" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "number",
            inputMode: "numeric",
            min: 0,
            max: 59,
            value: seconds,
            onChange: (event) => set(minutes * 60 + clamp(event.target.value, 59))
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "params__row timer__controls", children: [
      /* @__PURE__ */ jsx("button", { className: "btn-quiet btn-sm", type: "button", onClick: () => set(left - 60), children: "−1 мин" }),
      /* @__PURE__ */ jsx("button", { className: "btn-quiet btn-sm", type: "button", onClick: () => set(left + 60), children: "+1 мин" }),
      /* @__PURE__ */ jsx("button", { className: "btn-quiet btn-sm", type: "button", onClick: () => set(total), children: "Сброс" })
    ] }),
    /* @__PURE__ */ jsx(
      "button",
      {
        className: "btn-primary btn-block",
        type: "button",
        onClick: () => {
          setDone(false);
          setRunning((current) => !current);
        },
        disabled: left === 0,
        style: { marginTop: "var(--sp-2)" },
        children: running ? "Пауза" : "Пуск"
      }
    )
  ] });
}
const TIPS = [
  { keys: "Пробел, средняя кнопка, два пальца", what: "двигать холст" },
  { keys: "Колесо, щипок", what: "масштаб" },
  { keys: "Shift при рисовании фигуры", what: "правильная фигура, угол кратный 15°" },
  { keys: "Курсор + протяжка по пустому", what: "выделить рамкой" },
  { keys: "Ctrl + клик", what: "добавить объект к выделению или убрать" },
  { keys: "Ctrl + Z, Ctrl + Y", what: "отменить, повторить" },
  { keys: "Ctrl + D", what: "дублировать выделенное" },
  { keys: "Ctrl + A", what: "выделить всё" },
  { keys: "Delete, Backspace", what: "удалить выделенное" },
  { keys: "Esc", what: "снять выделение, закрыть панель" },
  { keys: "Enter в поле надписи", what: "закрепить; Shift + Enter — новая строка" },
  { keys: "Таблица: тычок в выбранную", what: "заполнить ячейку" },
  { keys: "Таблица: выбрать и «+ / −»", what: "добавить или убрать строку, столбец" }
];
function HelpPanel({ onClose }) {
  return /* @__PURE__ */ jsxs("div", { className: "params params--right", role: "dialog", "aria-label": "Справка", children: [
    /* @__PURE__ */ jsxs("div", { className: "params__head", children: [
      /* @__PURE__ */ jsx("span", { className: "params__title", children: "Приёмы" }),
      /* @__PURE__ */ jsx("button", { className: "btn-quiet btn-sm", type: "button", onClick: onClose, children: "Готово" })
    ] }),
    /* @__PURE__ */ jsx("dl", { className: "help", children: TIPS.map((tip) => /* @__PURE__ */ jsxs("div", { className: "help__row", children: [
      /* @__PURE__ */ jsx("dt", { className: "help__keys", children: tip.keys }),
      /* @__PURE__ */ jsx("dd", { className: "help__what", children: tip.what })
    ] }, tip.keys)) }),
    /* @__PURE__ */ jsx("p", { className: "text-muted small", children: "На планшете пером рисуют, а пальцем двигают холст — как только доска увидит перо, палец перестаёт оставлять след." })
  ] });
}
const PADDING = 32;
async function exportPng(items, background, title) {
  const bounds = boundsOf(items);
  if (!bounds) return false;
  await preload(items.map((item) => item.imageRef).filter((ref) => Boolean(ref)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(bounds.width + PADDING * 2);
  canvas.height = Math.ceil(bounds.height + PADDING * 2);
  const context = canvas.getContext("2d");
  if (!context) return false;
  context.fillStyle = background.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(PADDING - bounds.x, PADDING - bounds.y);
  for (const item of items) drawItem(context, item.type, item.data, item.imageRef);
  const link = document.createElement("a");
  link.download = `${title || "Доска"}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
  return true;
}
const DEFAULT_BACKGROUND = {
  background: "#FFFDF8",
  gridStyle: "none",
  gridColor: "#D9CFC0"
};
function useBoardHub(boardId) {
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState(null);
  const [role, setRole] = useState(null);
  const [canEdit, setCanEdit] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [items, setItems] = useState([]);
  const [live, setLive] = useState(/* @__PURE__ */ new Map());
  const [participants, setParticipants] = useState([]);
  const [cursors, setCursors] = useState([]);
  const [me, setMe] = useState(null);
  const [lastCommit, setLastCommit] = useState(null);
  const [background, setBackgroundState] = useState(DEFAULT_BACKGROUND);
  const connection = useRef(null);
  const seq = useRef(0);
  const apply = useCallback((name, payload) => {
    switch (name) {
      case "ItemBegan":
        setLive((current) => new Map(current).set(payload.tempId, payload));
        break;
      case "ItemPoints":
        setLive((current) => {
          const stroke = current.get(payload.tempId);
          if (!stroke) return current;
          const next = new Map(current);
          next.set(payload.tempId, {
            ...stroke,
            data: { ...stroke.data, points: [...stroke.data.points ?? [], ...payload.points] }
          });
          return next;
        });
        break;
      case "ItemCancelled":
        setLive((current) => {
          const next = new Map(current);
          next.delete(payload.tempId);
          return next;
        });
        break;
      case "ItemCommitted":
        setLive((current) => {
          const next = new Map(current);
          next.delete(payload.tempId);
          return next;
        });
        setItems((current) => [...current.filter((x) => x.id !== payload.item.id), payload.item]);
        setLastCommit({ tempId: payload.tempId, itemId: payload.item.id });
        break;
      case "ItemsMoved":
        setItems((current) => current.map((item) => payload.itemIds.includes(item.id) ? { ...item, data: translate(item.data, payload.dx, payload.dy) } : item));
        break;
      case "ItemsReordered":
        setItems((current) => {
          const fresh = new Map(
            payload.items.map((item) => [item.id, item])
          );
          return current.map((item) => fresh.get(item.id) ?? item).sort((a, b) => a.z - b.z || a.id - b.id);
        });
        break;
      case "BackgroundChanged":
        setBackgroundState(payload);
        break;
      case "ItemUpdated":
        setItems((current) => current.map((x) => x.id === payload.item.id ? payload.item : x));
        break;
      case "ItemsDeleted":
        setItems((current) => current.filter((x) => !payload.itemIds.includes(x.id)));
        break;
      case "BoardCleared":
        setItems([]);
        setLive(/* @__PURE__ */ new Map());
        break;
      case "ItemLocked":
        setItems((current) => current.map((x) => x.id === payload.itemId ? { ...x, lockedBy: payload.by } : x));
        break;
      case "ItemUnlocked":
        setItems((current) => current.map((x) => x.id === payload.itemId ? { ...x, lockedBy: null } : x));
        break;
      case "MemberJoined":
        setParticipants((current) => [
          ...current.filter((x) => x.connectionId !== payload.connectionId),
          payload
        ]);
        break;
      case "MemberLeft":
        setParticipants((current) => current.filter((x) => x.connectionId !== payload.connectionId));
        setCursors((current) => current.filter((x) => x.id !== payload.connectionId));
        break;
    }
  }, []);
  useEffect(() => {
    if (!Number.isFinite(boardId)) return;
    const token = readToken();
    const hub = new HubConnectionBuilder().withUrl(`${API_URL}/hub/board${token ? `?access_token=${encodeURIComponent(token)}` : ""}`).withAutomaticReconnect([0, 1e3, 2e3, 5e3, 1e4, 15e3]).configureLogging(LogLevel.Warning).build();
    connection.current = hub;
    const join = async () => {
      await hub.invoke("JoinBoard", boardId, readGuestToken(boardId), seq.current);
    };
    const handled = [
      "ItemBegan",
      "ItemPoints",
      "ItemCommitted",
      "ItemCancelled",
      "ItemUpdated",
      "ItemsMoved",
      "ItemsReordered",
      "ItemsDeleted",
      "BoardCleared",
      "ItemLocked",
      "ItemUnlocked",
      "MemberJoined",
      "MemberLeft",
      "BackgroundChanged"
    ];
    for (const name of handled) {
      hub.on(name, (payload, eventSeq) => {
        if (typeof eventSeq === "number") seq.current = Math.max(seq.current, eventSeq);
        apply(name, payload);
      });
    }
    hub.on("Cursors", (frame) => setCursors(frame));
    hub.on("Joined", (payload) => {
      seq.current = payload.seq;
      setRole(payload.role);
      setCanEdit(payload.canEdit);
      setCanManage(payload.canManage);
      setItems(payload.items);
      setParticipants(payload.participants);
      setBackgroundState(payload.background ?? DEFAULT_BACKGROUND);
      setLive(/* @__PURE__ */ new Map());
      setMe(hub.connectionId);
      setStatus("ready");
      setError(null);
    });
    hub.on("Resumed", (payload) => {
      setRole(payload.role);
      setCanEdit(payload.canEdit);
      setCanManage(payload.canManage);
      setParticipants(payload.participants);
      setMe(hub.connectionId);
      for (const event of payload.events) apply(event.name, event.payload);
      seq.current = payload.seq;
      setStatus("ready");
      setError(null);
    });
    hub.on("Synced", (payload) => {
      seq.current = payload.seq;
      setItems(payload.items);
      setParticipants(payload.participants);
      setBackgroundState(payload.background ?? DEFAULT_BACKGROUND);
      setLive(/* @__PURE__ */ new Map());
    });
    hub.on("Error", (_code, message) => setError(message));
    hub.onreconnecting(() => setStatus("reconnecting"));
    hub.onreconnected(async () => {
      await join();
      await hub.invoke("Sync").catch(() => void 0);
    });
    hub.onclose(() => setStatus("failed"));
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (hub.state !== HubConnectionState.Connected) return;
      void hub.invoke("Sync").catch(() => void 0);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    hub.start().then(join).catch(() => {
      setStatus("failed");
      setError("Не удалось подключиться к доске.");
    });
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      connection.current = null;
      void hub.stop();
    };
  }, [boardId, apply]);
  const call = useCallback((method, ...args) => {
    const hub = connection.current;
    if ((hub == null ? void 0 : hub.state) === HubConnectionState.Connected) void hub.invoke(method, ...args).catch(() => void 0);
  }, []);
  return {
    status,
    error,
    role,
    canEdit,
    canManage,
    items,
    live,
    participants,
    cursors,
    me,
    lastCommit,
    background,
    sendCursor: useCallback((x, y) => call("Cursor", x, y), [call]),
    beginItem: useCallback((id, type, data) => call("BeginItem", id, type, data), [call]),
    appendPoints: useCallback((id, points) => call("AppendPoints", id, points), [call]),
    commitItem: useCallback(
      (id, type, data, imageRef) => call("CommitItem", id, type, data, imageRef ?? null),
      [call]
    ),
    cancelItem: useCallback((id) => call("CancelItem", id), [call]),
    setBackground: useCallback((next) => call("SetBackground", next.background, next.gridStyle, next.gridColor), [call]),
    moveItems: useCallback((ids, dx, dy) => call("MoveItems", ids, dx, dy), [call]),
    updateItem: useCallback((id, data) => call("UpdateItem", id, data), [call]),
    reorder: useCallback((ids, toFront) => call("Reorder", ids, toFront), [call]),
    deleteItems: useCallback((ids) => call("DeleteItems", ids), [call]),
    clearBoard: useCallback(() => call("ClearBoard"), [call])
  };
}
const POLL_MS$1 = 4e3;
function useWaitingQueue(boardId, canManage) {
  const [waiting, setWaiting] = useState([]);
  const reload = useCallback(async () => {
    if (!canManage) return;
    try {
      setWaiting(await api(`/boards/${boardId}/waiting`));
    } catch {
    }
  }, [boardId, canManage]);
  useEffect(() => {
    if (!canManage) {
      setWaiting([]);
      return;
    }
    void reload();
    const timer = window.setInterval(reload, POLL_MS$1);
    return () => window.clearInterval(timer);
  }, [canManage, reload]);
  const forget = useCallback((requestId) => {
    setWaiting((current) => current.filter((item) => item.requestId !== requestId));
  }, []);
  return { waiting, reload, forget };
}
function useHistory(actions) {
  const [depth, setDepth] = useState({ undo: 0, redo: 0 });
  const past = useRef([]);
  const future = useRef([]);
  const sync = useCallback(() => {
    setDepth({ undo: past.current.length, redo: future.current.length });
  }, []);
  const push = useCallback((operation) => {
    past.current = [...past.current, operation].slice(-100);
    future.current = [];
    sync();
  }, [sync]);
  const undo = useCallback(() => {
    const operation = past.current.at(-1);
    if (!operation) return;
    past.current = past.current.slice(0, -1);
    if (operation.kind === "create") {
      actions.remove(operation.items.map((item) => item.ref));
    } else if (operation.kind === "delete") {
      for (const item of operation.items) actions.restore(item);
    } else {
      actions.move(operation.refs, -operation.dx, -operation.dy);
    }
    future.current = [...future.current, operation];
    sync();
  }, [actions, sync]);
  const redo = useCallback(() => {
    const operation = future.current.at(-1);
    if (!operation) return;
    future.current = future.current.slice(0, -1);
    if (operation.kind === "create") {
      for (const item of operation.items) actions.restore(item);
    } else if (operation.kind === "delete") {
      actions.remove(operation.items.map((item) => item.ref));
    } else {
      actions.move(operation.refs, operation.dx, operation.dy);
    }
    past.current = [...past.current, operation];
    sync();
  }, [actions, sync]);
  const clear = useCallback(() => {
    past.current = [];
    future.current = [];
    sync();
  }, [sync]);
  return { canUndo: depth.undo > 0, canRedo: depth.redo > 0, push, undo, redo, clear };
}
function BoardPage() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const id = Number(boardId);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [showLink, setShowLink] = useState(() => {
    var _a;
    return Boolean((_a = location.state) == null ? void 0 : _a.openLink);
  });
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    var _a;
    if ((_a = location.state) == null ? void 0 : _a.openLink) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, []);
  const [tool, setToolRaw] = useState("pen1");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [showParams, setShowParams] = useState(false);
  const [showBackground, setShowBackground] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [textAt, setTextAt] = useState(null);
  const [cellEdit, setCellEdit] = useState(null);
  const setTool = (next) => {
    setShowParams(next === tool && DRAWING_TOOLS.includes(next) ? !showParams : false);
    setToolRaw(next);
  };
  const [viewport, setViewport] = useState(INITIAL_VIEWPORT);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const canvasRef = useRef(canvasSize);
  canvasRef.current = canvasSize;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [selection, setSelection] = useState([]);
  const hub = useBoardHub(id);
  const queue = useWaitingQueue(id, hub.canManage);
  const refToId = useRef(/* @__PURE__ */ new Map());
  const idToRef = useRef(/* @__PURE__ */ new Map());
  const pending = useRef(/* @__PURE__ */ new Map());
  const idsOf = useCallback((refs) => refs.map((ref) => refToId.current.get(ref)).filter((id2) => id2 !== void 0), []);
  const send2 = useCallback((ref, type, data, imageRef) => {
    const tempId = `${ref}-${Date.now().toString(36)}`;
    pending.current.set(tempId, { ref });
    hub.commitItem(tempId, type, data, imageRef);
  }, [hub]);
  const history = useHistory({
    restore: (snapshot) => send2(snapshot.ref, snapshot.type, snapshot.data, snapshot.imageRef),
    move: (refs, dx, dy) => hub.moveItems(idsOf(refs), dx, dy),
    remove: (refs) => hub.deleteItems(idsOf(refs))
  });
  useEffect(() => {
    const commit = hub.lastCommit;
    if (!commit) return;
    const waiting = pending.current.get(commit.tempId);
    if (!waiting) return;
    pending.current.delete(commit.tempId);
    refToId.current.set(waiting.ref, commit.itemId);
    idToRef.current.set(commit.itemId, waiting.ref);
    if (waiting.snapshot) history.push({ kind: "create", items: [waiting.snapshot] });
  }, [hub.lastCommit, history]);
  const refOf = useCallback((itemId) => {
    const existing = idToRef.current.get(itemId);
    if (existing) return existing;
    const ref = `r${itemId}`;
    idToRef.current.set(itemId, ref);
    refToId.current.set(ref, itemId);
    return ref;
  }, []);
  useEffect(() => {
    const alive = new Set(hub.items.map((item) => item.id));
    setSelection((current) => current.every((id2) => alive.has(id2)) ? current : current.filter((id2) => alive.has(id2)));
  }, [hub.items]);
  const removeSelection = useCallback(() => {
    if (selection.length === 0) return;
    const doomed = hub.items.filter((item) => selection.includes(item.id));
    history.push({
      kind: "delete",
      items: doomed.map((item) => ({
        ref: refOf(item.id),
        type: item.type,
        data: item.data,
        imageRef: item.imageRef
      }))
    });
    hub.deleteItems(selection);
    setSelection([]);
  }, [hub, history, refOf, selection]);
  const eraseAt = useCallback((at, radius) => {
    const doomed = [];
    const born = [];
    const undoItems = [];
    for (const item of hub.items) {
      if (erased.current.has(item.id)) continue;
      const result = erase(item, at, radius);
      if (result.kind === "keep") continue;
      erased.current.add(item.id);
      doomed.push(item.id);
      undoItems.push({ ref: refOf(item.id), type: item.type, data: item.data, imageRef: item.imageRef });
      if (result.kind === "split") {
        for (const part of result.parts) {
          born.push({ ref: `e${Date.now().toString(36)}${born.length}`, type: item.type, data: part });
        }
      }
    }
    if (doomed.length === 0) return;
    hub.deleteItems(doomed);
    for (const part of born) send2(part.ref, part.type, part.data);
    history.push({ kind: "delete", items: undoItems });
  }, [hub, history, refOf, send2]);
  const erased = useRef(/* @__PURE__ */ new Set());
  useEffect(() => {
    const onKey = (event) => {
      const target = event.target;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      const control = event.ctrlKey || event.metaKey;
      if (control && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (control && event.key.toLowerCase() === "y") {
        event.preventDefault();
        history.redo();
        return;
      }
      if (control && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelection();
        return;
      }
      if (control && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelection(hub.items.map((item) => item.id));
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeSelection();
        return;
      }
      if (event.key === "Escape") setSelection([]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, hub.items, removeSelection]);
  useEffect(() => {
    if (!hub.canEdit && tool !== "hand") setToolRaw("hand");
  }, [hub.canEdit, tool]);
  const commitText = (text) => {
    const where = textAt;
    setTextAt(null);
    if (!where || !text.trim()) return;
    const data = {
      x1: where.x,
      y1: where.y,
      text,
      fontSize: settings.text.fontSize,
      color: settings.text.color,
      width: 1
    };
    const context = document.createElement("canvas").getContext("2d");
    const lines = text.split("\n");
    const lineHeight = settings.text.fontSize * 1.25;
    if (context) {
      context.font = fontOf(data);
      data.x2 = where.x + Math.max(...lines.map((line) => context.measureText(line).width));
      data.y2 = where.y + lines.length * lineHeight;
    }
    const ref = `t${Date.now().toString(36)}`;
    pending.current.set(`${ref}-new`, { ref, snapshot: { ref, type: "text", data } });
    hub.commitItem(`${ref}-new`, "text", data);
  };
  const editCell = (itemId, world) => {
    const item = hub.items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    const where = cellAt(item.data, world);
    if (!where) return;
    const rect = cellRect(tableBox(item.data), where.row, where.col);
    setCellEdit({
      itemId,
      row: where.row,
      col: where.col,
      at: { x: rect.x + 3, y: rect.y + rect.height / 2 - (item.data.fontSize ?? 20) * 0.6, p: 1 }
    });
  };
  const commitCell = (text) => {
    const edit = cellEdit;
    setCellEdit(null);
    if (!edit) return;
    const item = hub.items.find((candidate) => candidate.id === edit.itemId);
    if (!item) return;
    hub.updateItem(item.id, withCell(item.data, edit.row, edit.col, text));
  };
  const selectedItems = hub.items.filter((item) => selection.includes(item.id));
  const tableItem = cellEdit ? hub.items.find((item) => item.id === cellEdit.itemId) ?? null : null;
  const selectionBounds = selectedItems.length > 0 ? boundsOf(selectedItems) : null;
  const docked = Boolean(
    selectionBounds && hub.canEdit && canvasSize.width > 0 && canvasSize.width < 720
  );
  const duplicateSelection = () => {
    for (const item of selectedItems) {
      const ref = `c${item.id}-${Date.now().toString(36)}`;
      const data = translate(item.data, 16, 16);
      const snapshot = { ref, type: item.type, data, imageRef: item.imageRef };
      pending.current.set(`${ref}-new`, { ref, snapshot });
      hub.commitItem(`${ref}-new`, item.type, data, item.imageRef);
    }
  };
  const recolorSelection = (color) => {
    for (const item of selectedItems) hub.updateItem(item.id, { ...item.data, color });
  };
  const insertImage = useCallback(async (blob, name, ratio) => {
    const uploaded = await uploadBoardImage(id, blob, name, readGuestToken(id));
    const view = viewportRef.current;
    const size = canvasRef.current;
    const width = (size.width > 0 ? size.width * 0.5 : 480) / view.scale;
    const height = width / (ratio > 0 ? ratio : 1);
    const center = toWorld(view, size.width / 2, size.height / 2);
    const x1 = center.x - width / 2;
    const y1 = center.y - height / 2;
    const data = {
      x1,
      y1,
      x2: x1 + width,
      y2: y1 + height,
      ratio,
      color: "#000000",
      // Ноль: рамка выделения у картинки идёт ровно по её краю, а не с
      // отступом на толщину линии, которой у неё нет.
      width: 0
    };
    const ref = `i${Date.now().toString(36)}`;
    pending.current.set(`${ref}-new`, {
      ref,
      snapshot: { ref, type: "image", data, imageRef: uploaded.imageRef }
    });
    hub.commitItem(`${ref}-new`, "image", data, uploaded.imageRef);
  }, [hub, id]);
  const goToCursor = useCallback((connectionId) => {
    const at = hub.cursors.find((cursor) => cursor.id === connectionId);
    if (!at) return;
    setViewport((current) => centerOn(
      current,
      at.x,
      at.y,
      canvasRef.current.width,
      canvasRef.current.height
    ));
  }, [hub.cursors]);
  const insertFile = useCallback(async (file, name) => {
    try {
      const canvas = await canvasFromFile(file);
      await insertImage(await toPng(canvas), name, canvas.width / canvas.height);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось вставить картинку.");
    }
  }, [insertImage]);
  const pasteText = useCallback((text) => {
    const view = viewportRef.current;
    const size = canvasRef.current;
    const at = toWorld(view, size.width / 2, size.height / 2);
    const data = {
      x1: at.x,
      y1: at.y,
      text,
      fontSize: settingsRef.current.text.fontSize,
      color: settingsRef.current.text.color,
      width: 1
    };
    const box = measureText(text, data.fontSize ?? 24);
    data.x2 = at.x + box.width;
    data.y2 = at.y + box.height;
    const ref = `p${Date.now().toString(36)}`;
    pending.current.set(`${ref}-new`, { ref, snapshot: { ref, type: "text", data } });
    hub.commitItem(`${ref}-new`, "text", data);
  }, [hub]);
  useEffect(() => {
    if (!hub.canEdit || (state == null ? void 0 : state.me.isGuest) !== false) return;
    const onPaste = (event) => {
      var _a, _b, _c;
      const target = event.target;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      const items = (_a = event.clipboardData) == null ? void 0 : _a.items;
      if (!items) return;
      for (const entry of items) {
        if (entry.kind === "file") {
          const file = entry.getAsFile();
          if (!file) continue;
          event.preventDefault();
          void insertFile(file, file.name || "Вставка");
          return;
        }
      }
      const text = (_c = (_b = event.clipboardData) == null ? void 0 : _b.getData("text/plain")) == null ? void 0 : _c.trim();
      if (!text) return;
      event.preventDefault();
      pasteText(text);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [hub.canEdit, state == null ? void 0 : state.me.isGuest, insertFile, pasteText]);
  const zoomBy = (factor) => {
    setViewport((current) => zoomAt(current, canvasSize.width / 2, canvasSize.height / 2, factor));
  };
  const fitToAll = () => {
    const points = hub.items.flatMap((item) => pointsOf(item.data));
    const next = fitToContent(points, canvasSize.width, canvasSize.height);
    if (next) setViewport(next);
  };
  const load = useCallback(async () => {
    try {
      setState(await api(`/boards/${id}/state`, { guestToken: readGuestToken(id) }));
      setError(null);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось открыть доску.");
    }
  }, [id]);
  useEffect(() => {
    if (!Number.isFinite(id)) return;
    void load();
    const timer = window.setInterval(load, 5e3);
    return () => window.clearInterval(timer);
  }, [id, load]);
  const toggleLock = async () => {
    if (!state) return;
    setBusy(true);
    try {
      await api(`/boards/${id}/lock`, { method: "POST", body: { value: !state.board.locked } });
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось изменить замок.");
    } finally {
      setBusy(false);
    }
  };
  const toggleAutoAdmit = async () => {
    if (!state) return;
    try {
      await api(`/boards/${id}/auto-admit`, { method: "POST", body: { value: !state.board.autoAdmit } });
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось изменить настройку.");
    }
  };
  const reissue = async () => {
    if (!window.confirm("Выпустить новую ссылку? Прежняя перестанет работать сразу.")) return;
    try {
      await api(`/boards/${id}/reissue-link`, { method: "POST" });
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось перевыпустить ссылку.");
    }
  };
  const saveTitle = async () => {
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    if (!trimmed || !state || trimmed === state.board.title) return;
    try {
      await api(`/boards/${id}`, { method: "PATCH", body: { title: trimmed } });
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось переименовать доску.");
    }
  };
  const copy = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2e3);
    } catch {
      setError("Скопировать не вышло. Выделите ссылку и скопируйте вручную.");
    }
  };
  const leaveGuest = async () => {
    try {
      await api(`/boards/${id}/leave`, { method: "POST", guestToken: readGuestToken(id) });
    } catch {
    } finally {
      writeGuestToken(id, null);
      navigate("/", { replace: true });
    }
  };
  if (error && !state) {
    return /* @__PURE__ */ jsx(BoardShell, { children: /* @__PURE__ */ jsxs("div", { className: "card", children: [
      /* @__PURE__ */ jsx("h1", { children: "Доска" }),
      /* @__PURE__ */ jsx("p", { className: "note note-danger", children: error }),
      /* @__PURE__ */ jsx("p", { className: "text-muted small", children: "Возможно, вас убрали с доски или ссылку перевыпустили. Попросите новую у того, кто вас позвал." })
    ] }) });
  }
  if (!state) {
    return /* @__PURE__ */ jsx(BoardShell, { children: /* @__PURE__ */ jsx("p", { className: "text-muted", children: "Загружаем доску…" }) });
  }
  const { board, me, members, guests } = state;
  const otherGuests = guests.filter((guest) => guest.guestId !== me.guestId);
  const presentCount = members.length + otherGuests.length + (me.isGuest ? 1 : 0);
  return /* @__PURE__ */ jsxs(BoardShell, { children: [
    /* @__PURE__ */ jsxs("div", { className: "board-page", children: [
      board.canManage ? /* @__PURE__ */ jsxs("div", { className: "board-page__bar", children: [
        /* @__PURE__ */ jsxs(
          "button",
          {
            className: "btn-tool btn-tool--wide",
            type: "button",
            onClick: toggleLock,
            disabled: busy,
            "aria-pressed": board.locked,
            title: board.locked ? "Доска закрыта: по ссылке не войти. Нажмите, чтобы открыть" : "Доска открыта: по ссылке можно проситься. Нажмите, чтобы закрыть",
            children: [
              board.locked ? /* @__PURE__ */ jsx(IconLockClosed, {}) : /* @__PURE__ */ jsx(IconLockOpen, {}),
              /* @__PURE__ */ jsx("span", { children: board.locked ? "Закрыта" : "Открыта" })
            ]
          }
        ),
        /* @__PURE__ */ jsxs(
          "button",
          {
            className: "btn-tool btn-tool--wide",
            type: "button",
            onClick: () => setShowLink(true),
            title: "Ссылка на доску",
            children: [
              /* @__PURE__ */ jsx(IconLink, {}),
              /* @__PURE__ */ jsx("span", { children: "Ссылка" })
            ]
          }
        )
      ] }) : null,
      error ?? hub.error ? /* @__PURE__ */ jsx("p", { className: "note note-danger", children: error ?? hub.error }) : null,
      board.locked && board.canManage ? /* @__PURE__ */ jsx("p", { className: "note note-warning", children: "Доска закрыта: новые по ссылке войти не могут. Те, кто уже здесь, остаются." }) : null,
      /* @__PURE__ */ jsxs(
        "section",
        {
          className: "board-page__canvas",
          onDragOver: (event) => {
            if (hub.canEdit && !me.isGuest) event.preventDefault();
          },
          onDrop: (event) => {
            var _a;
            if (!hub.canEdit || me.isGuest) return;
            const file = (_a = event.dataTransfer.files) == null ? void 0 : _a[0];
            if (!file) return;
            event.preventDefault();
            void insertFile(file, file.name);
          },
          children: [
            /* @__PURE__ */ jsx("div", { className: "board-title", children: editingTitle ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  className: "board-title__input",
                  type: "text",
                  autoFocus: true,
                  maxLength: 200,
                  value: titleDraft,
                  onChange: (event) => setTitleDraft(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === "Enter") saveTitle();
                    if (event.key === "Escape") setEditingTitle(false);
                  }
                }
              ),
              /* @__PURE__ */ jsx("button", { className: "btn-tool", type: "button", onClick: saveTitle, "aria-label": "Сохранить название", children: /* @__PURE__ */ jsx(IconCheck, {}) })
            ] }) : board.canManage ? /* @__PURE__ */ jsx(
              "button",
              {
                className: "board-title__text",
                type: "button",
                onClick: () => {
                  setTitleDraft(board.title);
                  setEditingTitle(true);
                },
                title: "Переименовать доску",
                children: board.title
              }
            ) : /* @__PURE__ */ jsx("p", { className: "board-title__text", children: board.title }) }),
            docked ? null : /* @__PURE__ */ jsx(
              DrawToolbar,
              {
                tool,
                settings,
                canEdit: hub.canEdit,
                canUndo: history.canUndo,
                canRedo: history.canRedo,
                onTool: setTool,
                onUndo: history.undo,
                onRedo: history.redo
              }
            ),
            /* @__PURE__ */ jsx(
              ViewToolbar,
              {
                canManage: hub.canManage,
                canUpload: hub.canEdit && !me.isGuest,
                onFiles: () => setShowFiles((current) => !current),
                scale: viewport.scale,
                onBackground: () => setShowBackground((current) => !current),
                onTimer: () => setShowTimer((current) => !current),
                onHelp: () => setShowHelp((current) => !current),
                onExport: () => {
                  void exportPng(hub.items, hub.background, board.title).then((saved) => {
                    if (!saved) setError("Доска пуста — сохранять нечего.");
                  });
                },
                onZoom: zoomBy,
                onResetZoom: () => setViewport((current) => {
                  if (!selectionBounds) return { ...current, scale: 1 };
                  return centerOn(
                    current,
                    selectionBounds.x + selectionBounds.width / 2,
                    selectionBounds.y + selectionBounds.height / 2,
                    canvasSize.width,
                    canvasSize.height,
                    1
                  );
                }),
                onFit: fitToAll,
                onClear: () => {
                  if (window.confirm("Очистить доску? Всё нарисованное пропадёт у всех.")) hub.clearBoard();
                }
              }
            ),
            /* @__PURE__ */ jsx(
              BoardCanvas,
              {
                hub,
                tool,
                settings,
                viewport,
                background: hub.background,
                selection,
                onViewport: setViewport,
                onSize: setCanvasSize,
                onSelection: setSelection,
                onMoved: (itemIds, dx, dy) => {
                  hub.moveItems(itemIds, dx, dy);
                  history.push({ kind: "move", refs: itemIds.map(refOf), dx, dy });
                },
                onCommit: (type, data, tempId) => {
                  const ref = `s${tempId}`;
                  pending.current.set(tempId, { ref, snapshot: { ref, type, data } });
                  hub.commitItem(tempId, type, data);
                },
                onCellAt: editCell,
                onErase: eraseAt,
                onEraseEnd: () => erased.current.clear(),
                onDrawStart: () => setShowParams(false),
                onTextAt: (world) => {
                  setViewport((current) => {
                    if (canvasSize.width >= 720) return current;
                    const screen = toScreen(current, world.x, world.y);
                    const tight = screen.x > canvasSize.width - 160 || screen.y > canvasSize.height - 120 || screen.x < 8 || screen.y < 8;
                    return tight ? centerOn(current, world.x, world.y, canvasSize.width, canvasSize.height) : current;
                  });
                  setTextAt(world);
                }
              }
            ),
            showTimer ? /* @__PURE__ */ jsx(TimerPanel, { onClose: () => setShowTimer(false) }) : null,
            showHelp ? /* @__PURE__ */ jsx(HelpPanel, { onClose: () => setShowHelp(false) }) : null,
            showFiles ? /* @__PURE__ */ jsx(FilesPanel, { onInsert: insertImage, onClose: () => setShowFiles(false) }) : null,
            showBackground && hub.canManage ? /* @__PURE__ */ jsx(
              BackgroundPanel,
              {
                value: hub.background,
                onChange: hub.setBackground,
                onClose: () => setShowBackground(false)
              }
            ) : null,
            showParams ? /* @__PURE__ */ jsx(
              ToolSettingsPanel,
              {
                tool,
                settings,
                onChange: setSettings,
                onClose: () => setShowParams(false)
              }
            ) : null,
            selectionBounds && hub.canEdit ? /* @__PURE__ */ jsx(
              SelectionPanel,
              {
                items: selectedItems,
                bounds: selectionBounds,
                viewport,
                canvas: canvasSize,
                onColor: recolorSelection,
                onDuplicate: duplicateSelection,
                onDelete: removeSelection,
                onReorder: (toFront) => hub.reorder(selection, toFront),
                onCopyText: (text) => {
                  var _a;
                  (_a = navigator.clipboard) == null ? void 0 : _a.writeText(text).catch(() => setError("Скопировать не вышло — браузер не дал доступ к буферу."));
                },
                onDone: () => setSelection([]),
                onTable: (rows, cols) => {
                  const item = selectedItems[0];
                  if (item) hub.updateItem(item.id, resized$1(item.data, rows, cols));
                }
              }
            ) : null,
            cellEdit ? /* @__PURE__ */ jsx(
              TextInput,
              {
                at: cellEdit.at,
                viewport,
                bounds: canvasSize,
                settings: {
                  color: (tableItem == null ? void 0 : tableItem.data.color) ?? settings.table.color,
                  fontSize: (tableItem == null ? void 0 : tableItem.data.fontSize) ?? settings.table.fontSize
                },
                initial: tableItem ? cellText(tableItem.data, cellEdit.row, cellEdit.col) : "",
                onCommit: commitCell,
                onCancel: () => setCellEdit(null)
              }
            ) : null,
            textAt ? /* @__PURE__ */ jsx(
              TextInput,
              {
                at: textAt,
                viewport,
                bounds: canvasSize,
                settings: settings.text,
                onCommit: commitText,
                onCancel: () => setTextAt(null)
              }
            ) : null,
            hub.status !== "ready" ? /* @__PURE__ */ jsx("p", { className: "canvas-status", children: hub.status === "failed" ? "Связь с доской потеряна. Нарисованное сохранится, когда связь вернётся." : hub.status === "reconnecting" ? "Связь прервалась — восстанавливаем…" : "Подключаемся к доске…" }) : null,
            hub.status === "ready" && !hub.canEdit ? /* @__PURE__ */ jsx("p", { className: "canvas-status", children: "Вы наблюдаете: доступны только просмотр и масштаб." }) : null,
            /* @__PURE__ */ jsx(CanvasPanel, { open: showPeople, title: "Участники", onClose: () => setShowPeople(false), children: /* @__PURE__ */ jsx(
              PeoplePanel,
              {
                boardId: id,
                canManage: board.canManage,
                members,
                guests: otherGuests,
                guestName: me.isGuest ? me.displayName : null,
                queue,
                present: hub.participants,
                cursors: hub.cursors,
                onGoTo: goToCursor,
                meConnectionId: hub.me,
                onChanged: load
              }
            ) }),
            /* @__PURE__ */ jsxs("div", { className: "board-page__people-corner", children: [
              me.isGuest ? /* @__PURE__ */ jsxs("p", { className: "guest-hint", children: [
                "Вы гость. ",
                /* @__PURE__ */ jsx(Link, { to: "/login", children: "Войти?" })
              ] }) : null,
              /* @__PURE__ */ jsxs(
                "button",
                {
                  className: "btn-tool btn-tool--wide",
                  type: "button",
                  onClick: () => setShowPeople((current) => !current),
                  "aria-pressed": showPeople,
                  title: "Участники",
                  children: [
                    /* @__PURE__ */ jsx(IconPeople, {}),
                    /* @__PURE__ */ jsxs("span", { children: [
                      "Участники",
                      presentCount ? ` · ${presentCount}` : ""
                    ] }),
                    queue.waiting.length > 0 ? /* @__PURE__ */ jsx("span", { className: "badge-dot", "aria-label": `Ждут допуска: ${queue.waiting.length}`, children: queue.waiting.length }) : null
                  ]
                }
              )
            ] })
          ]
        }
      ),
      me.isGuest ? /* @__PURE__ */ jsxs("p", { className: "text-muted small", children: [
        "Вы на доске как гость — доска у вас не сохранится.",
        " ",
        /* @__PURE__ */ jsx("button", { className: "btn-quiet btn-sm", type: "button", onClick: leaveGuest, children: "Выйти" })
      ] }) : null
    ] }),
    showLink && board.linkUrl ? /* @__PURE__ */ jsxs(Modal, { title: "Ссылка на доску", onClose: () => setShowLink(false), children: [
      /* @__PURE__ */ jsx("p", { className: "text-muted small", children: "Действует час, потом обновляется сама." }),
      /* @__PURE__ */ jsxs("div", { className: "link-box link-box--stack", children: [
        /* @__PURE__ */ jsx("input", { type: "text", readOnly: true, value: board.linkUrl, onFocus: (e) => e.target.select() }),
        /* @__PURE__ */ jsx("button", { className: "btn-primary btn-block", type: "button", onClick: () => copy(board.linkUrl), children: copied ? "Скопировано" : "Копировать" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "check", style: { marginTop: "var(--sp-5)" }, children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            id: "autoAdmit",
            type: "checkbox",
            checked: board.autoAdmit,
            onChange: toggleAutoAdmit
          }
        ),
        /* @__PURE__ */ jsx("label", { htmlFor: "autoAdmit", children: "Впускать сразу, без спроса" })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-muted small", children: "Пришедшие попадут на доску наблюдателями, минуя очередь." }),
      /* @__PURE__ */ jsx(
        "button",
        {
          className: "btn-danger btn-block",
          type: "button",
          onClick: reissue,
          style: { marginTop: "var(--sp-5)" },
          children: "Выпустить новую ссылку"
        }
      ),
      /* @__PURE__ */ jsx("p", { className: "text-muted small", children: "Прежняя перестанет работать сразу." })
    ] }) : null
  ] });
}
const POLL_MS = 3e3;
function JoinPage() {
  const { token } = useParams();
  const { user, loading: loading2 } = useAuth();
  const navigate = useNavigate();
  const [boardTitle, setBoardTitle] = useState(null);
  const [name, setName] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!token) return;
    api(`/join/${token}`).then((info) => setBoardTitle(info.boardTitle)).catch((reason) => {
      setError(reason instanceof ApiError ? reason.message : "Ссылка недействительна.");
    });
  }, [token]);
  const enter = useCallback(
    (outcome) => {
      if (outcome.guestId) writeGuestMarker(outcome.guestId);
      if (outcome.guestToken) writeGuestToken(outcome.boardId, outcome.guestToken);
      navigate(`/boards/${outcome.boardId}`, { replace: true });
    },
    [navigate]
  );
  const request = async (event) => {
    event == null ? void 0 : event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = user ? await api(`/join/${token}/user`, { method: "POST" }) : await api(`/join/${token}/guest`, {
        method: "POST",
        // Метку браузера присылаем обратно: по ней владелец узнаёт нас
        // между заходами, и повторно принимать в течение 15 минут
        // не приходится.
        body: { displayName: name, guestId: readGuestMarker() }
      });
      if (outcome.status === "admitted") {
        enter(outcome);
        return;
      }
      setResult(outcome);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось попроситься на доску.");
    } finally {
      setBusy(false);
    }
  };
  const waiting = (result == null ? void 0 : result.status) === "waiting";
  useEffect(() => {
    if (!waiting || !token || !(result == null ? void 0 : result.guestId)) return;
    let stopped = false;
    const tick = async () => {
      try {
        const outcome = await api(`/join/${token}/check`, {
          method: "POST",
          body: { guestId: result.guestId, displayName: name }
        });
        if (stopped) return;
        if (outcome.status === "admitted") {
          enter(outcome);
        } else if (outcome.status !== "waiting") {
          setResult(outcome);
        }
      } catch {
      }
    };
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [waiting, token, result, name, enter]);
  if (error && !boardTitle) {
    return /* @__PURE__ */ jsx(Page, { narrow: true, children: /* @__PURE__ */ jsxs("div", { className: "card", children: [
      /* @__PURE__ */ jsx("h1", { children: "Приглашение на доску" }),
      /* @__PURE__ */ jsx("p", { className: "note note-danger", children: error }),
      /* @__PURE__ */ jsx("p", { className: "text-muted small", children: "Возможно, ссылку перевыпустили. Попросите новую у того, кто вас позвал." })
    ] }) });
  }
  if ((result == null ? void 0 : result.status) === "waiting") {
    return /* @__PURE__ */ jsx(Page, { narrow: true, children: /* @__PURE__ */ jsxs("div", { className: "card waiting", children: [
      /* @__PURE__ */ jsx("h1", { children: "Ждём преподавателя" }),
      /* @__PURE__ */ jsxs("p", { children: [
        "Вы попросились на доску «",
        result.boardTitle,
        "». Как только вас впустят, доска откроется сама."
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "waiting__dots", "aria-hidden": "true", children: [
        /* @__PURE__ */ jsx("span", {}),
        /* @__PURE__ */ jsx("span", {}),
        /* @__PURE__ */ jsx("span", {})
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-muted small", style: { marginTop: "var(--sp-5)" }, children: "Страницу можно не обновлять — она сама следит за ответом." })
    ] }) });
  }
  if ((result == null ? void 0 : result.status) === "rejected" || (result == null ? void 0 : result.status) === "locked") {
    return /* @__PURE__ */ jsx(Page, { narrow: true, children: /* @__PURE__ */ jsxs("div", { className: "card", children: [
      /* @__PURE__ */ jsx("h1", { children: result.status === "locked" ? "Доска закрыта" : "Вас не впустили" }),
      /* @__PURE__ */ jsx("p", { className: "note note-warning", children: result.message }),
      /* @__PURE__ */ jsx("button", { className: "btn-primary", type: "button", onClick: () => {
        setResult(null);
      }, children: "Попроситься ещё раз" })
    ] }) });
  }
  return /* @__PURE__ */ jsx(Page, { narrow: true, children: /* @__PURE__ */ jsxs("div", { className: "card", children: [
    /* @__PURE__ */ jsx("h1", { children: "Приглашение на доску" }),
    boardTitle ? /* @__PURE__ */ jsxs("p", { children: [
      "Вас зовут на доску «",
      boardTitle,
      "»."
    ] }) : /* @__PURE__ */ jsx("p", { className: "text-muted", children: "Загружаем…" }),
    error ? /* @__PURE__ */ jsx("p", { className: "note note-danger", children: error }) : null,
    loading2 || !boardTitle ? null : user ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("p", { className: "text-muted", children: [
        "Вы вошли как ",
        user.displayName,
        ". Доска останется в вашем списке — и роль сохранится, второй раз проситься не придётся."
      ] }),
      /* @__PURE__ */ jsx("button", { className: "btn-primary", type: "button", onClick: () => request(), disabled: busy, children: busy ? "Отправляем…" : "Попроситься на доску" })
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("form", { onSubmit: request, children: [
        /* @__PURE__ */ jsxs("div", { className: "field", children: [
          /* @__PURE__ */ jsx("label", { htmlFor: "name", children: "Как вас зовут" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              id: "name",
              type: "text",
              required: true,
              maxLength: 60,
              autoFocus: true,
              placeholder: "Имя увидят другие на доске",
              value: name,
              onChange: (event) => setName(event.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ jsx("button", { className: "btn-primary btn-block", type: "submit", disabled: busy, children: busy ? "Отправляем…" : "Войти на доску" })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "text-muted small", children: "Регистрироваться не нужно. Имя нужно только чтобы вас узнавали на доске — оно нигде не сохраняется." }),
      /* @__PURE__ */ jsxs("p", { className: "text-muted small", children: [
        "Если у вас есть учётная запись,",
        " ",
        /* @__PURE__ */ jsx(Link, { to: `/login?next=/join/${token ?? ""}`, children: "войдите" }),
        " — тогда доска сохранится у вас в списке."
      ] })
    ] })
  ] }) });
}
const p = (text) => ({ kind: "p", text });
const list = (...items) => ({ kind: "list", items });
const DETAILS = {
  kind: "rows",
  caption: "Реквизиты",
  rows: [
    ["Фамилия, имя, отчество", COMPANY.name],
    ["Статус", COMPANY.status],
    ["ИНН", COMPANY.inn],
    ["Электронная почта", COMPANY.email],
    ["Сайт", COMPANY.site]
  ]
};
const OFFER = {
  title: "Публичная оферта о предоставлении права использования сервиса «SchoolPiBoard» на условиях подписки",
  lead: `Документ относится к онлайн-доске в браузере по адресу ${COMPANY.site}. Лицензия на программу для компьютера продаётся по отдельной оферте: это другой предмет договора, другой порядок оплаты и другие правила возврата.`,
  sections: [
    {
      title: "1. Общие положения",
      blocks: [
        p("1.1. В настоящей Публичной оферте содержатся условия договора о предоставлении права использования сервиса «SchoolPiBoard» на условиях подписки (далее — «Договор»)."),
        p("1.2. Настоящей офертой признаётся предложение, адресованное неопределённому кругу лиц, которое достаточно определённо и выражает намерение лица, сделавшего предложение, считать себя заключившим Договор с адресатом, которым будет принято предложение."),
        p("1.3. Нижеизложенный текст является официальным публичным предложением Исполнителя заключить Договор в соответствии с пунктом 2 статьи 437 Гражданского кодекса Российской Федерации."),
        p("1.4. Совершение указанных в разделе 4 действий является подтверждением согласия Сторон заключить Договор на условиях, в порядке и объёме, изложенных в настоящей Оферте.")
      ]
    },
    {
      title: "2. Термины и определения",
      blocks: [
        p(`Сервис — программа для ЭВМ «SchoolPiBoard», доступ к которой предоставляется через сеть «Интернет» по адресу ${COMPANY.site}, предназначенная для совместной работы на виртуальной доске: рисования, размещения текста, фигур и изображений.`),
        p("Исполнитель — лицо, которому принадлежит исключительное право на Сервис, указанное в разделе «Реквизиты»."),
        p("Пользователь — лицо, создавшее учётную запись в Сервисе."),
        p("Участник — лицо, работающее на доске по приглашению Пользователя. Учётная запись Участнику не требуется."),
        p("Доска — рабочее пространство, созданное Пользователем, и всё размещённое на нём содержимое."),
        p("Тариф — набор пределов использования Сервиса: количество досок, количество одновременных Участников на доске, объём места для файлов, доступность библиотеки документов. Состав тарифов и их цены опубликованы на странице «Тарифы» и являются частью настоящей Оферты."),
        p("Подписка — право использования Сервиса в пределах выбранного Тарифа в течение оплаченного срока."),
        p("Бесплатный тариф — пределы, действующие без оплаты и без ограничения срока."),
        p("Пробный период — срок, в течение которого пределы платного Тарифа предоставляются без оплаты."),
        p("Акцепт — полное и безоговорочное принятие условий настоящей Оферты путём совершения действий, указанных в разделе 4.")
      ]
    },
    {
      title: "3. Предмет Договора",
      blocks: [
        p("3.1. Исполнитель предоставляет Пользователю право использования Сервиса в пределах выбранного Тарифа, а Пользователь обязуется уплатить вознаграждение в размере и порядке, установленных настоящим Договором."),
        p("3.2. Исключительное право на Сервис Пользователю не передаётся и не отчуждается. Пользователь получает только право использования Сервиса по его прямому функциональному назначению."),
        p("3.3. Пределы использования:"),
        list(
          "3.3.1. Территория — все страны мира.",
          "3.3.2. Срок — срок оплаченной Подписки. Бесплатный тариф предоставляется без ограничения срока.",
          "3.3.3. Количество досок, одновременных Участников на доске и объём места для файлов — в соответствии с выбранным Тарифом.",
          "3.3.4. Способы использования — доступ к Сервису через браузер и использование его по прямому функциональному назначению."
        ),
        p("3.4. Приглашённые Участники пользуются доской бесплатно. Оплату вносит только Пользователь, создавший доску."),
        p("3.5. Сервис предоставляется в том виде, в котором он существует на момент предоставления доступа («как есть»).")
      ]
    },
    {
      title: "4. Порядок заключения Договора",
      blocks: [
        p("4.1. Договор считается заключённым с момента Акцепта."),
        p("4.2. Акцептом признаётся совершение Пользователем любого из следующих действий:"),
        list(
          "4.2.1. оплата Подписки;",
          "4.2.2. создание учётной записи в Сервисе;",
          "4.2.3. начало использования Сервиса, в том числе в пределах Бесплатного тарифа или Пробного периода."
        ),
        p("4.3. Совершая любое из указанных действий, Пользователь подтверждает, что ознакомился с условиями настоящей Оферты, они ему понятны, и он принимает их полностью, без оговорок и ограничений.")
      ]
    },
    {
      title: "5. Бесплатный тариф и Пробный период",
      blocks: [
        p("5.1. Бесплатный тариф предоставляется без ограничения срока и не является пробным. Его пределы указаны на странице «Тарифы»."),
        p("5.2. После подтверждения адреса электронной почты Пользователю однократно предоставляется Пробный период — 7 (семь) календарных дней на пределах тарифа «Стандартный». Привязка банковской карты для этого не требуется."),
        p("5.3. Пробный период предоставляется один раз на учётную запись."),
        p("5.4. По окончании Пробного периода учётная запись возвращается к пределам Бесплатного тарифа. Созданные доски и загруженные файлы при этом не удаляются.")
      ]
    },
    {
      title: "6. Срок Подписки и порядок его исчисления",
      blocks: [
        p("6.1. Подписка оформляется на 30, 90, 180 или 365 календарных дней по выбору Пользователя. Оплата вносится единовременно за выбранный срок."),
        p("6.2. Срок начинает течь с момента поступления оплаты. Если на этот момент действует другой оплаченный срок или Пробный период, новый срок начинается по его окончании: оплаченные дни не сгорают и не заменяются."),
        p("6.3. При приобретении Тарифа более высокого уровня во время действия оплаченного срока Пользователю до оплаты предоставляется выбор:"),
        list(
          "6.3.1. начать новый Тариф по окончании текущего срока — при этом оплаченные дни текущего Тарифа сохраняются полностью;",
          "6.3.2. начать новый Тариф немедленно — при этом неиспользованные дни текущего Тарифа прекращаются и возврату не подлежат. О последствиях Пользователь уведомляется до оплаты."
        ),
        p("6.4. Пользователь, выбравший порядок по пункту 6.3.1, вправе впоследствии перейти к порядку по пункту 6.3.2 в личном кабинете. Обратный переход невозможен."),
        p("6.5. Понижение уровня Тарифа во время действия оплаченного срока не производится: приобретённый Тариф более низкого уровня начинает действовать по окончании текущего срока."),
        p("6.6. По окончании оплаченного срока учётная запись возвращается к пределам Бесплатного тарифа. Доски, файлы и иное содержимое не удаляются. Содержимое сверх пределов Бесплатного тарифа остаётся доступным, при этом создание новых досок и загрузка новых файлов возможны после того, как занятое станет меньше предела.")
      ]
    },
    {
      title: "7. Вознаграждение и порядок расчётов",
      blocks: [
        p("7.1. Размер вознаграждения определяется выбранными Тарифом и сроком и указан на странице «Тарифы». НДС не облагается в связи с применением Исполнителем специального налогового режима «Налог на профессиональный доход»."),
        p("7.2. В случае расхождения приоритет имеют сведения, размещённые на Сайте на момент оплаты."),
        p("7.3. Все расчёты производятся в безналичном порядке. Приём платежей осуществляется через платёжный сервис, указанный на странице оплаты. Данные банковских карт Пользователя Исполнителю не передаются и им не обрабатываются."),
        p("7.4. Обязанность Пользователя по оплате считается исполненной с момента поступления денежных средств."),
        p("7.5. Чек направляется Пользователю в порядке, предусмотренном законодательством Российской Федерации о применении специального налогового режима «Налог на профессиональный доход».")
      ]
    },
    {
      title: "8. Автоматическое продление",
      blocks: [
        p("8.1. При оплате Пользователь вправе выбрать автоматическое продление Подписки. По умолчанию оно выключено и включается только явным действием Пользователя."),
        p("8.2. При включённом автоматическом продлении за 1 (одни) сутки до окончания оплаченного срока с той же банковской карты списывается вознаграждение за следующий срок той же продолжительности по действующей на момент списания цене."),
        p("8.3. Автоматическое продление отключается Пользователем в любой момент в личном кабинете, в разделе «Мой тариф». Уже оплаченный срок при этом сохраняется полностью."),
        p("8.4. Если списание не прошло, попытки повторяются в течение оставшихся суток срока. Если ни одна не удалась, Подписка не продлевается: учётная запись возвращается к пределам Бесплатного тарифа в порядке пункта 6.6."),
        p("8.5. Автоматическое продление не производится, если на момент окончания срока Пользователем уже оплачен следующий срок: платить дважды за одно и то же время не требуется."),
        p("8.6. Включить автоматическое продление для уже оплаченной Подписки, при оплате которой оно не было выбрано, технически невозможно: платёжный сервис допускает повторные списания только по счёту, помеченному соответствующим образом в момент оплаты. Автоматическое продление может быть выбрано при следующей оплате.")
      ]
    },
    {
      title: "9. Права и обязанности Сторон",
      blocks: [
        p("9.1. Исполнитель обязуется предоставить доступ к Сервису в пределах оплаченного Тарифа и обеспечивать конфиденциальность персональных данных Пользователя."),
        p("9.2. Исполнитель вправе вносить изменения в Сервис, выпускать обновления, изменять и дополнять его функциональные возможности."),
        p("9.3. Исполнитель вправе в одностороннем порядке изменять условия настоящей Оферты, публикуя изменения на Сайте. Новые условия действуют в отношении Договоров, заключаемых после публикации изменений; уже оплаченные сроки изменение цен не затрагивает."),
        p("9.4. Пользователь обязуется указывать достоверные сведения и не передавать доступ к учётной записи третьим лицам."),
        p("9.5. Пользователь отвечает за содержимое, размещаемое им и приглашёнными им Участниками на досках, и за то, кому он передаёт ссылки на доски."),
        p("9.6. Пользователю запрещается размещать в Сервисе материалы, нарушающие законодательство Российской Федерации или права третьих лиц, а также предпринимать действия, направленные на обход пределов Тарифа, нарушение работы Сервиса или получение доступа к чужим учётным записям и доскам."),
        p("9.7. Пользователь самостоятельно обеспечивает сохранность важного для него содержимого. Исполнитель рекомендует сохранять доски в виде изображений средствами Сервиса.")
      ]
    },
    {
      title: "10. Возврат вознаграждения",
      blocks: [
        p("10.1. До приобретения Подписки Пользователю предоставляется возможность бесплатно проверить пригодность Сервиса в пределах Бесплатного тарифа без ограничения срока, а также в течение Пробного периода. Пользователь принимает решение о заключении Договора, располагая такой возможностью."),
        p("10.2. Пользователь вправе отказаться от Договора в любой момент. При отказе Исполнитель возвращает вознаграждение за неиспользованные полные месяцы оплаченного срока. Использованные дни, а также неполный месяц возврату не подлежат."),
        p("10.3. Независимо от пункта 10.2 Пользователь вправе требовать возврата вознаграждения в полном объёме, если доступ к Сервису не был предоставлен по обстоятельствам, зависящим от Исполнителя, и такие обстоятельства не устранены в течение 30 (тридцати) календарных дней с момента обращения Пользователя."),
        p("10.4. Возврат производится также в иных случаях, предусмотренных законодательством Российской Федерации."),
        p("10.5. Возврат за неиспользованные дни Тарифа, прекращённого по выбору Пользователя в порядке пункта 6.3.2, не производится: такое прекращение является добровольным решением Пользователя, о последствиях которого он уведомляется до оплаты."),
        p(`10.6. Для возврата Пользователь направляет обращение на адрес ${COMPANY.email} с указанием адреса электронной почты учётной записи и обстоятельств обращения. Срок рассмотрения обращения — ${COMPANY.refundDays} (десять) рабочих дней.`),
        p(`10.7. Возврат производится тем же способом, которым было уплачено вознаграждение, в срок не более ${COMPANY.refundDays} (десяти) рабочих дней с момента принятия решения о возврате. Ранее сформированный чек аннулируется.`),
        p("10.8. С момента возврата вознаграждения соответствующая Подписка прекращается, и учётная запись возвращается к пределам Бесплатного тарифа.")
      ]
    },
    {
      title: "11. Приостановление доступа",
      blocks: [
        p("11.1. Исполнитель вправе приостановить доступ к Сервису при нарушении Пользователем пункта 9.6 настоящего Договора."),
        p("11.2. При приостановлении доступа по причинам, не связанным с нарушением со стороны Пользователя, оплаченный и неиспользованный срок возвращается.")
      ]
    },
    {
      title: "12. Ограничение ответственности",
      blocks: [
        p("12.1. Сервис предоставляется «как есть». Исполнитель не гарантирует его бесперебойной и безошибочной работы, а также соответствия Сервиса конкретным ожиданиям и целям Пользователя."),
        p("12.2. Исполнитель не несёт ответственности за утрату содержимого досок, а также за прямые или косвенные убытки, возникшие в связи с использованием либо невозможностью использования Сервиса."),
        p("12.3. Совокупная ответственность Исполнителя по настоящему Договору ограничивается размером фактически уплаченного Пользователем вознаграждения за текущий срок Подписки."),
        p("12.4. Исполнитель не несёт ответственности за неисполнение обязательств, вызванное действиями Пользователя, в том числе указанием недостоверных сведений, передачей доступа третьим лицам или нарушением условий раздела 9.")
      ]
    },
    {
      title: "13. Персональные данные",
      blocks: [
        p("13.1. При исполнении настоящего Договора Стороны обеспечивают конфиденциальность и безопасность персональных данных в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных»."),
        p("13.2. Состав обрабатываемых данных, цели и сроки их обработки описаны в Политике в отношении обработки персональных данных, размещённой на Сайте.")
      ]
    },
    {
      title: "14. Форс-мажор",
      blocks: [
        p("14.1. Стороны освобождаются от ответственности за неисполнение или ненадлежащее исполнение обязательств, если оно оказалось невозможным вследствие обстоятельств непреодолимой силы: запретных действий властей, эпидемий, блокады, эмбарго, землетрясений, наводнений, пожаров и иных стихийных бедствий."),
        p("14.2. Сторона, для которой наступили такие обстоятельства, обязана уведомить об этом другую Сторону в течение 30 (тридцати) рабочих дней."),
        p("14.3. Если обстоятельства непреодолимой силы продолжают действовать более 60 (шестидесяти) рабочих дней, каждая Сторона вправе отказаться от Договора в одностороннем порядке.")
      ]
    },
    {
      title: "15. Срок действия Оферты и разрешение споров",
      blocks: [
        p("15.1. Оферта вступает в силу с момента размещения на Сайте и действует до момента её отзыва Исполнителем. Отзыв Оферты или изменение её условий не прекращает действия уже оплаченных Подписок."),
        p("15.2. Договор, его заключение и исполнение регулируются законодательством Российской Федерации."),
        p(`15.3. Досудебный порядок урегулирования спора является обязательным. Претензия направляется на адрес ${COMPANY.email}; срок ответа — 30 (тридцать) календарных дней с момента её получения.`),
        p("15.4. Споры, по которым Стороны не достигли договорённости, подлежат разрешению в соответствии с законодательством Российской Федерации."),
        p("15.5. Языком Договора и языком взаимодействия Сторон является русский язык.")
      ]
    },
    {
      title: "16. Реквизиты Исполнителя",
      blocks: [DETAILS]
    }
  ]
};
const TERMS = {
  title: "Пользовательское соглашение",
  lead: `Документ описывает условия, на которых можно пользоваться онлайн-доской ${COMPANY.site}. Создавая учётную запись или открывая доску по ссылке, вы соглашаетесь с этими условиями.`,
  sections: [
    {
      title: "1. Кто предоставляет сервис",
      blocks: [
        p("SchoolPiBoard — онлайн-доска для совместной работы в браузере. Сервисом владеет и управляет Оператор, сведения о котором приведены в конце документа."),
        p("Сервис не является образовательной организацией и не проводит занятий. Занятия проводят сами пользователи; доска — только рабочее пространство для них.")
      ]
    },
    {
      title: "2. Кто может пользоваться",
      blocks: [
        p("Владелец доски — тот, кто создал учётную запись и доску. Он приглашает остальных, назначает роли, может отозвать ссылку и удалить участника."),
        p("Участник — тот, кто пришёл по ссылке. Учётная запись ему не нужна, платить ему не нужно. Роль — работа на доске или только просмотр — назначается владельцем."),
        p("Если пользователю не исполнилось 18 лет, регистрация возможна с ведома и согласия родителя или иного законного представителя.")
      ]
    },
    {
      title: "3. Учётная запись",
      blocks: [
        p("При регистрации указываются достоверные сведения."),
        p("Пароль не следует передавать третьим лицам. Действия, совершённые под вашей учётной записью, считаются совершёнными вами."),
        p("Учётную запись можно удалить в любой момент в настройках профиля. Войти в неё после этого нельзя. Доски, которые вы создали, останутся рабочими для остальных участников ещё полгода, после чего будут удалены вместе с учётной записью и загруженными файлами.")
      ]
    },
    {
      title: "4. Доски, ссылки и роли",
      blocks: [
        p("Ссылка на доску не закрепляет роль заранее. Перешедший по ней либо сразу становится наблюдателем, если владелец включил такой режим, либо ждёт решения владельца."),
        p("Владелец в любой момент может отозвать ссылку и выпустить новую, закрыть доску для новых участников, изменить роль участника или удалить его."),
        p("Сколько человек помещается на доске одновременно — свойство тарифа владельца доски. Участники за это не платят.")
      ]
    },
    {
      title: "5. Тарифы и оплата",
      blocks: [
        p("Пользоваться доской можно бесплатно и без срока: бесплатный тариф даёт ограниченное число досок, небольшой объём места под файлы и до двух человек на доске одновременно. Платные тарифы расширяют эти пределы и открывают библиотеку документов."),
        p("Условия платной подписки — сроки, цены, автопродление, возврат — изложены в Оферте на подписку. При расхождении между настоящим Соглашением и Офертой в части оплаты применяется Оферта."),
        p("Когда оплаченный срок кончается, ничего не удаляется: учётная запись возвращается к бесплатным пределам.")
      ]
    },
    {
      title: "6. Правила поведения",
      blocks: [
        p("Пользуясь сервисом, нельзя:"),
        list(
          "размещать материалы, нарушающие законодательство Российской Федерации, в том числе разжигающие вражду, содержащие оскорбления, угрозы или порнографию;",
          "размещать чужие материалы без разрешения правообладателя;",
          "выдавать себя за другого человека;",
          "пытаться получить доступ к чужим учётным записям, доскам и файлам, вмешиваться в работу сервиса, обходить пределы тарифа;",
          "использовать сервис для рассылки рекламы и спама;",
          "собирать данные других пользователей автоматическими средствами."
        ),
        p("При нарушении этих правил Оператор вправе ограничить доступ к учётной записи или удалить её, а также удалить размещённые материалы.")
      ]
    },
    {
      title: "7. Права на содержимое",
      blocks: [
        p("Содержимое досок и загруженные файлы принадлежат их автору. Размещая их в сервисе, автор разрешает Оператору хранить и показывать их участникам, которым открыт доступ, — в объёме, необходимом для работы сервиса."),
        p("Оформление, тексты страниц и программный код сервиса принадлежат Оператору.")
      ]
    },
    {
      title: "8. Доступность сервиса и ответственность",
      blocks: [
        p("Сервис предоставляется «как есть». Оператор стремится к бесперебойной работе, но не гарантирует отсутствия перерывов, в том числе на техническое обслуживание."),
        p("Оператор не отвечает за содержание материалов, размещённых пользователями, и за договорённости пользователей между собой."),
        p("Важное содержимое стоит сохранять: доску можно выгрузить изображением средствами сервиса.")
      ]
    },
    {
      title: "9. Персональные данные",
      blocks: [
        p("Порядок обработки персональных данных описан в Политике в отношении обработки персональных данных. Там же указано, как посмотреть, изменить или удалить свои данные и как отозвать согласие.")
      ]
    },
    {
      title: "10. Изменение условий и разрешение споров",
      blocks: [
        p("Оператор может изменять настоящее Соглашение. Действующая редакция всегда доступна на сайте. Продолжая пользоваться сервисом после изменений, вы принимаете новую редакцию."),
        p(`К отношениям сторон применяется право Российской Федерации. Спорные вопросы стороны стремятся урегулировать перепиской: обращение направляется на ${COMPANY.email}, срок ответа — 30 дней. Если согласия достичь не удалось, спор разрешается в соответствии с законодательством Российской Федерации.`)
      ]
    },
    {
      title: "11. Связь с Оператором",
      blocks: [DETAILS]
    }
  ]
};
const PRIVACY = {
  title: "Политика в отношении обработки персональных данных",
  lead: "Политика составлена в соответствии с требованиями Федерального закона от 27.07.2006 № 152-ФЗ «О персональных данных» и определяет порядок обработки персональных данных и меры по обеспечению их безопасности, предпринимаемые Оператором.",
  sections: [
    {
      title: "1. Сведения об Операторе",
      blocks: [
        p("Оператор ставит своей важнейшей целью соблюдение прав и свобод человека и гражданина при обработке его персональных данных, в том числе защиты прав на неприкосновенность частной жизни."),
        DETAILS,
        p("Обработка персональных данных ведётся с использованием баз данных, находящихся на территории Российской Федерации, в соответствии с частью 5 статьи 18 Федерального закона № 152-ФЗ.")
      ]
    },
    {
      title: "2. Какие данные обрабатываются",
      blocks: [
        p("У пользователя с учётной записью:"),
        list(
          "имя для отображения — чтобы вас узнавали на доске;",
          "адрес электронной почты — чтобы подтвердить учётную запись, восстановить доступ и сообщить об оплате;",
          "пароль — только в виде необратимого хеша; восстановить исходный пароль по нему нельзя;",
          "содержимое созданных досок и загруженные файлы;",
          "сведения об оплатах: номер счёта, тариф, срок, сумма, дата."
        ),
        p("У участника, пришедшего по ссылке без учётной записи, сервис не сохраняет ничего: указанное им имя живёт только на время работы на доске."),
        p("Данные банковской карты сервису не передаются и им не хранятся: оплата проходит на стороне платёжной системы.")
      ]
    },
    {
      title: "3. Цели обработки",
      blocks: [
        list(
          "предоставление доступа к сервису и его возможностям в пределах тарифа;",
          "подтверждение учётной записи и восстановление доступа;",
          "приём оплаты, учёт срока подписки и направление уведомлений о ней;",
          "связь с пользователем по вопросам работы сервиса;",
          "выполнение требований законодательства."
        )
      ]
    },
    {
      title: "4. Правовые основания",
      blocks: [
        p("Оператор обрабатывает персональные данные при наличии согласия пользователя, выраженного путём заполнения форм на сайте, а также в рамках исполнения договора о предоставлении доступа к сервису.")
      ]
    },
    {
      title: "5. Хранение и защита",
      blocks: [
        p("Персональные данные хранятся в базе данных на сервере Оператора, доступ к которому ограничен. Пароли хранятся только в виде необратимого хеша."),
        p("Содержимое досок и загруженные файлы доступны владельцу доски и тем, кому он дал ссылку. Документы, загруженные в личную библиотеку, доступны только их владельцу."),
        p("Передача третьим лицам возможна только по требованию закона или с согласия пользователя, за исключением сервисов, перечисленных в разделе 7.")
      ]
    },
    {
      title: "6. Сроки хранения",
      blocks: [
        list(
          "Данные учётной записи — в течение всего времени её существования.",
          "Содержимое досок и загруженные файлы — пока существует учётная запись. После её удаления доски остаются рабочими для остальных участников ещё шесть месяцев, затем удаляются вместе с файлами.",
          "Сведения об оплатах — в пределах сроков, установленных законодательством о налогах и сборах."
        ),
        p("По достижении целей обработки или при отзыве согласия данные уничтожаются, если иной срок хранения не предусмотрен законом.")
      ]
    },
    {
      title: "7. Сторонние сервисы",
      blocks: [
        p("Для работы отдельных функций используются сервисы сторонних организаций. Данные передаются им только в объёме, необходимом для работы соответствующей функции."),
        {
          kind: "rows",
          caption: "Кому и что передаётся",
          rows: [
            ["Робокасса", "адрес электронной почты и сумма платежа — для приёма оплаты и направления чека. Данные банковской карты вводятся на стороне платёжной системы и Оператору не передаются. Обработка — в Российской Федерации"],
            ["Яндекс Почта", "адрес получателя и текст письма — для отправки подтверждения почты, восстановления пароля и уведомлений об оплате. Обработка — в Российской Федерации"]
          ]
        },
        p("Иным лицам персональные данные не передаются, за исключением случаев, прямо предусмотренных законом.")
      ]
    },
    {
      title: "8. Ваши права и как ими воспользоваться",
      blocks: [
        p("В соответствии со статьями 14–16 Федерального закона № 152-ФЗ вы вправе:"),
        list(
          "получить сведения о том, какие ваши данные обрабатываются, откуда получены и кому передаются;",
          "потребовать уточнения данных, если они неполны, устарели или неточны;",
          "потребовать блокирования или уничтожения данных, если они обрабатываются незаконно;",
          "отозвать согласие на обработку;",
          "обжаловать действия Оператора в Роскомнадзоре или в судебном порядке."
        ),
        p("Посмотреть и изменить свои данные можно в настройках профиля. Там же — удаление учётной записи: оно происходит сразу и необратимо."),
        p(`Обращение направляется на ${COMPANY.email}. Ответ направляется в течение 30 дней. В обращении укажите фамилию, имя, отчество, адрес электронной почты, на который зарегистрирована учётная запись, и существо требования.`)
      ]
    }
  ]
};
const LEGAL = {
  offer: OFFER,
  terms: TERMS,
  privacy: PRIVACY
};
function Piece({ block }) {
  if (block.kind === "p") return /* @__PURE__ */ jsx("p", { children: block.text });
  if (block.kind === "list") {
    return /* @__PURE__ */ jsx("ul", { children: block.items.map((item, index) => /* @__PURE__ */ jsx("li", { children: item }, index)) });
  }
  return /* @__PURE__ */ jsx("div", { className: "table-scroll", children: /* @__PURE__ */ jsxs("table", { className: "legal__table", children: [
    /* @__PURE__ */ jsx("caption", { children: block.caption }),
    /* @__PURE__ */ jsx("tbody", { children: block.rows.map(([name, value]) => /* @__PURE__ */ jsxs("tr", { children: [
      /* @__PURE__ */ jsx("th", { scope: "row", children: name }),
      /* @__PURE__ */ jsx("td", { children: value })
    ] }, name)) })
  ] }) });
}
function LegalPage() {
  const { page } = useParams();
  const document2 = LEGAL[page ?? ""] ?? LEGAL.terms;
  return /* @__PURE__ */ jsx(Page, { children: /* @__PURE__ */ jsxs("article", { className: "card reading legal", children: [
    /* @__PURE__ */ jsx("h1", { children: document2.title }),
    document2.lead ? /* @__PURE__ */ jsx("p", { className: "text-muted", children: document2.lead }) : null,
    document2.sections.map((section) => /* @__PURE__ */ jsxs("section", { children: [
      /* @__PURE__ */ jsx("h2", { className: "legal__title", children: section.title }),
      section.blocks.map((block, index) => /* @__PURE__ */ jsx(Piece, { block }, index))
    ] }, section.title)),
    /* @__PURE__ */ jsxs("p", { className: "text-muted small", children: [
      "Редакция действует с момента публикации.",
      " · ",
      /* @__PURE__ */ jsx(Link, { to: "/legal/offer", children: "Оферта" }),
      " · ",
      /* @__PURE__ */ jsx(Link, { to: "/legal/terms", children: "Соглашение" }),
      " · ",
      /* @__PURE__ */ jsx(Link, { to: "/legal/privacy", children: "Персональные данные" })
    ] })
  ] }) });
}
function useDocumentMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const meta = metaFor(pathname);
    document.title = meta.title;
    const description = document.querySelector('meta[name="description"]');
    description == null ? void 0 : description.setAttribute("content", meta.description);
  }, [pathname]);
}
function App() {
  const { user, loading: loading2 } = useAuth();
  useDocumentMeta();
  if (loading2) {
    return /* @__PURE__ */ jsx("div", { className: "screen-center muted", children: "Загружаем…" });
  }
  return /* @__PURE__ */ jsxs(Routes, { children: [
    /* @__PURE__ */ jsx(Route, { path: "/legal/:page", element: /* @__PURE__ */ jsx(LegalPage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/about", element: /* @__PURE__ */ jsx(AboutPage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/pricing", element: /* @__PURE__ */ jsx(PricingPage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/features", element: /* @__PURE__ */ jsx(FeaturesPage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/faq", element: /* @__PURE__ */ jsx(FaqPage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/confirm", element: /* @__PURE__ */ jsx(ConfirmPage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/reset-password", element: /* @__PURE__ */ jsx(ResetPasswordPage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/join/:token", element: /* @__PURE__ */ jsx(JoinPage, {}) }),
    /* @__PURE__ */ jsx(Route, { path: "/boards/:boardId", element: /* @__PURE__ */ jsx(BoardPage, {}) }),
    user ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Route, { path: "/", element: /* @__PURE__ */ jsx(LandingPage, {}) }),
      /* @__PURE__ */ jsx(Route, { path: "/login", element: /* @__PURE__ */ jsx(Navigate, { to: "/boards", replace: true }) }),
      /* @__PURE__ */ jsx(Route, { path: "/register", element: /* @__PURE__ */ jsx(Navigate, { to: "/boards", replace: true }) }),
      /* @__PURE__ */ jsx(Route, { path: "/boards", element: /* @__PURE__ */ jsx(BoardsPage, {}) }),
      /* @__PURE__ */ jsx(Route, { path: "/profile", element: /* @__PURE__ */ jsx(ProfilePage, {}) }),
      /* @__PURE__ */ jsx(Route, { path: "/plan", element: /* @__PURE__ */ jsx(PlanPage, {}) }),
      /* @__PURE__ */ jsx(Route, { path: "/plan/paid", element: /* @__PURE__ */ jsx(PlanPage, {}) }),
      /* @__PURE__ */ jsx(Route, { path: "/plan/failed", element: /* @__PURE__ */ jsx(PlanPage, {}) }),
      /* @__PURE__ */ jsx(Route, { path: "*", element: /* @__PURE__ */ jsx(Navigate, { to: "/boards", replace: true }) })
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Route, { path: "/", element: /* @__PURE__ */ jsx(LandingPage, {}) }),
      /* @__PURE__ */ jsx(Route, { path: "/login", element: /* @__PURE__ */ jsx(LoginPage, {}) }),
      /* @__PURE__ */ jsx(Route, { path: "/register", element: /* @__PURE__ */ jsx(RegisterPage, {}) }),
      /* @__PURE__ */ jsx(Route, { path: "/forgot-password", element: /* @__PURE__ */ jsx(ForgotPasswordPage, {}) }),
      /* @__PURE__ */ jsx(Route, { path: "*", element: /* @__PURE__ */ jsx(Navigate, { to: "/", replace: true }) })
    ] })
  ] });
}
function render(url) {
  return renderToString(
    /* @__PURE__ */ jsx(StaticRouter, { location: url, children: /* @__PURE__ */ jsx(AuthProvider, { children: /* @__PURE__ */ jsx(App, {}) }) })
  );
}
export {
  PUBLIC_PAGES,
  SITE_URL,
  render
};
