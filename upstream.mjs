const ENDPOINT='https://ignition-scanner.tjdrprns10.chatgpt.site/api/v1/results';

function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function safeStatus(v){return ['empty','queued','running','paused','complete','failed','cancelled'].includes(String(v))?String(v):null}
function normalizeLive(data,lastCompleted){
  const status=safeStatus(data?.status);
  if(!status)throw Error('invalid_status');
  if(status==='empty')return null;
  if(data?.kind!=='scan')throw Error('invalid_kind');
  if(typeof data?.id!=='string'||!Number.isFinite(data?.asOf)||!Array.isArray(data?.candidates))throw Error('invalid_scan');

  const current={
    ...data,
    status,
    sourceStatus:status,
    servedFromLastComplete:false
  };

  if(status==='complete'){
    if(!Number.isFinite(data.finishedAt))throw Error('invalid_complete');
    return current;
  }

  if(['queued','running','paused'].includes(status))return current;

  if(lastCompleted){
    return {
      ...lastCompleted,
      sourceStatus:status,
      servedFromLastComplete:true
    };
  }
  return null;
}

export function createSource({env,fetcher=fetch,now=Date.now}) {
 let lastCompleted=null,latest=null,checkedAt=0,pending=null;

 async function sync(){
  if(!env.IGNITION_UPSTREAM_TOKEN)throw Error('unconfigured');
  const response=await fetcher(ENDPOINT,{
    method:'GET',
    headers:{'OAI-Sites-Authorization':`Bearer ${env.IGNITION_UPSTREAM_TOKEN}`},
    redirect:'error',
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw Error('upstream_unavailable');
  const data=await response.json();
  if(data.schemaVersion!=='1.0')throw Error('invalid_upstream');

  const normalized=normalizeLive(data,lastCompleted);
  if(normalized?.status==='complete'&&!normalized.servedFromLastComplete){
    if(!lastCompleted||normalized.finishedAt>=lastCompleted.finishedAt)lastCompleted=normalized;
  }
  latest=normalized;
  checkedAt=now();
  return latest;
 }

 return async()=>{
  if(checkedAt&&now()-checkedAt<5000)return latest;
  if(!pending)pending=sync().finally(()=>{pending=null;});
  return pending;
 };
}
