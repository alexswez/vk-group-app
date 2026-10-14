// Слой хранения ОБЩИХ данных группы.
//
// Логика в двух режимах:
//   1. Сервер доступен  → данные берём и сохраняем на сервере (все одногруппники видят одно и то же);
//   2. Сервер выключен  → работаем локально в localStorage браузера (удобно при разработке).
//
// Благодаря тому, что функции асинхронные, остальному приложению всё равно, какой режим работает.

import { GroupData } from '../types';
import { createMockGroupData } from '../data/mockData';
import { apiGetGroup, apiReset, checkServer, isServerAvailable } from './api';

/** Ключ, под которым данные лежат в localStorage (локальный режим). */
const STORAGE_KEY = 'vk-group-app:group-data';

/** Данные из памяти браузера. */
const loadFromLocalStorage = (): GroupData => {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    const fresh = createMockGroupData();
    saveToLocalStorage(fresh);
    return fresh;
  }

  try {
    const parsed = JSON.parse(raw) as GroupData;
    if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.lessons)) {
      throw new Error('Неверный формат данных');
    }
    return parsed;
  } catch {
    const fresh = createMockGroupData();
    saveToLocalStorage(fresh);
    return fresh;
  }
};

/** Сохранение в память браузера. */
const saveToLocalStorage = (data: GroupData): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }));
};

/**
 * Загружает общие данные.
 * Сначала проверяем сервер: если он есть — берём данные оттуда, иначе из localStorage.
 */
export const loadGroupData = async (): Promise<GroupData> => {
  const serverIsUp = await checkServer();

  if (serverIsUp) {
    try {
      const data = await apiGetGroup();
      // Дублируем в localStorage: если сервер потом пропадёт, приложение останется с данными.
      saveToLocalStorage(data);
      return data;
    } catch {
      // Сервер ответил на /health, но упал на /api/group — работаем локально.
    }
  }

  return loadFromLocalStorage();
};

/** Сохраняет данные локально (используется только в режиме без сервера). */
export const saveGroupData = async (data: GroupData): Promise<void> => {
  saveToLocalStorage(data);
};

/** Сброс к тестовым данным: на сервере или локально. */
export const resetGroupData = async (): Promise<GroupData> => {
  if (isServerAvailable()) {
    try {
      return await apiReset();
    } catch {
      // Сервер перестал отвечать — сбрасываем локально.
    }
  }

  const fresh = createMockGroupData();
  saveToLocalStorage(fresh);
  return fresh;
};
