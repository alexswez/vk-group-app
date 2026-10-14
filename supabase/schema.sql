-- Схема базы данных для Supabase (PostgreSQL).
--
-- КАК ПРИМЕНИТЬ:
--   1. Открой свой проект на https://supabase.com
--   2. Слева выбери «SQL Editor» → «New query»
--   3. Скопируй ВЕСЬ этот файл, вставь и нажми «Run» (или Ctrl+Enter)
--
-- Скрипт можно запускать повторно: он не создаёт таблицы и данные заново.

-- ---------------------------------------------------------------- ТАБЛИЦЫ

create table if not exists subjects (
  id      text primary key,
  title   text not null,
  short   text not null,
  teacher text not null
);

-- Идентификаторы (id) приходят из приложения: так запись, созданная пользователем,
-- сразу имеет тот же id и в браузере, и в базе — не бывает «двух разных» id у одной записи.
create table if not exists lessons (
  id         text primary key,
  subject_id text not null references subjects(id),
  weekday    text not null,
  start_time text not null,
  end_time   text not null,
  room       text not null default '',
  kind       text not null,
  parity     text not null default 'all'
);

create table if not exists tasks (
  id          text primary key,
  subject_id  text not null references subjects(id),
  title       text not null,
  description text not null default '',
  kind        text not null,
  due_date    text not null,
  status      text not null default 'todo',
  author_id   bigint,
  author_name text,
  -- timestamptz — правильный тип для времени. REST API Supabase отдаёт его строкой в формате ISO.
  created_at  timestamptz not null default now()
);

-- Таблица «ключ-значение»: название группы и время последнего изменения.
create table if not exists meta (
  key   text primary key,
  value text not null
);

-- ---------------------------------------------------------------- ДОСТУП

-- Включаем защиту на уровне строк (Row Level Security) — это правильный подход Supabase.
alter table subjects enable row level security;
alter table lessons  enable row level security;
alter table tasks    enable row level security;
alter table meta     enable row level security;

-- ⚠️ ВАЖНО ПРО БЕЗОПАСНОСТЬ.
-- Политики ниже разрешают анонимный доступ (роль anon) на чтение и запись.
-- Для УЧЕБНОГО проекта этого достаточно: мини-приложение ходит в базу без логина.
-- В боевом проекте так делать нельзя: нужны авторизация (Supabase Auth), политики
-- «пользователь видит только свою группу» и проверка прав на запись.
drop policy if exists "anon read subjects" on subjects;
drop policy if exists "anon write subjects" on subjects;
create policy "anon read subjects"  on subjects for select to anon, authenticated using (true);
create policy "anon write subjects" on subjects for all    to anon, authenticated using (true) with check (true);

drop policy if exists "anon read lessons" on lessons;
drop policy if exists "anon write lessons" on lessons;
create policy "anon read lessons"  on lessons for select to anon, authenticated using (true);
create policy "anon write lessons" on lessons for all    to anon, authenticated using (true) with check (true);

drop policy if exists "anon read tasks" on tasks;
drop policy if exists "anon write tasks" on tasks;
create policy "anon read tasks"  on tasks for select to anon, authenticated using (true);
create policy "anon write tasks" on tasks for all    to anon, authenticated using (true) with check (true);

drop policy if exists "anon read meta" on meta;
drop policy if exists "anon write meta" on meta;
create policy "anon read meta"  on meta for select to anon, authenticated using (true);
create policy "anon write meta" on meta for all    to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------- ДАННЫЕ

-- Предметы группы ИСПСВ-301
insert into subjects (id, title, short, teacher) values
  ('db',   'Базы данных',                                   'БД',    'Иванова М. П.'),
  ('web',  'Web-программирование',                          'Web',   'Петров А. С.'),
  ('oop',  'Объектно-ориентированное программирование',     'ООП',   'Сидоров К. В.'),
  ('net',  'Компьютерные сети',                             'Сети',  'Кузнецова О. И.'),
  ('is',   'Проектирование информационных систем',          'ПИС',   'Морозов Д. А.'),
  ('math', 'Теория вероятностей и математическая статистика','ТВиМС', 'Волкова Е. Н.'),
  ('pe',   'Физическая культура',                           'Физра', 'Зайцев П. Р.')
