import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {makeChatBot} from './telegram-chat.mjs';
// region chat-flow-tests
const directory=await mkdtemp(join(tmpdir(),'oura-chat-test-'));
const sent=[];
const api=async(method,body)=>{if(method==='sendMessage'){sent.push(body);return true;}if(method==='getCustomEmojiStickers')return body.custom_emoji_ids.map(id=>({custom_emoji_id:id,emoji:'😴'}));throw new Error(method);};
let bot=makeChatBot({api,directory,appUrl:'https://example.test/oura-status'});
let update=0;
const message=(text,id=123,entities=[])=>({update_id:++update,message:{chat:{id,type:'private'},from:{id},text,entities}});
try{
 await bot.handle(message('/start'));assert.equal(sent.at(-1).reply_markup.inline_keyboard[0][0].text,'Connect');
 await bot.handle(message('/sleep'));
 await bot.handle(message('😴'));assert.match(sent.at(-1).text,/кастомный/);
 await bot.handle(message('😴',456,[{type:'custom_emoji',custom_emoji_id:'99',offset:0,length:2}]));
 assert.equal(JSON.parse(await readFile(join(directory,'456.json'))).sleep,undefined);
 const emoji=message('😴',123,[{type:'custom_emoji',custom_emoji_id:'99',offset:0,length:2}]);
 await bot.handle(emoji);assert.equal(JSON.parse(await readFile(join(directory,'123.json'))).sleep.id,'99');
 const count=sent.length;await bot.handle(emoji);assert.equal(sent.length,count);
 bot=makeChatBot({api,directory,appUrl:'https://example.test/oura-status'});
 await bot.handle(message('/awake'));await bot.handle(message('☀️',123,[{type:'custom_emoji',custom_emoji_id:'100',offset:0,length:2}]));
 await bot.confirmAccess(123);await bot.confirmAccess(123);
 const settings=JSON.parse(await readFile(join(directory,'123.json')));assert.equal(settings.awake.id,'100');assert.equal(settings.sleep.id,'99');assert.ok(settings.accessReportedAt);
 await bot.handle(message('/settings'));assert.match(sent.at(-1).text,/Сон:/);
 await bot.handle(message('/sleep'));await bot.handle(message('/cancel'));assert.equal(JSON.parse(await readFile(join(directory,'123.json'))).pending,undefined);
 console.log('PASS start/Connect, native custom emoji capture, user isolation, duplicate delivery, persistence, access confirmation, settings/cancel');
}finally{await rm(directory,{recursive:true,force:true});}
// endregion chat-flow-tests
