// Провайдер данных: загружает данные при старте и предоставляет операции изменения.
//
// Работает в двух режимах:
//   • сервер доступен  → изменения уходят на сервер, и все одногруппники видят одно и то же;
//   • сервер выключен  → изменения сохраняются в localStorage (режим разработки).
// Приложение при этом ведёт себя одинаково — этим и хорош слой хранения.

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import bridge, { UserInfo } from '@vkontakte/vk-bridge';

import { GroupData, Lesson, Material, Subject, Task, TaskStatus, UserPrefs } from '../types';
import { createMockGroupData } from '../data/mockData';
import { loadGroupData, loadLocalGroupData, resetGroupData, saveGroupData } from '../storage/groupDataStorage';
import { normalizeGroupData } from '../storage/normalize';
import { DEFAULT_PREFS, loadUserPrefs, saveUserPrefs } from '../storage/userPrefs';
import {
  apiCreateLesson,
  apiCreateMaterial,
  apiCreateSubject,
  apiCreateTask,
  apiDeleteLesson,
  apiDeleteMaterial,
  apiDeleteSubject,
  apiDeleteTask,
  apiGetGroup,
  apiPatchTask,
  apiSetGroupName,
  apiUpdateLesson,
  apiUpdateMaterial,
  apiUpdateSubject,
  apiUpdateTask,
  canReachServer,
  checkServer,
  isServerAvailable,
} from '../storage/api';
import { AppDataContext, LessonInput, MaterialInput, SubjectInput, TaskInput } from './context';

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
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);

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

    /**
     * Не ждём загрузку дольше 12 секунд.
     *
     * Зачем: если облако недоступно (нет сети, провайдер блокирует адрес), запрос может
     * висеть очень долго, и приложение застревало на экране загрузки — «вечный спиннер».
     * Теперь по истечении времени показываем сохранённые данные, а свежие подтянутся
     * позже (при возврате в приложение или по кнопке «Проверить снова»).
     */
    const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T | null> => {
      const guarded = promise.catch(() => null);

      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          guarded,
          new Promise<null>((resolve) => {
            timer = setTimeout(() => resolve(null), ms);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    // Данные группы: внутри loadGroupData сначала проверяется сервер, потом localStorage.
    void (async () => {
      try {
        const [loadedGroup, loadedPrefs] = await Promise.all([
          withTimeout(loadGroupData(), 12000),
          loadUserPrefs(),
        ]);
        if (cancelled) return;

        // null означает «облако не успело ответить» — берём копию с этого устройства.
        setGroup(loadedGroup ?? loadLocalGroupData());
        setPrefs(loadedPrefs);
        setServerMode(isServerAvailable() && loadedGroup !== null);
      } catch {
        if (!cancelled) setGroup(loadLocalGroupData());
      } finally {
        // Экран загрузки закрываем ВСЕГДА — даже если что-то пошло не так.
        if (!cancelled) setLoading(false);
      }
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
          const fromServer = normalizeGroupData(await serverCall());
          groupRef.current = fromServer;
          setGroup(fromServer);
          // Сервер ответил — значит общий режим действительно работает.
          setServerMode(true);
          return;
        } catch {
          // Запрос не прошёл. Пробуем взять актуальную версию данных с сервера.
          try {
            const fromServer = normalizeGroupData(await apiGetGroup());
            groupRef.current = fromServer;
            setGroup(fromServer);
            setServerMode(true);
            return;
          } catch {
            // Сервер недоступен: честно сообщаем интерфейсу, что данные теперь локальные,
            // иначе надпись «общий сервер» вводила бы пользователя в заблуждение.
            setServerMode(false);
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
        // Вложение (файл или ссылка) — если пользователь его добавил в форме.
        attachmentPath: input.attachmentPath,
        attachmentName: input.attachmentName,
        attachmentLink: input.attachmentLink,
      };

      await mutate(
        (current) => ({ ...current, tasks: [...current.tasks, task] }),
        // Передаём id и время создания: тогда запись сразу получает тот же идентификатор,
        // что и в интерфейсе (важно для мгновенного изменения статуса новой записи).
        () => apiCreateTask({ ...input, id: task.id, createdAt: task.createdAt, authorId: user?.id, authorName }),
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
                  attachmentPath: input.attachmentPath,
                  attachmentName: input.attachmentName,
                  attachmentLink: input.attachmentLink,
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
        () => apiCreateLesson({ ...input, id: lesson.id }),
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

  // ---------------------------------------------------------------- ПРЕДМЕТЫ

  const addSubject = useCallback(
    async (input: SubjectInput) => {
      // Код предмета формируем здесь: он связывает предмет с парами, заданиями и материалами.
      const id = makeId('subject');
      const subject: Subject = {
        id,
        title: input.title.trim(),
        short: input.short.trim() || input.title.trim().slice(0, 6),
        teacher: input.teacher.trim(),
      };

      await mutate(
        (current) => ({ ...current, subjects: [...current.subjects, subject] }),
        () => apiCreateSubject(id, input),
      );
    },
    [mutate],
  );

  const updateSubject = useCallback(
    async (id: string, input: SubjectInput) => {
      await mutate(
        (current) => ({
          ...current,
          subjects: current.subjects.map((subject) =>
            subject.id === id
              ? {
                  ...subject,
                  title: input.title.trim(),
                  short: input.short.trim() || input.title.trim().slice(0, 6),
                  teacher: input.teacher.trim(),
                }
              : subject,
          ),
        }),
        () => apiUpdateSubject(id, input),
      );
    },
    [mutate],
  );

  const deleteSubject = useCallback(
    async (id: string) => {
      await mutate(
        (current) => ({ ...current, subjects: current.subjects.filter((subject) => subject.id !== id) }),
        () => apiDeleteSubject(id),
      );
    },
    [mutate],
  );

  // ---------------------------------------------------------------- МАТЕРИАЛЫ

  const addMaterial = useCallback(
    async (input: MaterialInput) => {
      const id = makeId('material');
      const material: Material = {
        id,
        subjectId: input.subjectId,
        title: input.title.trim(),
        description: input.description.trim(),
        link: input.link?.trim() || undefined,
        uploadedBy: authorName,
        uploadedAt: new Date().toISOString(),
      };

      // Файл (если выбран) загружает драйвер хранилища, а в состояние он попадёт
      // после ответа сервера — там уже будет настоящий путь и размер файла.
      await mutate(
        (current) => ({ ...current, materials: [material, ...current.materials] }),
        () => apiCreateMaterial(id, input, authorName),
      );
    },
    [mutate, authorName],
  );

  const updateMaterial = useCallback(
    async (id: string, input: MaterialInput) => {
      await mutate(
        (current) => ({
          ...current,
          materials: current.materials.map((material) =>
            material.id === id
              ? {
                  ...material,
                  subjectId: input.subjectId,
                  title: input.title.trim(),
                  description: input.description.trim(),
                  link: input.link?.trim() || undefined,
                }
              : material,
          ),
        }),
        () => apiUpdateMaterial(id, input),
      );
    },
    [mutate],
  );

  const deleteMaterial = useCallback(
    async (id: string) => {
      // Путь к файлу нужен, чтобы удалить и сам файл из хранилища.
      const material = groupRef.current.materials.find((item) => item.id === id);

      await mutate(
        (current) => ({ ...current, materials: current.materials.filter((item) => item.id !== id) }),
        () => apiDeleteMaterial(id, material?.filePath),
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
    // Если из этой страницы обратиться к серверу в принципе нельзя — остаёмся локально.
    if (!canReachServer()) {
      setServerMode(false);
      return;
    }

    // Сначала «будим» сервер проверкой /health: на бесплатных тарифах хостинга он может
    // просыпаться 30–50 секунд, и запрос данных сразу после этого провалился бы.
    const serverIsUp = await checkServer();
    if (!serverIsUp) {
      setServerMode(false);
      return;
    }

    try {
      const fresh = normalizeGroupData(await apiGetGroup());
      groupRef.current = fresh;
      setGroup(fresh);
      setServerMode(true);
    } catch {
      // Сервер недоступен: данные остаются прежними, а режим переключается на локальный.
      setServerMode(false);
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

  // Если хранилище не ответило при запуске (например, бесплатное облако «просыпается»
  // или проект был на паузе), пробуем подключиться снова — с увеличивающейся паузой
  // (10 с, 20 с, 40 с… максимум 2 минуты), всего 8 попыток. Так мы не тратим батарею
  // и мобильный трафик бесконечными запросами; вручную всегда можно нажать «Обновить данные».
  useEffect(() => {
    if (loading || serverMode || !canReachServer()) return undefined;

    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      attempt += 1;
      void refresh().finally(() => {
        if (attempt >= 8) return;
        const delay = Math.min(10000 * 2 ** (attempt - 1), 120000);
        timer = setTimeout(tick, delay);
      });
    };

    timer = setTimeout(tick, 10000);

    return () => clearTimeout(timer);
  }, [loading, serverMode, refresh]);

  // useMemo: объект контекста пересоздаётся только при реальном изменении данных.
  const value = useMemo(
    () => ({
      loading,
      serverMode,
      group,
      subjects: group.subjects,
      lessons: group.lessons,
      tasks: group.tasks,
      materials: group.materials,
      prefs,
      user,
      editingTaskId,
      editingLessonId,
      editingMaterialId,
      editingSubjectId,
      startTaskEditing: setEditingTaskId,
      startLessonEditing: setEditingLessonId,
      startMaterialEditing: setEditingMaterialId,
      startSubjectEditing: setEditingSubjectId,
      addTask,
      updateTask,
      patchTask,
      deleteTask,
      addLesson,
      updateLesson,
      deleteLesson,
      addSubject,
      updateSubject,
      deleteSubject,
      addMaterial,
      updateMaterial,
      deleteMaterial,
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
      editingMaterialId,
      editingSubjectId,
      addTask,
      updateTask,
      patchTask,
      deleteTask,
      addLesson,
      updateLesson,
      deleteLesson,
      addSubject,
      updateSubject,
      deleteSubject,
      addMaterial,
      updateMaterial,
      deleteMaterial,
      setGroupName,
      patchPrefs,
      resetToMock,
      refresh,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};