on conflict (id) do nothing;

-- Расписание на неделю
insert into lessons (id, subject_id, weekday, start_time, end_time, room, kind, parity) values
  ('l1',  'db',   'monday',    '09:00', '10:30', '312',      'lecture',  'all'),
  ('l2',  'web',  'monday',    '10:40', '12:10', '404',      'lab',      'all'),
  ('l3',  'pe',   'monday',    '12:40', '14:10', 'Спортзал', 'practice', 'all'),
  ('l4',  'oop',  'tuesday',   '09:00', '10:30', '310',      'practice', 'all'),
  ('l5',  'math', 'tuesday',   '10:40', '12:10', '201',      'lecture',  'all'),
  ('l6',  'net',  'tuesday',   '12:40', '14:10', '405',      'lab',      'all'),
  ('l7',  'is',   'wednesday', '10:40', '12:10', '310',      'lecture',  'all'),
  ('l8',  'web',  'wednesday', '12:40', '14:10', '404',      'practice', 'all'),
  ('l9',  'math', 'wednesday', '14:20', '15:50', '201',      'practice', 'even'),
  ('l10', 'net',  'thursday',  '09:00', '10:30', '201',      'lecture',  'all'),
  ('l11', 'db',   'thursday',  '10:40', '12:10', '312',      'lab',      'all'),
  ('l12', 'oop',  'thursday',  '12:40', '14:10', '310',      'lecture',  'all'),
  ('l13', 'is',   'friday',    '09:00', '10:30', '310',      'practice', 'all'),
  ('l14', 'db',   'friday',    '10:40', '12:10', '312',      'practice', 'odd'),
  ('l15', 'pe',   'friday',    '12:40', '14:10', 'Спортзал', 'practice', 'all'),
  ('l16', 'is',   'saturday',  '10:40', '12:10', '310',      'practice', 'all')
on conflict (id) do nothing;

-- Задания: даты считаются от сегодняшнего дня, чтобы пример всегда был актуальным.
-- current_date + 3 — стандартная арифметика дат в PostgreSQL.
insert into tasks (id, subject_id, title, description, kind, due_date, status, author_id, author_name) values
  ('t1', 'is',   'Описать бизнес-процессы в нотации IDEF0',     'Схема «как есть» и «как должно быть».',      'homework',   (current_date)::text,      'inProgress', 1, 'Староста группы'),
  ('t2', 'oop',  'Лабораторная №3: наследование и полиморфизм', 'Иерархия классов фигур, отчёт в Word.',      'lab',        (current_date - 1)::text,  'todo',       1, 'Староста группы'),
  ('t3', 'db',   'Лабораторная №4: нормализация базы данных',   'Привести схему к 3НФ, приложить SQL-скрипт.','lab',        (current_date + 3)::text,  'todo',       2, 'Алексей П.'),
  ('t4', 'math', 'Контрольная по теории вероятностей',          'Формула Байеса, случайные величины.',        'test',       (current_date + 6)::text,  'todo',       1, 'Староста группы'),
  ('t5', 'web',  'Курсовая: SPA-приложение на React',           'ТЗ, схема БД, код, пояснительная записка.',  'coursework', (current_date + 24)::text, 'inProgress', 3, 'Мария К.')
on conflict (id) do nothing;

-- Время последнего изменения не задаём заранее: его проставит приложение при первой же правке.
-- Если значения нет, интерфейс подставит текущее время сам.
insert into meta (key, value) values
  ('group_name', 'ИСПСВ-301'),
  ('version', '1')
on conflict (key) do nothing;
