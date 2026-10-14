// Тестовые («мок») данные для группы. Позже они будут приходить с бэкенда,
// но структура останется точно такой же — поэтому интерфейс менять не придётся.

import { GroupData, Lesson, Material, Subject, Task } from '../types';
import { isoDaysFromNow } from '../utils/format';

/** Предметы 3 курса специальности «Информационные системы». */
const subjects: Subject[] = [
  { id: 'db', title: 'Базы данных', short: 'БД', teacher: 'Иванова М. П.' },
  { id: 'web', title: 'Web-программирование', short: 'Web', teacher: 'Петров А. С.' },
  { id: 'oop', title: 'Объектно-ориентированное программирование', short: 'ООП', teacher: 'Сидоров К. В.' },
  { id: 'net', title: 'Компьютерные сети', short: 'Сети', teacher: 'Кузнецова О. И.' },
  { id: 'is', title: 'Проектирование информационных систем', short: 'ПИС', teacher: 'Морозов Д. А.' },
  { id: 'math', title: 'Теория вероятностей и математическая статистика', short: 'ТВиМС', teacher: 'Волкова Е. Н.' },
  { id: 'pe', title: 'Физическая культура', short: 'Физра', teacher: 'Зайцев П. Р.' },
];

/**
 * Расписание. Для очно-заочной формы важны оба периода:
 *   • mode: 'session' — занятия сессии: идут очно по дням недели (привычная сетка);
 *   • mode: 'online'  — дистанционные занятия: привязаны к конкретным датам,
 *     потому что повторяются не каждую неделю.
 */
const lessons: Lesson[] = [
  // --- СЕССИЯ (по дням недели)
  { id: 'l1', subjectId: 'db', weekday: 'monday', startTime: '09:00', endTime: '10:30', room: '312', kind: 'lecture', parity: 'all', mode: 'session' },
  { id: 'l2', subjectId: 'web', weekday: 'monday', startTime: '10:40', endTime: '12:10', room: '404', kind: 'lab', parity: 'all', mode: 'session' },
  { id: 'l3', subjectId: 'pe', weekday: 'monday', startTime: '12:40', endTime: '14:10', room: 'Спортзал', kind: 'practice', parity: 'all', mode: 'session' },
  { id: 'l4', subjectId: 'oop', weekday: 'tuesday', startTime: '09:00', endTime: '10:30', room: '310', kind: 'practice', parity: 'all', mode: 'session' },
  { id: 'l5', subjectId: 'math', weekday: 'tuesday', startTime: '10:40', endTime: '12:10', room: '201', kind: 'lecture', parity: 'all', mode: 'session' },
  { id: 'l6', subjectId: 'net', weekday: 'tuesday', startTime: '12:40', endTime: '14:10', room: '405', kind: 'lab', parity: 'all', mode: 'session' },
  { id: 'l7', subjectId: 'is', weekday: 'wednesday', startTime: '10:40', endTime: '12:10', room: '310', kind: 'lecture', parity: 'all', mode: 'session' },
  { id: 'l8', subjectId: 'web', weekday: 'wednesday', startTime: '12:40', endTime: '14:10', room: '404', kind: 'practice', parity: 'all', mode: 'session' },
  { id: 'l9', subjectId: 'math', weekday: 'wednesday', startTime: '14:20', endTime: '15:50', room: '201', kind: 'practice', parity: 'even', mode: 'session' },
  { id: 'l10', subjectId: 'net', weekday: 'thursday', startTime: '09:00', endTime: '10:30', room: '201', kind: 'lecture', parity: 'all', mode: 'session' },
  { id: 'l11', subjectId: 'db', weekday: 'thursday', startTime: '10:40', endTime: '12:10', room: '312', kind: 'lab', parity: 'all', mode: 'session' },
  { id: 'l12', subjectId: 'oop', weekday: 'thursday', startTime: '12:40', endTime: '14:10', room: '310', kind: 'lecture', parity: 'all', mode: 'session' },
  { id: 'l13', subjectId: 'is', weekday: 'friday', startTime: '09:00', endTime: '10:30', room: '310', kind: 'practice', parity: 'all', mode: 'session' },
  { id: 'l14', subjectId: 'db', weekday: 'friday', startTime: '10:40', endTime: '12:10', room: '312', kind: 'practice', parity: 'odd', mode: 'session' },
  { id: 'l15', subjectId: 'pe', weekday: 'friday', startTime: '12:40', endTime: '14:10', room: 'Спортзал', kind: 'practice', parity: 'all', mode: 'session' },
  { id: 'l16', subjectId: 'is', weekday: 'saturday', startTime: '10:40', endTime: '12:10', room: '310', kind: 'practice', parity: 'all', mode: 'session' },

  // --- ДИСТАНЦИОННЫЙ ПЕРИОД (по датам, вечерние вебинары)
  { id: 'o1', subjectId: 'web', weekday: 'wednesday', startTime: '18:00', endTime: '19:30', room: 'Онлайн', kind: 'lecture', parity: 'all', mode: 'online', date: isoDaysFromNow(1) },
  { id: 'o2', subjectId: 'db', weekday: 'thursday', startTime: '18:00', endTime: '19:30', room: 'Онлайн', kind: 'practice', parity: 'all', mode: 'online', date: isoDaysFromNow(3) },
  { id: 'o3', subjectId: 'is', weekday: 'saturday', startTime: '11:00', endTime: '12:30', room: 'Онлайн', kind: 'lecture', parity: 'all', mode: 'online', date: isoDaysFromNow(8) },
];

