# Образ для запуска сервера общего хранилища на любом хостинге с поддержкой Docker
# (Render, Railway, Fly.io, VPS и т. д.).
#
# Сборка:  docker build -t vk-group-app-server .
# Запуск:  docker run -p 3000:3000 -v vk-data:/app/data vk-group-app-server

# Встроенный модуль node:sqlite появился в Node 22.5+, поэтому берём свежий LTS-образ.
FROM node:24-slim

# Рабочая папка внутри контейнера.
WORKDIR /app

# Сначала копируем только описание зависимостей — так Docker закэширует слой с установкой
# и не будет переустанавливать пакеты при каждом изменении кода.
COPY package.json package-lock.json ./

# ci — установка строго по lock-файлу (воспроизводимо); --omit=dev — без инструментов разработки.
RUN npm ci --omit=dev

# Теперь копируем код сервера.
COPY . .

# Папка для файла базы: её удобно вынести в отдельный том (volume), чтобы данные не терялись.
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/app.db

EXPOSE 3000

# Проверка работоспособности: Docker сможет понять, что контейнер жив.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]
