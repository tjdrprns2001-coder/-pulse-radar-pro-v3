(function(g){
  const SPOT_URLS=[
    'wss://stream.binance.com:9443/ws/!ticker@arr',
    'wss://stream.binance.com:443/ws/!ticker@arr',
    'wss://data-stream.binance.vision/ws/!ticker@arr'
  ];
  const FUTURES_URLS=[
    'wss://fstream.binance.com/ws/!ticker@arr',
    'wss://fstream.binance.com:443/ws/!ticker@arr'
  ];
  const MAX_FAST_FAILURES=6;
  const CONNECT_TIMEOUT_MS=9000;
  let opts={};
  const channels={
    spot:{name:'spot',urls:SPOT_URLS,urlIndex:0,ws:null,timer:null,connectTimer:null,tries:0,failures:0,lastMessage:0,state:'closed'},
    futures:{name:'futures',urls:FUTURES_URLS,urlIndex:0,ws:null,timer:null,connectTimer:null,tries:0,failures:0,lastMessage:0,state:'closed'}
  };
  const normalizeSpot=t=>({id:'binance:spot:'+t.s,source:'binance',venue:'Binance',chain:null,marketType:'spot',symbol:t.s,baseAsset:null,quoteAsset:'USDT',eventType:'ticker',eventTime:t.E||Date.now(),receivedTime:Date.now(),price:Number(t.c),quoteVolumeUsd:Number(t.q||0),priceChange24h:Number(t.P||0),txCount:Number(t.n||0),sourceConfidence:95});
  const normalizeFutures=t=>({id:'binance:futures:'+t.s,source:'binance',venue:'Binance Futures',chain:null,marketType:'futures',symbol:t.s,baseAsset:null,quoteAsset:'USDT',eventType:'ticker',eventTime:t.E||Date.now(),receivedTime:Date.now(),price:Number(t.c),quoteVolumeUsd:Number(t.q||0),priceChange24h:Number(t.P||0),txCount:Number(t.n||0),sourceConfidence:95});
  function currentUrl(c){return c.urls[c.urlIndex%c.urls.length]}
  function aggregateState(){
    const states=Object.fromEntries(Object.entries(channels).map(([k,c])=>[k,c.state]));
    const live=Object.values(channels).some(c=>c.state==='live');
    const connecting=Object.values(channels).some(c=>/connecting|reconnecting/.test(c.state));
    const fallback=Object.values(channels).some(c=>c.state==='fallback');
    return {state:live?'live':connecting?'reconnecting':fallback?'fallback':'closed',channels:states,lastMessage:Math.max(...Object.values(channels).map(c=>c.lastMessage||0))};
  }
  function emitState(channel,extra={}){opts.onState?.({...aggregateState(),channel,...extra})}
  function clearTimer(c){if(c.timer){clearTimeout(c.timer);c.timer=null}}
  function clearConnectTimer(c){if(c.connectTimer){clearTimeout(c.connectTimer);c.connectTimer=null}}
  function schedule(c,forceSlow=false){
    clearTimer(c);
    const slow=forceSlow||c.failures>=MAX_FAST_FAILURES;
    const ms=slow?60000:Math.min(30000,1000*Math.pow(2,Math.min(c.tries,5)))+Math.floor(Math.random()*750);
    if(slow){c.state='fallback';emitState(c.name,{fallback:true})}
    c.timer=setTimeout(()=>connectChannel(c),ms);
  }
  function disconnectChannel(c,cancel=true){
    clearTimer(c);clearConnectTimer(c);
    if(c.ws){const x=c.ws;c.ws=null;x.onclose=null;x.onerror=null;x.onopen=null;x.onmessage=null;try{x.close()}catch{}}
    if(cancel)c.state='closed';
  }
  function failAndRetry(c,reason){
    clearConnectTimer(c);
    c.failures++;
    c.urlIndex=(c.urlIndex+1)%c.urls.length;
    c.ws=null;
    c.state=c.failures>=MAX_FAST_FAILURES?'fallback':'reconnecting';
    emitState(c.name,{reason,url:currentUrl(c),failures:c.failures});
    schedule(c,c.failures>=MAX_FAST_FAILURES);
  }
  function connectChannel(c){
    disconnectChannel(c,false);
    c.tries++;
    c.state=c.failures>=MAX_FAST_FAILURES?'fallback':'connecting';
    const url=currentUrl(c);
    emitState(c.name,{url});
    let ws;
    try{ws=new WebSocket(url);c.ws=ws}
    catch(e){return failAndRetry(c,String(e))}
    c.connectTimer=setTimeout(()=>{
      if(c.ws===ws&&ws.readyState!==1){
        try{ws.close()}catch{}
        failAndRetry(c,'connect-timeout');
      }
    },CONNECT_TIMEOUT_MS);
    ws.onopen=()=>{
      if(c.ws!==ws)return;
      clearConnectTimer(c);
      c.tries=0;c.failures=0;c.lastMessage=Date.now();c.state='live';
      emitState(c.name,{url});
    };
    ws.onmessage=e=>{
      if(c.ws!==ws)return;
      c.lastMessage=Date.now();
      let a;try{a=JSON.parse(e.data)}catch{return}
      if(!Array.isArray(a))return;
      const normalize=c.name==='spot'?normalizeSpot:normalizeFutures;
      for(const t of a)if(t&&t.s)opts.onTick?.(normalize(t));
    };
    ws.onerror=()=>{if(c.ws===ws){c.state='error';emitState(c.name,{url})}};
    ws.onclose=()=>{
      if(c.ws!==ws)return;
      clearConnectTimer(c);
      failAndRetry(c,'closed');
    };
  }
  function connect(o){if(o)opts=o;for(const c of Object.values(channels)){c.failures=0;connectChannel(c)}}
  function disconnect(cancel=true){for(const c of Object.values(channels))disconnectChannel(c,cancel);if(cancel)emitState('all')}
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')for(const c of Object.values(channels)){
      if(!c.ws||Date.now()-c.lastMessage>45000){c.failures=0;connectChannel(c)}
    }
  });
  if(typeof window!=='undefined')window.addEventListener('online',()=>{for(const c of Object.values(channels)){c.failures=0;connectChannel(c)}});
  const api={connect,disconnect,normalize:normalizeSpot,normalizeSpot,normalizeFutures,urls:{spot:SPOT_URLS.slice(),futures:FUTURES_URLS.slice()},channels};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;g.PulseRadarStream=api;
})(typeof window!=='undefined'?window:globalThis);
