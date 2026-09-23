import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
const html=await readFile(new URL('../web/telegram-status.html',import.meta.url),'utf8');
const code=html.split('// #region permission-flow')[1].split('// #endregion permission-flow')[0];
function open(granted){
 const button={disabled:true,textContent:''}, result={textContent:''};let requests=0;
 const app={initData:'signed-data',isVersionAtLeast:()=>true,ready(){},expand(){},requestEmojiStatusAccess(cb){requests++;cb(granted);}};
 runInNewContext(code,{app,el:()=>button,result,load(){}});
 return {button,result,requests};
}
for(let i=0;i<2;i++){const s=open(true);assert.equal(s.button.disabled,true,'Already granted access must disable the button on every opening');assert.equal(s.button.textContent,'Смена статуса разрешена');}
const denied=open(false);assert.equal(denied.button.disabled,false);assert.equal(denied.button.textContent,'Разрешить смену статуса');
console.log('PASS permission granted/reopened/denied');
// region no-flash-regression
let closed=0;
const elements=new Map();
const element=id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);};
runInNewContext(code,{app:{initData:'signed',isVersionAtLeast:()=>true,ready(){},expand(){},close(){closed++;},requestEmojiStatusAccess(callback){callback(true);}},el:element,result:{},fetch:async()=>({ok:true})});
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(closed,0,'Permission confirmation must not close the window automatically');
assert.equal(element('return').hidden,false);
element('return').onclick();assert.equal(closed,1);
console.log('PASS no automatic close; explicit return closes window');
// endregion no-flash-regression
