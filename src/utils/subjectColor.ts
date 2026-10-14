// Цветовая метка предмета. Нужна, чтобы расписание читалось «по цвету»,
// а не только по тексту: так быстрее находишь нужную пару глазами.

/** Палитра из 8 цветов — берём из темы VKUI, чтобы цвета подходили и к тёмной теме. */
const PALETTE = [
  'var(--vkui--color_accent_blue)',
  'var(--vkui--color_accent_green)',
  'var(--vkui--color_accent_orange)',
  'var(--vkui--color_accent_purple)',
  'var(--vkui--color_accent_red)',
  'var(--vkui--color_accent_violet)',
  'var(--vkui--color_accent_cyan)',
  'var(--vkui--color_accent_lime)',
];

/**
 * Возвращает стабильный цвет для предмета: одинаковый id всегда даёт одинаковый цвет.
 * Считаем простую сумму кодов символов — этого достаточно для равномерного разброса.
 */
export const subjectColor = (subjectId: string): string => {
  let hash = 0;
  for (let index = 0; index < subjectId.length; index += 1) {
    hash += subjectId.charCodeAt(index);
  }
  return PALETTE[hash % PALETTE.length];
};
