// Экран «Расписание»: выбор дня недели и список пар.
//
// Учитывает очно-заочную форму обучения: переключатель периода сверху.
//   • «Сессия»       — обычная недельная сетка (занятия идут очно);
//   • «Дистанционно» — список занятий по датам (вебинары), потому что они
//                      не повторяются каждую неделю.

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
import { LessonMode, Weekday } from '../types';
import {
  WEEKDAYS,
  formatDate,
  formatDaySchedule,
  formatOnlineSchedule,
  todayIso,
  todayWeekdayIndex,
} from '../utils/format';
import { copyToClipboard, getAppLink, shareLink } from '../utils/share';

/** Переводит "09:40" в минуты от начала суток — так время удобно сравнивать между собой. */
const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const PERIOD_OPTIONS: { value: LessonMode; label: string; hint: string }[] = [
  { value: 'session', label: 'Сессия', hint: 'занятия очно, по дням недели' },
  { value: 'online', label: 'Дистанционно', hint: 'занятия по датам (вебинары)' },
];

export const Schedule = ({ nav }: NavIdProps) => {
  const { lessons, subjects, group, prefs, serverMode, refresh, deleteLesson, startLessonEditing } = useAppData();
  const routeNavigator = useRouteNavigator();

  const todayIndex = todayWeekdayIndex();
  /** Период обучения: сессия или дистанционный. */
  const [period, setPeriod] = useState<LessonMode>('session');
  // По умолчанию открываем сегодняшний день, а если сегодня воскресенье — понедельник.
  const [day, setDay] = useState<Weekday>(WEEKDAYS[todayIndex === -1 ? 0 : todayIndex].id);
  const [editable, setEditable] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** Подсказка после нажатия «Поделиться» (показывается под кнопкой). */
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const selectedIsToday = WEEKDAYS.findIndex((item) => item.id === day) === todayIndex;

  /** Занятия сессии: недельная сетка. */
  const dayLessons = useMemo(
    () =>
      lessons
        .filter((lesson) => (lesson.mode ?? 'session') === 'session' && lesson.weekday === day)
        // Прошедшие пары можно скрывать — настройка личная, хранится в VK Storage.
        .filter((lesson) =>
          prefs.showPastLessons || !selectedIsToday ? true : timeToMinutes(lesson.endTime) >= nowMinutes,
        )
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)),
    [lessons, day, prefs.showPastLessons, selectedIsToday, nowMinutes],
  );

  /** Дистанционные занятия: идут по датам, поэтому сортируем по дате и времени. */
  const onlineLessons = useMemo(
    () =>
      lessons
        .filter((lesson) => lesson.mode === 'online' && lesson.date)
        .filter((lesson) => prefs.showPastLessons || (lesson.date ?? '') >= todayIso())
        .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)),
    [lessons, prefs.showPastLessons],
  );

  const visibleLessons = period === 'session' ? dayLessons : onlineLessons;

  const deletingLesson = deletingId ? lessons.find((lesson) => lesson.id === deletingId) : undefined;
  const deletingSubject = deletingLesson
    ? subjects.find((subject) => subject.id === deletingLesson.subjectId)
    : undefined;

  const findSubject = (subjectId: string) => subjects.find((subject) => subject.id === subjectId);

  const goToForm = (lessonId: string | null) => {
    startLessonEditing(lessonId);
    routeNavigator.push(PATHS.LESSON_FORM);
  };

  /** Делимся ссылкой на расписание — её можно отправить в беседу группы. */
  const handleShare = async () => {
    const periodLabel = period === 'session' ? 'сессия' : 'дистанционные занятия';
    setShareMessage(await shareLink(PATHS.SCHEDULE, `Расписание группы ${group.groupName} (${periodLabel}):`));
  };

  /**
   * Копирует расписание обычным текстом.
   * Так его можно вставить прямо в сообщение: одногруппники прочитают расписание,
   * не открывая приложение (иногда это удобнее ссылки).
   */
  const handleCopyText = async () => {
    const text =
      period === 'session'
        ? formatDaySchedule(
            group.groupName,
            WEEKDAYS.find((item) => item.id === day)?.label ?? '',
            dayLessons,
            findSubject,
          )
        : formatOnlineSchedule(group.groupName, onlineLessons, findSubject);

    setShareMessage(
      await copyToClipboard([text, '', `Открыть приложение: ${getAppLink(PATHS.SCHEDULE)}`].join('\n')),
    );
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

      {/* Если облако недоступно, честно об этом сообщаем: иначе непонятно, почему
          данные старые. Кнопка запускает повторную попытку подключиться. */}
      {!serverMode && (
        <Group>
          <Div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
            <span>
              Нет связи с облаком — показаны данные, сохранённые на этом устройстве.
              Изменения сейчас не увидят одногруппники.
            </span>
            <Button size="m" mode="secondary" onClick={() => void refresh()}>
              Проверить снова
            </Button>
          </Div>
        </Group>
      )}

      {/* Период обучения — главное отличие очно-заочной формы. */}
      <Tabs>
        {PERIOD_OPTIONS.map((option) => (
          <TabsItem
            key={option.value}
            selected={period === option.value}
            onClick={() => setPeriod(option.value)}
          >
            {option.label}
          </TabsItem>
        ))}
      </Tabs>
      <Div style={{ fontSize: 13, color: 'var(--vkui--color_text_secondary)' }}>
        {PERIOD_OPTIONS.find((option) => option.value === period)?.hint}
      </Div>

      {/* Переключатель дней нужен только для занятий сессии. */}
      {period === 'session' && (
        <Tabs>
          {WEEKDAYS.map((item) => (
            <TabsItem key={item.id} selected={day === item.id} onClick={() => setDay(item.id)}>
              {item.short}
            </TabsItem>
          ))}
        </Tabs>
      )}

      {/* Кнопка «Поделиться»: отправляет ссылку на приложение в беседу группы. */}
      <Group>
        <Div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button stretched size="m" mode="secondary" onClick={() => void handleShare()}>
            Поделиться расписанием
          </Button>
          <Button stretched size="m" mode="tertiary" onClick={() => void handleCopyText()}>
            Скопировать расписание текстом
          </Button>
          {shareMessage && (
            <div style={{ fontSize: 13, color: 'var(--vkui--color_text_secondary)' }}>{shareMessage}</div>
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

      <Group
        header={
          <Header size="s">
            {period === 'session'
              ? WEEKDAYS.find((item) => item.id === day)?.label
              : 'Ближайшие дистанционные занятия'}
          </Header>
        }
      >
        {visibleLessons.length === 0 ? (
          <Placeholder icon={<Icon56CalendarOutline />} title="Занятий нет">
            {period === 'session'
              ? 'В этот день занятий нет. Можно добавить пару кнопкой ниже.'
              : 'Дистанционные занятия не назначены. Добавьте занятие с датой — например, вебинар.'}
          </Placeholder>
        ) : (
          <Div>
            {visibleLessons.map((lesson) => {
              const isNow =
                period === 'session' &&
                selectedIsToday &&
                nowMinutes >= timeToMinutes(lesson.startTime) &&
                nowMinutes <= timeToMinutes(lesson.endTime);

              // Для дистанционных занятий подписываем дату: «15.10.2026 (Ср)».
              const dateLabel =
                period === 'online' && lesson.date
                  ? `${formatDate(lesson.date)} (${
                      WEEKDAYS.find((item) => item.id === lesson.weekday)?.short ?? ''
                    })`
                  : undefined;

              return (
                <LessonCard
                  key={lesson.id}
                  lesson={lesson}
                  subject={findSubject(lesson.subjectId)}
                  isNow={isNow}
                  dateLabel={dateLabel}
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
