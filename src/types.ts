// Здесь описаны ВСЕ типы данных приложения.
// Один источник правды: эти же типы будут использовать и тестовые данные,
// и хранилище, и (в будущем) ответы нашего бэкенда.

/** Дни недели, которые есть в расписании. Порядок важен: по нему рисуем переключатель дней. */
export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

/** Вид пары: лекция, практика или лабораторная работа. */
export type LessonKind = 'lecture' | 'practice' | 'lab';

/** Чётность недели: all — каждую неделю, odd — по нечётным, even — по чётным. */
export type WeekParity = 'all' | 'odd' | 'even';

/**
 * Период обучения. Важно для очно-заочной формы:
 *   • 'session' — сессия: занятия идут очно, по дням недели (привычная «сетка»);
 *   • 'online'  — дистанционный период: занятия привязаны к конкретным датам (вебинары),
 *                 потому что они не повторяются каждую неделю.
 */
export type LessonMode = 'online' | 'session';

/** Учебный предмет (дисциплина). */
export interface Subject {
  id: string;
  title: string;
  /** Короткое название — для компактных подписей на карточках. */
  short: string;
  teacher: string;
}

/** Одна пара в расписании. */
export interface Lesson {
  id: string;
  subjectId: string;
  weekday: Weekday;
  /** Время в формате "ЧЧ:ММ". Строкой удобно сортировать и сравнивать. */
  startTime: string;
  endTime: string;
  room: string;
  kind: LessonKind;
  parity: WeekParity;
  /** Период: сессия (по дням недели) или дистанционное занятие (по дате). */
  mode: LessonMode;
  /** Дата занятия для дистанционного периода: "ГГГГ-ММ-ДД". Для сессии не используется. */
  date?: string;
}

/** Вид задания. */
export type TaskKind = 'homework' | 'lab' | 'coursework' | 'test' | 'essay';

/** Статус задания: не начато, в работе, сдано. */
export type TaskStatus = 'todo' | 'inProgress' | 'done';

/** Задание к предмету (домашка, лаба, курсовая...). */
export interface Task {
  id: string;
  subjectId: string;
  title: string;
  description: string;
  kind: TaskKind;
  /** Дата сдачи в формате ISO "ГГГГ-ММ-ДД": так её удобно сравнивать и сортировать. */
  dueDate: string;
  status: TaskStatus;
  /** Кто добавил задание — id и имя пользователя из VK. */
  authorId?: number;
  authorName?: string;
  createdAt: string;
  /** Файл-вложение, загруженный в наше хранилище (путь внутри бакета). */
  attachmentPath?: string;
  /** Имя файла вложения — показываем пользователю. */
  attachmentName?: string;
  /** Внешняя ссылка, если файл лежит не у нас (например, на диске или в облаке вуза). */
  attachmentLink?: string;
}

/**
 * Учебный материал по предмету: конспект, методичка, презентация, запись занятия.
 * Хранится либо файлом в бакете Supabase Storage, либо внешней ссылкой.
 */
export interface Material {
  id: string;
  subjectId: string;
  title: string;
  description: string;
  /** Путь к файлу внутри бакета "materials". */
  filePath?: string;
  /** Исходное имя файла. */
  fileName?: string;
  /** Размер файла в байтах. */
  fileSize?: number;
  /** Внешняя ссылка (если файл лежит не у нас). */
  link?: string;
  /** Кто загрузил (имя пользователя из VK). */
  uploadedBy?: string;
  uploadedAt: string;
}

/**
 * «Общие» данные группы: расписание, предметы и задания.
 * Именно этот объект в будущем будет приходить с нашего бэкенда,
 * чтобы все одногруппники видели одно и то же.
 */
export interface GroupData {
  /** Номер версии формата данных — пригодится, когда будем менять структуру. */
  version: number;
  groupName: string;
  subjects: Subject[];
  lessons: Lesson[];
  tasks: Task[];
  /** Материалы по предметам: файлы и ссылки. */
  materials: Material[];
  updatedAt: string;
}

/**
 * Личные настройки пользователя.
 * Они у каждого свои, поэтому их безопасно хранить в VK Storage.
 */
export interface UserPrefs {
  /** Подгруппа студента — влияет на показ лабораторных работ. */
  subgroup: 1 | 2;
  /** Показывать ли уже прошедшие пары в расписании. */
  showPastLessons: boolean;
}
