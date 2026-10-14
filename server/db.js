// Работа с данными: схема таблиц и запросы.
//
// Все функции асинхронные, потому что PostgreSQL отвечает по сети. Код одинаково
// работает и с PostgreSQL, и с SQLite — за это отвечает модуль database.js.

import { execScript, execute, query, queryOne } from './database.js';
import { seedGroupName, seedLessons, seedSubjects, seedTasks } from './seed.js';

/** Создаёт таблицы, если их ещё нет (можно вызывать при каждом запуске). */
export const initSchema = async () => {
  await execScript(`
    CREATE TABLE IF NOT EXISTS subjects (
      id      TEXT PRIMARY KEY,
      title   TEXT NOT NULL,
      short   TEXT NOT NULL,
      teacher TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id         TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL REFERENCES subjects(id),
      weekday    TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time   TEXT NOT NULL,
      room       TEXT NOT NULL DEFAULT '',
      kind       TEXT NOT NULL,
      parity     TEXT NOT NULL DEFAULT 'all'
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      subject_id  TEXT NOT NULL REFERENCES subjects(id),
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      kind        TEXT NOT NULL,
      due_date    TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'todo',
      author_id   INTEGER,
      author_name TEXT,
      created_at  TEXT NOT NULL
    );

    -- Таблица «ключ-значение» для общих настроек: название группы, версия, время изменения.
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
};

/** Читает одно значение из meta. */
const getMeta = async (key) => {
  const row = await queryOne('SELECT value FROM meta WHERE key = ?', [key]);
  return row ? row.value : null;
};

/** Записывает значение в meta (вставляет или обновляет — «upsert»). */
export const setMeta = async (key, value) => {
  await execute(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, String(value)],
  );
};

/** Строка из базы → объект предмета для фронтенда (snake_case → camelCase). */
const mapSubject = (row) => ({
  id: row.id,
  title: row.title,
  short: row.short,
  teacher: row.teacher,
});

const mapLesson = (row) => ({
  id: row.id,
  subjectId: row.subject_id,
  weekday: row.weekday,
  startTime: row.start_time,
  endTime: row.end_time,
  room: row.room,
  kind: row.kind,
  parity: row.parity,
});

const mapTask = (row) => ({
  id: row.id,
  subjectId: row.subject_id,
  title: row.title,
  description: row.description,
  kind: row.kind,
  dueDate: row.due_date,
  status: row.status,
  authorId: row.author_id ?? undefined,
  authorName: row.author_name ?? undefined,
  createdAt: row.created_at,
});

/** Обновляет время последнего изменения (вызывается после каждой правки). */
export const touch = async () => setMeta('updated_at', new Date().toISOString());

/** Собирает полный набор общих данных группы — ровно тот формат, что ждёт фронтенд. */
export const readGroupData = async () => {
  // Запросы выполняем параллельно: так ответ приходит быстрее.
  const [version, groupName, updatedAt, subjects, lessons, tasks] = await Promise.all([
    getMeta('version'),
    getMeta('group_name'),
    getMeta('updated_at'),
    query('SELECT * FROM subjects ORDER BY title'),
    query('SELECT * FROM lessons ORDER BY start_time'),
    query('SELECT * FROM tasks ORDER BY due_date'),
  ]);

  return {
    version: Number(version ?? 1),
    groupName: groupName ?? seedGroupName,
    subjects: subjects.map(mapSubject),
    lessons: lessons.map(mapLesson),
    tasks: tasks.map(mapTask),
    updatedAt: updatedAt ?? new Date().toISOString(),
  };
};

/** Наполняет базу тестовыми данными, если она пустая. */
export const seedIfEmpty = async () => {
  const row = await queryOne('SELECT COUNT(*) AS total FROM subjects');
  if (Number(row.total) > 0) return false;

  for (const subject of seedSubjects) {
    await execute('INSERT INTO subjects (id, title, short, teacher) VALUES (?, ?, ?, ?)', [
      subject.id,
      subject.title,
      subject.short,
      subject.teacher,
    ]);
  }

  for (const lesson of seedLessons) {
    await execute(
      'INSERT INTO lessons (id, subject_id, weekday, start_time, end_time, room, kind, parity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        lesson.id,
        lesson.subjectId,
        lesson.weekday,
        lesson.startTime,
        lesson.endTime,
        lesson.room,
        lesson.kind,
        lesson.parity,
      ],
    );
  }

  for (const task of seedTasks) {
    await execute(
      `INSERT INTO tasks (id, subject_id, title, description, kind, due_date, status, author_id, author_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.subjectId,
        task.title,
        task.description,
        task.kind,
        task.dueDate,
        task.status,
        task.authorId ?? null,
        task.authorName ?? null,
        task.createdAt,
      ],
    );
  }

  await setMeta('group_name', seedGroupName);
  await setMeta('version', 1);
  await touch();
  return true;
};

/** Полный сброс: удаляет все данные и заливает тестовые заново (кнопка в настройках). */
export const resetDatabase = async () => {
  // Порядок важен: сначала зависимые таблицы, потом основная.
  await execScript('DELETE FROM tasks; DELETE FROM lessons; DELETE FROM subjects; DELETE FROM meta;');
  await seedIfEmpty();
  return readGroupData();
};
