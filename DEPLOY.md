# Развёртывание доски

Доска живёт на `board.school-pi.online`, в `/var/www/schoolpiboard`, работает
службой `schoolpiboard` от пользователя `boardsvc`, со своей базой PostgreSQL
и своим номером базы Redis.

**Основной сайт не затрагивается ни на одном шаге.** `/var/www/my_portfolio_project`
и юнит `gunicorn` не открываются и не перезапускаются: nginx разводит запросы
по `server_name`, а доска — отдельный процесс на отдельном порту.

Файлы, на которые ссылается инструкция, лежат в `deploy/`:
`schoolpiboard.service`, `nginx-board.conf`, `env.example`.

---

## Что должно получиться

```
/var/www/schoolpiboard/
  .env          секреты, права 600, владелец boardsvc
  api/          служба, распаковывается из архива сборки
  api/migrate   применение миграций, приходит в том же архиве
  web/          собранный клиент
```

Сервер остаётся без SDK и без Node.js: сборка идёт в GitHub Actions, сюда
приезжает готовый архив.

---

## 1. DNS

Запись `board.school-pi.online` на адрес этого сервера. Годится и CNAME на
`school-pi.online`.

```bash
dig +short board.school-pi.online
```

Пока не вернёт адрес сервера, шаг 8 (сертификат) выполнить нельзя.

## 2. Пакеты

```bash
sudo apt update
```

```bash
sudo apt install -y aspnetcore-runtime-8.0
```

```bash
sudo apt install -y postgresql redis-server nginx
```

Двумя командами, а не одной: `apt` при неудаче не ставит ничего, и из общей
команды непонятно, что именно не встало.

```bash
dotnet --list-runtimes | grep AspNetCore
```

Ожидается `Microsoft.AspNetCore.App 8.x`.

## 3. Пользователь и папка

