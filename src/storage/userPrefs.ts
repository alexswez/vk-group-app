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

/** Загружает личные настройки: сначала пробуем VK Storage, при неудаче — localStorage. */
export const loadUserPrefs = async (): Promise<UserPrefs> => {
  try {
    const result = await bridge.send('VKWebAppStorageGet', { keys: [PREFS_KEY] });
    const raw = result.keys.find((item) => item.key === PREFS_KEY)?.value;
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<UserPrefs>) };
  } catch {
    // Вне ВКонтакте VK Bridge не отвечает — это ожидаемая ситуация при разработке.
    return loadFromLocalStorage();
  }
};

/** Сохраняет личные настройки. */
export const saveUserPrefs = async (prefs: UserPrefs): Promise<void> => {
  const raw = JSON.stringify(prefs);

  // Дублируем в localStorage всегда: так настройки не потеряются при запуске в браузере.
  localStorage.setItem(FALLBACK_KEY, raw);

  try {
    await bridge.send('VKWebAppStorageSet', { key: PREFS_KEY, value: raw });
  } catch {
    // Если мы не внутри ВКонтакте — данные уже сохранены в localStorage, ничего страшного.
  }
};
