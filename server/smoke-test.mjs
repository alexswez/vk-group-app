// «Дымовой тест» API: быстрая проверка, что сервер жив и все методы работают правильно.
//
// Запуск:  npm test        (сервер должен быть уже запущен в другом окне)
//
// Почему это важно: тест проверяет в том числе кириллицу в кириллице («UTF-8 туда-обратно»),
// проверку обязательных полей и то, что после каждой правки сервер отдаёт полный набор данных.

const BASE = process.env.API_URL ?? 'http://localhost:3000';

let passed = 0;
let failed = 0;

/** Мини-«фреймворк»: одна проверка — одна строка вывода. */
const check = (name, condition, extra = '') => {
  if (condition) {
    passed += 1;
    console.log(`  OK   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name} ${extra}`);
  }
};

/** Запрос к API с ожиданием успешного ответа. */
const call = async (path, method = 'GET', body) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status} ${await response.text()}`);
  }
  return response.json();
};

/** Запрос, который ДОЛЖЕН завершиться ошибкой (проверяем валидацию). */
const callExpectingError = async (path, method, body) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return response.status;
};

console.log(`Проверяем API по адресу ${BASE}\n`);

// --- 1. Сервер отвечает
const health = await call('/health');
check('GET /health отвечает ok', health.ok === true);

// --- 2. Полный набор данных
let group = await call('/api/group');
check('GET /api/group отдаёт название группы', typeof group.groupName === 'string' && group.groupName.length > 0);
check('Предметы — массив и не пустой', Array.isArray(group.subjects) && group.subjects.length > 0);
check('Пары — массив и не пустой', Array.isArray(group.lessons) && group.lessons.length > 0);
check('Задания — массив', Array.isArray(group.tasks));

// --- 3. Формат данных совпадает с ожиданиями фронтенда
const lesson = group.lessons[0];
check(
  'Поля пары в camelCase (subjectId, startTime, endTime, parity)',
  ['id', 'subjectId', 'weekday', 'startTime', 'endTime', 'room', 'kind', 'parity'].every((key) => key in lesson),
);

// --- 4. Создание задания с кириллицей
const tasksBefore = group.tasks.length;
const TITLE = 'Проверка: лабораторная «Нормализация» — 3НФ';
// Проверяем и передачу id с клиента: приложение присылает свой id, чтобы запись в базе
// и в интерфейсе имели один и тот же идентификатор.
const CLIENT_ID = `task_client_${Date.now().toString(36)}`;
group = await call('/api/tasks', 'POST', {
  id: CLIENT_ID,
  subjectId: 'db',
  title: TITLE,
  description: 'Создано автоматическим тестом',
  kind: 'lab',
  dueDate: '2030-01-15',
  status: 'todo',
  authorId: 42,
  authorName: 'Тестовый агент',
});
check('POST /api/tasks добавил задание', group.tasks.length === tasksBefore + 1);

const created = group.tasks.find((task) => task.title === TITLE);
check('Кириллица в названии сохранилась без искажений', Boolean(created));
check('Сервер принял id, присланный клиентом', created?.id === CLIENT_ID, `получено ${created?.id}`);
check('Автор задания сохранён', created?.authorName === 'Тестовый агент');
check('Дата сдачи сохранена', created?.dueDate === '2030-01-15');

// --- 5. Смена статуса (PATCH)
group = await call(`/api/tasks/${created.id}`, 'PATCH', { status: 'done' });
check('PATCH /api/tasks/:id меняет статус', group.tasks.find((task) => task.id === created.id)?.status === 'done');

// --- 6. Полное изменение задания (PUT)
group = await call(`/api/tasks/${created.id}`, 'PUT', {
  subjectId: 'web',
  title: 'Изменённое название',
  description: 'Изменено тестом',
  kind: 'test',
  dueDate: '2030-02-20',
  status: 'inProgress',
});
const updated = group.tasks.find((task) => task.id === created.id);
check('PUT /api/tasks/:id меняет все поля', updated?.title === 'Изменённое название' && updated?.subjectId === 'web');

// --- 7. Валидация: сервер не принимает «мусор»
const statusNoTitle = await callExpectingError('/api/tasks', 'POST', { subjectId: 'db', kind: 'lab', dueDate: '2030-01-01' });
check('POST без названия отклоняется (400)', statusNoTitle === 400, `получено ${statusNoTitle}`);

const statusBadSubject = await callExpectingError('/api/tasks', 'POST', {
  subjectId: 'нет-такого-предмета',
  title: 'Тест',
  kind: 'lab',
  dueDate: '2030-01-01',
});
check('POST с несуществующим предметом отклоняется (400)', statusBadSubject === 400, `получено ${statusBadSubject}`);

const statusBadTime = await callExpectingError('/api/lessons', 'POST', {
  subjectId: 'db',
  weekday: 'monday',
  startTime: '12:00',
  endTime: '11:00',
  kind: 'lecture',
});
check('Пара с окончанием раньше начала отклоняется (400)', statusBadTime === 400, `получено ${statusBadTime}`);

// --- 8. Удаление задания
group = await call(`/api/tasks/${created.id}`, 'DELETE');
check('DELETE /api/tasks/:id удаляет задание', !group.tasks.some((task) => task.id === created.id));

// --- 9. Пары: создание и удаление
const lessonsBefore = group.lessons.length;
group = await call('/api/lessons', 'POST', {
  subjectId: 'pe',
  weekday: 'saturday',
  startTime: '09:00',
  endTime: '10:30',
  room: 'Спортзал',
  kind: 'practice',
  parity: 'all',
});
check('POST /api/lessons добавил пару', group.lessons.length === lessonsBefore + 1);

const newLesson = group.lessons.find((item) => item.weekday === 'saturday' && item.startTime === '09:00');
group = await call(`/api/lessons/${newLesson.id}`, 'DELETE');
check('DELETE /api/lessons/:id удалил пару', group.lessons.length === lessonsBefore);

// --- 10. Название группы
const NEW_NAME = 'ИС-31 (проверка)';
group = await call('/api/settings', 'PUT', { groupName: NEW_NAME });
check('PUT /api/settings меняет название группы', group.groupName === NEW_NAME);

const statusEmptyName = await callExpectingError('/api/settings', 'PUT', { groupName: '   ' });
check('Пустое название группы отклоняется (400)', statusEmptyName === 400, `получено ${statusEmptyName}`);

// --- 11. Сброс к тестовым данным (заодно убирает всё, что создал тест)
group = await call('/api/reset', 'POST');
check('POST /api/reset вернул тестовые данные', group.groupName === 'ИС-31' && group.subjects.length > 0);

console.log(`\nИтог: успешно ${passed}, провалено ${failed}`);
process.exit(failed === 0 ? 0 : 1);
