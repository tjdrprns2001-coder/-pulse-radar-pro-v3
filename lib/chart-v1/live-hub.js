'use strict';

const T=require('./telemetry.js');

function cleanSymbol(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function lower(v){return cleanSymbol(v).toLowerCase()}
function boundedPush(a,v,max){a.push(v);if(a.length>max)a.splice(0,a.length-max)}
function safeJson(s){try{return JSON.parse(String(s))}catch{return null}}

function createLiveHub({WebSocketCtor=null,persistence=null,now=()=>Date.now(),maxSymbols=24,maxTrades=10000,maxLiquidations=2000}={}){
  let WS=WebSocketCtor;
  if(!WS){try{WS=require('ws')}catch{}}
  const states=new Map(),listeners=new Map();
  function stateFor(symbol){
    const s=cleanSymbol(symbol);if(!states.has(s))states.set(s,{symbol:s,status:'idle',connected_at:null,last_message_at:null,last_error:null,reconnects:0,trades:[],liquidations:[],book:null,wallState:{},funding:null,kline:null,klines:{},ws:null,timer:null});
    return states.get(s)
  }
  function notify(symbol,event){
    const set=listeners.get(cleanSymbol(symbol));if(!set)return;
    for(const fn of [...set])try{fn(event)}catch{}
  }
  async function persistEvent(e){if(!persistence?.appendEvent)return;try{await persistence.appendEvent(e)}catch{}}
  async function persistSnapshot(key,row){if(!persistence?.putSnapshot)return;try{await persistence.putSnapshot(key,row)}catch{}}
  function streams(symbol){
    const s=lower(symbol);
    return[
      s+'@aggTrade',
      s+'@forceOrder',
      s+'@depth20@100ms',
      ...['1m','5m','15m','1h','4h','12h','1d','1w'].map(tf=>s+'@kline_'+tf),
      s+'@markPrice@1s'
    ].join('/')
  }
  function connect(symbol){
    const s=cleanSymbol(symbol),existing=states.get(s);if(!existing&&states.size>=maxSymbols){const rejected={symbol:s,status:'rejected',last_error:'symbol limit reached'};return rejected}const st=existing||stateFor(s);
    if(!WS){st.status='unavailable';st.last_error='WebSocket client unavailable';return st}
    if(st.ws&&(st.status==='connecting'||st.status==='live'))return st;
    const url='wss://fstream.binance.com/stream?streams='+streams(s);
    let ws;try{ws=new WS(url)}catch(e){st.status='error';st.last_error=String(e?.message||e);return st}
    st.ws=ws;st.status='connecting';st.last_error=null;
    const bind=(name,fn)=>{if(typeof ws.on==='function')ws.on(name,fn);else if(typeof ws.addEventListener==='function')ws.addEventListener(name,fn);else ws['on'+name]=fn};
    bind('open',()=>{st.status='live';st.connected_at=now();st.reconnects=0;notify(s,{event:'stream.state',symbol:s,status:'live',time:now()})});
    bind('message',ev=>{
      const msg=safeJson(ev?.data??ev);if(!msg)return;
      const d=msg.data||msg,kind=String(d?.e||'').toLowerCase(),at=now();st.last_message_at=at;
      if(kind==='aggtrade'){
        const t=T.normalizeTrade(d,'BINANCE_FUTURES_WS');if(t){boundedPush(st.trades,t,maxTrades);notify(s,{event:'trade',symbol:s,data:t,time:at})}
      }else if(kind==='forceorder'){
        const l=T.normalizeLiquidation(d,'BINANCE_FUTURES_WS');if(l){boundedPush(st.liquidations,l,maxLiquidations);persistEvent({event_id:l.liquidation_id,event_type:'liquidation',symbol:s,event_time:l.event_time,payload:l});notify(s,{event:'liquidation',symbol:s,data:l,time:at})}
      }else if(kind==='depthupdate'||Array.isArray(d?.bids)||Array.isArray(d?.b)||Array.isArray(d?.asks)||Array.isArray(d?.a)){
        const bids=d.bids||d.b||[],asks=d.asks||d.a||[],book=T.depthStats(bids,asks,Number(d.E)||at),lastTrades=st.trades.filter(x=>x.time>=Number(st.book?.observed_at||at-1000));st.wallState=T.updateWallState(st.wallState,book,lastTrades);st.book=book;
        if(book.available&&(!st.last_book_persist||at-st.last_book_persist>=5000)){st.last_book_persist=at;persistSnapshot('orderbook:'+s,{symbol:s,snapshot_type:'orderbook',observed_at:book.observed_at,book,wall_state:st.wallState})}
        notify(s,{event:'orderbook',symbol:s,data:{book,wall_state:st.wallState},time:at})
      }else if(kind==='kline'){
        const k=d.k||{};st.kline={open_time:Number(k.t),close_time:Number(k.T),open:Number(k.o),high:Number(k.h),low:Number(k.l),close:Number(k.c),volume_base:Number(k.v),volume_quote:Number(k.q),is_closed:Boolean(k.x),interval:String(k.i||'1m')};st.klines[st.kline.interval]=st.kline;notify(s,{event:'candle.update',symbol:s,data:st.kline,time:at})
      }else if(kind==='markpriceupdate'){
        st.funding={time:Number(d.E)||at,mark_price:Number(d.p),index_price:Number(d.i),funding_rate:Number(d.r),funding_rate_pct:Number(d.r)*100,next_funding_time:Number(d.T)};notify(s,{event:'funding',symbol:s,data:st.funding,time:at})
      }
    });
    const onClose=()=>{if(st.ws!==ws)return;st.status='reconnect_wait';st.ws=null;st.reconnects++;const delay=Math.min(30000,1000*Math.max(1,2**Math.min(5,st.reconnects)));clearTimeout(st.timer);st.timer=setTimeout(()=>connect(s),delay);notify(s,{event:'stream.state',symbol:s,status:st.status,reconnect_in_ms:delay,time:now()})};
    bind('close',onClose);
    bind('error',e=>{st.last_error=String(e?.message||'websocket error');notify(s,{event:'stream.error',symbol:s,error:st.last_error,time:now()})});
    return st
  }
  function subscribe(symbol,fn){
    const s=cleanSymbol(symbol);if(!listeners.has(s))listeners.set(s,new Set());listeners.get(s).add(fn);connect(s);
    return()=>{const set=listeners.get(s);if(set){set.delete(fn);if(!set.size)listeners.delete(s)}}
  }
  function stop(symbol){
    const s=cleanSymbol(symbol),st=states.get(s);if(!st)return false;clearTimeout(st.timer);st.timer=null;try{st.ws?.close()}catch{}st.ws=null;st.status='stopped';return true
  }
  function snapshot(symbol,{tradeWindowMs=48*3600000,profileBins=100}={}){
    const s=cleanSymbol(symbol),st=stateFor(s),stamp=now(),trades=st.trades.filter(x=>x.time>=stamp-tradeWindowMs),tradeProfile=T.tradeVolumeProfile(trades,{bins:profileBins,startTime:stamp-tradeWindowMs,endTime:stamp}),liq=st.liquidations.slice(-500),liq1h=T.liquidationSummary(liq,3600000,stamp),liq4h=T.liquidationSummary(liq,4*3600000,stamp);
    return{symbol:s,status:st.status,connected_at:st.connected_at,last_message_at:st.last_message_at,last_error:st.last_error,reconnects:st.reconnects,trade_profile:tradeProfile,trades:trades.slice(-500),liquidations:{status:liq.length?'available':st.status==='live'?'empty':'unavailable',series:liq,summary_1h:liq1h,summary_4h:liq4h},orderbook:st.book?{...st.book,wall_state:st.wallState}:{available:false},funding:st.funding,kline:st.kline,klines:st.klines,as_of:stamp}
  }
  function health(){return{websocket_available:Boolean(WS),symbols:[...states.values()].map(st=>({symbol:st.symbol,status:st.status,last_message_at:st.last_message_at,reconnects:st.reconnects,last_error:st.last_error,trade_count:st.trades.length,liquidation_count:st.liquidations.length,book_available:Boolean(st.book?.available)})),listener_symbols:[...listeners.keys()]}}
  return{connect,subscribe,stop,snapshot,health,stateFor}
}
module.exports={createLiveHub};
