# Telegram emoji-status prototype

Bot: `@andrey_service_bot` (8321103180). Token remains outside the repo at `D:/Documents/API_Keys/Telegram-my-service-bot.txt`.

BotFather Main App enabled via its existing Telegram Desktop Mini App window. `getMe` confirms `has_main_web_app=true`. Menu button configured with Bot API and verified using `getChatMenuButton`: `Статус Oura`.

Both launch `https://pc-rtx4060.tail30e8c8.ts.net:8443/oura-status`. The page calls Telegram.WebApp.requestEmojiStatusAccess only after a button click. No bot token or health data is served. Existing Tailscale routes preserved; only /oura-status added on port 8443, proxied to 127.0.0.1:8766.

Temporary hosting: `node scripts/serve-telegram-miniapp.mjs`, currently running in exec session 7533. Depends on this computer and process; not installed as a persistent service. Server serves only the bundled HTML, not arbitrary files. External HTTPS GET verified 200. HTML script and server syntax checked.

Next user step: open https://t.me/andrey_service_bot?startapp and click the permission button, then approve Telegram's native dialog. Permission has NOT yet been granted or verified. Main App configuration alone does not authorize status updates. Afterwards obtain user ID, choose two custom emoji IDs, and test setUserEmojiStatus before connecting approximate Oura state.

References: https://core.telegram.org/bots/webapps#initializing-mini-apps and https://core.telegram.org/bots/api#setuseremojistatus.

## Emoji selection (task 3)

The existing Mini App now has separate sleep/awake choices, real Telegram thumbnails, a quick selection (12 matching emoji from RestrictedEmoji), a button loading all 997 items in that pack, and loading any custom-emoji pack by name or t.me/addemoji link. EmojiStatus is only one pack with 93 items, not Telegram's total catalog.

POST /oura-status/api/catalog loads choices and saved preferences. POST /oura-status/api/preferences saves both selections. Both verify Telegram initData HMAC and auth_date (24h maximum age). User identity comes only from signed data. Custom IDs are verified with getCustomEmojiStickers. Preferences are private per-user JSON files in D:/Documents/API_Keys/oura-telegram-users, atomically replaced. The bot token never goes to the page. Thumbnail bytes are proxied through /oura-status/api/image/:id, only for known Telegram stickers.

Run node scripts/test-telegram-miniapp.mjs. Verified auth/tampering/expiry, invalid emoji rejection, per-user save/reload/isolation, replacement and JS syntax. Public HTTPS page, signed synthetic catalog request and thumbnail download all returned 200. No real user preferences or emoji-status permission confirmed yet. Saving preferences does not call setUserEmojiStatus. Next stage: user chooses two statuses and grants permission, then test Bot API status switching and connect existing n8n workflow.

Server exec session is now 93757 (port 8766). Tailscale strips the mounted prefix; server accepts both prefixed local and stripped proxy routes. Still temporary PC hosting.

Task5: permission button now remains disabled after granted=true and reads 'Смена статуса разрешена'. Each opening calls requestEmojiStatusAccess to obtain a fresh native result; Telegram may show its permission dialog when access is absent. No separate read-only permission getter exists in the Mini App API. No stale local permission cache. Regression: node scripts/test-telegram-permission.mjs (granted, reopening, denied), plus existing integration tests pass; public HTML fix verified200.

Task6: state buttons open a full emoji dialog directly (all997 RestrictedEmoji items); quick subset removed from UI. Other packs load inside the dialog. Telegram does not expose its native global emoji picker to Mini Apps, so this is an in-app palette, not access to every custom pack ever published.

## Native Telegram picker research (task 7)

User rejected the homemade palette. Removed its HTML, CSS, grid, pack picker and client-side selection code from the live Mini App. Existing private preferences and backend validation retained. No replacement selector implemented yet.

Official deep-link docs explicitly list tg://settings/emoji-status and tg://chats/emoji-status for opening Telegram's own status picker: https://core.telegram.org/api/links#settings-links and https://core.telegram.org/api/links#chat-list-links . Client support and launching this from the Mini App remain unverified; these are tg: links, not documented t.me equivalents. They change the user's current status and do not provide a callback returning a selection to the Mini App.

