// Экран-форма пары: добавление и изменение занятия в расписании.

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
import { LessonKind, WeekParity, Weekday } from '../types';
import { LESSON_KIND_LABEL, WEEKDAYS } from '../utils/format';

const KIND_OPTIONS: LessonKind[] = ['lecture', 'practice', 'lab'];

const PARITY_OPTIONS: { value: WeekParity; label: string }[] = [
  { value: 'all', label: 'Каждую неделю' },
  { value: 'odd', label: 'Нечётная' },
  { value: 'even', label: 'Чётная' },
];

/** Проверка времени в формате "ЧЧ:ММ". */
const isTime = (value: string): boolean => /^\d{2}:\d{2}$/.test(value);

export const LessonForm = ({ nav }: NavIdProps) => {
  const { subjects, lessons, editingLessonId, addLesson, updateLesson, startLessonEditing } = useAppData();
  const routeNavigator = useRouteNavigator();

  const editingLesson = editingLessonId ? lessons.find((lesson) => lesson.id === editingLessonId) : undefined;

  const [subjectId, setSubjectId] = useState('');
  const [weekday, setWeekday] = useState<Weekday>('monday');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:30');
  const [room, setRoom] = useState('');
  const [kind, setKind] = useState<LessonKind>('lecture');
  const [parity, setParity] = useState<WeekParity>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingLesson) {
      setSubjectId(editingLesson.subjectId);
      setWeekday(editingLesson.weekday);
      setStartTime(editingLesson.startTime);
      setEndTime(editingLesson.endTime);
      setRoom(editingLesson.room);
      setKind(editingLesson.kind);
      setParity(editingLesson.parity);
    } else {
      setSubjectId(subjects[0]?.id ?? '');
      setWeekday('monday');
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

    const payload = { subjectId, weekday, startTime, endTime, room: room.trim(), kind, parity };

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

      <Group header={<Header size="s">Время и аудитория</Header>}>
        <FormItem top="Начало">
          <Input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
        </FormItem>
        <FormItem top="Окончание">
          <Input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
        </FormItem>
        <FormItem top="Аудитория">
          <Input value={room} onChange={(event) => setRoom(event.target.value)} placeholder="Например: 312 или Спортзал" />
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
