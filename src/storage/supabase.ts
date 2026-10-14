// Работа с Supabase как с общим хранилищем группы.
//
// Supabase — это PostgreSQL в облаке, который сам создаёт REST API для таблиц
// (технология PostgREST). Поэтому нам не нужен отдельный хостинг для Node-сервера:
// приложение обращается к базе обычными HTTPS-запросами.
//
// Дополнительные библиотеки не используются — только fetch. Это осознанно: в проекте
// и так много зависимостей, а REST-запросы читаются и отлаживаются проще.

import { GroupData, Lesson, LessonKind, Material, Subject, Task, TaskKind, TaskStatus, WeekParity, Weekday } from '../types';
import { createMockGroupData } from '../data/mockData';
import { LessonInput, MaterialInput, SubjectInput, TaskInput } from '../store/context';

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
  // Старые записи (до обновления схемы) не имеют поля lesson_mode — считаем их занятиями сессии.
  // Колонка называется lesson_mode, потому что имя «mode» конфликтует с функцией PostgreSQL.
  mode: row.lesson_mode === 'online' ? 'online' : 'session',
  date: row.lesson_date ? String(row.lesson_date) : undefined,
});

const mapMaterial = (row: Row): Material => ({
  id: String(row.id),
  subjectId: String(row.subject_id),
  title: String(row.title),
  description: String(row.description ?? ''),
  filePath: row.file_path ? String(row.file_path) : undefined,
  fileName: row.file_name ? String(row.file_name) : undefined,
  fileSize: row.file_size === null || row.file_size === undefined ? undefined : Number(row.file_size),
  link: row.link ? String(row.link) : undefined,
  uploadedBy: row.uploaded_by ? String(row.uploaded_by) : undefined,
  uploadedAt: String(row.uploaded_at ?? new Date().toISOString()),
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
  attachmentPath: row.attachment_path ? String(row.attachment_path) : undefined,
  attachmentName: row.attachment_name ? String(row.attachment_name) : undefined,
  attachmentLink: row.attachment_link ? String(row.attachment_link) : undefined,
});

/** Читает все общие данные группы. */
export const supabaseGetGroup = async (): Promise<GroupData> => {
  const [subjectRows, lessonRows, taskRows, metaRows] = await Promise.all([
    rest<Row[]>('/subjects?select=*&order=title'),
    rest<Row[]>('/lessons?select=*&order=start_time'),
    rest<Row[]>('/tasks?select=*&order=due_date'),
    rest<Row[]>('/meta?select=*'),
  ]);

  // Материалы читаем отдельно и «мягко»: если обновление базы ещё не применено,
  // таблицы materials может не быть. Тогда просто показываем пустой список,
  // вместо того чтобы уходить в локальный режим и терять общие данные.
  let materialRows: Row[] = [];
  try {
    materialRows = await rest<Row[]>('/materials?select=*&order=uploaded_at.desc');
  } catch {
    materialRows = [];
  }

  const meta = new Map(metaRows.map((row) => [String(row.key), String(row.value)]));

  return {
    version: Number(meta.get('version') ?? 1),
    groupName: meta.get('group_name') ?? 'ИС-31',
    subjects: subjectRows.map(mapSubject),
    lessons: lessonRows.map(mapLesson),
    tasks: taskRows.map(mapTask),
    materials: materialRows.map(mapMaterial),
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

/** Задание с вложением: файл загружаем в хранилище, а в задание пишем путь и имя. */
export type TaskRowWithAttachment = TaskRowInput & {
  attachmentPath?: string;
  attachmentName?: string;
  attachmentLink?: string;
};

const taskToRow = (input: TaskRowWithAttachment): Row => {
  const row: Row = {
    subject_id: input.subjectId,
    title: input.title.trim(),
    description: input.description.trim(),
    kind: input.kind,
    due_date: input.dueDate,
    status: input.status ?? 'todo',
    author_id: input.authorId ?? null,
    author_name: input.authorName ?? null,
    // Вложение: путь к файлу в хранилище, его имя для показа и/или внешняя ссылка.
    attachment_path: input.attachmentPath ?? null,
    attachment_name: input.attachmentName ?? null,
    attachment_link: input.attachmentLink ?? null,
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
    // Период обучения и (для дистанционных занятий) конкретная дата.
    lesson_mode: input.mode,
    lesson_date: input.mode === 'online' ? (input.date ?? null) : null,
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

// ---------------------------------------------------------------- ПРЕДМЕТЫ

/**
 * Создаёт предмет. Код (id) формируем на стороне приложения из названия:
 * этот код связывает предмет с парами, заданиями и материалами.
 */
export const supabaseCreateSubject = (id: string, input: SubjectInput): Promise<GroupData> =>
  mutateAndReload(() =>
    rest('/subjects', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id,
        title: input.title.trim(),
        short: input.short.trim() || input.title.trim().slice(0, 6),
        teacher: input.teacher.trim(),
      }),
    }),
  );

/** Меняет название предмета, короткое имя и преподавателя. Код (id) не меняется. */
export const supabaseUpdateSubject = (id: string, input: SubjectInput): Promise<GroupData> =>
  mutateAndReload(() =>
    rest(`/subjects?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        title: input.title.trim(),
        short: input.short.trim() || input.title.trim().slice(0, 6),
        teacher: input.teacher.trim(),
      }),
    }),
  );

/** Удаляет предмет. Если на него ссылаются пары или задания, база не даст это сделать. */
export const supabaseDeleteSubject = (id: string): Promise<GroupData> =>
  mutateAndReload(() =>
    rest(`/subjects?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    }),
  );

