// Тестовые данные для базы: те же предметы и расписание, что и во фронтенде.
//
// Почему данные продублированы в двух местах: фронтенд использует их как «запасной вариант»,
// когда сервер недоступен, а сервер — как стартовое наполнение базы.
// В реальном проекте такой дубль убирают, вынося данные в общий JSON-файл.

/** Дата через N дней от сегодня в формате "ГГГГ-ММ-ДД" (локальное время). */
const isoDaysFromNow = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const seedGroupName = 'ИС-31';

export const seedSubjects = [
  { id: 'db', title: 'Базы данных', short: 'БД', teacher: 'Иванова М. П.' },
  { id: 'web', title: 'Web-программирование', short: 'Web', teacher: 'Петров А. С.' },
  { id: 'oop', title: 'Объектно-ориентированное программирование', short: 'ООП', teacher: 'Сидоров К. В.' },
  { id: 'net', title: 'Компьютерные сети', short: 'Сети', teacher: 'Кузнецова О. И.' },
  { id: 'is', title: 'Проектирование информационных систем', short: 'ПИС', teacher: 'Морозов Д. А.' },
  { id: 'math', title: 'Теория вероятностей и математическая статистика', short: 'ТВиМС', teacher: 'Волкова Е. Н.' },
  { id: 'pe', title: 'Физическая культура', short: 'Физра', teacher: 'Зайцев П. Р.' },
];

export const seedLessons = [
  { id: 'l1', subjectId: 'db', weekday: 'monday', startTime: '09:00', endTime: '10:30', room: '312', kind: 'lecture', parity: 'all' },
  { id: 'l2', subjectId: 'web', weekday: 'monday', startTime: '10:40', endTime: '12:10', room: '404', kind: 'lab', parity: 'all' },
  { id: 'l3', subjectId: 'pe', weekday: 'monday', startTime: '12:40', endTime: '14:10', room: 'Спортзал', kind: 'practice', parity: 'all' },
  { id: 'l4', subjectId: 'oop', weekday: 'tuesday', startTime: '09:00', endTime: '10:30', room: '310', kind: 'practice', parity: 'all' },
  { id: 'l5', subjectId: 'math', weekday: 'tuesday', startTime: '10:40', endTime: '12:10', room: '201', kind: 'lecture', parity: 'all' },
  { id: 'l6', subjectId: 'net', weekday: 'tuesday', startTime: '12:40', endTime: '14:10', room: '405', kind: 'lab', parity: 'all' },
  { id: 'l7', subjectId: 'is', weekday: 'wednesday', startTime: '10:40', endTime: '12:10', room: '310', kind: 'lecture', parity: 'all' },
  { id: 'l8', subjectId: 'web', weekday: 'wednesday', startTime: '12:40', endTime: '14:10', room: '404', kind: 'practice', parity: 'all' },
  { id: 'l9', subjectId: 'math', weekday: 'wednesday', startTime: '14:20', endTime: '15:50', room: '201', kind: 'practice', parity: 'even' },
  { id: 'l10', subjectId: 'net', weekday: 'thursday', startTime: '09:00', endTime: '10:30', room: '201', kind: 'lecture', parity: 'all' },
  { id: 'l11', subjectId: 'db', weekday: 'thursday', startTime: '10:40', endTime: '12:10', room: '312', kind: 'lab', parity: 'all' },
  { id: 'l12', subjectId: 'oop', weekday: 'thursday', startTime: '12:40', endTime: '14:10', room: '310', kind: 'lecture', parity: 'all' },
  { id: 'l13', subjectId: 'is', weekday: 'friday', startTime: '09:00', endTime: '10:30', room: '310', kind: 'practice', parity: 'all' },
  { id: 'l14', subjectId: 'db', weekday: 'friday', startTime: '10:40', endTime: '12:10', room: '312', kind: 'practice', parity: 'odd' },
  { id: 'l15', subjectId: 'pe', weekday: 'friday', startTime: '12:40', endTime: '14:10', room: 'Спортзал', kind: 'practice', parity: 'all' },
  { id: 'l16', subjectId: 'is', weekday: 'saturday', startTime: '10:40', endTime: '12:10', room: '310', kind: 'practice', parity: 'all' },
];

export const seedTasks = [
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
  },
  {
    id: 't5',
    subjectId: 'web',
    title: 'Курсовая: SPA-приложение на React',
    description: 'Тема согласована. Нужны: ТЗ, схема БД, код, пояснительная записка.',
    kind: 'coursework',
    dueDate: isoDaysFromNow(24),
    status: 'inProgress',
    authorId: 3,
    authorName: 'Мария К.',
    createdAt: new Date().toISOString(),
  },
];
