import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// region chat-settings
export function makeChatBot({api, directory, appUrl}) {
  const queues=new Map();
  const send=(userId,text,extra={})=>api('sendMessage',{chat_id:userId,text,...extra});
  async function clearPending(userId,settings){
    if(settings.pendingPrompt)await api('editMessageReplyMarkup',{chat_id:userId,message_id:settings.pendingPrompt,reply_markup:{inline_keyboard:[]}}).catch(()=>{});
    delete settings.pending;delete settings.pendingToken;delete settings.pendingPrompt;
  }
  async function withUser(userId,action){
    const previous=queues.get(userId)||Promise.resolve();
    const next=previous.catch(()=>{}).then(async()=>{
      let settings;
      try{settings=JSON.parse(await readFile(join(directory,`${userId}.json`),'utf8'));}
      catch(error){if(error.code!=='ENOENT')throw error;settings={userId};}
      const save=async()=>{
        await mkdir(directory,{recursive:true});
        const temporary=join(directory,`${userId}.${randomUUID()}.tmp`);
        await writeFile(temporary,JSON.stringify({...settings,updatedAt:new Date().toISOString()},null,2));
        await rename(temporary,join(directory,`${userId}.json`));
      };
      return action(settings,save);
    });
    queues.set(userId,next);
    try{return await next;}finally{if(queues.get(userId)===next)queues.delete(userId);}
  }
  async function handle(update){
    const callback=update.callback_query;
    if(callback){
      if(callback.message?.chat?.type!=='private'||callback.from?.id!==callback.message.chat.id)return;
      return withUser(callback.from.id,async(settings,save)=>{
        const matches=settings.pending && callback.data===`cancel:${settings.pendingToken}`;
        await api('answerCallbackQuery',{callback_query_id:callback.id,text:matches?'Выбор отменён.':'Этот выбор уже завершён.'});
        if(matches){await clearPending(callback.from.id,settings);await save();}
      });
    }
    const message=update.message;
    if(message?.chat?.type!=='private'||message.from?.is_bot||message.from?.id!==message.chat.id)return;
    const userId=message.from.id;
    return withUser(userId,async(settings,save)=>{
      if(Number.isInteger(settings.lastUpdateId)&&update.update_id<=settings.lastUpdateId)return;
      const text=message.text||'';
      const command=text.match(/^\/(start|connect|sleep|awake|settings)(?:@[A-Za-z0-9_]+)?(?:\s|$)/)?.[1];
      if(command==='start'||command==='connect'){
        await clearPending(userId,settings);
        if(settings.accessReportedAt && command==='start'){
          await send(userId,'Подключено.\n/sleep — эмодзи для сна\n/awake — эмодзи для бодрствования');
        }else{
          const prompt=await send(userId,'Разреши боту менять твой эмодзи-статус.',{reply_markup:{inline_keyboard:[[{text:'Connect',web_app:{url:appUrl}}]]}});
          settings.connectPrompt=prompt.message_id;
        }
      }else if(command==='sleep'||command==='awake'){
        await clearPending(userId,settings);
        settings.pending=command;
        settings.pendingToken=randomUUID();
        const prompt=await send(userId,command==='sleep'?'Отправь эмодзи для сна.':'Отправь эмодзи для бодрствования.',{reply_markup:{inline_keyboard:[[{text:'Cancel',callback_data:`cancel:${settings.pendingToken}`}]]}});
        settings.pendingPrompt=prompt.message_id;
      }else if(command==='settings'){
        let summary='';
        const entities=[];
        for(const [state,label] of [['sleep','Сон'],['awake','Бодрствование']]){
          summary+=`${label}: `;
          const choice=settings[state];
          const emoji=choice?.emoji||'🙂';
          if(choice?.id)entities.push({type:'custom_emoji',offset:summary.length,length:emoji.length,custom_emoji_id:choice.id});
          summary+=(choice?.id?emoji:'не выбран')+'\n';
        }
        await send(userId,summary+'\n/sleep — выбрать для сна\n/awake — выбрать для бодрствования',{entities});
      }else if(text.startsWith('/')){
        await send(userId,'/sleep — эмодзи для сна\n/awake — эмодзи для бодрствования\n/settings — настройки');
      }else if(settings.pending){
        const entities=(message.entities||[]).filter(e=>e.type==='custom_emoji');
        if(entities.length!==1){
          await send(userId,'Отправь один кастомный эмодзи из палитры Telegram.');
        }else{
          const entity=entities[0];
          const stickers=await api('getCustomEmojiStickers',{custom_emoji_ids:[entity.custom_emoji_id]});
          const sticker=stickers.find(s=>s.custom_emoji_id===entity.custom_emoji_id);
          if(!sticker){await send(userId,'Этот эмодзи недоступен. Отправь другой.');}
          else{
            const state=settings.pending;
            settings[state]={id:entity.custom_emoji_id,emoji:sticker.emoji||text.slice(entity.offset,entity.offset+entity.length),image:null};
            await clearPending(userId,settings);
            await send(userId,state==='sleep'?'Эмодзи для сна сохранён.':'Эмодзи для бодрствования сохранён.');
          }
        }
      }else{await send(userId,'/sleep — выбрать эмодзи для сна\n/awake — выбрать эмодзи для бодрствования');}
      settings.lastUpdateId=update.update_id;await save();
    });
  }
  async function confirmAccess(userId){
    return withUser(userId,async(settings,save)=>{
      // Client reports native approval; actual Telegram authorization remains enforced by Bot API.
      if(!settings.accessReportedAt)await send(userId,'Подключено.\n/sleep — выбрать эмодзи для сна\n/awake — выбрать эмодзи для бодрствования');
      if(settings.connectPrompt){
        await api('editMessageText',{chat_id:userId,message_id:settings.connectPrompt,text:'Подключено.',reply_markup:{inline_keyboard:[]}}).catch(()=>{});
        delete settings.connectPrompt;
      }
      settings.accessReportedAt=new Date().toISOString();await save();
    });
  }
  async function applyState(userId, observation){
    return withUser(userId,async(settings,save)=>{
      if(!observation)return {ok:true,applied:false,reason:'no_recent_observation'};
      const previous=settings.ouraStatus;
      if(previous && Date.parse(observation.observedAt)<Date.parse(previous.observedAt))return {ok:true,applied:false,reason:'older_observation'};
      const emojiId=settings[observation.state]?.id;
      if(!emojiId)return {ok:true,applied:false,reason:'emoji_not_selected'};
      const changed=previous?.emojiId!==emojiId;
      if(changed)await api('setUserEmojiStatus',{user_id:userId,emoji_status_custom_emoji_id:emojiId});
      settings.ouraStatus={...observation,emojiId};
      await save();
      return {ok:true,applied:changed,state:observation.state,observedAt:observation.observedAt,reason:changed?'updated':'unchanged'};
    });
  }
  return {handle,confirmAccess,applyState};
}
// endregion chat-settings
