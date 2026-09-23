# Current checkpoint — 2026-09-23

## User constraints
- Russian, concise. No Antigravity in this session.
- No direct SSH edits to production. Code via GitHub; user runs pull/rebuild.
- Computer Use IS allowed when actively needed. Do not leave blocking dialogs open or steal focus while doing unrelated code work.
- Reuse the existing n8n workflow and browser tab; no duplicates, no unnecessary reloads. No homemade emoji picker.

## Completed and live
- Public repository: Andzdes/Oura-ring, master.
- Server: https://oura.8n8n.online/oura-status, Docker on gateway-net with alias oura-status-bot; persistent bot-data. Caddy configured by user. Local service stopped; PC no longer required.
- Telegram webhook and BotFather Main App URL point to server. Permission confirmed by real setUserEmojiStatus. /start Connect, /sleep and /awake native custom emoji capture with contextual Cancel; /settings renders saved custom emoji via entities.
- User ran server pull/rebuild after 52281c8 and explicitly confirmed correct pack icons. Task12 Done. Task11 Done.
- Protected POST /api/oura handles {userId,kind,data}; header X-Oura-Bridge-Secret uses existing TELEGRAM_WEBHOOK_SECRET. Inference and state persistence in oura-state.mjs / telegram-chat.mjs. Sources: heart-rate sleep vs awake/workout/live; recent movement, completed sleep/workout indicate awake. Ambiguous or older than90min retains previous status. Duplicate/older observations ignored.
- Existing n8n workflow Oura Ring OSdcjaQzj3Bl0n19: published Oura to Telegram status, fifteen nodes. Poll Oura Every30Minutes -> Check Latest Heart Rate -> Update Telegram From Heart Rate. Summarize Oura Event -> Update Telegram From Event. Both use encrypted Oura Status Bridge credential, created using existing server secret. All original signature verification and OAuth nodes preserved.
- Test81861 actual latest heart rate -> bridge succeeded, stale measurement caused no change. Test81862 synthetic signed webhook referencing real activity record -> complete published pipeline succeeded, historical observation caused no change. Separate controlled synthetic sleep -> awake bridge requests changed actual Telegram custom status; getChat matched both saved IDs. End state awake. Natural sleep transition not observed in this session.
- All relevant tests passed, Docker build passed. Last new source work is workflow generator connectTelegram helper and tests, plus documentation; these do not need another server rebuild.

## Task / maintenance
Task4 ready to mark Done after final commit. Prior tasks1-12 otherwise Done. Oura subscriptions expire2026-12-22; automatic renewal is not implemented and should be tracked separately. Classification remains approximate and depends on Oura cloud synchronization, which user accepts.

## UI / secrets
Chrome original tab944051178 browser2, URL /workflow/OSdcjaQzj3Bl0n19/executions/81862. Kept as deliverable. No modal left open. Do not download another backup (native Save As blocked browser earlier).
CUA globals flowTab, flowPw same tab. Native sky loaded in node_repl; Chrome1051816, Telegram main200228. No need for further UI work now.
Private values are in ignored local.env and D:/Documents/API_Keys; never print or commit them. Local.env PUBLIC_APP_URL still old Tailscale address; production.env is correct. User settings local private directory contains Telegram userID and chosen IDs. Local Tailscale Funnel route remains but is unused by the bot.
