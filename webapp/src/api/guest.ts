/**
 * Гостевая сессия в браузере.
 *
 * Хранится отдельно от токена учётной записи и по каждой доске своя: гость
 * может быть позван на две доски разными ссылками, и токен одной не должен
 * подходить к другой.
 *
 * Метка гостя (guestId) живёт дольше токена и переживает выход: по ней
 * владелец доски выгоняет гостя на пятнадцать минут. Не сохраняй мы её,
 * выгнанный обходил бы отказ простым обновлением страницы.
 */

const TOKEN_PREFIX = 'schoolpiboard.guest.';
const MARKER_KEY = 'schoolpiboard.guestMarker';

export function readGuestToken(boardId: number): string | null {
  try {
    return localStorage.getItem(TOKEN_PREFIX + boardId);
  } catch {
    // Приватный режим в некоторых браузерах запрещает хранилище. Гость всё
    // равно сможет войти — просто заново назовёт имя.
    return null;
  }
}

export function writeGuestToken(boardId: number, token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_PREFIX + boardId, token);
    } else {
      localStorage.removeItem(TOKEN_PREFIX + boardId);
    }
  } catch {
    // Не смогли сохранить — не беда, сессия проживёт до перезагрузки страницы.
  }
}

/** Метка браузера. Общая для всех досок: это «кто», а не «где». */
export function readGuestMarker(): string | null {
  try {
    return localStorage.getItem(MARKER_KEY);
  } catch {
    return null;
  }
}

export function writeGuestMarker(marker: string): void {
  try {
    localStorage.setItem(MARKER_KEY, marker);
  } catch {
    // См. выше.
  }
}
