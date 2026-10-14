// Карточка задания: срок, статус, автор и действия.

import { useState } from 'react';
import { Button, Card, Div, IconButton, Link } from '@vkontakte/vkui';
import { Icon28AttachOutline, Icon28DeleteOutline, Icon28EditOutline } from '@vkontakte/icons';

import { Subject, Task, TaskStatus } from '../types';
import { materialUrl, supportsFileUpload } from '../storage/api';
import { TASK_KIND_LABEL, daysLeft, formatDate, formatDaysLeft } from '../utils/format';
import { subjectColor } from '../utils/subjectColor';

interface TaskCardProps {
  task: Task;
  subject?: Subject;
  onEdit: () => void;
  onDelete: () => void;
  onChangeStatus: (status: TaskStatus) => void;
}

/** Варианты статуса для кнопок. */
const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'Не начато' },
  { value: 'inProgress', label: 'В работе' },
  { value: 'done', label: 'Сдано' },
];

export const TaskCard = ({ task, subject, onEdit, onDelete, onChangeStatus }: TaskCardProps) => {
  // Локальное состояние «подтверждаю удаление»: защита от случайного нажатия.
  const [confirming, setConfirming] = useState(false);

  const left = daysLeft(task.dueDate);
  // Просрочено — красным, горит (0–2 дня) — оранжевым, иначе обычный цвет.
  const dueColor =
    task.status === 'done'
      ? 'var(--vkui--color_text_secondary)'
      : left < 0
        ? 'var(--vkui--color_text_negative)'
        : left <= 2
          ? 'var(--vkui--color_text_warning)'
          : 'var(--vkui--color_text_secondary)';

  return (
    <Card mode="shadow" style={{ marginBottom: 8 }}>
      <Div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ width: 4, borderRadius: 2, alignSelf: 'stretch', background: subjectColor(task.subjectId) }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontWeight: 600, textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>
              {task.title}
            </span>
            <span style={{ whiteSpace: 'nowrap', fontSize: 13, color: dueColor }}>
              до {formatDate(task.dueDate)}
            </span>
          </div>

          <div style={{ marginTop: 4, fontSize: 14, color: 'var(--vkui--color_text_secondary)' }}>
            {subject?.short ?? 'Предмет не найден'} · {TASK_KIND_LABEL[task.kind]}
            {task.status !== 'done' ? ` · ${formatDaysLeft(task.dueDate)}` : ''}
          </div>

          {task.description && (
            <div style={{ marginTop: 6, fontSize: 14 }}>{task.description}</div>
          )}

          {/* Вложение: ссылка на файл (в облаке) или внешняя ссылка. */}
          {(task.attachmentPath || task.attachmentLink) && (
            <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <Icon28AttachOutline height={16} width={16} />
              {(() => {
                const href =
                  task.attachmentLink ??
                  (task.attachmentPath && supportsFileUpload() ? materialUrl(task.attachmentPath) : undefined);

                return href ? (
                  <Link href={href} target="_blank">
                    {task.attachmentName ?? 'Вложение'}
                  </Link>
                ) : (
                  <span style={{ fontSize: 14 }}>{task.attachmentName ?? 'Вложение'}</span>
                );
              })()}
            </div>
          )}

          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--vkui--color_text_subhead)' }}>
            Добавил: {task.authorName ?? 'неизвестно'}
          </div>

          {/* Переключение статуса: три кнопки, активная — синяя. */}
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {STATUS_OPTIONS.map((option) => (
              <Button
                key={option.value}
                size="s"
                mode={task.status === option.value ? 'primary' : 'secondary'}
                onClick={() => onChangeStatus(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {/* Двухшаговое удаление: сначала «Удалить», потом подтверждение. */}
          {confirming ? (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 14 }}>Удалить задание?</span>
              <Button size="s" appearance="negative" onClick={onDelete}>
                Да, удалить
              </Button>
              <Button size="s" mode="tertiary" onClick={() => setConfirming(false)}>
                Отмена
              </Button>
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <IconButton aria-label="Изменить задание" onClick={onEdit}>
            <Icon28EditOutline />
          </IconButton>
          <IconButton aria-label="Удалить задание" onClick={() => setConfirming(true)}>
            <Icon28DeleteOutline />
          </IconButton>
        </div>
      </Div>
    </Card>
  );
};
