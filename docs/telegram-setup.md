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
