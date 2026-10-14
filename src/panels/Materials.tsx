// Экран «Материалы»: общее хранилище учебных материалов по предметам.
//
// Студенты загружают сюда конспекты, методички, презентации и записи занятий —
// всё это видят все участники группы. Работает и для очно-заочной формы:
// материалы дистанционного периода доступны так же, как материалы сессии.

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
} from '@vkontakte/vkui';
import { Icon56DocumentOutline } from '@vkontakte/icons';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';

import { MaterialCard } from '../components/MaterialCard';
import { PATHS } from '../routes';
import { useAppData } from '../store/useAppData';
import { supportsFileUpload } from '../storage/api';

export const Materials = ({ nav }: NavIdProps) => {
  const { materials, subjects, startMaterialEditing, deleteMaterial } = useAppData();
  const routeNavigator = useRouteNavigator();

  const [subjectId, setSubjectId] = useState<string | 'all'>('all');

  const visible = useMemo(() => {
    const filtered = subjectId === 'all' ? materials : materials.filter((item) => item.subjectId === subjectId);
    // Свежие материалы сверху.
    return [...filtered].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }, [materials, subjectId]);

  const openForm = (id: string | null) => {
    startMaterialEditing(id);
    routeNavigator.push(PATHS.MATERIAL_FORM);
  };

  return (
    <Panel nav={nav}>
      <PanelHeader>Материалы</PanelHeader>

      <Group>
        <Div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600 }}>Всего: {materials.length}</span>
          <Button size="s" mode="primary" onClick={() => openForm(null)}>
            + Материал
          </Button>
        </Div>
        {!supportsFileUpload() && (
          <Div style={{ fontSize: 13, color: 'var(--vkui--color_text_secondary)' }}>
            Сейчас приложение работает без облака, поэтому файлы загрузить нельзя — материалы можно
            добавлять описанием и ссылкой.
          </Div>
        )}
      </Group>

      {/* Фильтр по предмету. */}
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

      <Group header={<Header size="s">Список материалов</Header>}>
        {visible.length === 0 ? (
          <Placeholder icon={<Icon56DocumentOutline />} title="Материалов пока нет">
            Загрузите конспекты, методички или презентации — их увидят все одногруппники.
          </Placeholder>
        ) : (
          <Div>
            {visible.map((material) => (
              <MaterialCard
                key={material.id}
                material={material}
                subject={subjects.find((item) => item.id === material.subjectId)}
                onEdit={() => openForm(material.id)}
                onDelete={() => void deleteMaterial(material.id)}
              />
            ))}
          </Div>
        )}
      </Group>
    </Panel>
  );
};
