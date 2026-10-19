// Публикация на GitHub Pages: собираем сайт и выкладываем его в ветку gh-pages.
//
// Запуск:
//   node scripts/deploy-github-pages.mjs <логин>/<репозиторий> [--no-build] [--with-source]
//   например: node scripts/deploy-github-pages.mjs alexswez/vk-group-app --with-source
//
// Что делает скрипт:
//   1) собирает сайт (vite build);
//   2) кладёт содержимое build/ во временный git-репозиторий и добавляет .nojekyll;
//   3) отправляет его в ветку gh-pages указанного репозитория (принудительно — это ветка сборки);
//   4) с флагом --with-source дополнительно отправляет исходный код в ветку main;
//   5) печатает адрес сайта.
//
// Почему так:
//   • пути внутри сборки относительные, поэтому сайт работает по адресу вида
//     https://<логин>.github.io/<репозиторий>/ (проектные страницы, не корень домена);
//   • маршрутизация в приложении через #, поэтому серверу не нужны правила перенаправления;
//   • .nojekyll отключает обработку Jekyll — иначе GitHub может не отдать некоторые файлы;
//   • используется отдельный SSH-ключ (~/.ssh/id_ed25519_github), чтобы не трогать основные.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const repoSpec = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
if (!repoSpec || !repoSpec.includes('/')) {
  console.error('Укажи репозиторий: node scripts/deploy-github-pages.mjs <логин>/<репозиторий>');
  process.exit(1);
}

const [owner, repo] = repoSpec.split('/');
const noBuild = process.argv.includes('--no-build');
const withSource = process.argv.includes('--with-source');

/** SSH-ключ для GitHub; StrictHostKeyChecking=accept-new — чтобы не спрашивало отпечаток хоста. */
const keyPath = join(homedir(), '.ssh', 'id_ed25519_github');
const env = {
  ...process.env,
  GIT_SSH_COMMAND: `ssh -i "${keyPath}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`,
};

const run = (command, args, cwd = process.cwd()) =>
  execFileSync(command, args, { cwd, env, stdio: 'inherit' });

const remote = `git@github.com:${owner}/${repo}.git`;

// 1. Соревнуемся за чистоту: сборка
if (!noBuild) {
  console.log('Собираю сайт…');
  run('node', ['./node_modules/vite/bin/vite.js', 'build']);
}

if (!existsSync('build/index.html')) {
  throw new Error('Нет папки build. Сначала выполни сборку.');
}

// 2. Временный репозиторий только со сборкой
const workDir = mkdtempSync(join(tmpdir(), 'gh-pages-'));
console.log('Готовлю ветку сборки…');
cpSync('build', workDir, { recursive: true });
writeFileSync(join(workDir, '.nojekyll'), '');

run('git', ['init', '-q', '-b', 'gh-pages'], workDir);
run('git', ['config', 'user.email', 'deploy@local'], workDir);
run('git', ['config', 'user.name', 'deploy'], workDir);
run('git', ['add', '-A'], workDir);
run('git', ['commit', '-q', '-m', 'Сборка сайта для GitHub Pages'], workDir);

// 3. Отправка ветки сборки
console.log('Отправляю сайт на GitHub…');
run('git', ['push', '--force', remote, 'gh-pages:gh-pages'], workDir);
rmSync(workDir, { recursive: true, force: true });

// 4. При желании — исходный код в ветку main
if (withSource) {
  console.log('Отправляю исходный код…');
  const remotes = execFileSync('git', ['remote'], { encoding: 'utf8' }).trim();
  if (!remotes.split(/\r?\n/).includes('origin')) {
    run('git', ['remote', 'add', 'origin', remote]);
  }
  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
  run('git', ['push', '-u', 'origin', `${branch}:main`]);
}

const site = `https://${owner.toLowerCase()}.github.io/${repo}/`;
console.log(`\nГотово! Адрес сайта: ${site}`);
console.log('Если страницы ещё не включены, включи один раз:');
console.log('  репозиторий → Settings → Pages → Source: Deploy from a branch → Branch: gh-pages, / (root)');
