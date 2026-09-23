# Oura → Telegram status

Telegram bot settings run in chat: `/start`, `/sleep`, `/awake`, `/settings`.
The Mini App is only for native emoji-status permission. Oura-to-status automation
is not connected yet. Oura webhook processing remains in the existing n8n workflow.

## Server deployment from Git

Requires Git, Docker Compose and an existing HTTPS reverse proxy. No source files
are copied manually; the server builds directly from the Git checkout.

```sh
git clone https://github.com/Andzdes/Oura-ring.git
cd Oura-ring
```

Create the server's `.env` using `.env.example` as the template. Set the existing
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `PUBLIC_APP_URL`.
Protect it with `chmod 600 .env`. Docker Compose reads it at runtime.
`.env` is excluded from Git and the image build. Do not generate a new bot token.

```sh
docker compose up -d --build
docker compose ps
docker compose exec oura-bot node -e "fetch('http://127.0.0.1:8766/health').then(r=>r.text()).then(console.log)"
```

The container joins the existing external Docker network `gateway-net` with alias `oura-status-bot`, without publishing host ports. Configure the existing reverse proxy for
the public `/oura-status` path. Register the new Telegram webhook at
`PUBLIC_APP_URL/telegram-webhook` with the existing secret and allowed updates
`message`, `callback_query`. Update the BotFather Main App URL too. Switch the
webhook only after HTTPS and health checks pass. Telegram supports webhook ports
443, 80, 88 and 8443.

Before switching, migrate the existing private user JSON files into the `bot-data`
volume so emoji choices and connection state survive. Deployment is incomplete
until that migration and Telegram URL switch are done.

## Updates

```sh
git pull --ff-only
docker compose up -d --build
docker compose ps
```

The named volume preserves settings across rebuilds. Do not use `down -v`.
For rollback, check out the previous deployed commit and rebuild. No CI/CD required.

## Checks

```sh
node scripts/test-telegram-chat.mjs
node scripts/test-telegram-miniapp.mjs
node scripts/test-telegram-permission.mjs
node scripts/test-oura-workflow.mjs
```

The local Windows entrypoint still defaults to the existing private key-file paths.
Server `.env` overrides them using environment variables; secrets never enter the
image. To run directly with Node24: `node --env-file=.env scripts/serve-telegram-miniapp.mjs`.
For direct Linux startup also set `DATA_DIR` to a writable persistent directory.

## Caddy on 8n8n.online

Public app: https://oura.8n8n.online/oura-status. Existing Caddy route uses reverse_proxy oura-status-bot:8766 and imports security_headers. After server rebuild, run docker compose exec oura-bot node scripts/configure-telegram.mjs only if intentionally switching the webhook. It verifies public HTTPS health before changing delivery. BotFather Main App URL must match PUBLIC_APP_URL.
