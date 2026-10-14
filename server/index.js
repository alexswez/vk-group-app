// Сервер общего хранилища: REST API.
//
// Работает с PostgreSQL (если задан DATABASE_URL) или с SQLite-файлом (локально).
// Запуск:  npm start        (по умолчанию http://localhost:3000)
// Проверка: http://localhost:3000/health

import express from 'express';
import cors from 'cors';

import { dbKind, execute, initDatabase, queryOne } from './database.js';
import { initSchema, readGroupData, resetDatabase, seedIfEmpty, setMeta, touch } from './db.js';

const PORT = Number(process.env.PORT ?? 3000);

// Подключаемся к базе и готовим таблицы ДО того, как принимать запросы.
// Если базы нет или строка подключения неверная — сервер упадёт сразу и с понятной ошибкой.
await initDatabase();
await initSchema();
const seeded = await seedIfEmpty();

const app = express();

// CORS нужен, чтобы фронтенд с другого адреса (например, localhost:5173) мог обращаться к API.
app.use(cors());

// Разбирает JSON в теле запроса в объект req.body.
app.use(express.json());

/** Любой ответ API отдаёт ПОЛНЫЙ набор данных группы: так фронтенду проще синхронизироваться. */
const sendGroup = async (res) => res.json(await readGroupData());

/** Проверка «жив ли сервер» + информация, какая база используется. */
app.get('/health', (req, res) => {
  res.json({ ok: true, database: dbKind, seeded });
});

/** Все общие данные группы одним запросом. */
app.get('/api/group', async (req, res) => sendGroup(res));

/** Генератор id в том же формате, что и на фронтенде. */
const makeId = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------- ЗАДАНИЯ

app.post('/api/tasks', async (req, res) => {
  // id и время создания приходят из приложения: тогда запись сразу получает тот же id,
  // что и в интерфейсе (иначе быстрая правка только что созданного задания уходила бы «в никуда»).
  // Если клиент их не прислал — сервер сгенерирует сам.
  const {
    id,
    subjectId,
    title,
    description = '',
    kind,
    dueDate,
    status = 'todo',
    authorId,
    authorName,
    createdAt,
    // Вложение к заданию: файл (путь и имя) или внешняя ссылка.
    attachmentPath,
    attachmentName,
    attachmentLink,
  } = req.body ?? {};

  // Проверяем обязательные поля: сервер никогда не доверяет клиенту «на слово».
  if (!subjectId || !title || !kind || !dueDate) {
    return res.status(400).json({ error: 'Нужны поля: subjectId, title, kind, dueDate' });
  }

  const subject = await queryOne('SELECT id FROM subjects WHERE id = ?', [subjectId]);
  if (!subject) {
    return res.status(400).json({ error: `Предмет ${subjectId} не найден` });
  }

  await execute(
    `INSERT INTO tasks (id, subject_id, title, description, kind, due_date, status, author_id, author_name, created_at,
                        attachment_path, attachment_name, attachment_link)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id ?? makeId('task'),
      subjectId,
      String(title).trim(),
      String(description).trim(),
      kind,
      dueDate,
      status,
      authorId ?? null,
      authorName ?? null,
      createdAt ?? new Date().toISOString(),
      attachmentPath ?? null,
      attachmentName ?? null,
      attachmentLink ?? null,
    ],
  );

  await touch();
  return sendGroup(res);
});

app.put('/api/tasks/:id', async (req, res) => {
  const { subjectId, title, description = '', kind, dueDate, status, attachmentPath, attachmentName, attachmentLink } =
    req.body ?? {};
  const current = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Задание не найдено' });

  await execute(
    `UPDATE tasks
        SET subject_id = ?, title = ?, description = ?, kind = ?, due_date = ?, status = ?,
            attachment_path = ?, attachment_name = ?, attachment_link = ?
      WHERE id = ?`,
    [
      subjectId ?? current.subject_id,
      title !== undefined ? String(title).trim() : current.title,
      description !== undefined ? String(description).trim() : current.description,
      kind ?? current.kind,
      dueDate ?? current.due_date,
      status ?? current.status,
      // Вложение можно и убрать: тогда клиент пришлёт пустое значение.
      attachmentPath !== undefined ? (attachmentPath ?? null) : current.attachment_path,
      attachmentName !== undefined ? (attachmentName ?? null) : current.attachment_name,
      attachmentLink !== undefined ? (attachmentLink ?? null) : current.attachment_link,
      req.params.id,
    ],
  );

  await touch();
  return sendGroup(res);
});

/** Частичное изменение: используется для переключения статуса «не начато / в работе / сдано». */
app.patch('/api/tasks/:id', async (req, res) => {
  const { status } = req.body ?? {};
  const current = await queryOne('SELECT id FROM tasks WHERE id = ?', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Задание не найдено' });

  await execute('UPDATE tasks SET status = ? WHERE id = ?', [status, req.params.id]);
  await touch();
  return sendGroup(res);
});

app.delete('/api/tasks/:id', async (req, res) => {
  const changes = await execute('DELETE FROM tasks WHERE id = ?', [req.params.id]);
  if (changes === 0) return res.status(404).json({ error: 'Задание не найдено' });
  await touch();
  return sendGroup(res);
});

// ---------------------------------------------------------------- РАСПИСАНИЕ

app.post('/api/lessons', async (req, res) => {
  // id также может прийти из приложения (см. пояснение в POST /api/tasks).
  const { id, subjectId, weekday, startTime, endTime, room = '', kind, parity = 'all', mode = 'session', date } =
    req.body ?? {};

  if (!subjectId || !weekday || !startTime || !endTime || !kind) {
    return res.status(400).json({ error: 'Нужны поля: subjectId, weekday, startTime, endTime, kind' });
  }
  if (endTime <= startTime) {
    return res.status(400).json({ error: 'Время окончания должно быть позже времени начала' });
  }
  // Для дистанционного занятия дата обязательна: именно по ней оно и находится.
  if (mode === 'online' && !date) {
    return res.status(400).json({ error: 'Для дистанционного занятия нужна дата' });
  }

  await execute(
    `INSERT INTO lessons (id, subject_id, weekday, start_time, end_time, room, kind, parity, mode, lesson_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id ?? makeId('lesson'),
      subjectId,
      weekday,
      startTime,
      endTime,
      room,
      kind,
      parity,
      mode,
      // Дату храним только у дистанционных занятий.
      mode === 'online' ? (date ?? null) : null,
    ],
  );

  await touch();
  return sendGroup(res);
});

