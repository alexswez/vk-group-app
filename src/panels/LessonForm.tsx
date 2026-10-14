// Экран-форма пары: добавление и изменение занятия в расписании.
//
// Форма учитывает очно-заочную форму обучения: у пары есть период.
//   • «Сессия»      — занятие идёт очно, повторяется по дням недели;
//   • «Дистанционно»— занятие привязано к конкретной дате (вебинар), дату выбирает пользователь,
//                     а день недели приложение вычисляет само.

import { useEffect, useState } from 'react';
import {
  Button,
  Div,
  FormItem,
  Group,
  Header,
  Input,
  NavIdProps,
  Panel,
  PanelHeader,
} from '@vkontakte/vkui';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';

import { PATHS } from '../routes';
import { useAppData } from '../store/useAppData';
import { LessonKind, LessonMode, WeekParity, Weekday } from '../types';
import { LESSON_KIND_LABEL, WEEKDAYS, isoDaysFromNow, weekdayFromIso } from '../utils/format';

const KIND_OPTIONS: LessonKind[] = ['lecture', 'practice', 'lab'];

const PARITY_OPTIONS: { value: WeekParity; label: string }[] = [
  { value: 'all', label: 'Каждую неделю' },
  { value: 'odd', label: 'Нечётная' },
  { value: 'even', label: 'Чётная' },
];

const MODE_OPTIONS: { value: LessonMode; label: string; hint: string }[] = [
  { value: 'session', label: 'Сессия', hint: 'очно, по дням недели' },
  { value: 'online', label: 'Дистанционно', hint: 'по конкретной дате' },
];

/** Проверка времени в формате "ЧЧ:ММ". */
const isTime = (value: string): boolean => /^\d{2}:\d{2}$/.test(value);

/** Проверка даты в формате "ГГГГ-ММ-ДД". */
const isIsoDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

