-- ============================================================================
--  Обновление №2: очно-заочный формат, редактирование предметов, материалы.
--
--  КАК ПРИМЕНИТЬ (как и в прошлый раз):
--    1. Открой проект на https://supabase.com
--    2. SQL Editor → New query
--    3. Вставь ВЕСЬ этот файл и нажми Run
--
--  Скрипт безопасно запускать повторно: он только добавляет новое и ничего не удаляет.
--  Существующие данные (расписание, задания) не пострадают.
-- ============================================================================

-- ---------------------------------------------------------------- 1. ПАРЫ

-- Период обучения: 'session' — сессия (занятия по дням недели, очно),
--                  'online'  — дистанционный период (занятия по конкретным датам).
-- Имя колонки именно lesson_mode (а не mode): слово «mode» совпадает с названием
-- функции PostgreSQL, и REST API Supabase на нём спотыкается.
alter table lessons add column if not exists lesson_mode text not null default 'session';

-- Дата занятия (только для дистанционного периода): 'ГГГГ-ММ-ДД'.
alter table lessons add column if not exists lesson_date text;

comment on column lessons.lesson_mode is 'session — сессия (по дням недели), online — дистанционное занятие по дате';
comment on column lessons.lesson_date is 'Дата занятия для дистанционного периода (ГГГГ-ММ-ДД)';

-- Существующие пары из схемы — это расписание сессии, что и стоит по умолчанию.

-- ---------------------------------------------------------------- 2. ЗАДАНИЯ

-- Вложение к заданию: файл в хранилище или внешняя ссылка.
alter table tasks add column if not exists attachment_path text;
alter table tasks add column if not exists attachment_name text;
alter table tasks add column if not exists attachment_link text;

comment on column tasks.attachment_path is 'Путь к файлу в хранилище материалов (или NULL)';
comment on column tasks.attachment_link is 'Внешняя ссылка, если файл не загружен в хранилище';

-- ---------------------------------------------------------------- 3. МАТЕРИАЛЫ

-- Учебные материалы по предметам: конспекты, методички, презентации, записи занятий.
create table if not exists materials (
  id          text primary key,
  subject_id  text not null references subjects(id),
  title       text not null,
  description text not null default '',
  -- Файл в хранилище Supabase: путь внутри бакета и исходное имя файла.
  file_path   text,
  file_name   text,
  file_size   bigint,
  -- Либо внешняя ссылка (если файл лежит не у нас).
  link        text,
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);

alter table materials enable row level security;

drop policy if exists "anon read materials" on materials;
drop policy if exists "anon write materials" on materials;
create policy "anon read materials"  on materials for select to anon, authenticated using (true);
create policy "anon write materials" on materials for all    to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------- 4. ФАЙЛОВОЕ ХРАНИЛИЩЕ

-- Бакет (папка) для файлов материалов. public = true, чтобы файлы открывались по ссылке.
insert into storage.buckets (id, name, public)
values ('materials', 'materials', true)
on conflict (id) do update set public = true;

-- Разрешаем читать и загружать файлы из этого бакета.
-- ⚠️ Так же, как и с таблицами: для учебного проекта доступ анонимный. В боевом
-- приложении нужна авторизация и политики «только своя группа».
drop policy if exists "anon read material files"   on storage.objects;
drop policy if exists "anon upload material files" on storage.objects;
drop policy if exists "anon delete material files" on storage.objects;

create policy "anon read material files"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'materials');

create policy "anon upload material files"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'materials');

create policy "anon delete material files"
  on storage.objects for delete to anon, authenticated
  using (bucket_id = 'materials');

-- ---------------------------------------------------------------- 5. ПРОВЕРКА

-- Покажет, что всё создалось: должно вернуться 5 строк (4 таблицы + бакет).
select 'materials' as объект, count(*)::text as значение from materials
union all select 'bucket materials', count(*)::text from storage.buckets where id = 'materials'
union all select 'lessons.lesson_mode', count(*)::text from information_schema.columns
          where table_name = 'lessons' and column_name = 'lesson_mode'
union all select 'lessons.lesson_date', count(*)::text from information_schema.columns
          where table_name = 'lessons' and column_name = 'lesson_date'
union all select 'tasks.attachment_path', count(*)::text from information_schema.columns
          where table_name = 'tasks' and column_name = 'attachment_path';
