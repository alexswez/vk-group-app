// Экран «Предметы»: список дисциплин с возможностью изменить название, короткое имя
// и преподавателя, а также добавить новый предмет.
//
// Сюда же попадаешь из «Настроек». Удалить предмет можно только если на него
// ничего не ссылается — иначе расписание и задания «потеряют» предмет.

import { Button, Card, Div, Group, Header, IconButton, NavIdProps, Panel, PanelHeader, Placeholder } from '@vkontakte/vkui';
import { Icon24DeleteOutline, Icon28EditOutline, Icon56DocumentOutline } from '@vkontakte/icons';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';

import { PATHS } from '../routes';
import { useAppData } from '../store/useAppData';

export const Subjects = ({ nav }: NavIdProps) => {
  const { subjects, lessons, tasks, materials, startSubjectEditing, deleteSubject } = useAppData();
  const routeNavigator = useRouteNavigator();

  const openForm = (subjectId: string | null) => {
    startSubjectEditing(subjectId);
    routeNavigator.push(PATHS.SUBJECT_FORM);
  };

  return (
    <Panel nav={nav}>
      <PanelHeader>Предметы</PanelHeader>

      <Group>
        <Div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600 }}>Всего предметов: {subjects.length}</span>
          <Button size="s" mode="primary" onClick={() => openForm(null)}>
            + Предмет
          </Button>
        </Div>
      </Group>

      <Group header={<Header size="s">Дисциплины</Header>}>
        {subjects.length === 0 ? (
          <Placeholder icon={<Icon56DocumentOutline />} title="Предметов нет">
            Добавьте первый предмет — после этого можно будет создавать пары и задания.
          </Placeholder>
        ) : (
          <Div>
            {subjects.map((subject) => {
              // Считаем, где используется предмет: это нужно для безопасного удаления.
              const lessonCount = lessons.filter((lesson) => lesson.subjectId === subject.id).length;
              const taskCount = tasks.filter((task) => task.subjectId === subject.id).length;
              const materialCount = materials.filter((material) => material.subjectId === subject.id).length;
              const used = lessonCount + taskCount + materialCount > 0;

              return (
                <Card key={subject.id} mode="shadow" style={{ marginBottom: 8 }}>
                  <Div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{subject.title}</div>
                      <div style={{ marginTop: 4, fontSize: 14, color: 'var(--vkui--color_text_secondary)' }}>
                        {subject.short}
                        {subject.teacher ? ` · ${subject.teacher}` : ''}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 13, color: 'var(--vkui--color_text_subhead)' }}>
                        пар: {lessonCount} · заданий: {taskCount} · материалов: {materialCount}
                      </div>
                      {used && (
                        <div style={{ marginTop: 6, fontSize: 13, color: 'var(--vkui--color_text_secondary)' }}>
                          Удалить нельзя: сначала уберите связанные пары, задания и материалы.
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <IconButton aria-label="Изменить предмет" onClick={() => openForm(subject.id)}>
                        <Icon28EditOutline />
                      </IconButton>
                      <IconButton
                        aria-label="Удалить предмет"
                        disabled={used}
                        onClick={() => void deleteSubject(subject.id)}
                      >
                        <Icon24DeleteOutline />
                      </IconButton>
                    </div>
                  </Div>
                </Card>
              );
            })}
          </Div>
        )}
      </Group>
    </Panel>
  );
};
