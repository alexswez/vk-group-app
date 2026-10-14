// Сервер общего хранилища: REST API поверх SQLite.
//
// Запуск:  npm start        (по умолчанию http://localhost:3000)
// Проверка: http://localhost:3000/health  →  {"ok":true}

import express from 'express';
import cors from 'cors';

import {
  db,
  initSchema,
  readGroupData,
  resetDatabase,
  seedIfEmpty,
  touch,
} from './db.js';

const PORT = Number(process.env.PORT ?? 3000);

initSchema();
const seeded = seedIfEmpty();

const app = express();

// CORS нужен, чтобы фронтенд с другого порта (5173) мог обращаться к серверу (3000).
app.use(cors());

// Разбирает JSON в теле запроса в объект req.body.
app.use(express.json());

/** Небольшая обёртка: любой ответ API отдаёт ПОЛНЫЙ набор данных группы.
 *  Так фронтенду проще: после любой правки он просто заменяет своё состояние целиком. */
const sendGroup = (res) => res.json(readGroupData());

/** Проверка «жив ли сервер». */
app.get('/health', (req, res) => {
  res.json({ ok: true, seeded });
});

/** Все общие данные группы одним запросом. */
app.get('/api/group', (req, res) => sendGroup(res));

/** Генератор id в том же формате, что и на фронтенде. */
const makeId = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------- ЗАДАНИЯ

app.post('/api/tasks', (req, res) => {
  const { subjectId, title, description = '', kind, dueDate, status = 'todo', authorId, authorName } = req.body ?? {};

  // Проверяем обязательные поля: сервер никогда не доверяет клиенту «на слово».
  if (!subjectId || !title || !kind || !dueDate) {
    return res.status(400).json({ error: 'Нужны поля: subjectId, title, kind, dueDate' });
  }

  const exists = db.prepare('SELECT id FROM subjects WHERE id = ?').get(subjectId);
  if (!exists) {
    return res.status(400).json({ error: `Предмет ${subjectId} не найден` });
  }

  db.prepare(
    `INSERT INTO tasks (id, subject_id, title, description, kind, due_date, status, author_id, author_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
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
  );

  touch();
  return sendGroup(res);
});

app.put('/api/tasks/:id', (req, res) => {
  const { subjectId, title, description = '', kind, dueDate, status } = req.body ?? {};
  const current = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Задание не найдено' });

  db.prepare(
    `UPDATE tasks
        SET subject_id = ?, title = ?, description = ?, kind = ?, due_date = ?, status = ?
      WHERE id = ?`,
  ).run(
    subjectId ?? current.subject_id,
    title !== undefined ? String(title).trim() : current.title,
    description !== undefined ? String(description).trim() : current.description,
    kind ?? current.kind,
    dueDate ?? current.due_date,
    status ?? current.status,
    req.params.id,
  );

  touch();
  return sendGroup(res);
});

/** Частичное изменение: используется для переключения статуса «не начато / в работе / сдано». */
app.patch('/api/tasks/:id', (req, res) => {
  const { status } = req.body ?? {};
  const current = db.prepare('SELECT id FROM tasks WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Задание не найдено' });

  db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, req.params.id);
  touch();
  return sendGroup(res);
});

app.delete('/api/tasks/:id', (req, res) => {
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Задание не найдено' });
  touch();
  return sendGroup(res);
});

// ---------------------------------------------------------------- РАСПИСАНИЕ

app.post('/api/lessons', (req, res) => {
  const { subjectId, weekday, startTime, endTime, room = '', kind, parity = 'all' } = req.body ?? {};

  if (!subjectId || !weekday || !startTime || !endTime || !kind) {
    return res.status(400).json({ error: 'Нужны поля: subjectId, weekday, startTime, endTime, kind' });
  }
  if (endTime <= startTime) {
    return res.status(400).json({ error: 'Время окончания должно быть позже времени начала' });
  }

  db.prepare(
    `INSERT INTO lessons (id, subject_id, weekday, start_time, end_time, room, kind, parity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(makeId('lesson'), subjectId, weekday, startTime, endTime, room, kind, parity);

  touch();
  return sendGroup(res);
});

app.put('/api/lessons/:id', (req, res) => {
  const current = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
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

  db.prepare(
    `UPDATE lessons
        SET subject_id = ?, weekday = ?, start_time = ?, end_time = ?, room = ?, kind = ?, parity = ?
      WHERE id = ?`,
  ).run(subjectId, weekday, startTime, endTime, room, kind, parity, req.params.id);

  touch();
  return sendGroup(res);
});

app.delete('/api/lessons/:id', (req, res) => {
  const result = db.prepare('DELETE FROM lessons WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Пара не найдена' });
  touch();
  return sendGroup(res);
});

// ---------------------------------------------------------------- НАСТРОЙКИ И СБРОС

app.put('/api/settings', (req, res) => {
  const { groupName } = req.body ?? {};
  if (!groupName || String(groupName).trim().length === 0) {
    return res.status(400).json({ error: 'Название группы не может быть пустым' });
  }
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run('group_name', String(groupName).trim());
  touch();
  return sendGroup(res);
});

app.post('/api/reset', (req, res) => {
  resetDatabase();
  return sendGroup(res);
});

app.listen(PORT, () => {
  console.log(`API запущено: http://localhost:${PORT}`);
  console.log(`Проверка:     http://localhost:${PORT}/health`);
  if (seeded) console.log('База была пустой — залиты тестовые данные.');
});
