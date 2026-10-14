// Тесты цветовых меток предметов.
//
// Цвет должен быть ОДИНАКОВЫМ для одного и того же предмета при каждой отрисовке —
// иначе расписание будет «мигать» разными цветами при каждом обновлении экрана.

import test from 'node:test';
import assert from 'node:assert/strict';

import { subjectColor } from '../src/utils/subjectColor.ts';

test('subjectColor: для одного предмета цвет всегда один и тот же', () => {
  assert.equal(subjectColor('db'), subjectColor('db'));
  assert.equal(subjectColor('web'), subjectColor('web'));
  assert.equal(subjectColor('math'), subjectColor('math'));
});

test('subjectColor: возвращается цвет из темы VKUI', () => {
  for (const id of ['db', 'web', 'oop', 'net', 'is', 'math', 'pe']) {
    assert.match(subjectColor(id), /^var\(--vkui--color_accent_[a-z]+\)$/);
  }
});

test('subjectColor: разные предметы получают разные цвета', () => {
  const ids = ['db', 'web', 'oop', 'net', 'is', 'math', 'pe'];
  const colors = new Set(ids.map(subjectColor));
  // В палитре 8 цветов, поэтому для 7 предметов ожидаем минимум 4 разных цвета.
  assert.ok(colors.size >= 4, `разных цветов всего ${colors.size}`);
});

test('subjectColor: пустая строка не ломает функцию', () => {
  assert.match(subjectColor(''), /^var\(--vkui--color_accent_[a-z]+\)$/);
});
