// Провайдер данных: загружает данные при старте и предоставляет операции изменения.
//
// Работает в двух режимах:
//   • сервер доступен  → изменения уходят на сервер, и все одногруппники видят одно и то же;
//   • сервер выключен  → изменения сохраняются в localStorage (режим разработки).
// Приложение при этом ведёт себя одинаково — этим и хорош слой хранения.

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import bridge, { UserInfo } from '@vkontakte/vk-bridge';

import { GroupData, Lesson, Task, TaskStatus, UserPrefs } from '../types';
import { createMockGroupData } from '../data/mockData';
import { loadGroupData, resetGroupData, saveGroupData } from '../storage/groupDataStorage';
import { DEFAULT_PREFS, loadUserPrefs, saveUserPrefs } from '../storage/userPrefs';
import {
  apiCreateLesson,
  apiCreateTask,
  apiDeleteLesson,
  apiDeleteTask,
  apiGetGroup,
  apiPatchTask,
  apiSetGroupName,
  apiUpdateLesson,
  apiUpdateTask,
  isServerAvailable,
} from '../storage/api';
import { AppDataContext, LessonInput, TaskInput } from './context';

/** Генератор уникальных идентификаторов для локального (оптимистичного) обновления. */
const makeId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const AppDataProvider = ({ children }: { children: ReactNode }) => {
  const [loading, setLoading] = useState(true);
  const [serverMode, setServerMode] = useState(false);
  // Стартовое значение — тестовые данные, чтобы интерфейс не был пустым ни секунды.
  const [group, setGroup] = useState<GroupData>(() => createMockGroupData());
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);
  const [user, setUser] = useState<UserInfo | undefined>(undefined);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);

  /**
   * Ссылка на самые свежие данные.
   * Зачем: если пользователь быстро нажмёт две кнопки подряд, второй обработчик
   * получил бы из замыкания УСТАРЕВШИЕ данные и затёр бы первое изменение.
   * Через ref мы всегда видим актуальное состояние.
   */
  const groupRef = useRef(group);
  useEffect(() => {
    groupRef.current = group;
  }, [group]);

  useEffect(() => {
    let cancelled = false;

    // Данные группы: внутри loadGroupData сначала проверяется сервер, потом localStorage.
    void (async () => {
      const [loadedGroup, loadedPrefs] = await Promise.all([loadGroupData(), loadUserPrefs()]);
      if (cancelled) return;
      setGroup(loadedGroup);
      setPrefs(loadedPrefs);
      setServerMode(isServerAvailable());
      setLoading(false);
    })();

    // Данные пользователя VK: вне ВКонтакте вызов не сработает — это нормально.
    void (async () => {
      try {
        const info = await bridge.send('VKWebAppGetUserInfo');
        if (!cancelled) setUser(info);
      } catch {
        // Приложение открыто в обычном браузере.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Имя пользователя для поля «кто добавил». */
  const authorName = user ? `${user.first_name} ${user.last_name}` : 'Гость';

  /**
   * Главная «рабочая лошадка»: применяет изменение.
   * 1) Сразу обновляет интерфейс (оптимистично) — пользователь не ждёт сеть.
   * 2) Если сервер доступен, отправляет запрос и берёт его версию данных как истину.
   * 3) Если сервер отклонил запрос — перечитывает данные с сервера, чтобы интерфейс
   *    не разошёлся с реальностью (например, сервер не принял данные при валидации).
   * 4) Если сервера нет вовсе — сохраняет изменение в localStorage.
   */
  const mutate = useCallback(
    async (localUpdater: (current: GroupData) => GroupData, serverCall?: () => Promise<GroupData>) => {
      const optimistic = localUpdater(groupRef.current);
      // Обновляем и состояние, и ссылку — следующая правка сразу увидит это изменение.
      groupRef.current = optimistic;
      setGroup(optimistic);

      if (serverCall && isServerAvailable()) {
        try {
          const fromServer = await serverCall();
          groupRef.current = fromServer;
          setGroup(fromServer);
          return;
        } catch {
          // Запрос не прошёл. Пробуем взять актуальную версию данных с сервера.
          try {
            const fromServer = await apiGetGroup();
            groupRef.current = fromServer;
            setGroup(fromServer);
            return;
          } catch {
            // Сервер недоступен — работаем локально.
          }
        }
      }

      await saveGroupData(optimistic);
    },
    [],
  );

  const addTask = useCallback(
    async (input: TaskInput) => {
      const task: Task = {
        id: makeId('task'),
        subjectId: input.subjectId,
        title: input.title.trim(),
        description: input.description.trim(),
        kind: input.kind,
        dueDate: input.dueDate,
        status: input.status ?? 'todo',
        authorId: user?.id,
        authorName,
        createdAt: new Date().toISOString(),
      };

      await mutate(
        (current) => ({ ...current, tasks: [...current.tasks, task] }),
        () => apiCreateTask({ ...input, authorId: user?.id, authorName }),
      );
    },
    [mutate, user, authorName],
  );

  const updateTask = useCallback(
    async (id: string, input: TaskInput) => {
      await mutate(
        (current) => ({
          ...current,
          tasks: current.tasks.map((task) =>
            task.id === id
              ? {
                  ...task,
                  subjectId: input.subjectId,
                  title: input.title.trim(),
                  description: input.description.trim(),
                  kind: input.kind,
                  dueDate: input.dueDate,
                  status: input.status ?? task.status,
                }
              : task,
          ),
        }),
        () => apiUpdateTask(id, input),
      );
    },
    [mutate],
  );

  const patchTask = useCallback(
    async (id: string, patch: Partial<Task>) => {
      await mutate(
        (current) => ({
          ...current,
          tasks: current.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
        }),
        patch.status ? () => apiPatchTask(id, { status: patch.status as TaskStatus }) : undefined,
      );
    },
    [mutate],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      await mutate(
        (current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== id) }),
        () => apiDeleteTask(id),
      );
    },
    [mutate],
  );

  const addLesson = useCallback(
    async (input: LessonInput) => {
      const lesson: Lesson = { id: makeId('lesson'), ...input };
      await mutate(
        (current) => ({ ...current, lessons: [...current.lessons, lesson] }),
        () => apiCreateLesson(input),
      );
    },
    [mutate],
  );

  const updateLesson = useCallback(
    async (id: string, input: LessonInput) => {
      await mutate(
        (current) => ({
          ...current,
          lessons: current.lessons.map((lesson) => (lesson.id === id ? { ...lesson, ...input } : lesson)),
        }),
        () => apiUpdateLesson(id, input),
      );
    },
    [mutate],
  );

  const deleteLesson = useCallback(
    async (id: string) => {
      await mutate(
        (current) => ({ ...current, lessons: current.lessons.filter((lesson) => lesson.id !== id) }),
        () => apiDeleteLesson(id),
      );
    },
    [mutate],
  );

  const setGroupName = useCallback(
    async (name: string) => {
      await mutate(
        (current) => ({ ...current, groupName: name.trim() }),
        () => apiSetGroupName(name),
      );
    },
    [mutate],
  );

  const patchPrefs = useCallback(async (patch: Partial<UserPrefs>) => {
    // Личные настройки живут в VK Storage и в localStorage — на сервер их не отправляем.
    setPrefs((current) => {
      const next: UserPrefs = { ...current, ...patch };
      void saveUserPrefs(next);
      return next;
    });
  }, []);

  const resetToMock = useCallback(async () => {
    const fresh = await resetGroupData();
    groupRef.current = fresh;
    setGroup(fresh);
  }, []);

  /**
   * Перечитывает данные с сервера.
   * Нужно, чтобы увидеть то, что добавили одногруппники: приложение читает данные
   * один раз при запуске, а общее расписание живёт своей жизнью.
   */
  const refresh = useCallback(async () => {
    if (!isServerAvailable()) return;
    try {
      const fresh = await apiGetGroup();
      groupRef.current = fresh;
      setGroup(fresh);
    } catch {
      // Сервер недоступен — оставляем те данные, что уже показаны.
    }
  }, []);

  // Обновляем данные, когда пользователь возвращается в приложение
  // (переключил вкладку, развернул окно, открыл приложение снова).
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) void refresh();
    };

    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refresh]);

  // useMemo: объект контекста пересоздаётся только при реальном изменении данных.
  const value = useMemo(
    () => ({
      loading,
      serverMode,
      group,
      subjects: group.subjects,
      lessons: group.lessons,
      tasks: group.tasks,
      prefs,
      user,
      editingTaskId,
      editingLessonId,
      startTaskEditing: setEditingTaskId,
      startLessonEditing: setEditingLessonId,
      addTask,
      updateTask,
      patchTask,
      deleteTask,
      addLesson,
      updateLesson,
      deleteLesson,
      setGroupName,
      patchPrefs,
      resetToMock,
      refresh,
    }),
    [
      loading,
      serverMode,
      group,
      prefs,
      user,
      editingTaskId,
      editingLessonId,
      addTask,
      updateTask,
      patchTask,
      deleteTask,
      addLesson,
      updateLesson,
      deleteLesson,
      setGroupName,
      patchPrefs,
      resetToMock,
      refresh,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};
