// Проверка SQL-схемы Supabase ДО её применения в облаке.
//
// Зачем: если в schema.sql опечатка, Supabase вернёт непонятную ошибку, и разбираться придётся
// уже в панели. Здесь мы выполняем определения таблиц на эмуляторе PostgreSQL (pg-mem)
// и проверяем, что схема согласована: таблицы, колонки, ссылки между ними.
//
// ⚠️ ЧТО ИМЕННО ПРОВЕРЯЕТСЯ И ЧТО НЕТ.
//   • Определения таблиц (CREATE TABLE) — проверяются;
//   • политики доступа (RLS) и наполнение данными — НЕ проверяются: эмулятор не умеет
//     RLS и часть функций PostgreSQL (например, приведение даты к тексту).
//     Эти части проверяются на РЕАЛЬНОМ проекте скриптом supabase/check-api.mjs.
//
// Запуск:  npm run check:schema    (из папки server)

import { readFileSync } from 'node:fs';
import { newDb } from 'pg-mem';

const schemaPath = new URL('../supabase/schema.sql', import.meta.url);
const sql = readFileSync(schemaPath, 'utf8');

/** Отрезаем всё, что идёт после определений таблиц (доступ, политики, данные). */
const ddlOnly = sql.split(/-- -+ ДОСТУП/)[0];

let passed = 0;
let failed = 0;
let skipped = 0;
const check = (name, condition, extra = '') => {
  if (condition) {
    passed += 1;
    console.log(`  OK   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name} ${extra}`);
  }
};

console.log('Проверяем определения таблиц из supabase/schema.sql (эмулятор PostgreSQL)\n');

const db = newDb();

try {
  db.public.none(ddlOnly);
  check('CREATE TABLE выполнились без синтаксических ошибок', true);
} catch (error) {
  check('CREATE TABLE выполнились без синтаксических ошибок', false, `→ ${error.message}`);
  console.log('\nПроверка прервана: сначала нужно исправить SQL.');
  process.exit(1);
}

/** Список колонок таблицы. */
const columnsOf = async (table) =>
  db.public
    .many(`select column_name from information_schema.columns where table_name = '${table}'`)
    .map((row) => row.column_name);

const subjects = await columnsOf('subjects');
check('Таблица subjects: id, title, short, teacher', ['id', 'title', 'short', 'teacher'].every((c) => subjects.includes(c)), subjects.join(', '));

const lessons = await columnsOf('lessons');
check(
  'Таблица lessons: все нужные колонки',
  ['id', 'subject_id', 'weekday', 'start_time', 'end_time', 'room', 'kind', 'parity'].every((c) => lessons.includes(c)),
  lessons.join(', '),
);

const tasks = await columnsOf('tasks');
check(
  'Таблица tasks: все нужные колонки',
  ['id', 'subject_id', 'title', 'description', 'kind', 'due_date', 'status', 'author_id', 'author_name', 'created_at'].every(
    (c) => tasks.includes(c),
  ),
  tasks.join(', '),
);

const meta = await columnsOf('meta');
check('Таблица meta: key и value', ['key', 'value'].every((c) => meta.includes(c)), meta.join(', '));

// Схема должна применяться повторно без ошибок (CREATE TABLE IF NOT EXISTS).
// ВАЖНО: сам эмулятор не умеет повторно выполнять CREATE TABLE IF NOT EXISTS для уже
// существующей таблицы, поэтому такое ограничение помечаем как «пропущено», а не как ошибку.
try {
  db.public.none(ddlOnly);
  check('Повторное применение схемы не вызывает ошибок', true);
} catch (error) {
  if (String(error.message).includes('Not supported')) {
    skipped += 1;
    console.log('  ПРОПУЩЕНО  Повторное применение схемы: ограничение эмулятора (в PostgreSQL это штатно)');
  } else {
    check('Повторное применение схемы не вызывает ошибок', false, `→ ${error.message}`);
  }
}

console.log(`\nИтог: успешно ${passed}, провалено ${failed}${skipped ? `, пропущено ${skipped}` : ''}`);
console.log('Политики доступа и данные проверяются на реальном проекте: supabase/check-api.mjs');
process.exit(failed === 0 ? 0 : 1);
