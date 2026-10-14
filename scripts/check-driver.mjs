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
  check('Данные группы прочитаны', group.subjects.length >= 7 && group.lessons.length >= 16, `предметов ${group.subjects.length}, пар ${group.lessons.length}`);
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
    mode: 'session',
  });
  check('Пара создана через код приложения', group.lessons.length === lessonsBefore + 1, `${lessonsBefore} → ${group.lessons.length}`);

  const createdLesson = group.lessons.find((lesson) => lesson.room === 'Проверка');
  group = await driver.supabaseDeleteLesson(createdLesson.id);
  check('Пара удалена через код приложения', group.lessons.length === lessonsBefore);

  // Название группы
  group = await driver.supabaseSetGroupName('ИС-31 (проверка драйвера)');
  check('Название группы изменено', group.groupName === 'ИС-31 (проверка драйвера)', group.groupName);
  group = await driver.supabaseSetGroupName('ИС-31');

  // --- Материалы: загрузка настоящего файла в облачное хранилище ---
  const materialId = `material_driver_${Date.now().toString(36)}`;
  const file = new File(['материалы для проверки загрузки из приложения'], 'проверка-материала.txt', {
    type: 'text/plain',
  });

  group = await driver.supabaseCreateMaterial(
    materialId,
    {
      subjectId: 'db',
      title: 'Проверка загрузки файла',
      description: 'Создано проверкой драйвера',
      file,
    },
    'Автопроверка',
  );

  const material = group.materials.find((item) => item.id === materialId);
  check('Материал с файлом создан', Boolean(material));
  check('Файл попал в хранилище и имя сохранено', Boolean(material?.filePath) && material?.fileName === 'проверка-материала.txt');
  check('Размер файла записан', Number(material?.fileSize) > 0, `получено ${material?.fileSize}`);
  check('Кириллица в имени файла не сломала путь', Boolean(material?.filePath) && !/[а-яА-Я]/.test(material.filePath));

  // Файл должен открываться по публичной ссылке — так его скачает одногруппник.
  const fileResponse = await fetch(driver.materialFileUrl(material.filePath));
  check('Файл открывается по публичной ссылке', fileResponse.ok, `HTTP ${fileResponse.status}`);

  group = await driver.supabaseDeleteMaterial(materialId, material.filePath);
  check('Материал удалён', !group.materials.some((item) => item.id === materialId));

  // --- Дистанционное занятие (очно-заочный режим) ---
  const onlineId = `lesson_online_${Date.now().toString(36)}`;
  group = await driver.supabaseCreateLesson({
    id: onlineId,
    subjectId: 'web',
    weekday: 'wednesday',
    startTime: '18:00',
    endTime: '19:30',
    room: 'Онлайн',
    kind: 'lecture',
    parity: 'all',
    mode: 'online',
    date: '2030-09-09',
  });

  const onlineLesson = group.lessons.find((item) => item.id === onlineId);
  check('Дистанционное занятие создано', Boolean(onlineLesson));
  check('Период и дата сохранены', onlineLesson?.mode === 'online' && onlineLesson?.date === '2030-09-09');

  group = await driver.supabaseDeleteLesson(onlineId);
  check('Дистанционное занятие удалено', !group.lessons.some((item) => item.id === onlineId));

  // --- Вложение к заданию ---
  const attachedId = `task_attach_${Date.now().toString(36)}`;
  group = await driver.supabaseCreateTask({
    id: attachedId,
    subjectId: 'db',
    title: 'Задание с вложением (проверка драйвера)',
    description: '',
    kind: 'lab',
    dueDate: '2030-10-10',
    status: 'todo',
    attachmentLink: 'https://example.com/attachment.pdf',
    attachmentName: 'вложение.pdf',
  });

  const attachedTask = group.tasks.find((item) => item.id === attachedId);
  check('Вложение к заданию сохранено', attachedTask?.attachmentLink === 'https://example.com/attachment.pdf' && attachedTask?.attachmentName === 'вложение.pdf');

  group = await driver.supabaseDeleteTask(attachedId);
  check('Задание с вложением удалено', !group.tasks.some((item) => item.id === attachedId));

  // Удаление задания (убираем за собой)
  group = await driver.supabaseDeleteTask(id);
  check('Задание удалено, количество вернулось к исходному', group.tasks.length === tasksBefore);

  console.log(`\nИтог: успешно ${passed}, провалено ${failed}`);
} finally {
  await vite.close();
}

process.exit(failed === 0 ? 0 : 1);
