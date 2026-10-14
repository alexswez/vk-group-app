// Доступ к базе данных в двух режимах.
//
//  • PostgreSQL — если задана переменная окружения DATABASE_URL.
//    Это боевой вариант: данные лежат в интернете и не теряются при перезапуске сервера.
//  • SQLite-файл — если переменной нет. Нужен для разработки на своём компьютере:
//    ничего устанавливать не надо, база создаётся сама.
//
// Остальной код сервера не знает, какой режим работает: он просто вызывает
// query / queryOne / execute. Именно поэтому переход на PostgreSQL не потребовал
// переписывать маршруты и схему таблиц.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));

/** Строка подключения к PostgreSQL (её выдаёт хостинг базы данных). */
const connectionString = process.env.DATABASE_URL;

/** Какой режим используется: 'postgres' или 'sqlite'. */
export const dbKind = connectionString ? 'postgres' : 'sqlite';

let sqlite = null;
let pool = null;

/** PostgreSQL ждёт нумерованные параметры ($1, $2, …), а SQLite — знаки вопроса. */
const toPostgresPlaceholders = (sql) => {
  let index = 0;
  return sql.replace(/\?/g, () => `$${(index += 1)}`);
};

/** Локальные адреса не требуют SSL, внешние (Neon, Supabase, Render) — требуют. */
const needsSsl = (url) => !/localhost|127\.0\.0\.1/.test(url);

/**
 * Приводит параметры к безопасному виду: в обеих базах `undefined` недопустим,
 * поэтому заменяем его на NULL.
 */
const normalizeParams = (params) => params.map((value) => (value === undefined ? null : value));

/**
 * Подключение к базе. Вызывается один раз при старте сервера.
 *
 * @param {{ poolFactory?: Function }} options
 *   poolFactory позволяет подменить драйвер PostgreSQL — это используется в проверке
 *   check-postgres.mjs, где вместо настоящей базы работает её эмулятор (pg-mem).
 */
export const initDatabase = async ({ poolFactory } = {}) => {
  if (dbKind === 'postgres') {
    // Динамический импорт: пакет pg нужен только в режиме PostgreSQL.
    const Pool = poolFactory ?? (await import('pg')).default.Pool;
    pool = new Pool({
      connectionString,
      ssl: needsSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
    // Простейший запрос: если подключения нет, сервер упадёт сразу и понятно.
    await pool.query('SELECT 1');
    return;
  }

  const path = process.env.DB_PATH ?? join(currentDir, 'data', 'app.db');
  mkdirSync(dirname(path), { recursive: true });
  sqlite = new DatabaseSync(path);
  // WAL позволяет читать базу, пока в неё пишут.
  sqlite.exec('PRAGMA journal_mode = WAL;');
};

/** SELECT: возвращает массив строк. */
export const query = async (sql, params = []) => {
  const values = normalizeParams(params);

  if (dbKind === 'postgres') {
    const result = await pool.query(toPostgresPlaceholders(sql), values);
    return result.rows;
  }

  return sqlite.prepare(sql).all(...values);
};

/** SELECT одной строки (или null, если ничего не найдено). */
export const queryOne = async (sql, params = []) => {
  const rows = await query(sql, params);
  return rows[0] ?? null;
};

/** INSERT / UPDATE / DELETE: возвращает количество изменённых строк. */
export const execute = async (sql, params = []) => {
  const values = normalizeParams(params);

  if (dbKind === 'postgres') {
    const result = await pool.query(toPostgresPlaceholders(sql), values);
    return result.rowCount ?? 0;
  }

  const result = sqlite.prepare(sql).run(...values);
  return Number(result.changes ?? 0);
};

/** Несколько команд одной строкой: используется для создания таблиц и очистки. */
export const execScript = async (sql) => {
  if (dbKind === 'postgres') {
    await pool.query(sql);
    return;
  }
  sqlite.exec(sql);
};

/** Закрывает соединения: нужно тестам и корректному завершению работы. */
export const closeDatabase = async () => {
  if (dbKind === 'postgres' && pool) {
    await pool.end();
    return;
  }
  if (sqlite) sqlite.close();
};
