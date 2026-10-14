import { createRoot } from 'react-dom/client';
import vkBridge from '@vkontakte/vk-bridge';
import { AppConfig } from './AppConfig.tsx';

vkBridge.send('VKWebAppInit');

createRoot(document.getElementById('root')!).render(<AppConfig />);

// Консоль разработчика Eruda включаем в двух случаях:
//   1) обычная разработка (npm start);
//   2) VITE_DEBUG=1 в .env.local — чтобы отлаживать уже опубликованное приложение на телефоне,
//      где обычной консоли нет.
if (import.meta.env.MODE === 'development' || import.meta.env.VITE_DEBUG === '1') {
  import('./eruda.ts');
}
