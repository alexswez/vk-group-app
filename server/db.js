// Работа с базой данных SQLite.
//
// Мы используем встроенный в Node.js модуль node:sqlite — он есть в Node 22.5+ и не требует
// установки никаких дополнительных пакетов и компиляции нативных модулей.
// Запросы — обычный SQL, поэтому позже перейти на PostgreSQL будет несложно:
// структура таблиц и логика запросов остаются теми же.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { seedSubjects, seedLessons, seedTasks, seedGroupName } from './seed.js';

const currentDir = dirname(fileURLToPath(import.meta.url));

/** Путь к файлу базы. Можно переопределить переменной окружения DB_PATH. */
const dbPath = process.env.DB_PATH ?? join(currentDir, 'data', 'app.db');

// Создаём папку data/, если её ещё нет.
mkdirSync(dirname(dbPath), { recursive: true });

/** Единственное соединение с базой на всё приложение. */
export const db = new DatabaseSync(dbPath);

// WAL-режим позволяет читать базу, пока в неё пишут — для учебного проекта это оптимально.
db.exec('PRAGMA journal_mode = WAL;');

/** Создаёт таблицы, если их ещё нет (идемпотентно — можно вызывать при каждом запуске). */
export const initSchema = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subjects (
      id      TEXT PRIMARY KEY,
      title   TEXT NOT NULL,
      short   TEXT NOT NULL,
      teacher TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id         TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      weekday    TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time   TEXT NOT NULL,
      room       TEXT NOT NULL DEFAULT '',
      kind       TEXT NOT NULL,
      parity     TEXT NOT NULL DEFAULT 'all',
      FOREIGN KEY (subject_id) REFERENCES subjects(id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      subject_id  TEXT NOT NULL,
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      kind        TEXT NOT NULL,
      due_date    TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'todo',
      author_id   INTEGER,
      author_name TEXT,
      created_at  TEXT NOT NULL,
      FOREIGN KEY (subject_id) REFERENCES subjects(id)
    );

    -- Таблица «ключ-значение» для общих настроек: название группы, версия, время изменения.
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
};

/** Читает одно значение из meta. */
const getMeta = (key) => {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : null;
};

/** Записывает значение в meta (вставляет или обновляет — «upsert»). */
const setMeta = (key, value) => {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, String(value));
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

/** Собирает полный набор общих данных группы — ровно тот формат, что ждёт фронтенд. */
export const readGroupData = () => ({
  version: Number(getMeta('version') ?? 1),
  groupName: getMeta('group_name') ?? seedGroupName,
  subjects: db.prepare('SELECT * FROM subjects ORDER BY title').all().map(mapSubject),
  lessons: db.prepare('SELECT * FROM lessons ORDER BY start_time').all().map(mapLesson),
  tasks: db.prepare('SELECT * FROM tasks ORDER BY due_date').all().map(mapTask),
  updatedAt: getMeta('updated_at') ?? new Date().toISOString(),
});

/** Обновляет время последнего изменения (вызывается после каждой правки). */
export const touch = () => setMeta('updated_at', new Date().toISOString());

/** Наполняет базу тестовыми данными, если она пустая. */
export const seedIfEmpty = () => {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM subjects').get();
  if (count > 0) return false;

  const insertSubject = db.prepare('INSERT INTO subjects (id, title, short, teacher) VALUES (?, ?, ?, ?)');
  for (const subject of seedSubjects) {
    insertSubject.run(subject.id, subject.title, subject.short, subject.teacher);
  }

  const insertLesson = db.prepare(
    'INSERT INTO lessons (id, subject_id, weekday, start_time, end_time, room, kind, parity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const lesson of seedLessons) {
    insertLesson.run(
      lesson.id,
      lesson.subjectId,
      lesson.weekday,
      lesson.startTime,
      lesson.endTime,
      lesson.room,
      lesson.kind,
      lesson.parity,
    );
  }

  const insertTask = db.prepare(
    `INSERT INTO tasks (id, subject_id, title, description, kind, due_date, status, author_id, author_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const task of seedTasks) {
    insertTask.run(
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
    );
  }

  setMeta('group_name', seedGroupName);
  setMeta('version', 1);
  touch();
  return true;
};

/** Полный сброс: удаляет все данные и заливает тестовые заново (кнопка в настройках). */
export const resetDatabase = () => {
  db.exec('DELETE FROM tasks; DELETE FROM lessons; DELETE FROM subjects; DELETE FROM meta;');
  seedIfEmpty();
  return readGroupData();
};
