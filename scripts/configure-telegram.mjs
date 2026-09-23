// region configure-webhook
// Explicit operator action: switches Telegram delivery to this deployment.
const token=process.env.TELEGRAM_BOT_TOKEN;
const secret=process.env.TELEGRAM_WEBHOOK_SECRET;
const rawUrl=process.env.PUBLIC_APP_URL;
if(!token || !secret || !rawUrl)throw new Error('Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and PUBLIC_APP_URL in .env');
const url=new URL(rawUrl);
if(url.protocol!=='https:' || url.pathname.replace(/\/$/,'')!=='/oura-status' || url.search || url.hash)throw new Error('PUBLIC_APP_URL must be https://your-host/oura-status');
const base=url.href.replace(/\/$/,'');
const health=await fetch(`${base}/health`,{signal:AbortSignal.timeout(15000)});
if(!health.ok || (await health.json()).ok!==true)throw new Error('Public health check failed; webhook unchanged');
async function api(method,body){
  const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const data=await response.json();
  if(!data.ok)throw new Error(`${method} failed: ${data.description}`);
  return data.result;
}
await api('setWebhook',{url:`${base}/telegram-webhook`,secret_token:secret,allowed_updates:['message','callback_query'],max_connections:1});
const state=await api('getWebhookInfo',{});
if(state.url!==`${base}/telegram-webhook`)throw new Error('Webhook URL verification failed');
console.log(`Webhook configured: ${state.url}`);
console.log(`Pending updates: ${state.pending_update_count}`);
if(state.last_error_message)console.log(`Last recorded delivery error: ${state.last_error_message}`);
// endregion configure-webhook
