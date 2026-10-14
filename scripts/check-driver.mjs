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
  // Точное количество не проверяем: группа свободно правит расписание и предметы.
  check(
    'Данные группы прочитаны',
    group.subjects.length > 0 && group.lessons.length > 0 && Array.isArray(group.materials),
    `предметов ${group.subjects.length}, пар ${group.lessons.length}`,
  );

  // Для проверок берём РЕАЛЬНЫЙ предмет группы: демонстрационный набор мог быть удалён,
  // и ссылка на несуществующий предмет справедливо отклоняется базой.
  const testSubjectId = group.subjects[0]?.id;
  check('В группе есть предмет для проверок', Boolean(testSubjectId));
  check('Название группы прочитано', typeof group.groupName === 'string' && group.groupName.length > 0, group.groupName);
  check('Предметы отображены в объекты приложения (title, short, teacher)', Boolean(group.subjects[0]?.title && group.subjects[0]?.short));

  // Создание задания через драйвер
  const id = `task_driver_${Date.now().toString(36)}`;
  const tasksBefore = group.tasks.length;

  group = await driver.supabaseCreateTask({
    id,
    subjectId: testSubjectId,
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
  check('Поля приведены к типам приложения (subjectId, dueDate)', created?.subjectId === testSubjectId && typeof created?.dueDate === 'string');

  // Изменение статуса
  group = await driver.supabasePatchTask(id, { status: 'done' });
  check('Статус изменён через код приложения', group.tasks.find((task) => task.id === id)?.status === 'done');

  // Изменение задания целиком
  group = await driver.supabaseUpdateTask(id, {
    subjectId: testSubjectId,
    title: 'Изменено драйвером',
    description: '',
    kind: 'test',
    dueDate: '2030-07-07',
    status: 'inProgress',
  });
  const updated = group.tasks.find((task) => task.id === id);
  check('Поля задания обновлены', updated?.title === 'Изменено драйвером' && updated?.subjectId === testSubjectId);

  // Работа с расписанием
  const lessonsBefore = group.lessons.length;
  group = await driver.supabaseCreateLesson({
    id: `lesson_driver_${Date.now().toString(36)}`,
    subjectId: testSubjectId,
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
  // Запоминаем текущее название группы и возвращаем именно его:
  // иначе проверка затрёт название, которое студент выбрал в приложении.
  const originalGroupName = group.groupName;
  group = await driver.supabaseSetGroupName(`${originalGroupName} (проверка драйвера)`);
  check('Название группы изменено', group.groupName === `${originalGroupName} (проверка драйвера)`, group.groupName);
  group = await driver.supabaseSetGroupName(originalGroupName);
  check('Прежнее название возвращено', group.groupName === originalGroupName, group.groupName);

  // --- Материалы: загрузка настоящего файла в облачное хранилище ---
  const materialId = `material_driver_${Date.now().toString(36)}`;
  const file = new File(['материалы для проверки загрузки из приложения'], 'проверка-материала.txt', {
    type: 'text/plain',
  });

  group = await driver.supabaseCreateMaterial(
    materialId,
    {
      subjectId: testSubjectId,
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

  // --- Материал без файла → прикрепляем файл при изменении (и заменяем его) ---
  const noFileId = `material_nofile_${Date.now().toString(36)}`;
  group = await driver.supabaseCreateMaterial(
    noFileId,
    { subjectId: testSubjectId, title: 'Материал без файла', description: '' },
    'Автопроверка',
  );
  const withoutFile = group.materials.find((item) => item.id === noFileId);
  check('Материал создан без файла', Boolean(withoutFile) && !withoutFile.filePath);

  group = await driver.supabaseUpdateMaterial(noFileId, {
    subjectId: testSubjectId,
    title: 'Материал с файлом (после изменения)',
    description: 'Файл добавлен при редактировании',
    file: new File(['файл, прикреплённый при изменении'], 'прикреплён-при-изменении.txt', { type: 'text/plain' }),
  });
  const withFile = group.materials.find((item) => item.id === noFileId);
  check(
    'Файл прикрепляется при изменении материала',
    Boolean(withFile?.filePath) && withFile?.fileName === 'прикреплён-при-изменении.txt',
  );
  const attached = await fetch(driver.materialFileUrl(withFile.filePath));
  check('Прикреплённый файл открывается по ссылке', attached.ok, `HTTP ${attached.status}`);

  // Заменяем файл: прежний должен исчезнуть из хранилища, чтобы не копить мусор.
  const previousPath = withFile.filePath;
  group = await driver.supabaseUpdateMaterial(noFileId, {
    subjectId: testSubjectId,
    title: 'Материал с новым файлом',
    description: '',
    file: new File(['второй файл'], 'второй.txt', { type: 'text/plain' }),
  });
  const replaced = group.materials.find((item) => item.id === noFileId);
  check('Файл заменяется при повторном изменении', replaced?.fileName === 'второй.txt');
  const previous = await fetch(driver.materialFileUrl(previousPath));
  check('Прежний файл удалён из хранилища', previous.status === 400 || previous.status === 404, `HTTP ${previous.status}`);

  group = await driver.supabaseDeleteMaterial(noFileId, replaced.filePath);
  check('Материал с файлом удалён', !group.materials.some((item) => item.id === noFileId));

  // --- Дистанционное занятие (очно-заочный режим) ---
  const onlineId = `lesson_online_${Date.now().toString(36)}`;
  group = await driver.supabaseCreateLesson({
    id: onlineId,
    subjectId: testSubjectId,
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
    subjectId: testSubjectId,
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
