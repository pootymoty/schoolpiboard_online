# Пошаговый запуск сайта онлайн-доски

Доска живёт на поддомене `board.school-pi.online`, в папке
`/var/www/schoolpiboard`, отдельной службой `schoolpiboard`, с отдельной
базой `schoolpiboard_online` и своим магазином Робокассы.

Обозначения: `[СЕРВЕР]` — команда на сервере по ssh, `[решение]` — действие
вне консоли (DNS, личный кабинет, почта).

## Уживается ли это с основным сайтом

Да, и это обычная схема. nginx умеет держать сколько угодно сайтов на одной
машине: он смотрит на имя из заголовка `Host` и по `server_name` выбирает,
какой блок обслуживает запрос. Основной сайт на gunicorn и доска на
ASP.NET Core — два независимых процесса на разных портах, оба слушают только
петлевой адрес, наружу их выпускает nginx:

```
                      ┌─ server_name school-pi.online       → gunicorn (порт/сокет основного сайта)
браузер → nginx :443 ─┤
                      └─ server_name board.school-pi.online → dotnet 127.0.0.1:5081
```

Останавливать gunicorn не нужно ни при установке, ни при обновлении доски.
Единственное требование — порт `5081` не должен быть занят, это проверяется
на шаге 3.

Токен входа доска хранит в `localStorage`, а он изолирован по origin,
поэтому учётные записи доски и основного сайта не пересекаются даже на
соседних поддоменах.

---

## Шаг 1. DNS `[решение]`

A-запись `board.school-pi.online` → IP сервера. Если основной домен уже
указывает на эту же машину, проще всего скопировать его A-запись.

Проверить, что запись разошлась (должен вернуться IP сервера):

```bash
dig +short board.school-pi.online
```

Пока запись не разошлась, certbot на шаге 9 сертификат не выпустит.

## Шаг 2. Пароль приложения Яндекс 360 `[решение]`

В Яндекс ID для `info@school-pi.online` создайте **пароль приложения** для
почты. Обычный пароль от ящика SMTP не примет. Пригодится на шаге 6.

## Шаг 3. Проверить, что порт свободен `[СЕРВЕР]`

```bash
sudo ss -tlnp | grep -E ':(5080|5081)\b' || echo "5080 и 5081 свободны"
```

Пусто — всё в порядке. Если `5081` кем-то занят, выберите другой свободный
порт и подставляйте его дальше вместо `5081` в двух местах: `ASPNETCORE_URLS`
(шаг 6) и `proxy_pass` (шаг 8).

## Шаг 4. Рантайм, Redis, папка `[СЕРВЕР]`

Серверу нужен только **рантайм** ASP.NET Core — SDK и Node.js не нужны,
сборкой занимается GitHub Actions.

```bash
sudo apt update
sudo apt install -y aspnetcore-runtime-8.0
sudo apt install -y redis-server
sudo systemctl enable --now redis-server
```

Двумя командами, а не одной: `apt` при неудаче не ставит **ничего**, поэтому
из общей команды нельзя понять, что именно не встало. Если на этой машине
уже работает сервер ключей, рантайм .NET там наверняка стоит — тогда первая
команда просто ничего не изменит.

Проверьте, что рантайм встал и где лежит исполняемый файл:

```bash
dotnet --list-runtimes | grep Microsoft.AspNetCore.App
which dotnet
```

В списке должна быть строка `Microsoft.AspNetCore.App 8.x`. Путь из
`which dotnet` (обычно `/usr/bin/dotnet`) понадобится на шаге 7 — если он
у вас другой, подставьте свой.

Если `aspnetcore-runtime-8.0` не находится в apt, подключите репозиторий
Microsoft и повторите установку:

```bash
wget https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/packages-microsoft-prod.deb -O /tmp/ms-prod.deb
sudo dpkg -i /tmp/ms-prod.deb
sudo apt update && sudo apt install -y aspnetcore-runtime-8.0
```

Папка проекта:

```bash
sudo mkdir -p /var/www/schoolpiboard
```

Подпапки `api/` и `web/` создавать не нужно — они появятся из архива.

## Шаг 5. База данных `[СЕРВЕР]`

И база, и роль отдельные от лицензионных: это разные продукты, общих данных
нет. Роль своя не только ради порядка — утечка `.env` одного сервиса тогда
не даёт доступа к базе другого.

