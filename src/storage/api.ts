// Клиент нашего API: все обращения к серверу общего хранилища собраны в одном файле.
//
// Ключевая идея: приложение не должно «падать», если сервер выключен. Поэтому каждая функция
// либо возвращает данные, либо бросает ошибку — а вызывающий код решает, что делать.

import { GroupData, Task, TaskStatus } from '../types';
import { LessonInput, TaskInput } from '../store/context';

/**
 * Адрес сервера. Берём из переменной окружения Vite (файл .env), а если её нет —
 * используем локальный адрес при разработке.
 */
const BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Был ли сервер доступен при последней проверке. */
let serverAvailable = false;

export const isServerAvailable = (): boolean => serverAvailable;

/**
 * Обёртка над fetch.
 * AbortSignal.timeout(4000) — «предохранитель»: если сервер молчит дольше 4 секунд,
 * запрос прерывается, и приложение переходит в локальный режим вместо бесконечного ожидания.
 */
const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(4000),
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Сервер вернул ошибку ${response.status}`);
  }

  return (await response.json()) as T;
};

/** Проверяет, поднят ли сервер. Вызывается один раз при запуске приложения. */
export const checkServer = async (): Promise<boolean> => {
  try {
    await request<{ ok: boolean }>('/health');
    serverAvailable = true;
  } catch {
    serverAvailable = false;
  }
  return serverAvailable;
};

/** Все общие данные группы. */
export const apiGetGroup = (): Promise<GroupData> => request<GroupData>('/api/group');

// Каждая изменяющая операция возвращает ПОЛНЫЙ набор данных — так проще синхронизировать состояние.

export const apiCreateTask = (input: TaskInput & { authorId?: number; authorName?: string }): Promise<GroupData> =>
  request<GroupData>('/api/tasks', { method: 'POST', body: JSON.stringify(input) });

export const apiUpdateTask = (id: string, input: TaskInput): Promise<GroupData> =>
  request<GroupData>(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(input) });

export const apiPatchTask = (id: string, patch: Partial<Pick<Task, 'status'>> & { status: TaskStatus }): Promise<GroupData> =>
  request<GroupData>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const apiDeleteTask = (id: string): Promise<GroupData> =>
  request<GroupData>(`/api/tasks/${id}`, { method: 'DELETE' });

export const apiCreateLesson = (input: LessonInput): Promise<GroupData> =>
  request<GroupData>('/api/lessons', { method: 'POST', body: JSON.stringify(input) });

export const apiUpdateLesson = (id: string, input: LessonInput): Promise<GroupData> =>
  request<GroupData>(`/api/lessons/${id}`, { method: 'PUT', body: JSON.stringify(input) });

export const apiDeleteLesson = (id: string): Promise<GroupData> =>
  request<GroupData>(`/api/lessons/${id}`, { method: 'DELETE' });

export const apiSetGroupName = (groupName: string): Promise<GroupData> =>
  request<GroupData>('/api/settings', { method: 'PUT', body: JSON.stringify({ groupName }) });

export const apiReset = (): Promise<GroupData> => request<GroupData>('/api/reset', { method: 'POST' });