The official Mini App SDK https://telegram.org/js/telegram-web-app.js exposes setEmojiStatus with an already-known custom_emoji_id, not a picker returning an ID. Native bridge specification agrees: https://core.telegram.org/api/web-events#web-app-set-emoji-status . Thus opening a status picker and receiving a chosen ID are separate problems; earlier blanket claim that the native picker cannot be opened was too broad.

Two documented building blocks for completing setup without a custom palette: (1) user selects their actual current status in native Telegram, then backend getChat reads emoji_status_custom_emoji_id; this temporarily changes the real profile status, and requires verifying access to the private chat; (2) user sends a custom emoji from the native chat palette to the bot, which receives MessageEntity.custom_emoji_id. Sources: https://core.telegram.org/bots/api#chatfullinfo and https://core.telegram.org/bots/api#messageentity . Neither flow implemented or represented as tested.

## Chat-first setup (task 7 implemented)

/start (also /connect) replies: «Разреши боту менять твой эмодзи-статус.» with one Connect web_app button. /sleep and /awake ask for one custom emoji from Telegram's native chat palette, validate its MessageEntity.custom_emoji_id through getCustomEmojiStickers and store it in the existing per-user JSON. /settings shows selections; /cancel cancels pending selection. Pending state survives restart. Private-chat identity checked; last processed update ID suppresses duplicate deliveries. No homemade picker.

Mini App now contains only permission text/button. After native approval it POSTs signed initData to /api/access, backend records accessReportedAt and sends chat instructions once, then page closes. This timestamp records a client report, not an independent Bot API authorization probe. Telegram itself enforces actual rights at setUserEmojiStatus time.

Live webhook: https://pc-rtx4060.tail30e8c8.ts.net:8443/oura-status/telegram-webhook. Secret header configured with setWebhook; secret file D:/Documents/API_Keys/oura-telegram-webhook.json outside Git. Previous webhook was empty. allowed_updates=message; max_connections=1. Menu changed from Mini App to commands; setMyCommands registered start/sleep/awake/settings/cancel. Existing n8n workflow untouched.

Server session56228 replaces93757. Still depends on this PC/Tailscale. Real Telegram update processed (lastUpdateId211680116 observed) and accessReportedAt recorded. No sleep/awake emoji selected yet. Unsigned public webhook returns401. Tests: node scripts/test-telegram-chat.mjs, test-telegram-miniapp.mjs and test-telegram-permission.mjs all pass. Next task4 connects Oura to actual Telegram status switching; not implemented yet.

Task8: cancel is now a contextual inline Cancel button on sleep/awake prompts, not a slash command. Command lists updated and verified in all configured scopes/languages. Selection tokens prevent stale cancellation. Callback queries enabled in webhook. Server session59722.

Task9 UX: already-approved access shows a stable 'Разрешение уже выдано' page. Approval through explicit button retains automatic close. /start for previously connected users omits Connect; tracked connection prompt is edited after approval. Server session73754.

## Server cutover verified

Public HTTPS health200 at https://oura.8n8n.online/oura-status/health. Existing sleep/awake custom emoji selections migrated through service-signed authenticated preferences request (one-time backend migration, not a captured Telegram session). Telegram webhook switched to https://oura.8n8n.online/oura-status/telegram-webhook with same secret, allowed_updates message/callback_query. BotFather Main App URL edited via native UI and reopened to verify saved URL. Actual user /settings sent via Telegram Desktop at01:57 returned both migrated choices from server. getChat confirmed current status matched saved awake emoji; idempotent setUserEmojiStatus returnedtrue. Local server73754 stopped after server reply confirmed.

Task1 markedDone: latest real Oura execution81856 at01:21:49 succeeded, multiple earlier successes. Task4 still needed: approximate state inference and server-side status action connected to existing n8n workflow. Task11 persistent gateway-net Compose changes tested locally and ready for user git pull/rebuild; no SSH edits performed. Old server Compose manual network attachment survives only until container recreation.
