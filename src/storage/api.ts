// Клиент хранилища: единая точка входа ко всем «сетевым» источникам данных.
//
// Источник выбирается автоматически по настройкам окружения:
//
//   • Supabase (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY) — PostgreSQL в облаке,
//     который сам предоставляет REST API. Основной вариант для опубликованного приложения:
//     работает из регионов, где хостинги Node-серверов недоступны;
//   • собственный Express-сервер (VITE_API_URL) — для локальной разработки;
//   • если не настроено ничего — приложение работает локально (localStorage).
//
// Ключевая идея: приложение не должно «падать», если хранилище недоступно. Поэтому каждая
// функция либо возвращает данные, либо бросает ошибку — а вызывающий код решает, что делать.

import { GroupData, Task, TaskStatus } from '../types';
import { LessonInput, TaskInput } from '../store/context';
import {
  isSupabaseConfigured,
  supabaseCreateLesson,
  supabaseCreateTask,
  supabaseDeleteLesson,
  supabaseDeleteTask,
  supabaseGetGroup,
  supabasePatchTask,
  supabasePing,
  supabaseReset,
  supabaseSetGroupName,
  supabaseUpdateLesson,
  supabaseUpdateTask,
} from './supabase';

/**
 * Адрес нашего Express-сервера. Берём из переменной окружения Vite (файл .env.local).
 *
 * Если переменная не задана:
 *   • при разработке (npm start) подставляем localhost — удобно держать сервер локально;
 *   • в боевой сборке оставляем пустую строку, чтобы адрес локального сервера не попадал
 *     в опубликованное приложение (там работает Supabase, он настраивается отдельно).
 */
const BASE_URL: string =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3000' : '');

/** Был ли сервер доступен при последней проверке. */
let serverAvailable = false;

export const isServerAvailable = (): boolean => serverAvailable;

/** Работаем ли мы через облако Supabase. */
export const usingSupabase = (): boolean => isSupabaseConfigured();

/**
 * Можно ли вообще пытаться обратиться к хранилищу из текущей страницы.
 * Если приложение открыто по HTTPS (так работают мини-приложения внутри ВКонтакте),
 * браузер запретит запрос к http-адресу — «смешанный контент». В этом случае попытки
 * бессмысленны: сразу работаем локально, без ошибок в консоли.
 */
export const canReachServer = (): boolean => {
  // Supabase всегда отвечает по HTTPS, поэтому смешанного контента не бывает.
  if (isSupabaseConfigured()) return true;
  return !(window.location.protocol === 'https:' && BASE_URL.startsWith('http://'));
};

/**
 * Сколько ждать ответа, миллисекунды.
 *
 * 15 секунд — не случайное число: на бесплатных тарифах облако «засыпает» после простоя,
 * и первый запрос может идти 30–50 секунд. Слишком короткий таймаут заставил бы приложение
 * решить, что хранилища нет, и уйти в локальный режим. Долгое ожидание не мешает работе:
 * интерфейс обновляется сразу (оптимистично).
 */
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Обёртка над fetch для нашего Express-сервера.
 * AbortSignal.timeout — «предохранитель» от бесконечного ожидания.
 */
const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  // Заголовки вынимаем отдельно и подставляем последними — иначе переданные заголовки
  // затрёт весь набор, включая Content-Type.
  const { headers: extraHeaders, ...restInit } = init ?? {};

  const response = await fetch(`${BASE_URL}${path}`, {
    ...restInit,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'Content-Type': 'application/json', ...(extraHeaders as Record<string, string> | undefined) },
  });

  if (!response.ok) {
    throw new Error(`Сервер вернул ошибку ${response.status}`);
  }

  return (await response.json()) as T;
};

/** Проверяет доступность хранилища. Вызывается при запуске приложения и при переподключении. */
export const checkServer = async (): Promise<boolean> => {
  if (isSupabaseConfigured()) {
    try {
      await supabasePing();
      serverAvailable = true;
    } catch {
      serverAvailable = false;
    }
    return serverAvailable;
  }

  // Если из текущей страницы обратиться к серверу в принципе нельзя (смешанный контент),
  // сразу работаем локально: без ошибок в консоли и без ожидания таймаута.
  if (!canReachServer()) {
    serverAvailable = false;
    return false;
  }

  try {
    await request<{ ok: boolean }>('/health');
    serverAvailable = true;
  } catch {
    serverAvailable = false;
  }
  return serverAvailable;
};

/** Человеческое описание источника данных — показывается в настройках. */
export const describeSource = (): string => {
  if (!serverAvailable) return 'локально — только этот браузер';
  return isSupabaseConfigured() ? 'облако Supabase — данные видят все одногруппники' : 'общий сервер — данные видят все одногруппники';
};

/** Все общие данные группы. */
export const apiGetGroup = (): Promise<GroupData> =>
  isSupabaseConfigured() ? supabaseGetGroup() : request<GroupData>('/api/group');

// Каждая изменяющая операция возвращает ПОЛНЫЙ набор данных — так проще синхронизировать состояние.

export const apiCreateTask = (
  input: TaskInput & { id?: string; createdAt?: string; authorId?: number; authorName?: string },
): Promise<GroupData> =>
  isSupabaseConfigured()
    ? supabaseCreateTask(input)
    : request<GroupData>('/api/tasks', { method: 'POST', body: JSON.stringify(input) });

export const apiUpdateTask = (id: string, input: TaskInput): Promise<GroupData> =>
  isSupabaseConfigured()
    ? supabaseUpdateTask(id, input)
    : request<GroupData>(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(input) });

export const apiPatchTask = (
  id: string,
  patch: Partial<Pick<Task, 'status'>> & { status: TaskStatus },
): Promise<GroupData> =>
  isSupabaseConfigured()
    ? supabasePatchTask(id, { status: patch.status })
    : request<GroupData>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const apiDeleteTask = (id: string): Promise<GroupData> =>
  isSupabaseConfigured()
    ? supabaseDeleteTask(id)
    : request<GroupData>(`/api/tasks/${id}`, { method: 'DELETE' });

export const apiCreateLesson = (input: LessonInput & { id?: string }): Promise<GroupData> =>
  isSupabaseConfigured()
    ? supabaseCreateLesson(input)
    : request<GroupData>('/api/lessons', { method: 'POST', body: JSON.stringify(input) });

export const apiUpdateLesson = (id: string, input: LessonInput): Promise<GroupData> =>
  isSupabaseConfigured()
    ? supabaseUpdateLesson(id, input)
    : request<GroupData>(`/api/lessons/${id}`, { method: 'PUT', body: JSON.stringify(input) });

export const apiDeleteLesson = (id: string): Promise<GroupData> =>
  isSupabaseConfigured()
    ? supabaseDeleteLesson(id)
    : request<GroupData>(`/api/lessons/${id}`, { method: 'DELETE' });

export const apiSetGroupName = (groupName: string): Promise<GroupData> =>
  isSupabaseConfigured()
    ? supabaseSetGroupName(groupName)
    : request<GroupData>('/api/settings', { method: 'PUT', body: JSON.stringify({ groupName }) });

export const apiReset = (): Promise<GroupData> =>
  isSupabaseConfigured() ? supabaseReset() : request<GroupData>('/api/reset', { method: 'POST' });
