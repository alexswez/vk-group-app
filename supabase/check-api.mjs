// Проверка REST API Supabase «вживую»: сквозной тест всех операций с данными.
//
// Запуск (значения — из панели Supabase: Project Settings → API):
//
//   $env:SUPABASE_URL = "https://xxxxxxxx.supabase.co"
//   $env:SUPABASE_ANON_KEY = "eyJhbGciOi..."
//   node supabase/check-api.mjs
//
// Что проверяем: доступность таблиц, чтение данных группы, создание задания с кириллицей,
// изменение статуса, удаление, а также upsert настроек. Тест убирает за собой созданные записи.

const BASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!BASE_URL || !ANON_KEY) {
  console.error('Не заданы переменные SUPABASE_URL и SUPABASE_ANON_KEY.');
  console.error('Пример: $env:SUPABASE_URL = "https://xxxx.supabase.co"');
  process.exit(1);
}

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

const rest = async (path, init = {}) => {
  const response = await fetch(`${BASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status} ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : undefined;
};

console.log(`Проверяем Supabase: ${BASE_URL}\n`);

// --- 1. Таблицы существуют и наполнены
const subjects = await rest('/subjects?select=*');
check('Таблица subjects доступна', Array.isArray(subjects));
check('Предметы залиты из schema.sql', subjects.length === 7, `получено ${subjects.length}`);

const lessons = await rest('/lessons?select=*');
check('Таблица lessons доступна', Array.isArray(lessons) && lessons.length === 16, `получено ${lessons?.length}`);

const tasksBefore = await rest('/tasks?select=*');
check('Таблица tasks доступна', Array.isArray(tasksBefore));

const meta = await rest('/meta?select=*');
check('Таблица meta доступна', Array.isArray(meta) && meta.length > 0);

// --- 2. Создание задания (проверяем кириллицу и автогенерацию id)
const TITLE = 'Проверка Supabase: лабораторная «Нормализация» — 3НФ';
await rest('/tasks', {
  method: 'POST',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({
    subject_id: 'db',
    title: TITLE,
    description: 'Создано автоматическим тестом',
    kind: 'lab',
    due_date: '2030-01-15',
    status: 'todo',
    author_id: 42,
    author_name: 'Проверка',
  }),
});

let tasks = await rest('/tasks?select=*');
check('Задание создано', tasks.length === tasksBefore.length + 1, `${tasksBefore.length} → ${tasks.length}`);

const created = tasks.find((task) => task.title === TITLE);
check('Кириллица сохранилась без искажений', Boolean(created));
check('id сгенерирован автоматически', Boolean(created?.id && created.id.startsWith('task_')));
check('Дата сдачи сохранена', created?.due_date === '2030-01-15');
check('created_at заполнен автоматически', Boolean(created?.created_at));

// --- 3. Изменение статуса
await rest(`/tasks?id=eq.${encodeURIComponent(created.id)}`, {
  method: 'PATCH',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ status: 'done' }),
});
tasks = await rest('/tasks?select=*');
check('Статус изменён', tasks.find((task) => task.id === created.id)?.status === 'done');

// --- 4. Обновление названия группы (upsert в meta)
await rest('/meta', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({ key: 'group_name', value: 'ИС-31 (проверка)' }),
});
const metaAfter = await rest('/meta?select=*');
check(
  'Upsert в meta работает',
  metaAfter.find((row) => row.key === 'group_name')?.value === 'ИС-31 (проверка)',
);

// возвращаем прежнее название
await rest('/meta', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({ key: 'group_name', value: 'ИС-31' }),
});

// --- 5. Удаление задания (убираем за собой)
await rest(`/tasks?id=eq.${encodeURIComponent(created.id)}`, {
  method: 'DELETE',
  headers: { Prefer: 'return=minimal' },
});
tasks = await rest('/tasks?select=*');
check('Задание удалено, количество вернулось к исходному', tasks.length === tasksBefore.length);

console.log(`\nИтог: успешно ${passed}, провалено ${failed}`);
process.exit(failed === 0 ? 0 : 1);
