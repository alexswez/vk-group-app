// Утилиты форматирования: превращают «машинные» данные в человеческий текст.
// Такие функции полезно держать отдельно — их удобно тестировать и переиспользовать.

// import type — «импорт только типов»: при сборке такая строка полностью исчезает,
// поэтому файл можно запускать и в Node.js напрямую (например, в тестах).
import type { Lesson, LessonKind, Subject, TaskKind, Weekday } from '../types';

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

/**
 * Размер файла в человеческом виде: «820 Б», «12,4 КБ», «3,1 МБ».
 * Нужно для карточек материалов и вложений.
 */
export const formatFileSize = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return 'размер неизвестен';
  if (bytes < 1024) return `${bytes} Б`;

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1).replace('.', ',')} КБ`;

  const megabytes = kilobytes / 1024;
  if (megabytes < 1024) return `${megabytes.toFixed(1).replace('.', ',')} МБ`;

  return `${(megabytes / 1024).toFixed(2).replace('.', ',')} ГБ`;
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

/**
 * Определяет день недели по дате "ГГГГ-ММ-ДД".
 *
 * Нужно для дистанционных занятий: пользователь выбирает конкретную дату,
 * а день недели приложение вычисляет само (он хранится в записи и используется
 * для сортировки и для недельной сетки).
 * Воскресенье относим к понедельнику — учебных пар по воскресеньям не бывает.
 */
export const weekdayFromIso = (iso: string): Weekday => {
  const [year, month, day] = iso.split('-').map(Number);
  const jsDay = new Date(year, month - 1, day).getDay();
  if (jsDay === 0) return 'monday';
  return WEEKDAYS[jsDay - 1].id;
};

/**
 * Одна строка описания пары — общая для недельного и дистанционного расписания.
 * Если withDate = true, перед временем добавляется дата (для занятий по датам).
 */
const lessonLine = (
  lesson: Lesson,
  index: number,
  findSubject: (subjectId: string) => Subject | undefined,
  withDate: boolean,
): string => {
  const subject = findSubject(lesson.subjectId);
  const title = subject ? subject.short || subject.title : 'предмет не найден';
  const teacher = subject?.teacher ? `, ${subject.teacher}` : '';
  // Для онлайн-занятий слово «ауд.» неуместно — пишем просто место, например «Онлайн».
  const room = lesson.room ? `, ${lesson.room === 'Онлайн' ? '' : 'ауд. '}${lesson.room}` : '';
  const parity =
    lesson.parity === 'all' ? '' : lesson.parity === 'odd' ? ' (нечётная неделя)' : ' (чётная неделя)';

  const weekdayShort = WEEKDAYS.find((item) => item.id === lesson.weekday)?.short ?? '';
  const date = withDate && lesson.date ? `${formatDate(lesson.date)} (${weekdayShort}), ` : '';

  return `${index + 1}) ${date}${lesson.startTime}–${lesson.endTime} — ${title} (${LESSON_KIND_LABEL[
    lesson.kind
  ].toLowerCase()})${room}${teacher}${parity}`;
};

/**
 * Готовит расписание одного дня в виде обычного текста — чтобы его можно было
 * отправить в беседу группы сообщением и прочитать, не открывая приложение.
 *
 * Предмет ищем через переданную функцию: так удобно и для реальных данных, и для тестов.
 */
export const formatDaySchedule = (
  groupName: string,
  dayLabel: string,
  lessons: Lesson[],
  findSubject: (subjectId: string) => Subject | undefined,
): string => {
  const header = `Расписание группы ${groupName}\n${dayLabel}`;

  if (lessons.length === 0) {
    return `${header}\n\nВ этот день пар нет.`;
  }

  // Сортируем по времени начала, чтобы текст всегда был в правильном порядке.
  const sorted = [...lessons].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const lines = sorted.map((lesson, index) => lessonLine(lesson, index, findSubject, false));

  return `${header}\n\n${lines.join('\n')}\n\nВсего пар: ${sorted.length}`;
};

/**
 * Готовит список дистанционных занятий (они идут по датам, а не по дням недели).
 * Такой текст удобно отправить в беседу: сразу видно, когда будет вебинар.
 */
export const formatOnlineSchedule = (
  groupName: string,
  lessons: Lesson[],
  findSubject: (subjectId: string) => Subject | undefined,
): string => {
  const header = `Дистанционные занятия группы ${groupName}`;

  if (lessons.length === 0) {
    return `${header}\n\nЗанятий не назначено.`;
  }

  // Сортируем по дате и времени.
  const sorted = [...lessons].sort((a, b) =>
    `${a.date ?? ''}${a.startTime}`.localeCompare(`${b.date ?? ''}${b.startTime}`),
  );
  const lines = sorted.map((lesson, index) => lessonLine(lesson, index, findSubject, true));

  return `${header}\n\n${lines.join('\n')}\n\nВсего занятий: ${sorted.length}`;
};
