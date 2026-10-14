// Работа с Supabase как с общим хранилищем группы.
//
// Supabase — это PostgreSQL в облаке, который сам создаёт REST API для таблиц
// (технология PostgREST). Поэтому нам не нужен отдельный хостинг для Node-сервера:
// приложение обращается к базе обычными HTTPS-запросами.
//
// Дополнительные библиотеки не используются — только fetch. Это осознанно: в проекте
// и так много зависимостей, а REST-запросы читаются и отлаживаются проще.

import { GroupData, Lesson, LessonKind, Subject, Task, TaskKind, TaskStatus, WeekParity, Weekday } from '../types';
import { createMockGroupData } from '../data/mockData';
import { LessonInput, TaskInput } from '../store/context';

/** Адрес проекта Supabase и публичный (anon) ключ — задаются в .env.local. */
const BASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Настроен ли режим Supabase. */
export const isSupabaseConfigured = (): boolean => Boolean(BASE_URL && ANON_KEY);

/** Сколько ждать ответа Supabase. */
const TIMEOUT_MS = 15000;

/** Строка таблицы как её отдаёт Supabase (имена в snake_case). */
type Row = Record<string, unknown>;

/**
 * Шапка запроса.
 *
 * Тонкость про ключи: у Supabase два формата.
 *   • старый («anon») — это JWT, он начинается с `eyJ`. Его передают и в `apikey`,
 *     и в `Authorization: Bearer ...`;
 *   • новый («publishable», `sb_publishable_...`) — это НЕ JWT. Если отправить его
 *     в заголовке Authorization, сервер ответит ошибкой авторизации. Поэтому такой ключ
 *     передаём только в `apikey`.
 */
const headers = (extra?: Record<string, string>): Record<string, string> => {
  const key = ANON_KEY ?? '';
  const result: Record<string, string> = {
    apikey: key,
    'Content-Type': 'application/json',
    ...extra,
  };

  if (key.startsWith('eyJ')) {
    result.Authorization = `Bearer ${key}`;
  }

  return result;
};

