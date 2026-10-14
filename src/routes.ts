// Маршруты приложения: какие экраны существуют и по каким адресам они открываются.
//
// Термины простыми словами:
// - Root («корень») — верхний уровень. У нас он один.
// - View («история») — вкладка нижнего меню со своей навигацией.
// - Panel («панель») — отдельный экран внутри вкладки.

import {
  createHashRouter,
  createPanel,
  createRoot,
  createView,
  RoutesConfig,
} from '@vkontakte/vk-mini-apps-router';

export const DEFAULT_ROOT = 'default_root';

/** Идентификаторы вкладок (View). */
export const VIEWS = {
  SCHEDULE: 'schedule_view',
  TASKS: 'tasks_view',
  MATERIALS: 'materials_view',
  SETTINGS: 'settings_view',
  /** Вкладка-«служебная»: в ней живут формы. Нижнее меню на ней скрыто. */
  FORM: 'form_view',
} as const;

/** Идентификаторы экранов (Panel). */
export const PANELS = {
  SCHEDULE: 'schedule',
  TASKS: 'tasks',
  MATERIALS: 'materials',
  SETTINGS: 'settings',
  SUBJECTS: 'subjects',
  TASK_FORM: 'task_form',
  LESSON_FORM: 'lesson_form',
  MATERIAL_FORM: 'material_form',
  SUBJECT_FORM: 'subject_form',
} as const;

/** Адреса внутри приложения. Роутер хранит их в hash, поэтому ссылка выглядит как #/tasks. */
export const PATHS = {
  SCHEDULE: '/',
  TASKS: '/tasks',
  MATERIALS: '/materials',
  SETTINGS: '/settings',
  /** Список предметов живёт внутри вкладки «Настройки». */
  SUBJECTS: '/subjects',
  TASK_FORM: '/task',
  LESSON_FORM: '/lesson',
  MATERIAL_FORM: '/material',
  SUBJECT_FORM: '/subject',
} as const;

export const routes = RoutesConfig.create([
  createRoot(DEFAULT_ROOT, [
    createView(VIEWS.SCHEDULE, [createPanel(PANELS.SCHEDULE, PATHS.SCHEDULE, [])]),
    createView(VIEWS.TASKS, [createPanel(PANELS.TASKS, PATHS.TASKS, [])]),
    createView(VIEWS.MATERIALS, [createPanel(PANELS.MATERIALS, PATHS.MATERIALS, [])]),
    // Вкладка «Настройки» содержит два экрана: сами настройки и список предметов.
    createView(VIEWS.SETTINGS, [
      createPanel(PANELS.SETTINGS, PATHS.SETTINGS, []),
      createPanel(PANELS.SUBJECTS, PATHS.SUBJECTS, []),
    ]),
    // Вкладка форм: какая именно форма открыта, определяет адрес.
    createView(VIEWS.FORM, [
      createPanel(PANELS.TASK_FORM, PATHS.TASK_FORM, []),
      createPanel(PANELS.LESSON_FORM, PATHS.LESSON_FORM, []),
      createPanel(PANELS.MATERIAL_FORM, PATHS.MATERIAL_FORM, []),
      createPanel(PANELS.SUBJECT_FORM, PATHS.SUBJECT_FORM, []),
    ]),
  ]),
]);

export const router = createHashRouter(routes.getRoutes());
