const ENDPOINT='https://ignition-scanner.tjdrprns10.chatgpt.site/api/v1/results';
export function createSource({env,fetcher=fetch,now=Date.now}) {
 let last=null,checkedAt=0,pending=null;
 async function sync(){
  if(!env.IGNITION_UPSTREAM_TOKEN)throw Error('unconfigured');
  const response=await fetcher(ENDPOINT,{method:'GET',headers:{'OAI-Sites-Authorization':`Bearer ${env.IGNITION_UPSTREAM_TOKEN}`},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('upstream_unavailable');
  const data=await response.json();
  if(data.schemaVersion!=='1.0')throw Error('invalid_upstream');
  if(data.status==='complete'){
   if(data.kind!=='scan'||!Number.isFinite(data.finishedAt)||!Number.isFinite(data.asOf)||typeof data.id!=='string'||!Array.isArray(data.candidates))throw Error('invalid_scan');
   if(!last||data.finishedAt>=last.finishedAt)last=data;
  }else if(!['empty','running','paused','failed','cancelled','queued'].includes(data.status))throw Error('invalid_status');
  checkedAt=now();
  return last;
 }
 return async()=>{
  if(checkedAt&&now()-checkedAt<5000)return last;
  if(!pending)pending=sync().finally(()=>{pending=null;});
  return pending;
 };
}
