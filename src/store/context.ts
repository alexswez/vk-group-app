// Контекст приложения — «общая шина» данных для всех экранов.
//
// Зачем это нужно: расписание, задания и настройки находятся на разных экранах,
// но работают с одними и теми же данными. Чтобы не таскать их через props,
// мы кладём данные в React-контекст: любой экран может их прочитать и изменить.

import { createContext } from 'react';
import { UserInfo } from '@vkontakte/vk-bridge';
import {
  GroupData,
  Lesson,
  LessonKind,
  Subject,
  Task,
  TaskKind,
  TaskStatus,
  UserPrefs,
  Weekday,
  WeekParity,
} from '../types';

/** Данные формы задания (без служебных полей, которые приложение проставляет само). */
export interface TaskInput {
  subjectId: string;
  title: string;
  description: string;
  kind: TaskKind;
  dueDate: string;
  status?: TaskStatus;
}

/** Данные формы пары в расписании. */
export interface LessonInput {
  subjectId: string;
  weekday: Weekday;
  startTime: string;
  endTime: string;
  room: string;
  kind: LessonKind;
  parity: WeekParity;
}

/** Всё, что контекст отдаёт наружу. */
export interface AppDataContextValue {
  /** true, пока данные читаются из хранилища (показываем спиннер). */
  loading: boolean;
  /** true, если данные берутся с общего сервера; false — локальный режим (localStorage). */
  serverMode: boolean;
  group: GroupData;
  subjects: Subject[];
  lessons: Lesson[];
  tasks: Task[];
  prefs: UserPrefs;
  /** Данные пользователя VK. undefined, если приложение открыто вне ВКонтакте. */
  user?: UserInfo;
  /** id задания, которое сейчас редактируется (null — создаём новое). */
  editingTaskId: string | null;
  /** id пары, которую сейчас редактируем (null — создаём новую). */
  editingLessonId: string | null;
  startTaskEditing: (id: string | null) => void;
  startLessonEditing: (id: string | null) => void;
  addTask: (input: TaskInput) => Promise<void>;
  updateTask: (id: string, input: TaskInput) => Promise<void>;
  patchTask: (id: string, patch: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  addLesson: (input: LessonInput) => Promise<void>;
  updateLesson: (id: string, input: LessonInput) => Promise<void>;
  deleteLesson: (id: string) => Promise<void>;
  setGroupName: (name: string) => Promise<void>;
  patchPrefs: (patch: Partial<UserPrefs>) => Promise<void>;
  resetToMock: () => Promise<void>;
}

/**
 * Сам контекст. По умолчанию null — если какой-то экран забудет обернуть приложение
 * провайдером, мы получим понятную ошибку, а не загадочное «данные пустые».
 */
export const AppDataContext = createContext<AppDataContextValue | null>(null);