export const LessonForm = ({ nav }: NavIdProps) => {
  const { subjects, lessons, editingLessonId, addLesson, updateLesson, startLessonEditing } = useAppData();
  const routeNavigator = useRouteNavigator();

  const editingLesson = editingLessonId ? lessons.find((lesson) => lesson.id === editingLessonId) : undefined;

  const [subjectId, setSubjectId] = useState('');
  const [mode, setMode] = useState<LessonMode>('session');
  const [weekday, setWeekday] = useState<Weekday>('monday');
  const [date, setDate] = useState(isoDaysFromNow(1));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:30');
  const [room, setRoom] = useState('');
  const [kind, setKind] = useState<LessonKind>('lecture');
  const [parity, setParity] = useState<WeekParity>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingLesson) {
      setSubjectId(editingLesson.subjectId);
      setMode(editingLesson.mode);
      setWeekday(editingLesson.weekday);
      setDate(editingLesson.date ?? isoDaysFromNow(1));
      setStartTime(editingLesson.startTime);
      setEndTime(editingLesson.endTime);
      setRoom(editingLesson.room);
      setKind(editingLesson.kind);
      setParity(editingLesson.parity);
    } else {
      setSubjectId(subjects[0]?.id ?? '');
      setMode('session');
      setWeekday('monday');
      setDate(isoDaysFromNow(1));
      setStartTime('09:00');
      setEndTime('10:30');
      setRoom('');
      setKind('lecture');
      setParity('all');
    }
    setError(null);
  }, [editingLesson, subjects]);

  const handleSave = async () => {
    if (!subjectId) {
      setError('Выберите предмет.');
      return;
    }
    if (!isTime(startTime) || !isTime(endTime)) {
      setError('Время должно быть в формате ЧЧ:ММ (например, 09:00).');
      return;
    }
    // Сравниваем время как строки: для формата "ЧЧ:ММ" это работает корректно.
    if (endTime <= startTime) {
      setError('Время окончания должно быть позже времени начала.');
      return;
    }
    if (mode === 'online' && !isIsoDate(date)) {
      setError('Для дистанционного занятия укажите дату в формате ГГГГ-ММ-ДД.');
      return;
    }

    const payload = {
      subjectId,
      // Для дистанционного занятия день недели вычисляем из даты.
      weekday: mode === 'online' ? weekdayFromIso(date) : weekday,
      startTime,
      endTime,
      room: room.trim(),
      kind,
      parity,
      mode,
      date: mode === 'online' ? date : undefined,
    };

    if (editingLesson) {
      await updateLesson(editingLesson.id, payload);
    } else {
      await addLesson(payload);
    }

    startLessonEditing(null);
    routeNavigator.push(PATHS.SCHEDULE);
  };

  return (
    <Panel nav={nav}>
      <PanelHeader>{editingLesson ? 'Изменить пару' : 'Новая пара'}</PanelHeader>

      <Group header={<Header size="s">Предмет</Header>}>
        <Div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {subjects.map((subject) => (
            <Button
              key={subject.id}
              size="s"
              mode={subjectId === subject.id ? 'primary' : 'secondary'}
              onClick={() => setSubjectId(subject.id)}
            >
              {subject.short}
            </Button>
          ))}
        </Div>
      </Group>

      {/* Период обучения — главное отличие очно-заочной формы. */}
      <Group header={<Header size="s">Период обучения</Header>}>
        <Div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 0 }}>
          {MODE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              size="s"
              mode={mode === option.value ? 'primary' : 'secondary'}
              onClick={() => setMode(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </Div>
        <Div style={{ fontSize: 13, color: 'var(--vkui--color_text_secondary)' }}>
          {MODE_OPTIONS.find((option) => option.value === mode)?.hint}
        </Div>
      </Group>

      {/* Сессия: день недели. Дистанционно: конкретная дата. */}
      {mode === 'session' ? (
        <Group header={<Header size="s">День недели</Header>}>
          <Div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {WEEKDAYS.map((item) => (
              <Button
                key={item.id}
                size="s"
                mode={weekday === item.id ? 'primary' : 'secondary'}
                onClick={() => setWeekday(item.id)}
              >
                {item.short}
              </Button>
            ))}
          </Div>
        </Group>
      ) : (
        <Group header={<Header size="s">Дата занятия</Header>}>
          <FormItem top="Когда" bottom="День недели определится автоматически">
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </FormItem>
        </Group>
      )}

      <Group header={<Header size="s">Время и аудитория</Header>}>
        <FormItem top="Начало">
          <Input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
        </FormItem>
        <FormItem top="Окончание">
          <Input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
        </FormItem>
        <FormItem top={mode === 'online' ? 'Ссылка или аудитория' : 'Аудитория'}>
          <Input
            value={room}
            onChange={(event) => setRoom(event.target.value)}
            placeholder={mode === 'online' ? 'Например: Онлайн или ссылка на вебинар' : 'Например: 312 или Спортзал'}
          />
        </FormItem>
      </Group>

      <Group header={<Header size="s">Вид занятия</Header>}>
        <Div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {KIND_OPTIONS.map((option) => (
            <Button
              key={option}
              size="s"
              mode={kind === option ? 'primary' : 'secondary'}
              onClick={() => setKind(option)}
            >
              {LESSON_KIND_LABEL[option]}
            </Button>
          ))}
        </Div>
      </Group>

      {/* Чётность недели имеет смысл только для занятий сессии. */}
      {mode === 'session' && (
        <Group header={<Header size="s">Периодичность</Header>}>
          <Div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PARITY_OPTIONS.map((option) => (
              <Button
                key={option.value}
                size="s"
                mode={parity === option.value ? 'primary' : 'secondary'}
                onClick={() => setParity(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </Div>
        </Group>
      )}

      <Group>
        {error && (
          <FormItem status="error" bottom={error}>
            <span />
          </FormItem>
        )}

        <Div style={{ display: 'flex', gap: 8 }}>
          <Button stretched size="l" mode="primary" onClick={() => void handleSave()}>
            Сохранить
          </Button>
          <Button
            stretched
            size="l"
            mode="secondary"
            onClick={() => {
              startLessonEditing(null);
              routeNavigator.push(PATHS.SCHEDULE);
            }}
          >
            Отмена
          </Button>
        </Div>
      </Group>
    </Panel>
  );
};
