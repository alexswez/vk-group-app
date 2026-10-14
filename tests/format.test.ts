// Тесты утилит форматирования дат.
//
// Запуск:  npm test
//
// Особенность: тесты написаны на встроенном в Node.js тест-раннере (node:test),
// поэтому НЕ требуют сторонних библиотек вроде Jest или Vitest. Node 24 умеет
// выполнять TypeScript-файлы напрямую, без отдельной сборки.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WEEKDAYS,
  daysLeft,
  formatDate,
  formatDaySchedule,
  formatDaysLeft,
  formatFileSize,
  formatOnlineSchedule,
  isoDaysFromNow,
  pluralDays,
  todayIso,
  todayWeekdayIndex,
  weekdayFromIso,
} from '../src/utils/format.ts';

test('pluralDays: правильные формы слова «день»', () => {
  assert.equal(pluralDays(1), 'день');
  assert.equal(pluralDays(2), 'дня');
  assert.equal(pluralDays(4), 'дня');
  assert.equal(pluralDays(5), 'дней');
  assert.equal(pluralDays(11), 'дней'); // исключение: 11–14 всегда «дней»
  assert.equal(pluralDays(13), 'дней');
  assert.equal(pluralDays(21), 'день');
  assert.equal(pluralDays(22), 'дня');
  assert.equal(pluralDays(102), 'дня');
});

test('todayIso: дата в формате ГГГГ-ММ-ДД', () => {
  assert.match(todayIso(), /^\d{4}-\d{2}-\d{2}$/);
});

test('isoDaysFromNow: сегодня, завтра и вчера считаются правильно', () => {
  assert.equal(isoDaysFromNow(0), todayIso());
  assert.equal(daysLeft(isoDaysFromNow(0)), 0);
  assert.equal(daysLeft(isoDaysFromNow(1)), 1);
  assert.equal(daysLeft(isoDaysFromNow(3)), 3);
  assert.equal(daysLeft(isoDaysFromNow(-2)), -2);
  assert.equal(daysLeft(isoDaysFromNow(30)), 30);
});

