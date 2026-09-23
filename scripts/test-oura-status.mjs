import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inferOuraState } from './oura-state.mjs';
import { makeServer } from './serve-telegram-miniapp.mjs';

// region integration-tests
const now=Date.now();
const at=minutes=>new Date(now-minutes*60000).toISOString();
const hr=(source,minutes=0)=>({data:[{source,timestamp:at(minutes)}]});
assert.equal(inferOuraState('heartrate',hr('sleep'),now).state,'sleep');
assert.equal(inferOuraState('heartrate',hr('awake'),now).state,'awake');
assert.equal(inferOuraState('heartrate',hr('rest'),now),null);
assert.equal(inferOuraState('heartrate',hr('sleep',120),now),null);
assert.equal(inferOuraState('heartrate',hr('awake',-5),now),null);
assert.equal(inferOuraState('sleep',{bedtime_end:at(10)},now).state,'awake');
assert.equal(inferOuraState('workout',{end_datetime:at(10)},now).state,'awake');
assert.equal(inferOuraState('daily_activity',{timestamp:at(20),class_5_min:'12321'},now).observedAt,at(10));
const directory=await mkdtemp(join(tmpdir(),'oura-status-test-'));
await writeFile(join(directory,'123.json'),JSON.stringify({userId:123,sleep:{id:'11'},awake:{id:'22'},pending:'sleep'}));
let calls=[],fail=false;
const api=async(method,body)=>{if(fail)throw new Error('telegram');calls.push({method,body});return true;};
let server=makeServer({token:'test',directory,api,webhookSecret:'secret'});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const post=(body,secret='secret')=>fetch(`http://127.0.0.1:${server.address().port}/oura-status/api/oura`,{method:'POST',headers:{'Content-Type':'application/json','X-Oura-Bridge-Secret':secret},body:JSON.stringify(body)});
const event=(source,minutes=0)=>({userId:123,kind:'heartrate',data:hr(source,minutes)});
try{
  assert.equal((await post(event('sleep'),'wrong')).status,401);
  assert.equal((await post({...event('sleep'),userId:'../123'})).status,400);
  assert.equal((await (await post(event('sleep',10))).json()).applied,true);
  assert.deepEqual(calls[0],{method:'setUserEmojiStatus',body:{user_id:123,emoji_status_custom_emoji_id:'11'}});
  assert.equal((await (await post(event('sleep',10))).json()).reason,'unchanged');
  assert.equal((await (await post(event('awake',20))).json()).reason,'older_observation');
  assert.equal((await (await post(event('awake',120))).json()).reason,'no_recent_observation');
  assert.equal(calls.length,1);
  fail=true;
  assert.equal((await post(event('awake',5))).status,502);
  fail=false;
  assert.equal((await (await post(event('awake',5))).json()).applied,true);
  assert.equal(calls.at(-1).body.emoji_status_custom_emoji_id,'22');
  assert.equal(JSON.parse(await readFile(join(directory,'123.json'),'utf8')).pending,'sleep');
  await new Promise(r=>server.close(r));
  server=makeServer({token:'test',directory,api,webhookSecret:'secret'});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  assert.equal((await (await post(event('awake',5))).json()).reason,'unchanged');
  assert.equal((await (await post({...event('awake'),userId:456})).json()).reason,'emoji_not_selected');
  console.log('PASS: inference, freshness, authentication, saved emoji, dedup across restart, retry after API failure, user isolation');
}finally{await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true});}
// endregion integration-tests
