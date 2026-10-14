// Экран «Задания»: фильтры, сортировка по сроку и карточки заданий.

import { useMemo, useState } from 'react';
import {
  Button,
  Div,
  Group,
  Header,
  NavIdProps,
  Panel,
  PanelHeader,
  Placeholder,
  Tabs,
  TabsItem,
} from '@vkontakte/vkui';
import { Icon56CheckCircleOutline } from '@vkontakte/icons';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';

import { TaskCard } from '../components/TaskCard';
import { PATHS } from '../routes';
import { useAppData } from '../store/useAppData';
import { TaskStatus } from '../types';
import { daysLeft } from '../utils/format';

/** Быстрые фильтры по смыслу: что мне важно сделать сейчас. */
type Filter = 'active' | 'overdue' | 'done' | 'all';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'active', label: 'Активные' },
  { id: 'overdue', label: 'Просроченные' },
  { id: 'done', label: 'Сданные' },
  { id: 'all', label: 'Все' },
];

export const Tasks = ({ nav }: NavIdProps) => {
  const { tasks, subjects, startTaskEditing, deleteTask, patchTask } = useAppData();
  const routeNavigator = useRouteNavigator();

  const [filter, setFilter] = useState<Filter>('active');
  const [subjectId, setSubjectId] = useState<string | 'all'>('all');

  const visibleTasks = useMemo(() => {
    return tasks
      .filter((task) => (subjectId === 'all' ? true : task.subjectId === subjectId))
      .filter((task) => {
        if (filter === 'all') return true;
        if (filter === 'done') return task.status === 'done';
        // «Просроченные» — только несданные задания с прошедшей датой.
        if (filter === 'overdue') return task.status !== 'done' && daysLeft(task.dueDate) < 0;
        return task.status !== 'done';
      })
      // Сортируем по сроку сдачи: ближайшие — сверху, сданные уезжают в конец.
      .sort((a, b) => {
        if (a.status === 'done' && b.status !== 'done') return 1;
        if (a.status !== 'done' && b.status === 'done') return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
  }, [tasks, filter, subjectId]);

  const openForm = (taskId: string | null) => {
    startTaskEditing(taskId);
    routeNavigator.push(PATHS.TASK_FORM);
  };

  const activeCount = tasks.filter((task) => task.status !== 'done').length;

  return (
    <Panel nav={nav}>
      <PanelHeader>Задания</PanelHeader>

      <Group>
        <Div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600 }}>
            К сдаче: {activeCount} из {tasks.length}
          </span>
          <Button size="s" mode="primary" onClick={() => openForm(null)}>
            + Задание
          </Button>
        </Div>
      </Group>

      <Tabs>
        {FILTERS.map((item) => (
          <TabsItem key={item.id} selected={filter === item.id} onClick={() => setFilter(item.id)}>
            {item.label}
          </TabsItem>
        ))}
      </Tabs>

      {/* Фильтр по предмету: «кнопки-чипсы». Такой вариант удобен на телефоне. */}
      <Group header={<Header size="s">Предмет</Header>}>
        <Div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="s" mode={subjectId === 'all' ? 'primary' : 'secondary'} onClick={() => setSubjectId('all')}>
            Все
          </Button>
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

      <Group header={<Header size="s">Список заданий</Header>}>
        {visibleTasks.length === 0 ? (
          <Placeholder icon={<Icon56CheckCircleOutline />} title="Здесь пусто">
            По выбранным фильтрам заданий нет. Добавьте задание кнопкой «+ Задание».
          </Placeholder>
        ) : (
          <Div>
            {visibleTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                subject={subjects.find((item) => item.id === task.subjectId)}
                onEdit={() => openForm(task.id)}
                onDelete={() => void deleteTask(task.id)}
                onChangeStatus={(status: TaskStatus) => void patchTask(task.id, { status })}
              />
            ))}
          </Div>
        )}
      </Group>
    </Panel>
  );
};
