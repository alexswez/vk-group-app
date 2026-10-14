// Хук-«ключ» к данным приложения.
// Любой экран пишет: const { tasks, addTask } = useAppData(); — и получает всё нужное.

import { useContext } from 'react';
import { AppDataContext } from './context';

export const useAppData = () => {
  const value = useContext(AppDataContext);

  // Понятная ошибка вместо загадочного «cannot read property of null».
  if (!value) {
    throw new Error('useAppData вызван вне AppDataProvider. Оберните приложение в провайдер.');
  }

  return value;
};