app.put('/api/lessons/:id', async (req, res) => {
  const current = await queryOne('SELECT * FROM lessons WHERE id = ?', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Пара не найдена' });

  const {
    subjectId = current.subject_id,
    weekday = current.weekday,
    startTime = current.start_time,
    endTime = current.end_time,
    room = current.room,
    kind = current.kind,
    parity = current.parity,
    mode = current.mode,
    date = current.lesson_date,
  } = req.body ?? {};

  if (endTime <= startTime) {
    return res.status(400).json({ error: 'Время окончания должно быть позже времени начала' });
  }
  if (mode === 'online' && !date) {
    return res.status(400).json({ error: 'Для дистанционного занятия нужна дата' });
  }

  await execute(
    `UPDATE lessons
        SET subject_id = ?, weekday = ?, start_time = ?, end_time = ?, room = ?, kind = ?, parity = ?,
            mode = ?, lesson_date = ?
      WHERE id = ?`,
    [subjectId, weekday, startTime, endTime, room, kind, parity, mode, mode === 'online' ? (date ?? null) : null, req.params.id],
  );

  await touch();
  return sendGroup(res);
});

app.delete('/api/lessons/:id', async (req, res) => {
  const changes = await execute('DELETE FROM lessons WHERE id = ?', [req.params.id]);
  if (changes === 0) return res.status(404).json({ error: 'Пара не найдена' });
  await touch();
  return sendGroup(res);
});

// ---------------------------------------------------------------- ПРЕДМЕТЫ

app.post('/api/subjects', async (req, res) => {
  const { id, title, short, teacher = '' } = req.body ?? {};

  if (!title || String(title).trim().length < 3) {
    return res.status(400).json({ error: 'Название предмета должно быть не короче 3 символов' });
  }

  await execute('INSERT INTO subjects (id, title, short, teacher) VALUES (?, ?, ?, ?)', [
    id ?? makeId('subject'),
    String(title).trim(),
    String(short ?? '').trim() || String(title).trim().slice(0, 6),
    String(teacher).trim(),
  ]);

  await touch();
  return sendGroup(res);
});

app.put('/api/subjects/:id', async (req, res) => {
  const current = await queryOne('SELECT * FROM subjects WHERE id = ?', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Предмет не найден' });

  const { title = current.title, short = current.short, teacher = current.teacher } = req.body ?? {};
  if (String(title).trim().length < 3) {
    return res.status(400).json({ error: 'Название предмета должно быть не короче 3 символов' });
  }

  await execute('UPDATE subjects SET title = ?, short = ?, teacher = ? WHERE id = ?', [
    String(title).trim(),
    String(short).trim() || String(title).trim().slice(0, 6),
    String(teacher).trim(),
    req.params.id,
  ]);

  await touch();
  return sendGroup(res);
});

app.delete('/api/subjects/:id', async (req, res) => {
  // Перед удалением проверяем связи: иначе пары, задания и материалы «осиротеют».
  const lessons = await queryOne('SELECT COUNT(*) AS total FROM lessons WHERE subject_id = ?', [req.params.id]);
  const tasks = await queryOne('SELECT COUNT(*) AS total FROM tasks WHERE subject_id = ?', [req.params.id]);
  const materials = await queryOne('SELECT COUNT(*) AS total FROM materials WHERE subject_id = ?', [req.params.id]);

  const used = Number(lessons.total) + Number(tasks.total) + Number(materials.total);
  if (used > 0) {
    return res.status(400).json({
      error: `Предмет используется: пар ${lessons.total}, заданий ${tasks.total}, материалов ${materials.total}`,
    });
  }

  const changes = await execute('DELETE FROM subjects WHERE id = ?', [req.params.id]);
  if (changes === 0) return res.status(404).json({ error: 'Предмет не найден' });

  await touch();
  return sendGroup(res);
});

// ---------------------------------------------------------------- МАТЕРИАЛЫ

/** Локальный сервер файлы не хранит: материалы добавляются ссылкой или описанием. */
app.post('/api/materials', async (req, res) => {
  const { id, subjectId, title, description = '', link, uploadedBy, filePath, fileName, fileSize } = req.body ?? {};

  if (!subjectId || !title || String(title).trim().length < 3) {
    return res.status(400).json({ error: 'Нужны поля: subjectId и title (не короче 3 символов)' });
  }

  const subject = await queryOne('SELECT id FROM subjects WHERE id = ?', [subjectId]);
  if (!subject) return res.status(400).json({ error: `Предмет ${subjectId} не найден` });

  await execute(
    `INSERT INTO materials (id, subject_id, title, description, file_path, file_name, file_size, link, uploaded_by, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id ?? makeId('material'),
      subjectId,
      String(title).trim(),
      String(description).trim(),
      filePath ?? null,
      fileName ?? null,
      fileSize ?? null,
      link ?? null,
      uploadedBy ?? null,
      new Date().toISOString(),
    ],
  );

  await touch();
  return sendGroup(res);
});

app.put('/api/materials/:id', async (req, res) => {
  const current = await queryOne('SELECT * FROM materials WHERE id = ?', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Материал не найден' });

  const {
    subjectId = current.subject_id,
    title = current.title,
    description = current.description,
    link,
  } = req.body ?? {};

  await execute('UPDATE materials SET subject_id = ?, title = ?, description = ?, link = ? WHERE id = ?', [
    subjectId,
    String(title).trim(),
    String(description).trim(),
    link !== undefined ? (link ?? null) : current.link,
    req.params.id,
  ]);

  await touch();
  return sendGroup(res);
});

app.delete('/api/materials/:id', async (req, res) => {
  const changes = await execute('DELETE FROM materials WHERE id = ?', [req.params.id]);
  if (changes === 0) return res.status(404).json({ error: 'Материал не найден' });

  await touch();
  return sendGroup(res);
});

// ---------------------------------------------------------------- НАСТРОЙКИ И СБРОС

app.put('/api/settings', async (req, res) => {
  const { groupName } = req.body ?? {};
  if (!groupName || String(groupName).trim().length === 0) {
    return res.status(400).json({ error: 'Название группы не может быть пустым' });
  }
  await setMeta('group_name', String(groupName).trim());
  await touch();
  return sendGroup(res);
});

app.post('/api/reset', async (req, res) => {
  await resetDatabase();
  return sendGroup(res);
});

/** Общий обработчик ошибок: клиент всегда получает понятный JSON, а не HTML. */
app.use((error, req, res, next) => {
  console.error('Ошибка API:', error?.message ?? error);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

app.listen(PORT, () => {
  console.log(`API запущено: http://localhost:${PORT}`);
  console.log(`База данных:  ${dbKind}${dbKind === 'sqlite' ? ' (локальный файл)' : ' (PostgreSQL)'}`);
  console.log(`Проверка:     http://localhost:${PORT}/health`);
  if (seeded) console.log('База была пустой — залиты тестовые данные.');
});