// ---------------------------------------------------------------- МАТЕРИАЛЫ И ФАЙЛЫ

/** Бакет (папка) в хранилище Supabase, где лежат файлы материалов. */
const MATERIAL_BUCKET = 'materials';

/**
 * Приводит имя файла к безопасному виду для пути в хранилище.
 * Кириллицу и пробелы заменяем подчёркиваниями, расширение сохраняем
 * (оригинальное имя хранится отдельно и показывается пользователю).
 */
const sanitizeFileName = (name: string): string =>
  name
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(-64);

/** Загружает файл в хранилище и возвращает путь внутри бакета. */
const uploadToStorage = async (path: string, file: File): Promise<string> => {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');

  const response = await fetch(`${BASE_URL}/storage/v1/object/${MATERIAL_BUCKET}/${encodedPath}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY ?? '',
      'Content-Type': file.type || 'application/octet-stream',
      // Если файл с таким путём уже есть — перезаписываем.
      'x-upsert': 'true',
    },
    body: file,
    // Файлы бывают большими, поэтому таймаут здесь больше обычного.
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Хранилище ответило ${response.status}: ${text.slice(0, 200)}`);
  }

  return path;
};

/** Удаляет файл из хранилища. */
const deleteFromStorage = async (path: string): Promise<void> => {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');

  await fetch(`${BASE_URL}/storage/v1/object/${MATERIAL_BUCKET}/${encodedPath}`, {
    method: 'DELETE',
    headers: { apikey: ANON_KEY ?? '' },
    signal: AbortSignal.timeout(30000),
  });
};

/** Публичная ссылка на файл — по ней файл скачает любой пользователь приложения. */
export const materialFileUrl = (filePath: string): string =>
  `${BASE_URL}/storage/v1/object/public/${MATERIAL_BUCKET}/${filePath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;

/** Добавляет материал: при наличии файла сначала загружает его в хранилище. */
export const supabaseCreateMaterial = (
  id: string,
  input: MaterialInput,
  uploadedBy?: string,
): Promise<GroupData> =>
  mutateAndReload(async () => {
    let filePath: string | undefined;

    if (input.file) {
      filePath = await uploadToStorage(
        `${input.subjectId}/${id}-${sanitizeFileName(input.file.name)}`,
        input.file,
      );
    }

    await rest('/materials', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id,
        subject_id: input.subjectId,
        title: input.title.trim(),
        description: input.description.trim(),
        file_path: filePath ?? null,
        file_name: input.file?.name ?? null,
        file_size: input.file?.size ?? null,
        link: input.link?.trim() || null,
        uploaded_by: uploadedBy ?? null,
      }),
    });
  });

/** Меняет описание материала (файл при этом не перезагружается). */
export const supabaseUpdateMaterial = (id: string, input: MaterialInput): Promise<GroupData> =>
  mutateAndReload(() =>
    rest(`/materials?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        subject_id: input.subjectId,
        title: input.title.trim(),
        description: input.description.trim(),
        link: input.link?.trim() || null,
      }),
    }),
  );

/** Удаляет материал вместе с его файлом в хранилище. */
export const supabaseDeleteMaterial = (id: string, filePath?: string): Promise<GroupData> =>
  mutateAndReload(async () => {
    if (filePath) await deleteFromStorage(filePath);

    await rest(`/materials?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  });

/** Загружает файл-вложение к заданию и возвращает путь и имя файла. */
export const uploadTaskAttachment = async (
  taskId: string,
  file: File,
): Promise<{ path: string; name: string }> => {
  const path = await uploadToStorage(`tasks/${taskId}-${sanitizeFileName(file.name)}`, file);
  return { path, name: file.name };
};