Служебный пользователь без домашней папки и без возможности войти: ему нужно
только запускать процесс.

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin boardsvc
```

```bash
sudo mkdir -p /var/www/schoolpiboard
```

```bash
sudo chown -R boardsvc:boardsvc /var/www/schoolpiboard
```

## 4. База

Своя база и свой пользователь — не те, под которыми работает сайт.

Пароль вводится вслепую и остаётся в переменной до шага 6, где попадёт в
файл секретов: копировать его руками не придётся.

```bash
read -rsp "Пароль для базы: " DBPASS; echo
```

```bash
sudo -u postgres psql -c "CREATE ROLE boardsvc WITH LOGIN PASSWORD '$DBPASS'"
```

```bash
sudo -u postgres psql -c "CREATE DATABASE schoolpiboard OWNER boardsvc"
```

```bash
PGPASSWORD="$DBPASS" psql -h localhost -U boardsvc -d schoolpiboard -c '\conninfo'
```

Предупреждение `could not change directory to "/root"` безобидно: пользователь
`postgres` не может зайти в домашнюю папку root.

Владельцем базы роль быть обязана: миграции создают таблицы.

## 5. Redis

Redis должен слушать только петлевой адрес и требовать пароль — иначе любой
процесс на машине читает присутствие и блокировки чужой службы.

Пароль вводится вслепую, чтобы не осесть в истории команд:

```bash
read -rsp "Пароль для Redis: " REDISPASS; echo
```

```bash
sudo sed -i "/^\s*requirepass /d; /^\s*# *requirepass /d" /etc/redis/redis.conf
```

```bash
echo "requirepass $REDISPASS" | sudo tee -a /etc/redis/redis.conf > /dev/null
```

Через удаление и дописывание, а не заменой по образцу: в разных сборках
Redis строка-образец закомментирована по-разному, и замена молча не
сработала бы — а молча незащищённый Redis хуже, чем явная ошибка.

```bash
grep -nE '^\s*(bind|requirepass|protected-mode)' /etc/redis/redis.conf
```

Ожидается `bind 127.0.0.1 ::1`, `protected-mode yes` и строка `requirepass`.

```bash
sudo systemctl restart redis-server; redis-cli -a "$REDISPASS" --no-auth-warning ping
```

Ожидается `PONG`.

Доска использует номер базы 1, чтобы не пересекаться с ключами других служб
на этом же Redis.

## 6. Секреты

Состав переменных с пояснениями — `deploy/env.example`; значений там нет и
быть не должно.

Файл собирается одной командой из переменных этой же сессии — так секреты не
проходят через буфер обмена и не оседают в истории. Пароль базы должен быть
в `$DBPASS` с шага 4, пароль Redis — в `$REDISPASS` с шага 5, поэтому все
три шага делаются **в одном окне терминала**.

Ключ подписи и общий секрет с сервером ключей генерируются на месте:

```bash
JWTKEY=$(openssl rand -hex 32); LICSECRET=$(openssl rand -hex 32); echo "готово"
```

```bash
read -rsp "Пароль приложения Яндекс: " MAILPASS; echo
```

В `MAIL_PASSWORD` кладётся **пароль приложения** из Яндекс ID, а не пароль от
ящика: обычный пароль SMTP не примет.

Команда длинная, но однострочная — многострочные вставки в терминале ломаются
на конструкциях с `$( )`:

```bash
printf '%s\n' 'ASPNETCORE_ENVIRONMENT=Production' "DATABASE_URL=\"Host=localhost;Database=schoolpiboard;Username=boardsvc;Password=$DBPASS\"" "REDIS_URL=\"localhost:6379,password=$REDISPASS,defaultDatabase=1\"" "JWT_SIGNING_KEY=$JWTKEY" 'PUBLIC_URL=https://board.school-pi.online' 'LICENSE_SERVER_URL=https://keys.school-pi.online' "LICENSE_SHARED_SECRET=$LICSECRET" 'MAIL_SERVER=smtp.yandex.ru' 'MAIL_PORT=465' 'MAIL_USERNAME=info@school-pi.online' "MAIL_PASSWORD=$MAILPASS" 'MAIL_FROM=info@school-pi.online' 'S3_ENDPOINT=' 'S3_BUCKET=' 'S3_ACCESS_KEY=' 'S3_SECRET_KEY=' 'TRIAL_DAYS=7' 'GRACE_DAYS=60' | sudo tee /var/www/schoolpiboard/.env > /dev/null
```

```bash
sudo chown boardsvc:boardsvc /var/www/schoolpiboard/.env && sudo chmod 600 /var/www/schoolpiboard/.env
```

Проверка, секретов не печатает:

```bash
wc -l /var/www/schoolpiboard/.env; cut -d= -f1 /var/www/schoolpiboard/.env | tr '\n' ' '; echo; ls -l /var/www/schoolpiboard/.env
```

Ожидается `18`, список из восемнадцати имён и права `-rw------- boardsvc boardsvc`.

Строки подключения — в кавычках, и это обязательно. Systemd читает
`EnvironmentFile` построчно и кавычки снимает сам, а вот команда применения
миграций читает тот же файл через `. .env`, то есть **выполняет его как
скрипт**: без кавычек точка с запятой в строке подключения разделила бы её
на четыре присваивания, и `DATABASE_URL` остался бы без пароля.

`LICENSE_SHARED_SECRET` понадобится в `.env` сервера ключей, когда дойдёт до
оплаты. Прочитать его оттуда:

```bash
sudo grep '^LICENSE_SHARED_SECRET=' /var/www/schoolpiboard/.env
```

**Служба не поднимется, если `JWT_SIGNING_KEY` короче 32 символов или похож
на заглушку** — это пункт 13.6 приёмки, и проверка стоит намеренно.

Паролей Робокассы в этом файле нет: доска в Робокассу не ходит, счёт заводит
сервер ключей (пункт 13.7).

## 7. Сборка, миграции, служба

```bash
cd /tmp && rm -f board.tar.gz
```

```bash
curl -sL -o board.tar.gz https://github.com/pootymoty/schoolpiboard_online/releases/download/online-board-latest/online-board.tar.gz
```

```bash
tar -tzf board.tar.gz | head -5
```

Показывает содержимое, ничего не распаковывая: ожидаются пути `./api/…` и
`./web/…`. Ответ `not in gzip format` означает, что скачалась страница с
ошибкой, а не архив.

```bash
sudo tar -xzf board.tar.gz -C /var/www/schoolpiboard
```

```bash
sudo chown -R boardsvc:boardsvc /var/www/schoolpiboard
```

Миграции применяются командой, а не при старте службы: выкладка и изменение
схемы — разные события, и объединять их значит менять схему при каждом
случайном перезапуске.

```bash
sudo -u boardsvc bash -c 'set -a; . /var/www/schoolpiboard/.env; set +a; export DOTNET_BUNDLE_EXTRACT_BASE_DIR=/var/www/schoolpiboard/.bundle; mkdir -p "$DOTNET_BUNDLE_EXTRACT_BASE_DIR"; /var/www/schoolpiboard/api/migrate'
```

Ожидается `Applying migration '20260826120000_Initial'` и `Done`.

Строка подключения передаётся через окружение, а не аргументом: аргумент был
бы виден в `ps` любому пользователю машины вместе с паролем базы.

`DOTNET_BUNDLE_EXTRACT_BASE_DIR` обязателен. `migrate` — однофайловая сборка,
она распаковывает себя во временный каталог внутри домашней папки, а у
`boardsvc` домашней папки нет намеренно. Без этой переменной команда падает
с `Failed to determine location for extracting embedded files`. Каталог задан
внутри папки проекта, а не в `/tmp`: `/tmp` очищается при перезагрузке и
доступен на запись всем.

Юнит службы — содержимое `deploy/schoolpiboard.service`. Репозиторий на
сервере не разворачивается, поэтому файл переносится вручную:

```bash
sudo nano /etc/systemd/system/schoolpiboard.service
```

```bash
sudo chmod 644 /etc/systemd/system/schoolpiboard.service
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now schoolpiboard
```

```bash
systemctl is-active schoolpiboard
```

```bash
curl -s http://127.0.0.1:5081/api/health; echo
```

Ожидается `active` и `{"status":"ok"}`. Если служба не поднялась, причина
будет в логе прямым текстом:

```bash
sudo journalctl -u schoolpiboard -n 40 --no-pager
```

## 8. nginx и сертификат

Содержимое — `deploy/nginx-board.conf`. Сначала только HTTP: если вписать
`ssl_certificate` до выпуска сертификата, nginx не перезапустится, потому что
файла ещё нет.

```bash
sudo nano /etc/nginx/sites-available/schoolpiboard
```

```bash
sudo ln -sf /etc/nginx/sites-available/schoolpiboard /etc/nginx/sites-enabled/
```

```bash
sudo nginx -t
```

Проверка перед каждым перезапуском — требование раздела 10.2.

```bash
sudo systemctl reload nginx
```

`reload`, а не `restart`: основной сайт при этом не прерывается.

```bash
sudo certbot --nginx -d board.school-pi.online --redirect -n
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