/** Обёртка над fetch к REST API Supabase. */
const rest = async <T>(path: string, init?: RequestInit): Promise<T> => {
  // ВАЖНО: заголовки запроса вынимаем отдельно и подставляем ПОСЛЕ остальных параметров.
  // Если просто написать { headers: ..., ...init }, то переданные заголовки (например,
  // Prefer при записи) затрут apikey, и сервер ответит 401 «No API key found in request».
  const { headers: extraHeaders, ...restInit } = init ?? {};

  const response = await fetch(`${BASE_URL}/rest/v1${path}`, {
    ...restInit,
    headers: headers(extraHeaders as Record<string, string> | undefined),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Supabase ответил ${response.status}: ${text.slice(0, 200)}`);
  }

  // POST с заголовком Prefer: return=minimal возвращает пустое тело — учитываем это.
  return text ? (JSON.parse(text) as T) : (undefined as T);
};

// ---------------------------------------------------------------- ЧТЕНИЕ

const mapSubject = (row: Row): Subject => ({
  id: String(row.id),
  title: String(row.title),
  short: String(row.short),
  teacher: String(row.teacher),
});

const mapLesson = (row: Row): Lesson => ({
  id: String(row.id),
  subjectId: String(row.subject_id),
  weekday: String(row.weekday) as Weekday,
  startTime: String(row.start_time),
  endTime: String(row.end_time),
  room: String(row.room ?? ''),
  kind: String(row.kind) as LessonKind,
  parity: String(row.parity ?? 'all') as WeekParity,
});

const mapTask = (row: Row): Task => ({
  id: String(row.id),
  subjectId: String(row.subject_id),
  title: String(row.title),
  description: String(row.description ?? ''),
  kind: String(row.kind) as TaskKind,
  dueDate: String(row.due_date),
  status: String(row.status ?? 'todo') as TaskStatus,
  authorId: row.author_id === null || row.author_id === undefined ? undefined : Number(row.author_id),
  authorName: row.author_name === null || row.author_name === undefined ? undefined : String(row.author_name),
  createdAt: String(row.created_at ?? new Date().toISOString()),
});

/** Читает все общие данные группы. */
export const supabaseGetGroup = async (): Promise<GroupData> => {
  const [subjectRows, lessonRows, taskRows, metaRows] = await Promise.all([
    rest<Row[]>('/subjects?select=*&order=title'),
    rest<Row[]>('/lessons?select=*&order=start_time'),
    rest<Row[]>('/tasks?select=*&order=due_date'),
    rest<Row[]>('/meta?select=*'),
  ]);

  const meta = new Map(metaRows.map((row) => [String(row.key), String(row.value)]));

  return {
    version: Number(meta.get('version') ?? 1),
    groupName: meta.get('group_name') ?? 'ИС-31',
    subjects: subjectRows.map(mapSubject),
    lessons: lessonRows.map(mapLesson),
    tasks: taskRows.map(mapTask),
    updatedAt: meta.get('updated_at') ?? new Date().toISOString(),
  };
};

/** Лёгкая проверка доступности: используется при запуске приложения. */
export const supabasePing = (): Promise<Row[]> => rest<Row[]>('/subjects?select=id&limit=1');

/** Записывает время последнего изменения. */
const touch = async (): Promise<void> => {
  await rest('/meta', {
    method: 'POST',
    // resolution=merge-duplicates — «вставить или обновить» (upsert) по первичному ключу.
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: 'updated_at', value: new Date().toISOString() }),
  });
};

/** Изменение + возврат полного набора данных: так же ведёт себя и наш Express-сервер. */
const mutateAndReload = async (action: () => Promise<unknown>): Promise<GroupData> => {
  await action();
  await touch();
  return supabaseGetGroup();
};

// ---------------------------------------------------------------- ЗАПИСЬ

/** Задание для записи в базу: id и время создания приходят из приложения. */
export type TaskRowInput = TaskInput & {
  id?: string;
  createdAt?: string;
  authorId?: number;
  authorName?: string;
};

/** Пара для записи в базу. */
export type LessonRowInput = LessonInput & { id?: string };

const taskToRow = (input: TaskRowInput): Row => {
  const row: Row = {
    subject_id: input.subjectId,
    title: input.title.trim(),
    description: input.description.trim(),
    kind: input.kind,
    due_date: input.dueDate,
    status: input.status ?? 'todo',
    author_id: input.authorId ?? null,
    author_name: input.authorName ?? null,
  };

  // id и created_at добавляем только при создании: при изменении их трогать нельзя.
  if (input.id) row.id = input.id;
  if (input.createdAt) row.created_at = input.createdAt;

  return row;
};

const lessonToRow = (input: LessonRowInput): Row => {
  const row: Row = {
    subject_id: input.subjectId,
    weekday: input.weekday,
    start_time: input.startTime,
    end_time: input.endTime,
    room: input.room,
    kind: input.kind,
    parity: input.parity,
  };

  if (input.id) row.id = input.id;

  return row;
};

/** Фильтр «все строки»: PostgREST требует фильтр для изменения и удаления. */
const ALL_ROWS = '?id=not.is.null';

export const supabaseCreateTask = (input: TaskRowInput): Promise<GroupData> =>
  mutateAndReload(() =>
    rest('/tasks', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(taskToRow(input)),
    }),
  );

export const supabaseUpdateTask = (id: string, input: TaskInput): Promise<GroupData> =>
  mutateAndReload(() =>
    rest(`/tasks?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(taskToRow(input)),
    }),
  );

export const supabasePatchTask = (id: string, patch: { status: TaskStatus }): Promise<GroupData> =>
  mutateAndReload(() =>
    rest(`/tasks?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: patch.status }),
    }),
  );

export const supabaseDeleteTask = (id: string): Promise<GroupData> =>
  mutateAndReload(() =>
    rest(`/tasks?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    }),
  );

export const supabaseCreateLesson = (input: LessonRowInput): Promise<GroupData> =>
  mutateAndReload(() =>
    rest('/lessons', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(lessonToRow(input)),
    }),
  );

export const supabaseUpdateLesson = (id: string, input: LessonInput): Promise<GroupData> =>
  mutateAndReload(() =>
    rest(`/lessons?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(lessonToRow(input)),
    }),
  );

export const supabaseDeleteLesson = (id: string): Promise<GroupData> =>
  mutateAndReload(() =>
    rest(`/lessons?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    }),
  );

export const supabaseSetGroupName = (groupName: string): Promise<GroupData> =>
  mutateAndReload(() =>
    rest('/meta', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: 'group_name', value: groupName.trim() }),
    }),
  );

/**
 * Сброс к тестовым данным: удаляем задания и пары, затем заливаем их заново из mockData.
 * Предметы не трогаем — они задаются схемой базы.
 */
export const supabaseReset = async (): Promise<GroupData> => {
  const fresh = createMockGroupData();

  return mutateAndReload(async () => {
    await rest(`/tasks${ALL_ROWS}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    await rest(`/lessons${ALL_ROWS}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });

    for (const lesson of fresh.lessons) {
      await rest('/lessons', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(lessonToRow(lesson)),
      });
    }

    for (const task of fresh.tasks) {
      await rest('/tasks', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(taskToRow(task)),
      });
    }
  });
};
