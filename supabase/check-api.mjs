// Проверка REST API Supabase «вживую»: сквозной тест всех операций с данными.
//
// ЗАПУСК. Ключи можно не указывать вручную: скрипт сам прочитает их из файла .env.local.
//
//   node supabase/check-api.mjs
//
// Либо задать переменные окружения (тогда они имеют приоритет):
//
//   $env:SUPABASE_URL = "https://xxxxxxxx.supabase.co"
//   $env:SUPABASE_ANON_KEY = "sb_publishable_..."
//   node supabase/check-api.mjs
//
// Что проверяется: доступность таблиц, чтение данных группы, создание задания с кириллицей,
// изменение статуса, удаление и upsert настроек. Скрипт убирает за собой созданные записи.

import { existsSync, readFileSync } from 'node:fs';

/** Читает нужные значения из .env.local, если они не заданы в окружении. */
const loadEnvFile = () => {
  const envPath = new URL('../.env.local', import.meta.url);
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = /^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.+?)\s*$/.exec(line);
    if (!match) continue;

    // VITE_SUPABASE_URL → SUPABASE_URL, VITE_SUPABASE_ANON_KEY → SUPABASE_ANON_KEY
    const name = match[1].replace('VITE_', '');
    if (!process.env[name]) process.env[name] = match[2];
  }
};

loadEnvFile();

const BASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!BASE_URL || !ANON_KEY) {
  console.error('Не найдены адрес и ключ Supabase.');
  console.error('1) Добавь их в файл .env.local:');
  console.error('   VITE_SUPABASE_URL=https://xxxx.supabase.co');
  console.error('   VITE_SUPABASE_ANON_KEY=sb_publishable_...');
  console.error('2) Или задай переменные окружения SUPABASE_URL и SUPABASE_ANON_KEY.');
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

/**
 * Шапка запроса. У Supabase два формата ключей: старый anon (JWT, начинается с `eyJ`)
 * передаётся и в `apikey`, и в `Authorization`; новый publishable (`sb_publishable_...`) —
 * только в `apikey`, иначе сервер отвечает ошибкой авторизации.
 */
const buildHeaders = (extra = {}) => {
  const headers = {
    apikey: ANON_KEY,
    'Content-Type': 'application/json',
    ...extra,
  };

  if (ANON_KEY.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${ANON_KEY}`;
  }

  return headers;
};

/**
 * Запрос к REST API с одной повторной попыткой.
 * Сеть бывает нестабильной (обрыв соединения), и из-за этого проверка не должна падать.
 */
const rest = async (path, init = {}) => {
  const attempt = async () => {
    const response = await fetch(`${BASE_URL}/rest/v1${path}`, {
      ...init,
      headers: buildHeaders(init.headers ?? {}),
      signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`${init.method ?? 'GET'} ${path} → ${response.status} ${text.slice(0, 300)}`);
      error.status = response.status;
      throw error;
    }
    return text ? JSON.parse(text) : undefined;
  };

  try {
    return await attempt();
  } catch (error) {
    // Повторяем только сетевые сбои, а не осмысленные ответы сервера (400/404 и т. п.).
    if (error?.status) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return attempt();
  }
};

console.log(`Проверяем Supabase: ${BASE_URL}`);
console.log(`Ключ: ${ANON_KEY.startsWith('eyJ') ? 'старый anon (JWT)' : 'новый publishable'}\n`);

// --- 1. Таблицы существуют и наполнены
const subjects = await rest('/subjects?select=*');
check('Таблица subjects доступна', Array.isArray(subjects));
// Количество не проверяем: группа может добавлять и удалять свои предметы.
check('Список предметов не пуст', subjects.length > 0, `получено ${subjects.length}`);

const lessons = await rest('/lessons?select=*');
check('Таблица lessons доступна', Array.isArray(lessons));
check('Расписание не пустое', lessons.length > 0, `получено ${lessons?.length} пар`);

const tasksBefore = await rest('/tasks?select=*');
check('Таблица tasks доступна', Array.isArray(tasksBefore));

const meta = await rest('/meta?select=*');
check('Таблица meta доступна', Array.isArray(meta) && meta.length > 0);

// --- 1.5. Проверяем, применено ли обновление схемы №2 (очно-заочный режим и материалы)
const probe = async (path) => {
  try {
    await rest(path);
    return true;
  } catch {
    return false;
  }
};

const hasLessonMode = await probe('/lessons?select=lesson_mode&limit=1');
const hasMaterials = await probe('/materials?select=id&limit=1');
const hasAttachments = await probe('/tasks?select=attachment_path&limit=1');

check('Схема: у пар есть период обучения (lesson_mode)', hasLessonMode);
check('Схема: есть таблица материалов', hasMaterials);
check('Схема: у заданий есть вложения', hasAttachments);

if (!hasLessonMode || !hasMaterials || !hasAttachments) {
  console.log('\n⚠️  Обновление схемы не применено.');
  console.log('    Открой SQL Editor и выполни файл supabase/migrations/002-materials-and-lesson-modes.sql\n');
}

// --- 2. Создание задания (проверяем кириллицу и работу с id из приложения)
const TITLE = 'Проверка Supabase: лабораторная «Нормализация» — 3НФ';
const TEST_ID = `task_check_${Date.now().toString(36)}`;

await rest('/tasks', {
  method: 'POST',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({
    id: TEST_ID,
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

const created = tasks.find((task) => task.id === TEST_ID);
check('Запись найдена по id, который прислал клиент', Boolean(created));
check('Кириллица сохранилась без искажений', created?.title === TITLE, `получено ${created?.title}`);
check('Дата сдачи сохранена', created?.due_date === '2030-01-15');
check('created_at заполнен автоматически', Boolean(created?.created_at));

// --- 3. Изменение статуса
await rest(`/tasks?id=eq.${encodeURIComponent(TEST_ID)}`, {
  method: 'PATCH',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ status: 'done' }),
});
tasks = await rest('/tasks?select=*');
check('Статус изменён', tasks.find((task) => task.id === TEST_ID)?.status === 'done');

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

// --- 4.5. Новые возможности (проверяем только если схема обновлена)
if (hasLessonMode) {
  const LESSON_ID = `lesson_check_${Date.now().toString(36)}`;
  await rest('/lessons', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      id: LESSON_ID,
      subject_id: 'web',
      weekday: 'wednesday',
      start_time: '18:00',
      end_time: '19:30',
      room: 'Онлайн',
      kind: 'lecture',
      parity: 'all',
      lesson_mode: 'online',
      lesson_date: '2030-03-14',
    }),
  });

  let lessons = await rest('/lessons?select=*');
  const onlineLesson = lessons.find((lesson) => lesson.id === LESSON_ID);
  check('Дистанционное занятие сохранило дату и период', onlineLesson?.lesson_mode === 'online' && onlineLesson?.lesson_date === '2030-03-14');

  await rest(`/lessons?id=eq.${encodeURIComponent(LESSON_ID)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  lessons = await rest('/lessons?select=*');
  check('Дистанционное занятие удалено', !lessons.some((lesson) => lesson.id === LESSON_ID));
}

if (hasAttachments) {
  const TASK_ID = `task_attach_${Date.now().toString(36)}`;
  await rest('/tasks', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      id: TASK_ID,
      subject_id: 'db',
      title: 'Проверка вложения',
      description: '',
      kind: 'lab',
      due_date: '2030-04-04',
      attachment_link: 'https://example.com/file.pdf',
      attachment_name: 'файл.pdf',
    }),
  });

  const tasksWithAttachment = await rest('/tasks?select=*');
  const attached = tasksWithAttachment.find((task) => task.id === TASK_ID);
  check('Вложение к заданию сохранено', attached?.attachment_link === 'https://example.com/file.pdf');

  await rest(`/tasks?id=eq.${encodeURIComponent(TASK_ID)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  check('Задание с вложением удалено', !(await rest('/tasks?select=id')).some((task) => task.id === TASK_ID));
}

if (hasMaterials) {
  const MATERIAL_ID = `material_check_${Date.now().toString(36)}`;
  await rest('/materials', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      id: MATERIAL_ID,
      subject_id: 'db',
      title: 'Проверочный материал — кириллица',
      description: 'Создан автотестом',
      link: 'https://example.com/material.pdf',
      uploaded_by: 'Автопроверка',
    }),
  });

  let materials = await rest('/materials?select=*');
  const material = materials.find((item) => item.id === MATERIAL_ID);
  check('Материал создан и кириллица сохранилась', material?.title === 'Проверочный материал — кириллица');
  check('Автор материала записан', material?.uploaded_by === 'Автопроверка');

  await rest(`/materials?id=eq.${encodeURIComponent(MATERIAL_ID)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  materials = await rest('/materials?select=*');
  check('Материал удалён', !materials.some((item) => item.id === MATERIAL_ID));
}

// --- 5. Удаление задания (убираем за собой)
await rest(`/tasks?id=eq.${encodeURIComponent(TEST_ID)}`, {
  method: 'DELETE',
  headers: { Prefer: 'return=minimal' },
});
tasks = await rest('/tasks?select=*');
check('Задание удалено, количество вернулось к исходному', tasks.length === tasksBefore.length);

console.log(`\nИтог: успешно ${passed}, провалено ${failed}`);
process.exit(failed === 0 ? 0 : 1);
