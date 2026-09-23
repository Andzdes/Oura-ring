import { createServer } from 'node:http';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeChatBot } from './telegram-chat.mjs';
import { inferOuraState } from './oura-state.mjs';

// region telegram-auth
export function validateInitData(raw, token, now = Date.now()) {
  const params = new URLSearchParams(raw);
  if ([...params.keys()].some(k => params.getAll(k).length !== 1)) throw new Error('auth');
  const hash = params.get('hash') || '';
  params.delete('hash');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const check = [...params].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${k}=${v}`).join('\n');
  const expected = createHmac('sha256', secret).update(check).digest();
  if (!/^[a-f0-9]{64}$/i.test(hash) || !timingSafeEqual(expected, Buffer.from(hash, 'hex'))) throw new Error('auth');
  const age = now / 1000 - Number(params.get('auth_date'));
  if (!Number.isFinite(age) || age < -60 || age > 86400) throw new Error('auth');
  const user = JSON.parse(params.get('user') || 'null');
  if (!Number.isSafeInteger(user?.id) || user.id <= 0) throw new Error('auth');
  return user.id;
}
// endregion telegram-auth

// region miniapp-server
export function makeServer({ token, directory, api, fileDownload, webhookSecret, appUrl='https://pc-rtx4060.tail30e8c8.ts.net:8443/oura-status' }) {
  const stickers = new Map(), packs = new Map(), images = new Map();
  const favorites = new Set(['😴','💤','🌙','🛌','🥱','☀️','🌞','👀','🙂','😀','💻','☕','🚶','🏃','💪','🟢']);
  const call = api || (async (method, body) => {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!data.ok) throw new Error('telegram');
    return data.result;
  });
  const describe = s => ({ id:s.custom_emoji_id, emoji:s.emoji || '◇', image:s.thumbnail ? `/oura-status/api/image/${s.custom_emoji_id}` : null });
  const bot=makeChatBot({api:call,directory,appUrl});
  async function pack(name) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) throw new Error('pack');
    if (!packs.has(name)) {
      const value = await call('getStickerSet', {name});
      if (value.sticker_type !== 'custom_emoji') throw new Error('pack');
      for (const s of value.stickers) stickers.set(s.custom_emoji_id, s);
      if (packs.size >= 20) packs.delete(packs.keys().next().value);
      packs.set(name, value);
    }
    return packs.get(name);
  }
  async function load(userId) {
    try { return JSON.parse(await readFile(join(directory, `${userId}.json`), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  return createServer(async (request, response) => {
    const send = (code, data, type='application/json; charset=utf-8') => {
      response.writeHead(code, {'Content-Type':type, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
      response.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
    };
    try {
      const incoming = new URL(request.url, 'http://localhost').pathname;
      // Tailscale strips the mounted /oura-status prefix before proxying.
      const path = incoming.startsWith('/oura-status') ? incoming : `/oura-status${incoming}`;
      if(request.method==='GET' && path==='/oura-status/health')return send(200,{ok:true});
      if (request.method === 'GET' && ['/oura-status','/oura-status/'].includes(path)) return send(200, await readFile(new URL('../web/telegram-status.html', import.meta.url)), 'text/html; charset=utf-8');
      const imageId = path.match(/^\/oura-status\/api\/image\/([0-9]+)$/)?.[1];
      if (request.method === 'GET' && imageId) {
        const sticker = stickers.get(imageId);
        if (!sticker?.thumbnail) return send(404, {error:'Нет изображения'});
        if (!images.has(imageId)) {
          const file = await call('getFile', {file_id:sticker.thumbnail.file_id});
          const download = fileDownload ? await fileDownload(file.file_path) : await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, {signal:AbortSignal.timeout(15000)});
          if (!download.ok) throw new Error('telegram');
          if (images.size >= 1000) images.delete(images.keys().next().value);
          images.set(imageId, Buffer.from(await download.arrayBuffer()));
        }
        return send(200, images.get(imageId), 'image/webp');
      }
      const isWebhook=path==='/oura-status/telegram-webhook';
      const isOura=path==='/oura-status/api/oura';
      if (request.method !== 'POST' || !['/oura-status/api/catalog','/oura-status/api/preferences','/oura-status/api/access','/oura-status/api/oura','/oura-status/telegram-webhook'].includes(path)) return send(404, {error:'Не найдено'});
      if(isWebhook && (!webhookSecret || request.headers['x-telegram-bot-api-secret-token']!==webhookSecret))return send(401,{error:'Unauthorized'});
      if(isOura){
        const supplied=Buffer.from(request.headers['x-oura-bridge-secret']||'');
        const expected=Buffer.from(webhookSecret||'');
        if(!expected.length||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return send(401,{error:'Unauthorized'});
      }
      let raw = '';
      for await (const chunk of request) { raw += chunk; if (Buffer.byteLength(raw) > 32768) return send(413, {error:'Слишком большой запрос'}); }
      let body;
      try { body = JSON.parse(raw); } catch { return send(400, {error:'Некорректный запрос'}); }
      if(isWebhook){await bot.handle(body);return send(200,{ok:true});}
      if(isOura){
        if(!Number.isSafeInteger(body.userId)||body.userId<=0||!['heartrate','sleep','workout','daily_activity'].includes(body.kind)||!body.data||typeof body.data!=='object')return send(400,{error:'Invalid observation'});
        return send(200,await bot.applyState(body.userId,inferOuraState(body.kind,body.data)));
      }
      let userId;
      try { userId = validateInitData(body.initData, token); } catch { return send(401, {error:'Открой Mini App заново в Telegram.'}); }
      if(path.endsWith('/access')){await bot.confirmAccess(userId);return send(200,{ok:true});}
      if (path.endsWith('/catalog')) {
        const value = await pack(body.pack || 'RestrictedEmoji');
        const list = body.pack ? value.stickers : value.stickers.filter(s => favorites.has(s.emoji));
        const preferences = await load(userId);
        const missing = [preferences?.sleep?.id, preferences?.awake?.id].filter(id => id && !stickers.has(id));
        if (missing.length) for (const s of await call('getCustomEmojiStickers', {custom_emoji_ids:missing})) stickers.set(s.custom_emoji_id, s);
        return send(200, {title:body.pack ? value.title : 'Сон и бодрствование', items:list.map(describe), preferences});
      }
      const ids = [body.sleep, body.awake];
      if (ids.some(id => typeof id !== 'string' || !/^[0-9]{1,24}$/.test(id))) return send(400, {error:'Выбери оба эмодзи.'});
      const verified = await call('getCustomEmojiStickers', {custom_emoji_ids:[...new Set(ids)]});
      if (ids.some(id => !verified.some(s => s.custom_emoji_id === id))) return send(400, {error:'Эмодзи недоступен. Выбери другой.'});
      for (const s of verified) stickers.set(s.custom_emoji_id, s);
      const settings = {userId, sleep:describe(stickers.get(body.sleep)), awake:describe(stickers.get(body.awake)), updatedAt:new Date().toISOString()};
      await mkdir(directory, {recursive:true});
      const temporary = join(directory, `${userId}.${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify(settings, null, 2));
      await rename(temporary, join(directory, `${userId}.json`));
      return send(200, settings);
    } catch { if (!response.headersSent) send(502, {error:'Не удалось выполнить запрос. Попробуй ещё раз.'}); }
  });
}
// endregion miniapp-server

// region local-startup
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const text = process.env.TELEGRAM_BOT_TOKEN || await readFile(process.env.TELEGRAM_TOKEN_FILE || 'D:/Documents/API_Keys/Telegram-my-service-bot.txt', 'utf8');
  const token = text.match(/\d{6,}:[A-Za-z0-9_-]{25,}/)?.[0];
  if (!token) throw new Error('Bot token not found');
  const webhookSecret=process.env.TELEGRAM_WEBHOOK_SECRET || JSON.parse(await readFile(process.env.WEBHOOK_SECRET_FILE || 'D:/Documents/API_Keys/oura-telegram-webhook.json','utf8')).webhookSecret;
  if(!/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret))throw new Error('Invalid webhook secret');
  const server=makeServer({token,webhookSecret,directory:process.env.DATA_DIR || 'D:/Documents/API_Keys/oura-telegram-users',appUrl:process.env.PUBLIC_APP_URL});
  server.listen(Number(process.env.PORT || 8766),process.env.HOST || '127.0.0.1');
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
// endregion local-startup
