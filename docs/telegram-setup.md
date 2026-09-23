# Telegram emoji-status prototype

Bot: `@andrey_service_bot` (8321103180). Token remains outside the repo at `D:/Documents/API_Keys/Telegram-my-service-bot.txt`.

BotFather Main App enabled via its existing Telegram Desktop Mini App window. `getMe` confirms `has_main_web_app=true`. Menu button configured with Bot API and verified using `getChatMenuButton`: `Статус Oura`.

Both launch `https://pc-rtx4060.tail30e8c8.ts.net:8443/oura-status`. The page calls Telegram.WebApp.requestEmojiStatusAccess only after a button click. No bot token or health data is served. Existing Tailscale routes preserved; only /oura-status added on port 8443, proxied to 127.0.0.1:8766.

Temporary hosting: `node scripts/serve-telegram-miniapp.mjs`, currently running in exec session 7533. Depends on this computer and process; not installed as a persistent service. Server serves only the bundled HTML, not arbitrary files. External HTTPS GET verified 200. HTML script and server syntax checked.

Next user step: open https://t.me/andrey_service_bot?startapp and click the permission button, then approve Telegram's native dialog. Permission has NOT yet been granted or verified. Main App configuration alone does not authorize status updates. Afterwards obtain user ID, choose two custom emoji IDs, and test setUserEmojiStatus before connecting approximate Oura state.

References: https://core.telegram.org/bots/webapps#initializing-mini-apps and https://core.telegram.org/bots/api#setuseremojistatus.
