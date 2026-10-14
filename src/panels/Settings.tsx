// Экран «Настройки»: данные пользователя, название группы, личные настройки и сброс данных.

import { useEffect, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Div,
  FormItem,
  Group,
  Header,
  Input,
  NavIdProps,
  Panel,
  PanelHeader,
  SimpleCell,
  Switch,
} from '@vkontakte/vkui';

import { useAppData } from '../store/useAppData';
import { describeSource } from '../storage/api';
import { formatDate } from '../utils/format';

export const Settings = ({ nav }: NavIdProps) => {
  const { group, tasks, lessons, subjects, prefs, user, serverMode, setGroupName, patchPrefs, resetToMock, refresh } =
    useAppData();
  const [groupName, setLocalGroupName] = useState(group.groupName);
  /** Показывать ли подтверждение полного сброса данных группы. */
  const [confirmReset, setConfirmReset] = useState(false);

  // Если название группы изменилось в другом месте, синхронизируем поле ввода.
  useEffect(() => {
    setLocalGroupName(group.groupName);
  }, [group.groupName]);

  return (
    <Panel nav={nav}>
      <PanelHeader>Настройки</PanelHeader>

      <Group header={<Header size="s">Пользователь</Header>}>
        {user ? (
          <SimpleCell before={<Avatar size={48} src={user.photo_200} />} subtitle={`id ${user.id}`}>
            {`${user.first_name} ${user.last_name}`}
          </SimpleCell>
        ) : (
          <Div>
            Откройте приложение внутри ВКонтакте — тогда подтянутся имя и аватар. В браузере VK Bridge
            недоступен, и это нормально.
          </Div>
        )}
      </Group>

      <Group header={<Header size="s">Учебная группа</Header>}>
        <FormItem top="Название группы" bottom="Отображается в шапке расписания">
          <Input value={groupName} onChange={(event) => setLocalGroupName(event.target.value)} />
        </FormItem>
        <Div>
          <Button size="m" mode="primary" onClick={() => void setGroupName(groupName)}>
            Сохранить название
          </Button>
        </Div>
      </Group>

      <Group header={<Header size="s">Мои настройки</Header>}>
        <Div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ marginBottom: 8 }}>Подгруппа</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[1, 2].map((value) => (
                <Button
                  key={value}
                  size="s"
                  mode={prefs.subgroup === value ? 'primary' : 'secondary'}
                  onClick={() => void patchPrefs({ subgroup: value as 1 | 2 })}
                >
                  {value} подгруппа
                </Button>
              ))}
            </div>
          </div>

          <Switch
            checked={prefs.showPastLessons}
            onChange={(event) => void patchPrefs({ showPastLessons: event.target.checked })}
          >
            Показывать прошедшие пары сегодня
          </Switch>

          <div style={{ fontSize: 13, color: 'var(--vkui--color_text_secondary)' }}>
            Эти настройки личные и хранятся в VK Storage — у каждого пользователя свои.
          </div>
        </Div>
      </Group>

      <Group header={<Header size="s">Данные приложения</Header>}>
        <Card mode="outline">
          <Div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
            <span>Предметов: {subjects.length}</span>
            <span>Пар в расписании: {lessons.length}</span>
            <span>Заданий: {tasks.length}</span>
            <span>
              Режим данных: {serverMode ? describeSource() : 'локально — только этот браузер'}
            </span>
            <span>Последнее изменение: {formatDate(group.updatedAt.slice(0, 10))}</span>
            <span style={{ color: 'var(--vkui--color_text_secondary)' }}>
              Сейчас данные лежат в памяти браузера (localStorage), поэтому одногруппники пока не видят
              правки друг друга. Общее хранилище для всей группы подключим на следующем этапе.
            </span>
          </Div>
        </Card>

        <Div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="m" mode="secondary" onClick={() => void refresh()}>
            Обновить данные
          </Button>
          {!confirmReset && (
            <Button size="m" appearance="negative" onClick={() => setConfirmReset(true)}>
              Сбросить к тестовым данным
            </Button>
          )}
        </Div>

        {/* Сброс удаляет задания и расписание ВСЕЙ группы, поэтому спрашиваем подтверждение:
            в общем приложении одно случайное нажатие не должно стирать данные одногруппников. */}
        {confirmReset && (
          <Card mode="outline" style={{ marginTop: 8 }}>
            <Div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span>
                Сбросить данные <b>всей группы</b>? Все добавленные задания и пары будут удалены,
                вместо них вернутся тестовые.
              </span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  size="s"
                  appearance="negative"
                  onClick={() => {
                    setConfirmReset(false);
                    void resetToMock();
                  }}
                >
                  Да, сбросить всё
                </Button>
                <Button size="s" mode="tertiary" onClick={() => setConfirmReset(false)}>
                  Отмена
                </Button>
              </div>
            </Div>
          </Card>
        )}
      </Group>
    </Panel>
  );
};