test('isoDaysFromNow: переход через границу месяца не ломается', () => {
  // Проверяем, что функция работает с реальными календарными датами:
  // результат всегда существует и остаётся в формате ГГГГ-ММ-ДД.
  for (const shift of [28, 31, 59, 365, -28, -31]) {
    assert.match(isoDaysFromNow(shift), /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('formatDate: ISO превращается в привычный вид', () => {
  assert.equal(formatDate('2026-03-14'), '14.03.2026');
  assert.equal(formatDate('2030-12-01'), '01.12.2030');
});

test('formatDaysLeft: человеческие формулировки срока', () => {
  assert.equal(formatDaysLeft(isoDaysFromNow(0)), 'сегодня');
  assert.equal(formatDaysLeft(isoDaysFromNow(1)), 'завтра');
  assert.equal(formatDaysLeft(isoDaysFromNow(3)), 'через 3 дня');
  assert.equal(formatDaysLeft(isoDaysFromNow(5)), 'через 5 дней');
  assert.equal(formatDaysLeft(isoDaysFromNow(21)), 'через 21 день');
  assert.equal(formatDaysLeft(isoDaysFromNow(-1)), 'просрочено на 1 день');
  assert.equal(formatDaysLeft(isoDaysFromNow(-2)), 'просрочено на 2 дня');
  assert.equal(formatDaysLeft(isoDaysFromNow(-5)), 'просрочено на 5 дней');
});

test('WEEKDAYS: шесть учебных дней с уникальными идентификаторами', () => {
  assert.equal(WEEKDAYS.length, 6);
  assert.equal(new Set(WEEKDAYS.map((item) => item.id)).size, 6);
  assert.deepEqual(
    WEEKDAYS.map((item) => item.short),
    ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  );
});

test('todayWeekdayIndex: корректный индекс для расписания', () => {
  const index = todayWeekdayIndex();
  // Понедельник — 0, суббота — 5, воскресенье — -1 (в расписании такого дня нет).
  assert.ok(index >= -1 && index <= 5, `получено ${index}`);
});

// --- расписание текстом (для отправки в беседу) ---

/** Предметы для проверок. */
const SUBJECTS = [
  { id: 'db', title: 'Базы данных', short: 'БД', teacher: 'Иванова М. П.' },
  { id: 'pe', title: 'Физическая культура', short: 'Физра', teacher: 'Зайцев П. Р.' },
];
const findSubject = (id: string) => SUBJECTS.find((subject) => subject.id === id);

test('formatDaySchedule: пустой день сообщает об отсутствии пар', () => {
  const text = formatDaySchedule('ИС-31', 'Воскресенье', [], findSubject);
  assert.match(text, /ИС-31/);
  assert.match(text, /Воскресенье/);
  assert.match(text, /В этот день пар нет\./);
});

test('formatDaySchedule: пары идут по порядку и содержат аудиторию с преподавателем', () => {
  const lessons = [
    { id: '2', subjectId: 'pe', weekday: 'monday', startTime: '12:40', endTime: '14:10', room: 'Спортзал', kind: 'practice', parity: 'all' },
    { id: '1', subjectId: 'db', weekday: 'monday', startTime: '09:00', endTime: '10:30', room: '312', kind: 'lecture', parity: 'all' },
  ];

  const text = formatDaySchedule('ИС-31', 'Понедельник', lessons, findSubject);

  assert.match(text, /1\) 09:00–10:30 — БД \(лекция\), ауд\. 312, Иванова М\. П\./);
  assert.match(text, /2\) 12:40–14:10 — Физра \(практика\), ауд\. Спортзал, Зайцев П\. Р\./);
  assert.match(text, /Всего пар: 2/);

  // Даже если пары пришли вперемешку, в тексте они должны идти по времени.
  assert.ok(
    text.indexOf('1) 09:00') < text.indexOf('2) 12:40'),
    'пары должны быть отсортированы по времени начала',
  );
});

test('formatDaySchedule: отмечает чётность недели', () => {
  const lessons = [
    { id: '1', subjectId: 'db', weekday: 'monday', startTime: '09:00', endTime: '10:30', room: '312', kind: 'lecture', parity: 'odd' },
  ];

  const text = formatDaySchedule('ИС-31', 'Понедельник', lessons, findSubject);
  assert.match(text, /нечётная неделя/);
});

test('formatDaySchedule: не падает, если предмет не найден', () => {
  const lessons = [
    { id: '1', subjectId: 'неизвестный', weekday: 'monday', startTime: '09:00', endTime: '10:30', room: '312', kind: 'lecture', parity: 'all' },
  ];

  const text = formatDaySchedule('ИС-31', 'Понедельник', lessons, findSubject);
  assert.match(text, /предмет не найден/);
});

// --- очно-заочная форма: дистанционные занятия ---

test('weekdayFromIso: определяет день недели по дате', () => {
  // 1 января 2026 — четверг, 3 января — суббота, 4 января — воскресенье.
  assert.equal(weekdayFromIso('2026-01-01'), 'thursday');
  assert.equal(weekdayFromIso('2026-01-03'), 'saturday');
  // Воскресенье относим к понедельнику: пар по воскресеньям не бывает.
  assert.equal(weekdayFromIso('2026-01-04'), 'monday');
});

test('formatOnlineSchedule: занятия идут по датам и сортируются', () => {
  const lessons = [
    { id: '2', subjectId: 'db', weekday: 'thursday', startTime: '18:00', endTime: '19:30', room: 'Онлайн', kind: 'practice', parity: 'all', mode: 'online', date: '2026-01-08' },
    { id: '1', subjectId: 'pe', weekday: 'monday', startTime: '11:00', endTime: '12:30', room: 'Онлайн', kind: 'lecture', parity: 'all', mode: 'online', date: '2026-01-05' },
  ];

  const text = formatOnlineSchedule('ИС-31', lessons, findSubject);

  assert.match(text, /Дистанционные занятия группы ИС-31/);
  // Дата и день недели видны сразу — это главное для занятий по датам.
  assert.match(text, /1\) 05\.01\.2026 \(Пн\), 11:00–12:30 — Физра \(лекция\), Онлайн, Зайцев П\. Р\./);
  assert.match(text, /2\) 08\.01\.2026 \(Чт\), 18:00–19:30 — БД \(практика\), Онлайн, Иванова М\. П\./);
  assert.match(text, /Всего занятий: 2/);
  assert.ok(text.indexOf('05.01.2026') < text.indexOf('08.01.2026'), 'занятия должны идти по возрастанию даты');
});

test('formatOnlineSchedule: пустой список сообщает об отсутствии занятий', () => {
  const text = formatOnlineSchedule('ИС-31', [], findSubject);
  assert.match(text, /Занятий не назначено\./);
});

test('formatFileSize: размер файла в человеческом виде', () => {
  assert.equal(formatFileSize(undefined), 'размер неизвестен');
  assert.equal(formatFileSize(0), 'размер неизвестен');
  assert.equal(formatFileSize(820), '820 Б');
  assert.equal(formatFileSize(12698), '12,4 КБ');
  assert.equal(formatFileSize(3250586), '3,1 МБ');
});
