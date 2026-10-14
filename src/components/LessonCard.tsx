// Карточка одной пары в расписании.

import { Button, Card, Div, IconButton } from '@vkontakte/vkui';
import { Icon28DeleteOutline, Icon28EditOutline } from '@vkontakte/icons';

import { Lesson, Subject } from '../types';
import { LESSON_KIND_LABEL } from '../utils/format';
import { subjectColor } from '../utils/subjectColor';

interface LessonCardProps {
  lesson: Lesson;
  /** Предмет пары. Может быть не найден, если данные повреждены — обрабатываем и это. */
  subject?: Subject;
  /** true, если пара идёт прямо сейчас. */
  isNow?: boolean;
  /** Включён ли режим редактирования расписания. */
  editable?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

/** Маленькая цветная «плашка» для дополнительных подписей. */
const Badge = ({ text, color }: { text: string; color?: string }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 6,
      fontSize: 12,
      lineHeight: '16px',
      background: color ?? 'var(--vkui--color_background_secondary)',
      color: color ? '#fff' : 'var(--vkui--color_text_secondary)',
    }}
  >
    {text}
  </span>
);

export const LessonCard = ({ lesson, subject, isNow, editable, onEdit, onDelete }: LessonCardProps) => (
  <Card mode="shadow" style={{ marginBottom: 8 }}>
    <Div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      {/* Цветная полоса слева — визуальный признак предмета. */}
      <div style={{ width: 4, borderRadius: 2, alignSelf: 'stretch', background: subjectColor(lesson.subjectId) }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontWeight: 600 }}>{subject?.title ?? 'Предмет не найден'}</span>
          <span style={{ whiteSpace: 'nowrap', color: 'var(--vkui--color_text_secondary)' }}>
            {lesson.startTime}–{lesson.endTime}
          </span>
        </div>

        <div style={{ marginTop: 4, fontSize: 14, color: 'var(--vkui--color_text_secondary)' }}>
          {LESSON_KIND_LABEL[lesson.kind]} · ауд. {lesson.room}
          {subject?.teacher ? ` · ${subject.teacher}` : ''}
        </div>

        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {isNow && <Badge text="Сейчас идёт" color="var(--vkui--color_background_accent)" />}
          {lesson.parity !== 'all' && (
            <Badge text={lesson.parity === 'odd' ? 'Нечётная неделя' : 'Чётная неделя'} />
          )}
        </div>
      </div>

      {editable && (
        <div style={{ display: 'flex', gap: 4 }}>
          <IconButton aria-label="Изменить пару" onClick={onEdit}>
            <Icon28EditOutline />
          </IconButton>
          <IconButton aria-label="Удалить пару" onClick={onDelete}>
            <Icon28DeleteOutline />
          </IconButton>
        </div>
      )}
    </Div>
  </Card>
);

/** Кнопка «Добавить пару» — вынесена сюда, чтобы экран расписания был короче. */
export const AddLessonButton = ({ onClick }: { onClick: () => void }) => (
  <Div>
    <Button stretched size="l" mode="secondary" onClick={onClick}>
      Добавить пару
    </Button>
  </Div>
);
