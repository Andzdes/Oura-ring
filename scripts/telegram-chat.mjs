import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// region chat-settings
export function makeChatBot({api, directory, appUrl}) {
  const queues=new Map();
  const send=(userId,text,extra={})=>api('sendMessage',{chat_id:userId,text,...extra});
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
    const message=update.message;
    if(message?.chat?.type!=='private'||message.from?.is_bot||message.from?.id!==message.chat.id)return;
    const userId=message.from.id;
    return withUser(userId,async(settings,save)=>{
      if(Number.isInteger(settings.lastUpdateId)&&update.update_id<=settings.lastUpdateId)return;
      const text=message.text||'';
      const command=text.match(/^\/(start|connect|sleep|awake|settings|cancel)(?:@[A-Za-z0-9_]+)?(?:\s|$)/)?.[1];
      if(command==='start'||command==='connect'){
        delete settings.pending;
        await send(userId,'Разреши боту менять твой эмодзи-статус.',{reply_markup:{inline_keyboard:[[{text:'Connect',web_app:{url:appUrl}}]]}});
      }else if(command==='sleep'||command==='awake'){
        settings.pending=command;
        await send(userId,command==='sleep'?'Отправь эмодзи для сна.':'Отправь эмодзи для бодрствования.');
      }else if(command==='cancel'){
        delete settings.pending;await send(userId,'Выбор отменён.');
      }else if(command==='settings'){
        await send(userId,`Сон: ${settings.sleep?.emoji||'не выбран'}\nБодрствование: ${settings.awake?.emoji||'не выбран'}\n\n/sleep — выбрать для сна\n/awake — выбрать для бодрствования`);
      }else if(text.startsWith('/')){
        await send(userId,'/sleep — эмодзи для сна\n/awake — эмодзи для бодрствования\n/settings — настройки');
      }else if(settings.pending){
        const entities=(message.entities||[]).filter(e=>e.type==='custom_emoji');
        if(entities.length!==1){
          await send(userId,'Отправь один кастомный эмодзи из палитры Telegram. /cancel — отмена.');
        }else{
          const entity=entities[0];
          const stickers=await api('getCustomEmojiStickers',{custom_emoji_ids:[entity.custom_emoji_id]});
          const sticker=stickers.find(s=>s.custom_emoji_id===entity.custom_emoji_id);
          if(!sticker){await send(userId,'Этот эмодзи недоступен. Отправь другой.');}
          else{
            const state=settings.pending;
            settings[state]={id:entity.custom_emoji_id,emoji:sticker.emoji||text.slice(entity.offset,entity.offset+entity.length),image:null};
            delete settings.pending;
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
      settings.accessReportedAt=new Date().toISOString();await save();
    });
  }
  return {handle,confirmAccess};
}
// endregion chat-settings
