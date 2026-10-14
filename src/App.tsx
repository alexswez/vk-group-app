// Главный компонент приложения: собирает экраны, нижнее меню и переходы между ними.

import { ScreenSpinner, Epic, SplitCol, SplitLayout, Tabbar, TabbarItem, View } from '@vkontakte/vkui';
import {
  Icon28CalendarOutline,
  Icon28ListCheckOutline,
  Icon28SettingsOutline,
} from '@vkontakte/icons';
import {
  useActiveVkuiLocation,
  useGetPanelForView,
  useRouteNavigator,
} from '@vkontakte/vk-mini-apps-router';

import { PANELS, PATHS, VIEWS } from './routes';
import { LessonForm, Schedule, Settings, TaskForm, Tasks } from './panels';
import { useAppData } from './store/useAppData';

export const App = () => {
  // useActiveVkuiLocation сообщает, какая вкладка (view) сейчас открыта.
  const { view: activeView = VIEWS.SCHEDULE } = useActiveVkuiLocation();
  // Во вкладке форм две панели — спрашиваем у роутера, какая из них активна.
  const activeFormPanel = useGetPanelForView(VIEWS.FORM);
  const routeNavigator = useRouteNavigator();
  const { loading } = useAppData();

  // Пока данные читаются из хранилища — показываем спиннер поверх интерфейса.
  const popout = loading ? <ScreenSpinner /> : null;

  // На формах нижнее меню скрываем: пользователь занят заполнением полей.
  const showTabbar = activeView !== VIEWS.FORM;

  return (
    <SplitLayout>
      <SplitCol>
        <Epic
          activeStory={activeView}
          tabbar={
            showTabbar ? (
              <Tabbar>
                <TabbarItem
                  selected={activeView === VIEWS.SCHEDULE}
                  onClick={() => routeNavigator.push(PATHS.SCHEDULE)}
                  label="Расписание"
                >
                  <Icon28CalendarOutline />
                </TabbarItem>
                <TabbarItem
                  selected={activeView === VIEWS.TASKS}
                  onClick={() => routeNavigator.push(PATHS.TASKS)}
                  label="Задания"
                >
                  <Icon28ListCheckOutline />
                </TabbarItem>
                <TabbarItem
                  selected={activeView === VIEWS.SETTINGS}
                  onClick={() => routeNavigator.push(PATHS.SETTINGS)}
                  label="Настройки"
                >
                  <Icon28SettingsOutline />
                </TabbarItem>
              </Tabbar>
            ) : undefined
          }
        >
          {/* У каждой вкладки ровно одна панель, поэтому activePanel задаём напрямую. */}
          <View nav={VIEWS.SCHEDULE} activePanel={PANELS.SCHEDULE}>
            <Schedule nav={PANELS.SCHEDULE} />
          </View>

          <View nav={VIEWS.TASKS} activePanel={PANELS.TASKS}>
            <Tasks nav={PANELS.TASKS} />
          </View>

          <View nav={VIEWS.SETTINGS} activePanel={PANELS.SETTINGS}>
            <Settings nav={PANELS.SETTINGS} />
          </View>

          {/* Вкладка форм: активную панель выбирает роутер по адресу. */}
          <View nav={VIEWS.FORM} activePanel={activeFormPanel ?? PANELS.TASK_FORM}>
            <TaskForm nav={PANELS.TASK_FORM} />
            <LessonForm nav={PANELS.LESSON_FORM} />
          </View>
        </Epic>
      </SplitCol>
      {popout}
    </SplitLayout>
  );
};
