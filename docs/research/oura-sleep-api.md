# Oura API V2: сон, синхронизация, авторизация

Проверено 2026-09-22 только по официальной документации Oura. Основной источник — [опубликованная OpenAPI-спецификация V2](https://cloud.ouraring.com/v2/static/json/openapi-1.40.json) (страница [V2 Docs](https://cloud.ouraring.com/v2/docs)).

## Подтверждено

- Единственная доступная точка интеграции — V2; V1 закрыт. Доступ к пользовательским данным требует OAuth2 access token в `Authorization: Bearer …`. В V2 также прямо сказано: **personal access tokens deprecated в декабре 2025 и больше не доступны**.
- OAuth authorization-code flow использует `https://cloud.ouraring.com/oauth/authorize` и `https://api.ouraring.com/oauth/token`; зарегистрированное redirect URI должно совпасть с redirect URI запроса. Подробности: [Authentication](https://cloud.ouraring.com/docs/authentication), [OpenAPI security schemes](https://cloud.ouraring.com/v2/static/json/openapi-1.40.json).
- `GET /v2/usercollection/sleep` возвращает законченные записи сна. В них есть `bedtime_start`, `bedtime_end`, длительности, а `sleep_phase_30_sec` кодирует каждые 30 секунд: `1` deep, `2` light, `3` REM, `4` awake. Это позволяет восстановить интервалы бодрствования **в готовой записи**, а не получить текущий статус.
- `GET /v2/usercollection/sleep_time` возвращает рекомендацию времени сна: `optimal_bedtime`, `recommendation`, `status`; это не факт текущего сна.
- Webhook-подписки поддерживают типы данных `sleep` и `sleep_time` и события `create`, `update`, `delete`. Управление: `GET/POST /v2/webhook/subscription`, `GET/PUT/DELETE /v2/webhook/subscription/{id}`, `PUT /v2/webhook/subscription/renew/{id}`. Для этих маршрутов нужны одновременно `x-client-id` и `x-client-secret`; для создания нужны `callback_url`, `verification_token`, `event_type`, `data_type`.
- Oura рекомендует первичную загрузку истории, затем webhooks; уведомления поступают примерно через 30 секунд **после синхронизации с мобильным приложением**. Документация отдельно говорит, что данные сна требуют открытия Oura app для синхронизации.

## Выводы с ограничением

- В опубликованной V2 OpenAPI нет endpoint или webhook data type, описанного как текущий/live `asleep`/`awake`; есть лишь готовые sleep-записи и их 30-секундные фазы. Поэтому live-индикатор нельзя считать доступным по документированному API. Последняя запись описывает прошлое; отсутствие новой записи не означает бодрствование. Текущее состояние следует считать неизвестным.
- Client ID и Client Secret приложения не заменяют access token для `/v2/usercollection/*`: эти endpoints требуют Bearer/OAuth2. Они годятся для управления webhook-подписками, но webhook всё равно требует публичный callback и не устраняет задержку до синхронизации приложения.
- Для однопользовательского локального прототипа нужен OAuth-flow с разрешённым redirect URI. Предоставленный файл содержит только Client ID и Client Secret; пользовательский access token не получен. Единственный callback в просмотренных настройках ведёт на production n8n. По просьбе пользователя production не трогали, авторизацию не запускали, настройки приложения не меняли. Позднее можно рассмотреть отдельный local callback.

## Практический выбор

1. Нужны точные интервалы сна после синхронизации: OAuth access token → `sleep` → разбор `sleep_phase_30_sec`.
2. Нужны обновления без опроса: зарегистрировать webhook `sleep` для нужных операций и после события запросить запись; заложить задержку sync.
3. Нужен настоящий live asleep/awake: подтверждённого публичного API-механизма не найдено; не строить функцию на таком обещании.

## Первый эксперимент: 2026-09-22

После разрешения пользователя использовать открытый n8n проверено существующее
подключение `Oura Ring` в workflow `Oura Ring` (папка `Experiments`).
Первый GET завершился `EAUTH`; повторное OAuth-подключение с прежними scopes
восстановило доступ. Секреты не копировались в репозиторий.

Изолированный узел `HTTP Request1` переключён с `daily_activity` на `sleep`.
Запрос истории с `start_date=2020-01-01&end_date=2026-09-24` успешно вернул
563 записи и `next_token=null`. Ответ скачан через интерфейс n8n в локальный
`D:\Downloads\HTTP_Request1.json`; медицинские данные в Git не включены.
Последняя запись определена сортировкой всех записей по `bedtime_end`.

В узле оставлен успешно выполненный компактный запрос:
`GET https://api.ouraring.com/v2/usercollection/sleep?start_date=2026-08-19&end_date=2026-09-24`.
Это фиксированный диапазон эксперимента, не автоматический мониторинг.
Workflow не публиковался; webhook-ветки и конфигурация сервера не менялись.
Следующий шаг — синхронизация кольца в мобильном приложении и повторный GET,
чтобы проверить свежесть данных. Доступ к истории подтверждён;
текущее состояние сна и задержка его определения ещё не установлены.

## Ссылки

- [Oura API V2 OpenAPI 1.40](https://cloud.ouraring.com/v2/static/json/openapi-1.40.json)
- [Oura API V2 Docs](https://cloud.ouraring.com/v2/docs)
- [OAuth2 authentication](https://cloud.ouraring.com/docs/authentication)
- [Getting started / статус V1](https://cloud.ouraring.com/docs/)
- [Oura API Agreement](https://cloud.ouraring.com/legal/api-agreement)
