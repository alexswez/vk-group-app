// Приведение данных к ожидаемой форме.
//
// Зачем это нужно: данные приходят из разных источников — облака Supabase, нашего
// Express-сервера, локального хранилища браузера. Любой из них может ответить по старой
// схеме (например, до обновления базы) или не прислать какое-то поле.
// Вместо падения приложение аккуратно дополняет недостающее значениями по умолчанию.

// import type — «импорт только типов»: при сборке строка исчезает, а файл можно
// запускать и в Node.js напрямую (это используется в тестах).
import type { GroupData, Lesson } from '../types';

/**
 * Гарантирует, что у данных группы есть все обязательные части:
 * массивы предметов, пар, заданий и материалов, а у каждой пары — период обучения.
 */
export const normalizeGroupData = (data: Partial<GroupData> | null | undefined): GroupData => {
  const lessons: Lesson[] = (data?.lessons ?? []).map((lesson) => ({
    ...lesson,
    // Записи, созданные до появления очно-заочного режима, считаем занятиями сессии.
    mode: lesson.mode ?? 'session',
    date: lesson.date ?? undefined,
  }));

  return {
    version: data?.version ?? 2,
    groupName: data?.groupName ?? 'ИС-31',
    subjects: data?.subjects ?? [],
    lessons,
    tasks: data?.tasks ?? [],
    materials: data?.materials ?? [],
    updatedAt: data?.updatedAt ?? new Date().toISOString(),
  };
};
