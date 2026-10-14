// Утилиты форматирования: превращают «машинные» данные в человеческий текст.
// Такие функции полезно держать отдельно — их удобно тестировать и переиспользовать.

// import type — «импорт только типов»: при сборке такая строка полностью исчезает,
// поэтому файл можно запускать и в Node.js напрямую (например, в тестах).
import type { LessonKind, TaskKind, Weekday } from '../types';

/** Дни недели в порядке следования с подписями для интерфейса. */
export const WEEKDAYS: { id: Weekday; label: string; short: string }[] = [
  { id: 'monday', label: 'Понедельник', short: 'Пн' },
  { id: 'tuesday', label: 'Вторник', short: 'Вт' },
  { id: 'wednesday', label: 'Среда', short: 'Ср' },
  { id: 'thursday', label: 'Четверг', short: 'Чт' },
  { id: 'friday', label: 'Пятница', short: 'Пт' },
  { id: 'saturday', label: 'Суббота', short: 'Сб' },
];

/** Подписи для видов пар. Record<...> означает «объект, где ключи — все значения LessonKind». */
export const LESSON_KIND_LABEL: Record<LessonKind, string> = {
  lecture: 'Лекция',
  practice: 'Практика',
  lab: 'Лабораторная',
};

/** Подписи для видов заданий. */
export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  homework: 'Домашняя работа',
  lab: 'Лабораторная',
  coursework: 'Курсовая',
  test: 'Контрольная',
  essay: 'Реферат',
};

/** Дописывает ноль слева: 5 -> "05". Нужно для формата "ГГГГ-ММ-ДД". */
const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Возвращает сегодняшнюю дату в формате "ГГГГ-ММ-ДД" по ЛОКАЛЬНОМУ времени.
 * Важно: используем локальные части даты, а не toISOString(),
 * потому что toISOString() переводит время в UTC и вечером может «сдвинуть» дату на день назад.
 */
export const todayIso = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** Дата через N дней от сегодня (N может быть отрицательным). */
export const isoDaysFromNow = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** Превращает "2026-03-14" в "14.03.2026". */
export const formatDate = (iso: string): string => {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
};

/** Сколько полных дней осталось до даты. Отрицательное число — задание просрочено. */
export const daysLeft = (iso: string): number => {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const [year, month, day] = iso.split('-').map(Number);
  // new Date(year, month - 1, day) — полночь нужного дня в локальном времени.
  const target = new Date(year, month - 1, day).getTime();
  const [ty, tm, td] = todayIso().split('-').map(Number);
  const today = new Date(ty, tm - 1, td).getTime();
  return Math.round((target - today) / MS_PER_DAY);
};

/** Человеческая формулировка про срок сдачи: «сегодня», «завтра», «через 3 дня», «просрочено на 2 дня». */
export const formatDaysLeft = (iso: string): string => {
  const left = daysLeft(iso);
  if (left === 0) return 'сегодня';
  if (left === 1) return 'завтра';
  if (left > 1) return `через ${left} ${pluralDays(left)}`;
  const overdue = Math.abs(left);
  return `просрочено на ${overdue} ${pluralDays(overdue)}`;
};

/** Правильная форма слова «день»: 1 день, 2 дня, 5 дней. */
export const pluralDays = (count: number): string => {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'дней';
  if (mod10 === 1) return 'день';
  if (mod10 >= 2 && mod10 <= 4) return 'дня';
  return 'дней';
};

/** Индекс сегодняшнего дня недели в нашем массиве WEEKDAYS (-1 для воскресенья). */
export const todayWeekdayIndex = (): number => {
  // В JavaScript воскресенье — это 0, понедельник — 1. Переводим в наш порядок (Пн = 0).
  const jsDay = new Date().getDay();
  return jsDay === 0 ? -1 : jsDay - 1;
};
