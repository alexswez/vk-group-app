// Публикация сайта на Netlify через API — без установки дополнительных пакетов и без zip-архива.
//
// Запуск (из папки проекта):
//   npm run deploy:netlify              # соберёт сайт и опубликует
//   npm run deploy:netlify -- --no-build  # опубликовать уже собранное
//
// Токен берётся из переменной окружения NETLIFY_TOKEN или из файла .env.local
// (строка NETLIFY_TOKEN=...). Токен в репозиторий не попадает: .env.local в .gitignore.
//
// Почему не архив: PowerShell и tar на Windows записывают пути внутри zip то с обратными
// слэшами, то с префиксом "./" — Netlify раскладывает такие файлы не по своим адресам,
// и вложенные файлы отдают 404. Поэтому используется API «по отпечаткам файлов»:
//   1) отправляем список файлов с их SHA1 — Netlify отвечает, чего у него не хватает;
//   2) догружаем только недостающие файлы, каждый по своему точному пути;
//   3) ждём, когда публикация станет готовой.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

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
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
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

/** Обходит папку сборки и собирает список файлов: путь с прямыми слэшами → содержимое. */
const collectFiles = (dir, root = dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collectFiles(full, root, out);
    else out.push({ path: relative(root, full).split(sep).join('/'), full });
  }
  return out;
};

const files = collectFiles('build');
const digests = {};
for (const file of files) {
  digests[file.path] = createHash('sha1').update(readFileSync(file.full)).digest('hex');
}
console.log(`Файлов к публикации: ${files.length}`);

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

/** Начинаем публикацию: передаём отпечатки файлов. */
const deploy = await api(`/sites/${site.id}/deploys`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ files: digests }),
});

/** Netlify сообщает, каких файлов у него нет — их и загружаем. */
const required = deploy.required ?? [];
console.log(`Netlify запросил файлов: ${required.length}`);

for (const path of required) {
  const file = files.find((item) => item.path === path);
  if (!file) {
    console.warn(`  пропущен (нет в сборке): ${path}`);
    continue;
  }

  const response = await fetch(`${API}/deploys/${deploy.id}/files/${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
    body: readFileSync(file.full),
  });

  if (!response.ok) {
    throw new Error(`Загрузка ${path} → ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  console.log(`  загружен: ${path}`);
}

/** Ожидание готовности публикации. */
let state = deploy.state;
for (let attempt = 0; attempt < 40 && state !== 'ready' && state !== 'error'; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  state = (await api(`/deploys/${deploy.id}`)).state;
  process.stdout.write(`  состояние: ${state}\n`);
}

if (state !== 'ready') {
  throw new Error(`Публикация не завершилась успешно (состояние: ${state})`);
}

console.log(`\nГотово! Сайт опубликован: ${site.ssl_url ?? site.url}`);
