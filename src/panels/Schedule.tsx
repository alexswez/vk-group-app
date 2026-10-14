// Экран «Расписание»: выбор дня недели и список пар.

import { useMemo, useState } from 'react';
import {
  Button,
  Card,
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
import { Icon56CalendarOutline } from '@vkontakte/icons';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';

import { AddLessonButton, LessonCard } from '../components/LessonCard';
import { PATHS } from '../routes';
import { useAppData } from '../store/useAppData';
import { Weekday } from '../types';
import { WEEKDAYS, todayWeekdayIndex } from '../utils/format';
import { shareLink } from '../utils/share';

/** Переводит "09:40" в минуты от начала суток — так время удобно сравнивать между собой. */
const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

export const Schedule = ({ nav }: NavIdProps) => {
  const { lessons, subjects, group, prefs, deleteLesson, startLessonEditing } = useAppData();
  const routeNavigator = useRouteNavigator();

  const todayIndex = todayWeekdayIndex();
  // По умолчанию открываем сегодняшний день, а если сегодня воскресенье — понедельник.
  const [day, setDay] = useState<Weekday>(WEEKDAYS[todayIndex === -1 ? 0 : todayIndex].id);
  const [editable, setEditable] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** Подсказка после нажатия «Поделиться» (показывается под кнопкой). */
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const selectedIsToday = WEEKDAYS.findIndex((item) => item.id === day) === todayIndex;

  const dayLessons = useMemo(
    () =>
      lessons
        .filter((lesson) => lesson.weekday === day)
        // Прошедшие пары можно скрывать — настройка личная, хранится в VK Storage.
        .filter((lesson) =>
          prefs.showPastLessons || !selectedIsToday ? true : timeToMinutes(lesson.endTime) >= nowMinutes,
        )
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)),
    [lessons, day, prefs.showPastLessons, selectedIsToday, nowMinutes],
  );

  const deletingLesson = deletingId ? lessons.find((lesson) => lesson.id === deletingId) : undefined;
  const deletingSubject = deletingLesson
    ? subjects.find((subject) => subject.id === deletingLesson.subjectId)
    : undefined;

  const goToForm = (lessonId: string | null) => {
    startLessonEditing(lessonId);
    routeNavigator.push(PATHS.LESSON_FORM);
  };

  /** Делимся ссылкой на расписание — её можно отправить в беседу группы. */
  const handleShare = async () => {
    const dayLabel = WEEKDAYS.find((item) => item.id === day)?.label ?? '';
    setShareMessage(await shareLink(PATHS.SCHEDULE, `Расписание группы ${group.groupName} (${dayLabel}):`));
  };

  return (
    <Panel nav={nav}>
      <PanelHeader>Расписание</PanelHeader>

      <Group>
        <Div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600 }}>Группа {group.groupName}</span>
          <Button size="s" mode={editable ? 'primary' : 'secondary'} onClick={() => setEditable((value) => !value)}>
            {editable ? 'Готово' : 'Изменить'}
          </Button>
        </Div>
      </Group>

      {/* Переключатель дней недели. */}
      <Tabs>
        {WEEKDAYS.map((item) => (
          <TabsItem key={item.id} selected={day === item.id} onClick={() => setDay(item.id)}>
            {item.short}
          </TabsItem>
        ))}
      </Tabs>

      {/* Кнопка «Поделиться»: отправляет ссылку на приложение в беседу группы. */}
      <Group>
        <Div>
          <Button stretched size="m" mode="secondary" onClick={() => void handleShare()}>
            Поделиться расписанием
          </Button>
          {shareMessage && (
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--vkui--color_text_secondary)' }}>
              {shareMessage}
            </div>
          )}
        </Div>
      </Group>

      {/* Подтверждение удаления пары (чтобы не удалить случайным нажатием). */}
      {deletingLesson && (
        <Group>
          <Card mode="outline">
            <Div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span>
                Удалить пару «{deletingSubject?.short ?? 'предмет'}» в {deletingLesson.startTime}?
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  size="s"
                  appearance="negative"
                  onClick={async () => {
                    await deleteLesson(deletingLesson.id);
                    setDeletingId(null);
                  }}
                >
                  Да, удалить
                </Button>
                <Button size="s" mode="tertiary" onClick={() => setDeletingId(null)}>
                  Отмена
                </Button>
              </div>
            </Div>
          </Card>
        </Group>
      )}

      <Group header={<Header size="s">{WEEKDAYS.find((item) => item.id === day)?.label}</Header>}>
        {dayLessons.length === 0 ? (
          <Placeholder icon={<Icon56CalendarOutline />} title="Пар нет">
            В этот день занятий нет. Можно добавить пару кнопкой ниже.
          </Placeholder>
        ) : (
          <Div>
            {dayLessons.map((lesson) => {
              const subject = subjects.find((item) => item.id === lesson.subjectId);
              const isNow =
                selectedIsToday &&
                nowMinutes >= timeToMinutes(lesson.startTime) &&
                nowMinutes <= timeToMinutes(lesson.endTime);

              return (
                <LessonCard
                  key={lesson.id}
                  lesson={lesson}
                  subject={subject}
                  isNow={isNow}
                  editable={editable}
                  onEdit={() => goToForm(lesson.id)}
                  onDelete={() => setDeletingId(lesson.id)}
                />
              );
            })}
          </Div>
        )}
      </Group>

      {editable && <AddLessonButton onClick={() => goToForm(null)} />}
    </Panel>
  );
};