Интерактивный psql не открываем: при вставке нескольких строк разом часть
из них уходит в оболочку вместо psql. Каждая команда — отдельная, через `-c`.

```bash
cd /tmp
PGPASS=$(openssl rand -hex 24)
sudo -u postgres psql -c "CREATE ROLE schoolpi_board WITH LOGIN PASSWORD '$PGPASS'"
sudo -u postgres psql -c "CREATE DATABASE schoolpiboard_online OWNER schoolpi_board"
```

`cd /tmp` убирает предупреждение `could not change directory to "/root"`:
пользователь `postgres` не может зайти в домашнюю папку root.

Пароль хранится в переменной и на шаге 6 попадёт в `.env` прямо оттуда —
копировать его руками не придётся, поэтому **не закрывайте это окно
терминала** до конца шага 6 и не запускайте `PGPASS=...` повторно.

Если роль уже существует с прошлой попытки, `CREATE ROLE` ответит
`already exists` и пароль останется прежним — тогда переназначьте его,
чтобы переменная и реальный пароль сошлись:

```bash
sudo -u postgres psql -c "ALTER ROLE schoolpi_board WITH LOGIN PASSWORD '$PGPASS'"
```

Владельцем базы роль быть обязана: схему сервис создаёт сам при каждом
старте идемпотентными скриптами из `sql/`, и для этого ему нужно право
создавать таблицы.

Проверить подключение:

```bash
PGPASSWORD="$PGPASS" psql -h localhost -U schoolpi_board -d schoolpiboard_online -c '\conninfo'
```

## Шаг 6. Секреты `[СЕРВЕР]`

Секреты живут в отдельном файле с правами `600`, а не в unit-файле службы:
unit читается любым пользователем системы.

Пишем файл целиком одной вставкой, **в том же окне**, где жива `$PGPASS`
с шага 5: пароль базы подставится сам, `AUTH_TOKEN_SECRET` сгенерируется
на месте. Так секреты не проходят через буфер обмена и не попадают в историю
команд. `umask 077` — чтобы файл сразу создался закрытым, без промежутка,
в который он читаем всем.

```bash
umask 077
cat > /etc/schoolpiboard.env <<EOF
ASPNETCORE_ENVIRONMENT=Production
ASPNETCORE_URLS=http://127.0.0.1:5081
ConnectionStrings__Postgres=Host=localhost;Database=schoolpiboard_online;Username=schoolpi_board;Password=$PGPASS
AUTH_TOKEN_SECRET=$(openssl rand -hex 32)
REDIS_CONNECTION_STRING=localhost:6379
Site__BaseUrl=https://board.school-pi.online
Site__AppOrigins__0=https://board.school-pi.online
Site__SupportEmail=info@school-pi.online
Smtp__Host=smtp.yandex.ru
Smtp__Port=465
Smtp__User=info@school-pi.online
Smtp__FromEmail=info@school-pi.online
SMTP_PASSWORD=
Payments__MerchantLogin=
ROBOKASSA_PASSWORD1=
ROBOKASSA_PASSWORD2=
Payments__IsTest=true
EOF
chown root:root /etc/schoolpiboard.env && chmod 600 /etc/schoolpiboard.env
```

Здесь `EOF` **без кавычек** — это намеренно: иначе `$PGPASS` и `$(openssl …)`
попали бы в файл текстом вместо значений.

Проверка, секретов не печатает:

```bash
wc -l /etc/schoolpiboard.env      # 17 — блок не оборвался при вставке
grep -c PGPASS /etc/schoolpiboard.env   # 0 — переменная подставилась
ls -l /etc/schoolpiboard.env      # -rw------- root root
```

### Пароль приложения для почты

`SMTP_PASSWORD` оставлен пустым: с ним сервис стартует нормально, но письма
подтверждения отправляться не будут, а без подтверждения учётная запись не
создаётся. Заполняется вслепую, чтобы не осветить пароль на экране и в
истории команд:

```bash
read -rsp "Пароль приложения Яндекс: " SMTPPASS; echo
umask 077
{ grep -v '^SMTP_PASSWORD=' /etc/schoolpiboard.env; echo "SMTP_PASSWORD=$SMTPPASS"; } > /etc/schoolpiboard.env.new
mv /etc/schoolpiboard.env.new /etc/schoolpiboard.env
chown root:root /etc/schoolpiboard.env && chmod 600 /etc/schoolpiboard.env
unset SMTPPASS
```

