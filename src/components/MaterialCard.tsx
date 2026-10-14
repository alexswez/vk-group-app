// Карточка учебного материала: файл в общем хранилище или внешняя ссылка.

import { useState } from 'react';
import { Button, Card, Div, IconButton, Link } from '@vkontakte/vkui';
import { Icon24DeleteOutline, Icon28DocumentTextOutline, Icon28EditOutline } from '@vkontakte/icons';

import { Material, Subject } from '../types';
import { materialUrl, supportsFileUpload } from '../storage/api';
import { formatDate, formatFileSize } from '../utils/format';
import { subjectColor } from '../utils/subjectColor';

interface MaterialCardProps {
  material: Material;
  subject?: Subject;
  onDelete: () => void;
  onEdit: () => void;
}

export const MaterialCard = ({ material, subject, onDelete, onEdit }: MaterialCardProps) => {
  const [confirming, setConfirming] = useState(false);

  // Ссылка на файл: в облачном режиме отдаём публичный адрес хранилища.
  const fileHref = material.filePath && supportsFileUpload() ? materialUrl(material.filePath) : undefined;
  // Внешняя ссылка: если файл лежит не у нас.
  const externalHref = material.link;

  return (
    <Card mode="shadow" style={{ marginBottom: 8 }}>
      <Div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ width: 4, borderRadius: 2, alignSelf: 'stretch', background: subjectColor(material.subjectId) }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{material.title}</div>

          <div style={{ marginTop: 4, fontSize: 14, color: 'var(--vkui--color_text_secondary)' }}>
            {subject?.short ?? 'Предмет не найден'}
            {material.fileName ? ` · ${material.fileName}` : ''}
            {material.fileSize ? ` · ${formatFileSize(material.fileSize)}` : ''}
          </div>

          {material.description && <div style={{ marginTop: 6, fontSize: 14 }}>{material.description}</div>}

          <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {fileHref && (
              <Link href={fileHref} target="_blank">
                Открыть файл
              </Link>
            )}
            {externalHref && (
              <Link href={externalHref} target="_blank">
                Открыть ссылку
              </Link>
            )}
            {!fileHref && !externalHref && (
              <span style={{ fontSize: 13, color: 'var(--vkui--color_text_secondary)' }}>
                <Icon28DocumentTextOutline height={14} width={14} /> только описание
              </span>
            )}
          </div>

          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--vkui--color_text_subhead)' }}>
            {material.uploadedBy ? `Загрузил: ${material.uploadedBy} · ` : ''}
            {formatDate(material.uploadedAt.slice(0, 10))}
          </div>

          {confirming && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14 }}>Удалить материал?</span>
              <Button size="s" appearance="negative" onClick={onDelete}>
                Да, удалить
              </Button>
              <Button size="s" mode="tertiary" onClick={() => setConfirming(false)}>
                Отмена
              </Button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <IconButton aria-label="Изменить материал" onClick={onEdit}>
            <Icon28EditOutline />
          </IconButton>
          <IconButton aria-label="Удалить материал" onClick={() => setConfirming(true)}>
            <Icon24DeleteOutline />
          </IconButton>
        </div>
      </Div>
    </Card>
  );
};
