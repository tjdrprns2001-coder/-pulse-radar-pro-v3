'use strict';
const {createSequenceGuard}=require('./source-sequence-guard.js');
function clean(s){return String(s||'').toLowerCase().replace(/[^a-z0-9@_]/g,'')}
function createBinanceWsMultiplexer({WebSocketCtor=globalThis.WebSocket,url='wss://stream.binance.com:9443/stream',restSnapshot,now=()=>Date.now(),maxStreams=200}={}){
  if(!WebSocketCtor)throw new Error('WebSocket unavailable');
  const guard=createSequenceGuard({now,maxAgeMs:30000}),streams=new Set(),buffer=new Map();let ws=null,state='DISCONNECTED',lastMessageAt=null,lastPingAt=null,lastPongAt=null,reconnectAttempt=0;
  function subscribe(list=[]){for(const s of list.map(clean).filter(Boolean).slice(0,maxStreams))streams.add(s);if(ws&&state==='LIVE'&&streams.size)ws.send(JSON.stringify({method:'SUBSCRIBE',params:[...streams],id:now()}))}
  async function resync(stream,event){
    state='RESYNC_REQUIRED';guard.beginRecovery(stream);
    const snap=await restSnapshot?.(stream,event);if(!snap||!Number.isFinite(Number(snap.lastUpdateId)))throw new Error('REST snapshot unavailable');
    const queued=(buffer.get(stream)||[]).filter(x=>Number(x.u)>Number(snap.lastUpdateId)).sort((a,b)=>Number(a.U)-Number(b.U));let last=Number(snap.lastUpdateId);
    for(const x of queued){if(Number(x.U)>last+1)throw new Error('buffer gap persists');last=Number(x.u)}
    guard.recover(stream,{snapshotSequence:last,eventTime:now()});buffer.set(stream,[]);state='LIVE';return{snapshot:snap,replayed:queued.length,lastUpdateId:last};
  }
  async function onDepth(stream,d){
    const key=clean(stream);if(!buffer.has(key))buffer.set(key,[]);
    const seq=guard.observe(key,{sequence:Number(d.u),eventTime:Number(d.E)||now()});
    if(seq.recoveryRequired){buffer.get(key).push(d);return resync(key,d)}
    return{status:'LIVE',lastUpdateId:Number(d.u)}
  }
  function connect(){
    if(ws)try{ws.close()}catch{}
    state='CONNECTING';ws=new WebSocketCtor(url);
    ws.onopen=()=>{state='LIVE';reconnectAttempt=0;subscribe([...streams])};
    ws.onmessage=async e=>{lastMessageAt=now();let j;try{j=JSON.parse(e.data)}catch{return}const stream=j.stream||'',d=j.data||j;if(/depth/i.test(stream)&&d.u!=null){try{await onDepth(stream,d)}catch(err){state='RECONNECT_WAIT';guard.fail(stream,'SEQUENCE_GAP',err.message)}}};
    ws.onclose=()=>{state='RECONNECT_WAIT';reconnectAttempt++};
    ws.onerror=()=>{state='RECONNECT_WAIT'};
    return ws;
  }
  function heartbeat(){const silent=lastMessageAt!=null&&now()-lastMessageAt>30000;return{state,lastMessageAt,lastPingAt,lastPongAt,reconnectAttempt,streamCount:streams.size,silent,guards:guard.all()}}
  return{connect,subscribe,onDepth,resync,heartbeat,get state(){return state}};
}
module.exports={createBinanceWsMultiplexer};
