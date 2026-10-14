// Проверка НАСТОЯЩЕГО кода приложения, который работает с Supabase.
//
// Зачем это нужно: скрипт supabase/check-api.mjs проверяет сам REST API (контракт),
// но написан отдельно. Здесь мы запускаем ровно тот модуль, который выполняется в браузере
// пользователя — src/storage/supabase.ts — через загрузчик Vite, и убеждаемся, что он
// читает и изменяет данные в облаке правильно.
//
// Запуск:  npm run check:driver

import { createServer } from 'vite';

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

// middlewareMode — Vite не поднимает свой сервер, только собирает модули по запросу.
const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

try {
  // ssrLoadModule подставляет import.meta.env из .env.local — то же, что видит браузер.
  const driver = await vite.ssrLoadModule('/src/storage/supabase.ts');

  console.log('Проверяем настоящий драйвер src/storage/supabase.ts\n');

  check('Драйвер видит настройки Supabase', driver.isSupabaseConfigured() === true);

  let group = await driver.supabaseGetGroup();
  check('Данные группы прочитаны', group.subjects.length === 7 && group.lessons.length === 16, `предметов ${group.subjects.length}, пар ${group.lessons.length}`);
  check('Название группы прочитано', typeof group.groupName === 'string' && group.groupName.length > 0, group.groupName);
  check('Предметы отображены в объекты приложения (title, short, teacher)', Boolean(group.subjects[0]?.title && group.subjects[0]?.short));

  // Создание задания через драйвер
  const id = `task_driver_${Date.now().toString(36)}`;
  const tasksBefore = group.tasks.length;

  group = await driver.supabaseCreateTask({
    id,
    subjectId: 'db',
    title: 'Проверка драйвера — кириллица и «кавычки»',
    description: 'Создано проверкой кода приложения',
    kind: 'lab',
    dueDate: '2030-06-06',
    status: 'todo',
    authorName: 'Автопроверка',
  });

  const created = group.tasks.find((task) => task.id === id);
  check('Задание создано через код приложения', group.tasks.length === tasksBefore + 1, `${tasksBefore} → ${group.tasks.length}`);
  check('Кириллица дошла до облака без искажений', created?.title === 'Проверка драйвера — кириллица и «кавычки»', created?.title);
  check('Дата и автор сохранены', created?.dueDate === '2030-06-06' && created?.authorName === 'Автопроверка');
  check('Поля приведены к типам приложения (subjectId, dueDate)', created?.subjectId === 'db' && typeof created?.dueDate === 'string');

  // Изменение статуса
  group = await driver.supabasePatchTask(id, { status: 'done' });
  check('Статус изменён через код приложения', group.tasks.find((task) => task.id === id)?.status === 'done');

  // Изменение задания целиком
  group = await driver.supabaseUpdateTask(id, {
    subjectId: 'web',
    title: 'Изменено драйвером',
    description: '',
    kind: 'test',
    dueDate: '2030-07-07',
    status: 'inProgress',
  });
  const updated = group.tasks.find((task) => task.id === id);
  check('Поля задания обновлены', updated?.title === 'Изменено драйвером' && updated?.subjectId === 'web');

  // Работа с расписанием
  const lessonsBefore = group.lessons.length;
  group = await driver.supabaseCreateLesson({
    id: `lesson_driver_${Date.now().toString(36)}`,
    subjectId: 'pe',
    weekday: 'saturday',
    startTime: '16:00',
    endTime: '17:30',
    room: 'Проверка',
    kind: 'practice',
    parity: 'all',
  });
  check('Пара создана через код приложения', group.lessons.length === lessonsBefore + 1, `${lessonsBefore} → ${group.lessons.length}`);

  const createdLesson = group.lessons.find((lesson) => lesson.room === 'Проверка');
  group = await driver.supabaseDeleteLesson(createdLesson.id);
  check('Пара удалена через код приложения', group.lessons.length === lessonsBefore);

  // Название группы
  group = await driver.supabaseSetGroupName('ИС-31 (проверка драйвера)');
  check('Название группы изменено', group.groupName === 'ИС-31 (проверка драйвера)', group.groupName);
  group = await driver.supabaseSetGroupName('ИС-31');

  // Удаление задания (убираем за собой)
  group = await driver.supabaseDeleteTask(id);
  check('Задание удалено, количество вернулось к исходному', group.tasks.length === tasksBefore);

  console.log(`\nИтог: успешно ${passed}, провалено ${failed}`);
} finally {
  await vite.close();
}

process.exit(failed === 0 ? 0 : 1);
