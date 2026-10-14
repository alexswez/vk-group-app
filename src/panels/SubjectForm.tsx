// Экран-форма предмета: создание новой дисциплины и изменение существующей.

import { useEffect, useState } from 'react';
import { Button, Div, FormItem, Group, Header, Input, NavIdProps, Panel, PanelHeader } from '@vkontakte/vkui';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';

import { PATHS } from '../routes';
import { useAppData } from '../store/useAppData';

export const SubjectForm = ({ nav }: NavIdProps) => {
  const { subjects, editingSubjectId, addSubject, updateSubject, startSubjectEditing } = useAppData();
  const routeNavigator = useRouteNavigator();

  const editingSubject = editingSubjectId
    ? subjects.find((subject) => subject.id === editingSubjectId)
    : undefined;

  const [title, setTitle] = useState('');
  const [short, setShort] = useState('');
  const [teacher, setTeacher] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingSubject) {
      setTitle(editingSubject.title);
      setShort(editingSubject.short);
      setTeacher(editingSubject.teacher);
    } else {
      setTitle('');
      setShort('');
      setTeacher('');
    }
    setError(null);
  }, [editingSubject]);

  const handleSave = async () => {
    if (title.trim().length < 3) {
      setError('Название предмета должно быть не короче 3 символов.');
      return;
    }

    const payload = { title, short, teacher };

    if (editingSubject) {
      await updateSubject(editingSubject.id, payload);
    } else {
      await addSubject(payload);
    }

    startSubjectEditing(null);
    routeNavigator.push(PATHS.SUBJECTS);
  };

  return (
    <Panel nav={nav}>
      <PanelHeader>{editingSubject ? 'Изменить предмет' : 'Новый предмет'}</PanelHeader>

      <Group header={<Header size="s">Данные дисциплины</Header>}>
        <FormItem top="Полное название">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Например: Базы данных"
          />
        </FormItem>

        <FormItem top="Короткое название" bottom="Показывается на карточках, 2–6 символов">
          <Input
            value={short}
            onChange={(event) => setShort(event.target.value)}
            placeholder="Например: БД"
          />
        </FormItem>

        <FormItem top="Преподаватель">
          <Input
            value={teacher}
            onChange={(event) => setTeacher(event.target.value)}
            placeholder="Например: Иванова М. П."
          />
        </FormItem>
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
              startSubjectEditing(null);
              routeNavigator.push(PATHS.SUBJECTS);
            }}
          >
            Отмена
          </Button>
        </Div>
      </Group>
    </Panel>
  );
};
