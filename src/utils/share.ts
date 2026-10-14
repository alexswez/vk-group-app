// Отправка ссылки на приложение в беседу группы.
//
// Зачем это нужно: мини-приложение нельзя «встроить» в чат как сообщение от его имени,
// но можно поделиться ссылкой, которая открывает приложение сразу на нужном экране.
// Ссылка вида https://vk.com/app<ID>#/tasks открывает вкладку «Задания».

import bridge from '@vkontakte/vk-bridge';

/**
 * Собирает ссылку на приложение.
 * ID приложения берём из переменной окружения VITE_APP_ID (задаётся при публикации),
 * а если её нет — используем адрес текущей страницы: так кнопка работает и при разработке.
 */
export const getAppLink = (path = ''): string => {
  const appId = import.meta.env.VITE_APP_ID as string | undefined;
  const base = appId
    ? `https://vk.com/app${appId}`
    : `${window.location.origin}${window.location.pathname}`;

  return path ? `${base}#${path}` : base;
};

/**
 * Делится ссылкой и возвращает текст-подсказку для интерфейса.
 *
 * Порядок попыток:
 *   1. VKWebAppShare — системное окно «Поделиться» (внутри ВКонтакте: выбираешь беседу группы).
 *   2. VKWebAppCopyText — копирование в буфер средствами платформы.
 *   3. navigator.clipboard — копирование в обычном браузере.
 *   4. Если ничего не сработало — показываем ссылку, чтобы её скопировали руками.
 */
export const shareLink = async (path: string, message: string): Promise<string> => {
  const link = getAppLink(path);

  try {
    await bridge.send('VKWebAppShare', { link });
    return 'Открылось окно «Поделиться» — выберите беседу группы';
  } catch {
    // Мы вне ВКонтакте или пользователь закрыл окно: переходим к копированию.
  }

  const text = `${message} ${link}`;

  try {
    await bridge.send('VKWebAppCopyText', { text });
    return 'Ссылка скопирована — вставьте её в беседу';
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      return 'Ссылка скопирована — вставьте её в беседу';
    } catch {
      return `Скопируйте ссылку вручную: ${link}`;
    }
  }
};
