(function(g){
  const URL='wss://stream.binance.com:9443/ws/!ticker@arr';
  let ws=null,timer=null,tries=0,opts={},lastMessage=0;
  const emitState=(state,extra={})=>opts.onState?.({state,tries,lastMessage,...extra});
  const normalize=t=>({id:'binance:spot:'+t.s,source:'binance',venue:'Binance',chain:null,marketType:'spot',symbol:t.s,baseAsset:null,quoteAsset:'USDT',eventType:'ticker',eventTime:t.E||Date.now(),receivedTime:Date.now(),price:Number(t.c),quoteVolumeUsd:Number(t.q||0),priceChange24h:Number(t.P||0),sourceConfidence:95});
  function clear(){if(timer){clearTimeout(timer);timer=null}}
  function schedule(){clear();const ms=Math.min(30000,1000*Math.pow(2,Math.min(tries,5)))+Math.floor(Math.random()*750);timer=setTimeout(connect,ms)}
  function connect(o){if(o)opts=o;disconnect(false);tries++;emitState('connecting');try{ws=new WebSocket(URL)}catch(e){emitState('error',{error:String(e)});return schedule()}
    ws.onopen=()=>{tries=0;lastMessage=Date.now();emitState('live')};
    ws.onmessage=e=>{lastMessage=Date.now();let a;try{a=JSON.parse(e.data)}catch{return}if(Array.isArray(a))for(const t of a)if(t&&t.s)opts.onTick?.(normalize(t))};
    ws.onerror=()=>emitState('error');
    ws.onclose=()=>{ws=null;emitState('reconnecting');schedule()};
  }
  function disconnect(cancel=true){clear();if(ws){const x=ws;ws=null;x.onclose=null;try{x.close()}catch{}}if(cancel)emitState('closed')}
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&(!ws||Date.now()-lastMessage>45000))connect()});
  const api={connect,disconnect,url:URL,normalize};if(typeof module!=='undefined'&&module.exports)module.exports=api;g.PulseRadarStream=api;
})(typeof window!=='undefined'?window:globalThis);
