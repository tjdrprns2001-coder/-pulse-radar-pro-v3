(function(g){
  const SPOT_URL='wss://stream.binance.com:9443/ws/!ticker@arr';
  const FUTURES_URL='wss://fstream.binance.com/ws/!ticker@arr';
  let opts={};
  const channels={
    spot:{name:'spot',url:SPOT_URL,ws:null,timer:null,tries:0,lastMessage:0,state:'closed'},
    futures:{name:'futures',url:FUTURES_URL,ws:null,timer:null,tries:0,lastMessage:0,state:'closed'}
  };
  const normalizeSpot=t=>({id:'binance:spot:'+t.s,source:'binance',venue:'Binance',chain:null,marketType:'spot',symbol:t.s,baseAsset:null,quoteAsset:'USDT',eventType:'ticker',eventTime:t.E||Date.now(),receivedTime:Date.now(),price:Number(t.c),quoteVolumeUsd:Number(t.q||0),priceChange24h:Number(t.P||0),txCount:Number(t.n||0),sourceConfidence:95});
  const normalizeFutures=t=>({id:'binance:futures:'+t.s,source:'binance',venue:'Binance Futures',chain:null,marketType:'futures',symbol:t.s,baseAsset:null,quoteAsset:'USDT',eventType:'ticker',eventTime:t.E||Date.now(),receivedTime:Date.now(),price:Number(t.c),quoteVolumeUsd:Number(t.q||0),priceChange24h:Number(t.P||0),txCount:Number(t.n||0),sourceConfidence:95});
  function aggregateState(){
    const states=Object.fromEntries(Object.entries(channels).map(([k,c])=>[k,c.state]));
    const live=Object.values(channels).some(c=>c.state==='live');
    const connecting=Object.values(channels).some(c=>/connecting|reconnecting/.test(c.state));
    return {state:live?'live':connecting?'reconnecting':'closed',channels:states,lastMessage:Math.max(...Object.values(channels).map(c=>c.lastMessage||0))};
  }
  function emitState(channel,extra={}){opts.onState?.({...aggregateState(),channel,...extra})}
  function clearTimer(c){if(c.timer){clearTimeout(c.timer);c.timer=null}}
  function schedule(c){
    clearTimer(c);
    const ms=Math.min(30000,1000*Math.pow(2,Math.min(c.tries,5)))+Math.floor(Math.random()*750);
    c.timer=setTimeout(()=>connectChannel(c),ms);
  }
  function disconnectChannel(c,cancel=true){
    clearTimer(c);
    if(c.ws){const x=c.ws;c.ws=null;x.onclose=null;try{x.close()}catch{}}
    c.state=cancel?'closed':c.state;
  }
  function connectChannel(c){
    disconnectChannel(c,false);c.tries++;c.state='connecting';emitState(c.name);
    try{c.ws=new WebSocket(c.url)}catch(e){c.state='error';emitState(c.name,{error:String(e)});return schedule(c)}
    c.ws.onopen=()=>{c.tries=0;c.lastMessage=Date.now();c.state='live';emitState(c.name)};
    c.ws.onmessage=e=>{c.lastMessage=Date.now();let a;try{a=JSON.parse(e.data)}catch{return}if(!Array.isArray(a))return;const normalize=c.name==='spot'?normalizeSpot:normalizeFutures;for(const t of a)if(t&&t.s)opts.onTick?.(normalize(t))};
    c.ws.onerror=()=>{c.state='error';emitState(c.name)};
    c.ws.onclose=()=>{c.ws=null;c.state='reconnecting';emitState(c.name);schedule(c)};
  }
  function connect(o){if(o)opts=o;for(const c of Object.values(channels))connectChannel(c)}
  function disconnect(cancel=true){for(const c of Object.values(channels))disconnectChannel(c,cancel);if(cancel)emitState('all')}
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')for(const c of Object.values(channels))if(!c.ws||Date.now()-c.lastMessage>45000)connectChannel(c)});
  const api={connect,disconnect,normalize:normalizeSpot,normalizeSpot,normalizeFutures,urls:{spot:SPOT_URL,futures:FUTURES_URL},channels};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;g.PulseRadarStream=api;
})(typeof window!=='undefined'?window:globalThis);
