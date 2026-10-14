// Мок-сервер, повторяющий поведение REST API Supabase (PostgREST).
//
// Зачем он нужен: проверить клиентскую часть ДО появления настоящего проекта в Supabase.
// Мы запускаем этот сервер локально, направляем на него тест supabase/check-api.mjs и убеждаемся,
// что клиент правильно формирует запросы: заголовки, фильтры `?id=eq.…`, upsert, удаление.
// Это позволяет отладить нашу сторону, не дожидаясь облака.
//
// Он также специально повторяет «строгое» поведение настоящего API:
//   • без заголовка apikey — 401;
//   • ключ нового формата (sb_publishable_…) в заголовке Authorization — 401
//     (именно так ведёт себя Supabase: это не JWT);
//   • удаление без фильтра — 400 (защита от массового удаления).
//
// Запуск:  node supabase/mock-postgrest.mjs [порт]

import { createServer } from 'node:http';

const PORT = Number(process.argv[2] ?? 3100);

// --- данные в памяти, как в schema.sql -------------------------------------------------
const db = {
  subjects: [
    { id: 'db', title: 'Базы данных', short: 'БД', teacher: 'Иванова М. П.' },
    { id: 'web', title: 'Web-программирование', short: 'Web', teacher: 'Петров А. С.' },
    { id: 'oop', title: 'Объектно-ориентированное программирование', short: 'ООП', teacher: 'Сидоров К. В.' },
    { id: 'net', title: 'Компьютерные сети', short: 'Сети', teacher: 'Кузнецова О. И.' },
    { id: 'is', title: 'Проектирование информационных систем', short: 'ПИС', teacher: 'Морозов Д. А.' },
    { id: 'math', title: 'Теория вероятностей и математическая статистика', short: 'ТВиМС', teacher: 'Волкова Е. Н.' },
    { id: 'pe', title: 'Физическая культура', short: 'Физра', teacher: 'Зайцев П. Р.' },
  ],
  lessons: Array.from({ length: 16 }, (_, index) => ({
    id: `l${index + 1}`,
    subject_id: 'db',
    weekday: 'monday',
    start_time: '09:00',
    end_time: '10:30',
    room: '312',
    kind: 'lecture',
    parity: 'all',
  })),
  tasks: [
    { id: 't1', subject_id: 'is', title: 'Описать бизнес-процессы', description: '', kind: 'homework', due_date: '2030-01-10', status: 'inProgress', author_id: 1, author_name: 'Староста группы', created_at: new Date().toISOString() },
    { id: 't2', subject_id: 'oop', title: 'Лабораторная №3', description: '', kind: 'lab', due_date: '2030-01-11', status: 'todo', author_id: 1, author_name: 'Староста группы', created_at: new Date().toISOString() },
    { id: 't3', subject_id: 'db', title: 'Лабораторная №4', description: '', kind: 'lab', due_date: '2030-01-12', status: 'todo', author_id: 2, author_name: 'Алексей П.', created_at: new Date().toISOString() },
    { id: 't4', subject_id: 'math', title: 'Контрольная работа', description: '', kind: 'test', due_date: '2030-01-13', status: 'todo', author_id: 1, author_name: 'Староста группы', created_at: new Date().toISOString() },
    { id: 't5', subject_id: 'web', title: 'Курсовая работа', description: '', kind: 'coursework', due_date: '2030-01-14', status: 'inProgress', author_id: 3, author_name: 'Мария К.', created_at: new Date().toISOString() },
  ],
  meta: [
    { key: 'group_name', value: 'ИСПСВ-301' },
    { key: 'version', value: '1' },
  ],
};

/** Разбор фильтра вида `id=eq.значение` или `id=not.is.null`. */
const matchesFilter = (row, searchParams) => {
  for (const [field, expression] of searchParams.entries()) {
    if (expression === 'not.is.null') {
      if (row[field] === null || row[field] === undefined) return false;
      continue;
    }

    const eqMatch = /^eq\.(.*)$/.exec(expression);
    if (eqMatch && String(row[field]) !== eqMatch[1]) return false;
  }
  return true;
};

const readBody = (request) =>
  new Promise((resolve) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  const table = url.pathname.replace('/rest/v1/', '').replace('/', '');
  const searchParams = url.searchParams;
  const prefer = String(request.headers.prefer ?? '');
  const key = String(request.headers.apikey ?? '');
  const authorization = String(request.headers.authorization ?? '');

  const send = (status, payload) => {
    const body = payload === undefined ? '' : JSON.stringify(payload);
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    response.end(body);
  };

  // --- проверки, как в настоящем Supabase
  if (!key) return send(401, { message: 'No API key found in request' });

  // Ключ нового формата нельзя передавать в Authorization — это не JWT.
  if (authorization.startsWith('Bearer sb_')) {
    return send(401, { message: 'Invalid JWT: publishable key must be sent in the apikey header only' });
  }

  if (!db[table]) return send(404, { message: `relation "${table}" does not exist` });

  const rows = db[table];

  if (request.method === 'GET') {
    return send(200, rows.filter((row) => matchesFilter(row, searchParams)));
  }

  if (request.method === 'POST') {
    const body = await readBody(request);
    const records = Array.isArray(body) ? body : [body];

    for (const record of records) {
      if (table === 'meta') {
        // upsert по первичному ключу (в PostgREST включается заголовком resolution=merge-duplicates)
        if (!prefer.includes('resolution=merge-duplicates')) {
          return send(409, { message: 'duplicate key value violates unique constraint' });
        }
        const existing = rows.find((row) => row.key === record.key);
        if (existing) existing.value = record.value;
        else rows.push({ ...record });
        continue;
      }

      rows.push({ created_at: new Date().toISOString(), ...record });
    }

    return send(201, prefer.includes('return=minimal') ? undefined : records);
  }

  if (request.method === 'PATCH') {
    const body = await readBody(request);
    const targets = rows.filter((row) => matchesFilter(row, searchParams));
    for (const row of targets) Object.assign(row, body);
    return send(204);
  }

  if (request.method === 'DELETE') {
    // Настоящий PostgREST требует фильтр: иначе массовое удаление.
    if ([...searchParams.keys()].length === 0) {
      return send(400, { message: 'DELETE requires a WHERE clause' });
    }
    db[table] = rows.filter((row) => !matchesFilter(row, searchParams));
    return send(204);
  }

  return send(405, { message: 'Method not allowed' });
});

server.listen(PORT, () => {
  console.log(`Мок PostgREST запущен: http://localhost:${PORT}/rest/v1/`);
  console.log('Для проверки клиента выполни:');
  console.log(`  $env:SUPABASE_URL = "http://localhost:${PORT}"`);
  console.log('  $env:SUPABASE_ANON_KEY = "sb_publishable_test"');
  console.log('  node supabase/check-api.mjs');
});