Вводить без пробелов: Яндекс показывает пароль группами по четыре символа,
сами пробелы в него не входят. Через файл-времянку с `mv`, а не правкой
на месте, — чтобы при обрыве не остаться с покалеченным файлом секретов.
Порядок строк в env-файле роли не играет, поэтому строка просто дописывается
в конец.

Проверить, что сервис принял почту (после перезапуска на шаге 7):

```bash
journalctl -u schoolpiboard -n 15 --no-pager | grep -i smtp
```

Пусто — хорошо. Строка «SMTP не настроен: письма пишутся в лог» означает,
что пароль не подхватился.

`Site__BaseUrl` — из него собираются ссылки в письмах: ошибётесь здесь, и
письма уйдут со ссылками в никуда. `Payments__IsTest=true` оставляем до
первой успешной тестовой оплаты.

Робокассу можно заполнить позже: без неё сервис поднимется, только оплата
подписки будет отвечать `503`, о чём он предупредит в логе при старте.

## Шаг 7. Забрать сборку и поднять службу `[СЕРВЕР]`

Архив собран GitHub Actions и уже разложен внутри на `api/` и `web/`,
поэтому распаковывается прямо в корень проекта.

**Репозиторий должен быть публичным.** Ссылка на файл релиза скачивается без
токена, и у приватного репозитория `curl` получает `404 Not Found` — на диск
ложатся девять байт текста вместо архива. Секретов в репозитории нет (они
живут только в `/etc/schoolpiboard.env`), поэтому публичность здесь ничего
не раскрывает. Если репозиторий понадобится закрыть, скачивание придётся
переводить на токен с правом `Contents: Read-only`.

```bash
cd /tmp && rm -f ob.tar.gz
curl -sL -o ob.tar.gz https://github.com/pootymoty/schoolpiboard_online/releases/download/online-board-latest/online-board.tar.gz
tar -tzf ob.tar.gz | head -5
```

Третья команда показывает содержимое архива, ничего не распаковывая, —
дешёвая страховка от молчаливой ошибки. Ожидаются пути `./api/…` и `./web/…`.
Ответ `not in gzip format` означает, что скачалась страница с ошибкой,
а не архив: проверьте, публичен ли репозиторий и есть ли релиз.

Только после этого:

```bash
sudo tar -xzf ob.tar.gz -C /var/www/schoolpiboard
sudo chown -R www-data:www-data /var/www/schoolpiboard
ls -l /var/www/schoolpiboard/api/SchoolPiBoard.Online.dll /var/www/schoolpiboard/web/index.html
```

Найтись должны обе строки — это подтверждает, что в архиве были обе части.

Служба. Здесь `EOF` **в кавычках** — в отличие от env-файла, подставлять
сюда нечего, и кавычки страхуют от случайной подстановки:

```bash
cat > /etc/systemd/system/schoolpiboard.service <<'EOF'
[Unit]
Description=SchoolPiBoard online API
After=network.target postgresql.service redis-server.service

[Service]
WorkingDirectory=/var/www/schoolpiboard/api
ExecStart=/usr/bin/dotnet /var/www/schoolpiboard/api/SchoolPiBoard.Online.dll
EnvironmentFile=/etc/schoolpiboard.env
Restart=always
RestartSec=5
User=www-data

[Install]
WantedBy=multi-user.target
EOF
chmod 644 /etc/systemd/system/schoolpiboard.service
```

`ExecStart` должен начинаться с пути из `which dotnet` (шаг 4).