```bash
curl -s https://board.school-pi.online/api/health; echo
```

## 9. Проверка

1. `https://board.school-pi.online` — открывается страница входа.
2. Регистрация проходит, письмо приходит, ссылка подтверждает почту.
3. Служба поднимается после перезагрузки сервера:

```bash
sudo reboot
```

```bash
systemctl is-active schoolpiboard nginx postgresql redis-server
```

---

## Обновление

```bash
cd /tmp && rm -f board.tar.gz
```

```bash
curl -sL -o board.tar.gz https://github.com/pootymoty/schoolpiboard_online/releases/download/online-board-latest/online-board.tar.gz
```

```bash
sudo tar -xzf board.tar.gz -C /var/www/schoolpiboard && sudo chown -R boardsvc:boardsvc /var/www/schoolpiboard
```

```bash
sudo -u boardsvc bash -c 'set -a; . /var/www/schoolpiboard/.env; set +a; export DOTNET_BUNDLE_EXTRACT_BASE_DIR=/var/www/schoolpiboard/.bundle; mkdir -p "$DOTNET_BUNDLE_EXTRACT_BASE_DIR"; /var/www/schoolpiboard/api/migrate'
```

```bash
sudo systemctl restart schoolpiboard
```

Основной сайт при этом не трогается. Миграции идут до перезапуска: новая
схема должна существовать к моменту, когда новый код начнёт к ней обращаться.
