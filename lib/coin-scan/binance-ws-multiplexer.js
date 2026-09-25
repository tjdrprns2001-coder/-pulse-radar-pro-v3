'use strict';
const {createSequenceGuard}=require('./source-sequence-guard.js');
function clean(s){return String(s||'').toLowerCase().replace(/[^a-z0-9@_]/g,'')}
function createBinanceWsMultiplexer({WebSocketCtor=globalThis.WebSocket,url='wss://stream.binance.com:9443/stream',restSnapshot,onEvent=null,onState=null,now=()=>Date.now(),maxStreams=200}={}){
  if(!WebSocketCtor)throw new Error('WebSocket unavailable');
  const guard=createSequenceGuard({now,maxAgeMs:30000}),streams=new Set(),buffer=new Map(),lastApplied=new Map();let ws=null,state='DISCONNECTED',lastMessageAt=null,lastPingAt=null,lastPongAt=null,reconnectAttempt=0;
  function subscribe(list=[]){for(const s of list.map(clean).filter(Boolean).slice(0,maxStreams))streams.add(s);if(ws&&state==='LIVE'&&streams.size)ws.send(JSON.stringify({method:'SUBSCRIBE',params:[...streams],id:now()}))}
  async function resync(stream,event){
    state='RESYNC_REQUIRED';guard.beginRecovery(stream);
    const snap=await restSnapshot?.(stream,event);if(!snap||!Number.isFinite(Number(snap.lastUpdateId)))throw new Error('REST snapshot unavailable');
    const queued=(buffer.get(stream)||[]).filter(x=>Number(x.u)>Number(snap.lastUpdateId)).sort((a,b)=>Number(a.U)-Number(b.U));let last=Number(snap.lastUpdateId),replayed=0;
    for(const x of queued){const U=Number(x.U),u=Number(x.u);if(u<=last)continue;if(!(U<=last+1&&u>=last+1))throw new Error('buffer gap persists');last=u;replayed++}
    lastApplied.set(stream,last);guard.recover(stream,{snapshotSequence:last,eventTime:now()});buffer.set(stream,[]);state='LIVE';onState?.({state,stream,at:now(),resynced:true,lastUpdateId:last});return{snapshot:snap,replayed,lastUpdateId:last};
  }
  async function onDepth(stream,d){
    const key=clean(stream);if(!buffer.has(key))buffer.set(key,[]);
    const U=Number(d.U??d.u),u=Number(d.u),pu=d.pu!=null?Number(d.pu):null,last=lastApplied.get(key);
    if(!Number.isFinite(u))return{status:'IGNORED',lastUpdateId:last??null};
    if(last==null){lastApplied.set(key,u);guard.recover(key,{snapshotSequence:u,eventTime:Number(d.E)||now()});return{status:'LIVE',lastUpdateId:u,initialized:true}}
    if(u<=last)return{status:'STALE_EVENT',lastUpdateId:last};
    const contiguous=pu!=null?pu===last:(U<=last+1&&u>=last+1);
    if(!contiguous){buffer.get(key).push(d);guard.beginRecovery(key);return resync(key,d)}
    lastApplied.set(key,u);guard.recover(key,{snapshotSequence:u,eventTime:Number(d.E)||now()});
    return{status:'LIVE',lastUpdateId:u}
  }
  function connect(){
    if(ws)try{ws.close()}catch{}
    state='CONNECTING';ws=new WebSocketCtor(url);
    ws.onopen=()=>{state='LIVE';reconnectAttempt=0;onState?.({state,at:now()});subscribe([...streams])};
    ws.onmessage=async e=>{lastMessageAt=now();let j;try{j=JSON.parse(e.data)}catch{return}const stream=j.stream||'',d=j.data||j;await onEvent?.({stream,data:d,receivedAt:lastMessageAt});if(/depth/i.test(stream)&&d.u!=null){try{await onDepth(stream,d)}catch(err){state='RECONNECT_WAIT';guard.fail(stream,'SEQUENCE_GAP',err.message);onState?.({state,error:err.message,stream,at:now()})}}};
    ws.onclose=()=>{state='RECONNECT_WAIT';reconnectAttempt++;onState?.({state,reconnectAttempt,at:now()})};
    ws.onerror=()=>{state='RECONNECT_WAIT';onState?.({state,at:now()})};
    return ws;
  }
  function heartbeat(){const silent=lastMessageAt!=null&&now()-lastMessageAt>30000;return{state,lastMessageAt,lastPingAt,lastPongAt,reconnectAttempt,streamCount:streams.size,silent,guards:guard.all(),lastApplied:Object.fromEntries(lastApplied)}}
  return{connect,subscribe,onDepth,resync,heartbeat,get state(){return state}};
}
module.exports={createBinanceWsMultiplexer};