`chmod` не формальность: после `umask 077` с шага 6 файл создался бы с
правами `600`. Работать бы служба всё равно работала — systemd читает юнит
от root, — но права выглядели бы необъяснимо.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now schoolpiboard
sudo systemctl is-active schoolpiboard
curl -s http://127.0.0.1:5081/health; echo
```

Ожидаемый ответ: `{"status":"ok"}`. Схему базы сервис создал сам при старте —
отдельной команды нет.

Если служба не поднялась, причина будет в логе прямым текстом (чаще всего —
опечатка в строке подключения к базе или незаданная обязательная настройка):

```bash
sudo journalctl -u schoolpiboard -n 50 --no-pager
```

В логе при старте будут предупреждения про выключенную капчу и, если не
заполнена, про Робокассу — это ожидаемо, а не ошибка.

## Шаг 8. nginx `[СЕРВЕР]`

Сначала поднимаем сайт **по HTTP**, без единой строчки про сертификаты.
Порядок важен: если вписать `ssl_certificate` до выпуска сертификата, nginx
не перезапустится — файла, на который он ссылается, ещё нет. Сертификат
пропишет сам certbot на шаге 9.

```bash
sudo nano /etc/nginx/sites-available/schoolpiboard
```

```nginx
server {
    listen 80;
    server_name board.school-pi.online;

    root /var/www/schoolpiboard/web;
    index index.html;

    # Приложение одностраничное: любой адрес отдаём index.html,
    # маршрутизацией занимается сам сайт. Без этого внутренние адреса
    # будут отдавать 404 при перезагрузке страницы.
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Порядок блоков не важен, важна их специфичность: более длинный
    # префикс /api/hub/ выигрывает у /api/ по правилам nginx.
    location /api/ {
        proxy_pass http://127.0.0.1:5081/;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Доска работает по WebSocket — без этих двух заголовков соединение
    # не поднимется, и SignalR молча свалится на длинный опрос.
    location /api/hub/ {
        proxy_pass http://127.0.0.1:5081/hub/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host       $host;
        proxy_set_header X-Real-IP  $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 1h;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/schoolpiboard /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

`reload`, а не `restart`: основной сайт при этом не прерывается.

Конфиг основного сайта трогать не нужно — он остаётся как есть, nginx
разведёт запросы по `server_name` сам. Проверить, что доска отвечает и
основной сайт не задет:

```bash
curl -s http://board.school-pi.online/api/health; echo
curl -sI https://school-pi.online | head -1
```

## Шаг 9. Сертификат `[СЕРВЕР]`

```bash
sudo certbot --nginx -d board.school-pi.online
```

На вопрос про перенаправление отвечайте «redirect» — certbot сам добавит
в конфиг блок `listen 443 ssl`, пути к сертификату и редирект с HTTP.

```bash
sudo nginx -t && sudo systemctl reload nginx
curl -s https://board.school-pi.online/api/health; echo
```

Снова `{"status":"ok"}`, теперь по HTTPS — значит, всё сошлось.

## Шаг 10. ResultURL в кабинете Робокассы `[решение]`

```
https://board.school-pi.online/api/billing/robokassa/result
```

**Магазин нужен отдельный.** У магазина один ResultURL, поэтому один магазин
на два продукта не годится: уведомления об оплате десктопных ключей и
подписок доски пришли бы на один адрес и с общей нумерацией счетов.
Заведите второй магазин до первой тестовой оплаты.

Об оплате сервис узнаёт от Робокассы по этому адресу, а не от браузера
покупателя, — поэтому адрес должен быть доступен снаружи (шаг 9 это и даёт).

## Шаг 11. Проверить `[браузер]`

1. Открыть `https://board.school-pi.online` — главная с кнопками «ВОЙТИ»
   и «ЗАРЕГИСТРИРОВАТЬСЯ».
2. Зарегистрироваться → письмо со ссылкой → подтвердить → войти.
   Письмо не пришло — смотрите `journalctl -u schoolpiboard`: там будет
   либо ошибка SMTP, либо само письмо, если пароль приложения не задан.
3. Взять пробные 7 дней, создать доску.
4. Создать ссылку-приглашение, открыть её во втором браузере под другим
   пользователем — оба должны видеть друг друга в списке участников.
   Это заодно проверяет, что WebSocket через nginx поднялся.
5. Тестовая оплата при `Payments__IsTest=true`. После успешной —
   поменять на `Payments__IsTest=false` в `/etc/schoolpiboard.env`
   и `sudo systemctl restart schoolpiboard`.

---

## Обновление

Пуш в репозиторий → GitHub Actions собирает → на сервере три команды:

```bash
cd /tmp && rm -f ob.tar.gz
curl -sL -o ob.tar.gz https://github.com/pootymoty/schoolpiboard_online/releases/download/online-board-latest/online-board.tar.gz
sudo tar -xzf ob.tar.gz -C /var/www/schoolpiboard && sudo chown -R www-data:www-data /var/www/schoolpiboard
sudo systemctl restart schoolpiboard
```

Основной сайт при этом не трогается: перезапускается только служба доски,
nginx продолжает работать.

Если в обновлении есть новые скрипты схемы, они применятся при старте сами.
Старые файлы `tar` перезаписывает, но не удаляет — если нужно начисто,
перед распаковкой сделайте `sudo rm -rf /var/www/schoolpiboard/api/*`
(службу при этом остановите).
