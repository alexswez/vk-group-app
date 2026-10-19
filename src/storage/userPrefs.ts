// Личные настройки пользователя — то, что у каждого своё.
//
// Здесь мы используем VK Storage (VK Bridge: VKWebAppStorageGet / VKWebAppStorageSet).
// Это правильное место для личных настроек: по документации VK API переменные хранилища
// привязаны к пользователю (параметр user_id у методов storage.get / storage.set) —
// то есть у каждого своя копия.
//
// ⚠️ Для ОБЩИХ данных (расписание и задания всей группы) VK Storage НЕ подходит
// именно поэтому: изменения одного не увидит другой. Общие данные хранит наш бэкенд (этап 5).

import bridge from '@vkontakte/vk-bridge';
import { UserPrefs } from '../types';

/** Ключ в VK Storage. */
const PREFS_KEY = 'user_prefs';

/** Ключ-дублёр в localStorage: нужен, когда приложение открыто в обычном браузере, а не в VK. */
const FALLBACK_KEY = 'vk-group-app:user-prefs';

/** Настройки по умолчанию. */
export const DEFAULT_PREFS: UserPrefs = {
  subgroup: 1,
  showPastLessons: true,
};

/** Читает настройки из localStorage (запасной вариант). */
const loadFromLocalStorage = (): UserPrefs => {
  const raw = localStorage.getItem(FALLBACK_KEY);
  if (!raw) return DEFAULT_PREFS;
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<UserPrefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
};

/** Сколько ждём ответа от VK Bridge, прежде чем работать без него. */
const BRIDGE_TIMEOUT_MS = 2500;

/**
 * Ждёт промис не дольше указанного времени и возвращает запасное значение.
 *
 * Зачем это нужно: вне ВКонтакте (обычный браузер, сторонний хостинг) VK Bridge
 * не отвечает вообще — промис не отклоняется, а просто «висит». Без таймаута
 * приложение навсегда оставалось на экране загрузки: именно это и случилось,
 * когда мы открыли сайт вне ВКонтакте.
 */
const withTimeout = async <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
  // Если промис всё-таки упадёт позже, ошибка не должна «выстрелить» без обработчика.
  const guarded = promise.catch(() => fallback);

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      guarded,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/** Загружает личные настройки: сначала пробуем VK Storage, при неудаче — localStorage. */
export const loadUserPrefs = async (): Promise<UserPrefs> => {
  // undefined означает «ВКонтакте не ответил вовремя» или «настройки ещё не сохранялись».
  const raw = await withTimeout(
    bridge.send('VKWebAppStorageGet', { keys: [PREFS_KEY] }).then(
      (result) => result.keys.find((item) => item.key === PREFS_KEY)?.value,
    ),
    BRIDGE_TIMEOUT_MS,
    undefined,
  );

  if (!raw) return loadFromLocalStorage();

  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<UserPrefs>) };
  } catch {
    return loadFromLocalStorage();
  }
};

/** Сохраняет личные настройки. */
export const saveUserPrefs = async (prefs: UserPrefs): Promise<void> => {
  const raw = JSON.stringify(prefs);

  // Дублируем в localStorage всегда: так настройки не потеряются при запуске в браузере.
  localStorage.setItem(FALLBACK_KEY, raw);

  // Отправку в VK Storage не ждём дольше пары секунд: вне ВКонтакте она не ответит.
  await withTimeout(bridge.send('VKWebAppStorageSet', { key: PREFS_KEY, value: raw }), BRIDGE_TIMEOUT_MS, undefined);
};
