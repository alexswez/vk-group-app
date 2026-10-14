// Тесты приведения данных к ожидаемой форме.
//
// Смысл проверок: приложение получает данные из трёх источников (облако, свой сервер,
// локальное хранилище), и любой из них может ответить по старой схеме. Эти тесты
// фиксируют, что приложение в таком случае не падает, а дополняет недостающее.

import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeGroupData } from '../src/storage/normalize.ts';

test('normalizeGroupData: из пустого ответа получается рабочая структура', () => {
  const data = normalizeGroupData(null);

  assert.deepEqual(data.subjects, []);
  assert.deepEqual(data.lessons, []);
  assert.deepEqual(data.tasks, []);
  assert.deepEqual(data.materials, []);
  assert.equal(data.version, 2);
  assert.equal(data.groupName, 'ИС-31');
  assert.match(data.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('normalizeGroupData: пары без периода считаются занятиями сессии', () => {
  // Так выглядят данные, созданные до появления очно-заочного режима.
  const data = normalizeGroupData({
    lessons: [{ id: 'l1', subjectId: 'db', weekday: 'monday', startTime: '09:00', endTime: '10:30', room: '312', kind: 'lecture', parity: 'all' }],
  });

  assert.equal(data.lessons.length, 1);
  assert.equal(data.lessons[0].mode, 'session');
  assert.equal(data.lessons[0].date, undefined);
});

test('normalizeGroupData: дистанционное занятие сохраняет период и дату', () => {
  const data = normalizeGroupData({
    lessons: [{ id: 'o1', subjectId: 'web', weekday: 'wednesday', startTime: '18:00', endTime: '19:30', room: 'Онлайн', kind: 'lecture', parity: 'all', mode: 'online', date: '2026-03-14' }],
  });

  assert.equal(data.lessons[0].mode, 'online');
  assert.equal(data.lessons[0].date, '2026-03-14');
});

test('normalizeGroupData: отсутствующие массивы заменяются пустыми', () => {
  // Например, сервер старой версии ещё не знает про материалы.
  const data = normalizeGroupData({ groupName: 'ИС-42', subjects: [{ id: 'db', title: 'Базы данных', short: 'БД', teacher: 'Иванова М. П.' }] });

  assert.equal(data.groupName, 'ИС-42');
  assert.equal(data.subjects.length, 1);
  assert.deepEqual(data.materials, []);
  assert.deepEqual(data.tasks, []);
});

test('normalizeGroupData: заполненные данные не портятся', () => {
  const data = normalizeGroupData({
    version: 3,
    groupName: 'ИС-31',
    updatedAt: '2026-01-01T00:00:00.000Z',
    materials: [{ id: 'm1', subjectId: 'db', title: 'Методичка', description: '', uploadedAt: '2026-01-01T00:00:00.000Z' }],
  });

  assert.equal(data.version, 3);
  assert.equal(data.updatedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(data.materials.length, 1);
  assert.equal(data.materials[0].title, 'Методичка');
});
