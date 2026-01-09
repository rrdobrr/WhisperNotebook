# Руководство по деплою WhisperTranscriber

## Деплой на Railway

### ⚠️ Важно: Настройка Volume

**Перед деплоем на Railway обязательно создайте Volume!**

Railway использует эфемерную файловую систему - без Volume все данные теряются при редеплое.

**Требования к Volume:**
- **Mount Path:** `/app/data`
- **Минимальный размер:** 5GB (1GB БД + 3GB модель Whisper + запас)
- **Рекомендуемый размер:** 10GB

Подробные инструкции по настройке Volume см. ниже в разделе "Настройка постоянного хранилища".

### Подготовка

1. Создайте аккаунт на [Railway](https://railway.app)
2. Установите Railway CLI (опционально):
   ```bash
   npm install -g @railway/cli
   ```

### Шаги деплоя

#### Вариант 1: Через веб-интерфейс Railway

1. **Создайте новый проект**
   - Войдите в Railway Dashboard
   - Нажмите "New Project"
   - Выберите "Deploy from GitHub repo"

2. **Подключите репозиторий**
   - Авторизуйте Railway для доступа к GitHub
   - Выберите репозиторий WhisperTranscriber
   - Railway автоматически обнаружит Dockerfile

3. **Настройте переменные окружения**

   Перейдите в настройки проекта и добавьте:

   ```
   ENCRYPTION_KEY=<сгенерируйте новый ключ>
   DATABASE_URL=sqlite:////app/data/whispertranscriber.db
   ```

   Для генерации ENCRYPTION_KEY:
   ```python
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```

4. **Добавьте Volume для данных**
   - В настройках сервиса найдите "Volumes"
   - Добавьте новый Volume:
     - Mount Path: `/app/data`
     - Size: 5GB (минимум: 1GB для БД + 3GB для модели Whisper)

   **ВАЖНО:** Этот Volume будет использоваться для хранения:
   - База данных SQLite (`/app/data/whispertranscriber.db`)
   - Модель Whisper для локальной транскрибации (`/app/data/models/`)
   - Все данные сохраняются между редеплоями

5. **Настройте домен (опционально)**
   - Railway предоставит домен по умолчанию
   - Можете добавить свой кастомный домен в настройках

6. **Деплой**
   - Railway автоматически начнет деплой
   - Следите за логами в реальном времени
   - После успешного деплоя перейдите по URL

#### Вариант 2: Через Railway CLI

```bash
# Войдите в Railway
railway login

# Инициализируйте проект
railway init

# Добавьте переменные окружения
railway variables set ENCRYPTION_KEY="your-key-here"
railway variables set DATABASE_URL="sqlite:////app/data/whispertranscriber.db"

# Деплой
railway up
```

### Настройка постоянного хранилища

Railway использует эфемерную файловую систему, поэтому критически важно настроить Volume для данных:

1. В дашборде проекта откройте настройки сервиса
2. Перейдите в раздел "Volumes"
3. Создайте новый Volume:
   ```
   Mount Path: /app/data
   Size: 5GB (рекомендуется)
   ```

**Что хранится в Volume:**
- **База данных SQLite** (`/app/data/whispertranscriber.db`) - все транскрипции, чаты, настройки
- **Модель Whisper** (`/app/data/models/`) - модель для локальной транскрибации (~3GB)
- **Временные файлы** - загруженные видео/аудио в процессе обработки

**Важно:**
- Без Volume все данные будут теряться при каждом редеплое
- Модель Whisper придётся скачивать заново при каждом перезапуске (если не используется Volume)
- Минимальный размер Volume: 5GB (1GB для БД + 3GB для модели + запас)

**После настройки Volume:**
1. Зайдите в настройки приложения (после деплоя)
2. Нажмите кнопку "Скачать модель" в разделе "Локальная модель транскрибации"
3. Модель скачается в `/app/data/models/` и сохранится между редеплоями

### Проверка работы

После деплоя проверьте:

1. **Health check**: `https://your-app.railway.app/health`
   - Должен вернуть `{"status": "healthy"}`

2. **API документация**: `https://your-app.railway.app/docs`
   - Swagger UI с полной документацией API

3. **Frontend**: `https://your-app.railway.app/`
   - Главная страница приложения

### Мониторинг

Railway предоставляет встроенный мониторинг:

1. **Логи**: Просмотр логов в реальном времени
2. **Метрики**: CPU, RAM, Network usage
3. **Deployments**: История всех деплоев

### Обновление приложения

При пуше в GitHub репозиторий Railway автоматически:
1. Обнаружит изменения
2. Соберет новый образ
3. Задеплоит обновление
4. Сделает health check
5. Переключит трафик на новую версию

## Деплой на других платформах

### Heroku

```bash
# Установите Heroku CLI
curl https://cli-assets.heroku.com/install.sh | sh

# Войдите
heroku login

# Создайте приложение
heroku create your-app-name

# Добавьте buildpack для Python
heroku buildpacks:add heroku/python

# Установите переменные окружения
heroku config:set ENCRYPTION_KEY="your-key-here"
heroku config:set DATABASE_URL="sqlite:////app/data/whispertranscriber.db"

# Деплой
git push heroku main

# Откройте приложение
heroku open
```

### Render

1. Создайте новый "Web Service"
2. Подключите GitHub репозиторий
3. Настройте:
   - Build Command: `pip install -r backend/requirements.txt && cd frontend && npm install && npm run build`
   - Start Command: `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`
4. Добавьте переменные окружения
5. Добавьте Disk для постоянного хранилища

### DigitalOcean App Platform

1. Создайте новое приложение
2. Подключите GitHub репозиторий
3. App Platform автоматически обнаружит Dockerfile
4. Настройте переменные окружения
5. Добавьте Volume для `/app/data`
6. Деплой

### Fly.io

```bash
# Установите flyctl
curl -L https://fly.io/install.sh | sh

# Войдите
flyctl auth login

# Инициализируйте приложение
flyctl launch

# Создайте Volume
flyctl volumes create whisper_data --size 1

# Обновите fly.toml для монтирования Volume
# Добавьте в конфигурацию:
# [mounts]
#   source = "whisper_data"
#   destination = "/app/data"

# Установите секреты
flyctl secrets set ENCRYPTION_KEY="your-key-here"

# Деплой
flyctl deploy
```

## VPS / Собственный сервер

### Требования

- Ubuntu 20.04+ / Debian 11+
- 2GB RAM минимум (4GB рекомендуется)
- 10GB свободного места
- Docker и Docker Compose

### Установка

1. **Установите Docker**
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo usermod -aG docker $USER
   ```

2. **Установите Docker Compose**
   ```bash
   sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```

3. **Клонируйте репозиторий**
   ```bash
   git clone https://github.com/your-username/WhisperTranscriber.git
   cd WhisperTranscriber
   ```

4. **Создайте .env файл**
   ```bash
   echo "ENCRYPTION_KEY=$(python3 -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')" > .env
   ```

5. **Запустите приложение**
   ```bash
   docker-compose up -d
   ```

6. **Настройте Nginx (опционально)**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:8000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

7. **Настройте SSL с Certbot**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

## Рекомендации по настройке

### Оптимизация для производства

1. **Используйте переменные окружения для секретов**
   - Никогда не коммитьте .env файлы
   - Используйте secrets management платформы

2. **Настройте логирование**
   - Настройте уровень логирования в production
   - Используйте централизованное логирование (Sentry, LogDNA)

3. **Настройте мониторинг**
   - Используйте Prometheus + Grafana
   - Настройте алерты для критических метрик

4. **Бэкапы базы данных**
   ```bash
   # Создайте cron job для автоматических бэкапов
   0 0 * * * cp /app/data/whispertranscriber.db /backups/whispertranscriber_$(date +\%Y\%m\%d).db
   ```

5. **Ограничение ресурсов**
   - Настройте лимиты CPU и RAM в Docker
   - Настройте rate limiting для API

## Решение проблем

### База данных не сохраняется

- Убедитесь, что Volume правильно настроен
- Проверьте права доступа к директории `/app/data`

### ffmpeg не найден

- Убедитесь, что ffmpeg установлен в Docker образе
- Проверьте PATH переменную

### Ошибка "API key not set"

- Добавьте OpenAI API ключ через UI в настройках
- Или установите OPENAI_API_KEY в переменных окружения

### Медленная транскрибация

- Локальная модель работает медленнее на CPU
- Рассмотрите использование GPU
- Или используйте OpenAI API для более быстрой обработки

## Масштабирование

### Горизонтальное масштабирование

1. **Используйте внешнюю БД**
   - PostgreSQL вместо SQLite
   - Обновите DATABASE_URL

2. **Используйте Redis для кэширования**
   - Кэшируйте часто используемые данные
   - Используйте для очереди задач

3. **Используйте S3 для хранения файлов**
   - AWS S3, DigitalOcean Spaces, etc.
   - Не храните файлы в контейнере

4. **Настройте Load Balancer**
   - Распределите нагрузку между инстансами
   - Используйте health checks

### Вертикальное масштабирование

- Увеличьте RAM для обработки больших файлов
- Используйте более мощный CPU для локальной транскрибации
- Добавьте GPU для ускорения faster-whisper

## Безопасность

1. **HTTPS обязателен**
   - Используйте SSL сертификаты
   - Принудительно перенаправляйте HTTP на HTTPS

2. **Обновления**
   - Регулярно обновляйте зависимости
   - Мониторьте уязвимости с Dependabot

3. **Firewall**
   - Ограничьте доступ к портам
   - Используйте UFW или аналоги

4. **Rate Limiting**
   - Ограничьте количество запросов
   - Защитите от DDoS

5. **Аутентификация**
   - Добавьте систему аутентификации для мультипользовательского режима
   - Используйте JWT токены
