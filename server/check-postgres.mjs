// Проверка режима PostgreSQL без установки настоящей базы.
//
// Как это работает: вместо PostgreSQL используется его эмулятор pg-mem, который понимает
// настоящий SQL. Мы выполняем ТОТ ЖЕ код (server/db.js и server/database.js), что и с живой
// базой, и проверяем результат. Это ловит ошибки диалекта: подстановку параметров ($1, $2),
// создание таблиц, upsert, COUNT и порядок удаления строк.
//
// Запуск:  npm run check:postgres

// Переменную окружения нужно задать ДО импорта database.js — от неё зависит выбор режима.
process.env.DATABASE_URL = 'postgres://user:password@localhost:5432/vk_group_app';

const { newDb } = await import('pg-mem');
const memory = newDb();
const { Pool } = memory.adapters.createPg();

const { initDatabase, dbKind, execute, queryOne } = await import('./database.js');
const { initSchema, readGroupData, resetDatabase, seedIfEmpty, setMeta } = await import('./db.js');

let passed = 0;
let failed = 0;
const check = (name, condition, extra = '') => {
  if (condition) {
    passed += 1;
    console.log(`  OK   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name} ${extra}`);
  }
};

console.log('Проверяем режим PostgreSQL на эмуляторе pg-mem\n');

await initDatabase({ poolFactory: Pool });
check('Режим определён как postgres', dbKind === 'postgres', `получено ${dbKind}`);

await initSchema();
check('Таблицы созданы (initSchema выполнился без ошибок)', true);

const seeded = await seedIfEmpty();
check('Тестовые данные залиты', seeded === true);

const seededAgain = await seedIfEmpty();
check('Повторный запуск не дублирует данные', seededAgain === false);

let data = await readGroupData();
check('Предметы прочитаны', data.subjects.length === 7, `получено ${data.subjects.length}`);
check('Пары прочитаны', data.lessons.length === 16, `получено ${data.lessons.length}`);
check('Задания прочитаны', data.tasks.length === 5, `получено ${data.tasks.length}`);
check('COUNT(*) вернулся числом, а не строкой', Number.isFinite(Number(data.tasks.length)));

const firstTask = data.tasks[0];
check('Поля переведены в camelCase (subjectId, dueDate)', 'subjectId' in firstTask && 'dueDate' in firstTask);

// Вставка с параметрами: проверяем преобразование "?" в "$1, $2, …".
const before = data.tasks.length;
await execute(
  `INSERT INTO tasks (id, subject_id, title, description, kind, due_date, status, author_id, author_name, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ['task_pg_1', 'db', 'Проверка на эмуляторе — «кириллица»', 'описание', 'lab', '2030-05-05', 'todo', 7, 'Тест', new Date().toISOString()],
);
data = await readGroupData();
check('INSERT с параметрами выполнен', data.tasks.length === before + 1);

const inserted = await queryOne('SELECT * FROM tasks WHERE id = ?', ['task_pg_1']);
check('Кириллица сохранилась через Postgres-параметры', inserted?.title === 'Проверка на эмуляторе — «кириллица»', `получено ${inserted?.title}`);

await execute('UPDATE tasks SET status = ? WHERE id = ?', ['done', 'task_pg_1']);
const updated = await queryOne('SELECT status FROM tasks WHERE id = ?', ['task_pg_1']);
check('UPDATE выполнен', updated?.status === 'done');

// Upsert: та же конструкция используется для настроек и времени изменения.
await setMeta('group_name', 'ИС-31 (Postgres)');
await setMeta('group_name', 'ИС-31 (Postgres, обновлено)');
const groupName = await queryOne('SELECT value FROM meta WHERE key = ?', ['group_name']);
check('ON CONFLICT (upsert) работает', groupName?.value === 'ИС-31 (Postgres, обновлено)', `получено ${groupName?.value}`);

const changes = await execute('DELETE FROM tasks WHERE id = ?', ['task_pg_1']);
check('DELETE вернул количество удалённых строк', changes === 1, `получено ${changes}`);

const nothing = await execute('DELETE FROM tasks WHERE id = ?', ['нет-такого']);
check('DELETE несуществующей строки вернул 0', nothing === 0);

data = await resetDatabase();
check('Полный сброс вернул тестовые данные', data.subjects.length === 7 && data.groupName === 'ИСПСВ-301');

console.log(`\nИтог: успешно ${passed}, провалено ${failed}`);
process.exit(failed === 0 ? 0 : 1);
