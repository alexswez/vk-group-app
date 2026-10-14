// Экран-форма задания: используется и для создания, и для редактирования.
// Какое именно действие — определяет editingTaskId из общего состояния приложения.

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
  Textarea,
} from '@vkontakte/vkui';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';

import { PATHS } from '../routes';
import { useAppData } from '../store/useAppData';
import { TaskKind, TaskStatus } from '../types';
import { TASK_KIND_LABEL, isoDaysFromNow } from '../utils/format';

/** Варианты вида задания и статуса — рисуем «кнопками-чипсами». */
const KIND_OPTIONS: TaskKind[] = ['homework', 'lab', 'coursework', 'test', 'essay'];
const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'Не начато' },
  { value: 'inProgress', label: 'В работе' },
  { value: 'done', label: 'Сдано' },
];

/** Проверка формата даты "ГГГГ-ММ-ДД". */
const isIsoDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

export const TaskForm = ({ nav }: NavIdProps) => {
  const { subjects, tasks, editingTaskId, addTask, updateTask, startTaskEditing } = useAppData();
  const routeNavigator = useRouteNavigator();

  const editingTask = editingTaskId ? tasks.find((task) => task.id === editingTaskId) : undefined;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [kind, setKind] = useState<TaskKind>('homework');
  const [dueDate, setDueDate] = useState(isoDaysFromNow(7));
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [error, setError] = useState<string | null>(null);

  // Когда открываем форму для конкретного задания — заполняем поля его данными.
  useEffect(() => {
    if (editingTask) {
      setTitle(editingTask.title);
      setDescription(editingTask.description);
      setSubjectId(editingTask.subjectId);
      setKind(editingTask.kind);
      setDueDate(editingTask.dueDate);
      setStatus(editingTask.status);
    } else {
      setTitle('');
      setDescription('');
      setSubjectId(subjects[0]?.id ?? '');
      setKind('homework');
      setDueDate(isoDaysFromNow(7));
      setStatus('todo');
    }
    setError(null);
  }, [editingTask, subjects]);

  const handleSave = async () => {
    // Простая валидация: объясняем пользователю, что именно не так.
    if (title.trim().length < 3) {
      setError('Название задания должно быть не короче 3 символов.');
      return;
    }
    if (!subjectId) {
      setError('Выберите предмет.');
      return;
    }
    if (!isIsoDate(dueDate)) {
      setError('Дата сдачи должна быть в формате ГГГГ-ММ-ДД (например, 2026-03-14).');
      return;
    }

    const payload = { subjectId, title, description, kind, dueDate, status };

    if (editingTask) {
      await updateTask(editingTask.id, payload);
    } else {
      await addTask(payload);
    }

    // Возвращаемся на предыдущий экран и сбрасываем «режим редактирования».
    startTaskEditing(null);
    routeNavigator.push(PATHS.TASKS);
  };

  return (
    <Panel nav={nav}>
      <PanelHeader>{editingTask ? 'Изменить задание' : 'Новое задание'}</PanelHeader>

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

      <Group header={<Header size="s">Вид задания</Header>}>
        <Div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {KIND_OPTIONS.map((option) => (
            <Button
              key={option}
              size="s"
              mode={kind === option ? 'primary' : 'secondary'}
              onClick={() => setKind(option)}
            >
              {TASK_KIND_LABEL[option]}
            </Button>
          ))}
        </Div>
      </Group>

      <Group header={<Header size="s">Описание</Header>}>
        <FormItem top="Название задания">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например: Лабораторная №5" />
        </FormItem>

        <FormItem top="Подробности">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Что нужно сделать, что приложить к отчёту"
            rows={4}
          />
        </FormItem>

        <FormItem top="Дата сдачи" bottom="Формат: ГГГГ-ММ-ДД">
          <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </FormItem>

        <FormItem top="Статус">
          <Div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 0 }}>
            {STATUS_OPTIONS.map((option) => (
              <Button
                key={option.value}
                size="s"
                mode={status === option.value ? 'primary' : 'secondary'}
                onClick={() => setStatus(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </Div>
        </FormItem>

        {/* Сообщение об ошибке валидации. */}
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
              startTaskEditing(null);
              routeNavigator.push(PATHS.TASKS);
            }}
          >
            Отмена
          </Button>
        </Div>
      </Group>
    </Panel>
  );
};