/**
 * Задания. Даты считаем от «сегодня», чтобы пример всегда был актуальным:
 * просроченные, горящие и далёкие задания видно сразу.
 */
const tasks: Task[] = [
  {
    id: 't1',
    subjectId: 'is',
    title: 'Описать бизнес-процессы в нотации IDEF0',
    description: 'Схема «как есть» и «как должно быть» для выбранной предметной области.',
    kind: 'homework',
    dueDate: isoDaysFromNow(0),
    status: 'inProgress',
    authorId: 1,
    authorName: 'Староста группы',
    createdAt: new Date().toISOString(),
  },
  {
    id: 't2',
    subjectId: 'oop',
    title: 'Лабораторная №3: наследование и полиморфизм',
    description: 'Реализовать иерархию классов фигур, отчёт в Word.',
    kind: 'lab',
    dueDate: isoDaysFromNow(-1),
    status: 'todo',
    authorId: 1,
    authorName: 'Староста группы',
    createdAt: new Date().toISOString(),
  },
  {
    id: 't3',
    subjectId: 'db',
    title: 'Лабораторная №4: нормализация базы данных',
    description: 'Привести схему к 3НФ, приложить SQL-скрипт создания таблиц.',
    kind: 'lab',
    dueDate: isoDaysFromNow(3),
    status: 'todo',
    authorId: 2,
    authorName: 'Алексей П.',
    createdAt: new Date().toISOString(),
    // Пример вложения: файл лежит в общем хранилище.
    attachmentPath: 'db/example-method.pdf',
    attachmentName: 'Методичка по нормализации.pdf',
  },
  {
    id: 't4',
    subjectId: 'math',
    title: 'Контрольная работа по теории вероятностей',
    description: 'Темы: формула Байеса, случайные величины, закон больших чисел.',
    kind: 'test',
    dueDate: isoDaysFromNow(6),
    status: 'todo',
    authorId: 1,
    authorName: 'Староста группы',
    createdAt: new Date().toISOString(),
    // Пример вложения: файл лежит не у нас, а по ссылке.
    attachmentLink: 'https://example.com/math-test-variant-3.pdf',
    attachmentName: 'Вариант контрольной №3',
  },
  {
    id: 't5',
    subjectId: 'net',
    title: 'Реферат: протоколы маршрутизации OSPF и BGP',
    description: '12–15 страниц, минимум 5 источников, оформление по методичке.',
    kind: 'essay',
    dueDate: isoDaysFromNow(12),
    status: 'inProgress',
    authorId: 3,
    authorName: 'Мария К.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 't6',
    subjectId: 'web',
    title: 'Курсовая: SPA-приложение на React',
    description: 'Тема согласована. Нужны: ТЗ, схема БД, код, пояснительная записка.',
    kind: 'coursework',
    dueDate: isoDaysFromNow(24),
    status: 'inProgress',
    authorId: 1,
    authorName: 'Староста группы',
    createdAt: new Date().toISOString(),
  },
  {
    id: 't7',
    subjectId: 'db',
    title: 'Домашняя работа: проектирование ER-диаграммы',
    description: 'Уже сдано, оставлено для примера выполненных заданий.',
    kind: 'homework',
    dueDate: isoDaysFromNow(-5),
    status: 'done',
    authorId: 2,
    authorName: 'Алексей П.',
    createdAt: new Date().toISOString(),
  },
];

/** Учебные материалы по предметам: конспекты, методички, записи занятий. */
const materials: Material[] = [
  {
    id: 'm1',
    subjectId: 'db',
    title: 'Методичка по нормализации (3НФ)',
    description: 'Примеры приведения схемы к третьей нормальной форме.',
    link: 'https://example.com/db-normalization-guide.pdf',
    uploadedBy: 'Староста группы',
    uploadedAt: new Date().toISOString(),
  },
  {
    id: 'm2',
    subjectId: 'web',
    title: 'Запись вебинара: состояние и хуки в React',
    description: 'Занятие дистанционного периода, 1 час 20 минут.',
    link: 'https://example.com/react-hooks-recording',
    uploadedBy: 'Мария К.',
    uploadedAt: new Date().toISOString(),
  },
];

/**
 * Собирает полный набор данных группы.
 * Функция (а не константа) нужна, чтобы каждый вызов возвращал СВЕЖУЮ копию:
 * иначе случайное изменение объекта в одном месте испортило бы данные везде.
 */
export const createMockGroupData = (): GroupData => ({
  version: 2,
  groupName: 'ИС-31',
  subjects: subjects.map((item) => ({ ...item })),
  lessons: lessons.map((item) => ({ ...item })),
  tasks: tasks.map((item) => ({ ...item })),
  materials: materials.map((item) => ({ ...item })),
  updatedAt: new Date().toISOString(),
});
