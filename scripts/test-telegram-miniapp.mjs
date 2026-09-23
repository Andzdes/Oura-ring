import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeServer, validateInitData } from './serve-telegram-miniapp.mjs';

// #region integration-checks
const token = 'test-token';
function sign(id, age=0) {
  const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)-age),user:JSON.stringify({id}),signature:'example-signature'});
  const secret=createHmac('sha256','WebAppData').update(token).digest();
  p.set('hash',createHmac('sha256',secret).update([...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n')).digest('hex'));
  return p.toString();
}
assert.equal(validateInitData(sign(123),token),123);
assert.throws(()=>validateInitData(sign(123).replace('123','124'),token));
assert.throws(()=>validateInitData(sign(123,86410),token));
assert.throws(()=>validateInitData(sign(123,-120),token));
assert.throws(()=>validateInitData(sign(123)+'&user=duplicate',token));
const directory=await mkdtemp(join(tmpdir(),'oura-miniapp-test-'));
const stickers=[{custom_emoji_id:'11',emoji:'😴'},{custom_emoji_id:'22',emoji:'🌞'}];
const api=async(method,body)=>method==='getStickerSet'?{sticker_type:'custom_emoji',title:'Test',stickers}:stickers.filter(s=>body.custom_emoji_ids.includes(s.custom_emoji_id));
const server=makeServer({token,directory,api});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/oura-status/api/`;
const post=(route,body)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
try {
  assert.equal((await post('catalog',{})).status,401);
  assert.equal((await post('preferences',{initData:sign(123),sleep:'999',awake:'22'})).status,400);
  assert.equal((await post('preferences',{initData:sign(123),sleep:'11',awake:'22'})).status,200);
  assert.equal(JSON.parse(await readFile(join(directory,'123.json'),'utf8')).sleep.id,'11');
  assert.equal((await (await post('catalog',{initData:sign(123)})).json()).preferences.awake.id,'22');
  assert.equal((await (await post('catalog',{initData:sign(456)})).json()).preferences,null);
  assert.equal((await post('preferences',{initData:sign(123),sleep:'22',awake:'11'})).status,200);
  assert.equal(JSON.parse(await readFile(join(directory,'123.json'),'utf8')).awake.id,'11');
  const html=await readFile(new URL('../web/telegram-status.html',import.meta.url),'utf8');
  new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  console.log('PASS: signed auth, tampering/expiry rejection, emoji validation, save/reload, user isolation, HTML script syntax');
} finally { await new Promise(r=>server.close(r)); await rm(directory,{recursive:true,force:true}); }
// #endregion integration-checks
