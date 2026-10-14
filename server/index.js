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
  const { subjectId, title, description = '', kind, dueDate, status = 'todo', authorId, authorName } = req.body ?? {};

  // Проверяем обязательные поля: сервер никогда не доверяет клиенту «на слово».
  if (!subjectId || !title || !kind || !dueDate) {
    return res.status(400).json({ error: 'Нужны поля: subjectId, title, kind, dueDate' });
  }

  const subject = await queryOne('SELECT id FROM subjects WHERE id = ?', [subjectId]);
  if (!subject) {
    return res.status(400).json({ error: `Предмет ${subjectId} не найден` });
  }

  await execute(
    `INSERT INTO tasks (id, subject_id, title, description, kind, due_date, status, author_id, author_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      makeId('task'),
      subjectId,
      String(title).trim(),
      String(description).trim(),
      kind,
      dueDate,
      status,
      authorId ?? null,
      authorName ?? null,
      new Date().toISOString(),
    ],
  );

  await touch();
  return sendGroup(res);
});

app.put('/api/tasks/:id', async (req, res) => {
  const { subjectId, title, description = '', kind, dueDate, status } = req.body ?? {};
  const current = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Задание не найдено' });

  await execute(
    `UPDATE tasks
        SET subject_id = ?, title = ?, description = ?, kind = ?, due_date = ?, status = ?
      WHERE id = ?`,
    [
      subjectId ?? current.subject_id,
      title !== undefined ? String(title).trim() : current.title,
      description !== undefined ? String(description).trim() : current.description,
      kind ?? current.kind,
      dueDate ?? current.due_date,
      status ?? current.status,
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
  const { subjectId, weekday, startTime, endTime, room = '', kind, parity = 'all' } = req.body ?? {};

  if (!subjectId || !weekday || !startTime || !endTime || !kind) {
    return res.status(400).json({ error: 'Нужны поля: subjectId, weekday, startTime, endTime, kind' });
  }
  if (endTime <= startTime) {
    return res.status(400).json({ error: 'Время окончания должно быть позже времени начала' });
  }

  await execute(
    `INSERT INTO lessons (id, subject_id, weekday, start_time, end_time, room, kind, parity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [makeId('lesson'), subjectId, weekday, startTime, endTime, room, kind, parity],
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
  } = req.body ?? {};

  if (endTime <= startTime) {
    return res.status(400).json({ error: 'Время окончания должно быть позже времени начала' });
  }

  await execute(
    `UPDATE lessons
        SET subject_id = ?, weekday = ?, start_time = ?, end_time = ?, room = ?, kind = ?, parity = ?
      WHERE id = ?`,
    [subjectId, weekday, startTime, endTime, room, kind, parity, req.params.id],
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
