// Публикация сайта на Netlify через API — без установки дополнительных пакетов.
//
// Запуск (из папки проекта):
//   node scripts/deploy-netlify.mjs            # соберёт сайт и опубликует
//   node scripts/deploy-netlify.mjs --no-build # опубликовать уже собранное
//
// Токен берётся из переменной окружения NETLIFY_TOKEN или из файла .env.local
// (строка вида NETLIFY_TOKEN=xxxx). Токен в репозиторий не попадает: .env.local в .gitignore.
//
// Что делает скрипт:
//   1) собирает сайт (vite build) — если не передан --no-build;
//   2) упаковывает папку build в zip (через PowerShell, он есть в Windows);
//   3) находит или создаёт сайт с нужным именем (по умолчанию ispsv301);
//   4) загружает архив как новую версию (deploy);
//   5) ждёт, пока Netlify объявит версию готовой, и печатает адрес.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = 'https://api.netlify.com/api/v1';
const SITE_NAME = process.env.NETLIFY_SITE_NAME ?? 'ispsv301';
const noBuild = process.argv.includes('--no-build');

/** Читает токен: сначала из окружения, потом из .env.local. */
const readToken = () => {
  if (process.env.NETLIFY_TOKEN) return process.env.NETLIFY_TOKEN.trim();

  if (existsSync('.env.local')) {
    const line = readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .find((row) => row.trim().startsWith('NETLIFY_TOKEN='));
    if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  }

  throw new Error('Не найден токен Netlify. Добавь NETLIFY_TOKEN=... в .env.local');
};

const token = readToken();

const api = async (path, init = {}) => {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : undefined;
};

/** Сборка сайта. */
if (!noBuild) {
  console.log('Собираю сайт…');
  execFileSync('node', ['./node_modules/vite/bin/vite.js', 'build'], { stdio: 'inherit' });
}

if (!existsSync('build/index.html')) {
  throw new Error('Нет папки build. Сначала выполни сборку (npm run build).');
}

/** Упаковка сборки в zip: Netlify принимает именно архив. */
const zipPath = join(tmpdir(), `netlify-${Date.now()}.zip`);
console.log('Упаковываю в архив…');
execFileSync('powershell', [
  '-NoProfile',
  '-Command',
  `Compress-Archive -Path 'build\\*' -DestinationPath '${zipPath}' -Force`,
]);

const sizeKb = Math.round(statSync(zipPath).size / 1024);
console.log(`Архив готов: ${sizeKb} КБ`);

/** Ищем сайт с нужным именем; если нет — создаём. */
console.log(`Ищу сайт ${SITE_NAME}.netlify.app…`);
const sites = await api('/sites?per_page=100');
let site = sites.find((item) => item.name === SITE_NAME);

if (!site) {
  console.log('Сайта нет — создаю…');
  site = await api('/sites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: SITE_NAME }),
  });
} else {
  console.log('Сайт уже существует, обновляю его.');
}

console.log(`Сайт: ${site.name} (${site.ssl_url ?? site.url})`);

/** Загрузка новой версии: тело запроса — zip-архив. */
console.log('Загружаю файлы…');
const deploy = await api(`/sites/${site.id}/deploys`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/zip' },
  body: readFileSync(zipPath),
});

rmSync(zipPath, { force: true });

/** Ожидание готовности (обычно несколько секунд). */
let state = deploy.state;
for (let attempt = 0; attempt < 40 && state !== 'ready' && state !== 'error'; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const current = await api(`/deploys/${deploy.id}`);
  state = current.state;
  process.stdout.write(`  состояние: ${state}\n`);
}

if (state !== 'ready') {
  throw new Error(`Публикация не завершилась успешно (состояние: ${state})`);
}

console.log(`\nГотово! Сайт опубликован: ${site.ssl_url ?? site.url}`);
