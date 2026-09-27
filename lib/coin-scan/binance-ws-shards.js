'use strict';
const {createBinanceWsMultiplexer}=require('./binance-ws-multiplexer.js');
const BINANCE_USDM_PUBLIC_STREAM_URL='wss://fstream.binance.com/market/stream';
function chunk(list,size){const out=[];for(let i=0;i<list.length;i+=size)out.push(list.slice(i,i+size));return out}
function createBinanceFuturesWsShards({WebSocketCtor=globalThis.WebSocket,now=()=>Date.now(),maxStreamsPerShard=180,onTick=null,onState=null}={}){
  const latest=new Map(),shards=[];let symbols=[];
  function start(list=[]){
    symbols=[...new Set((list||[]).map(x=>String(x?.symbol||x||'').toUpperCase()).filter(Boolean))];
    for(const [index,group] of chunk(symbols,Math.max(1,Number(maxStreamsPerShard)||180)).entries()){
      const mux=createBinanceWsMultiplexer({WebSocketCtor,url:BINANCE_USDM_PUBLIC_STREAM_URL,maxStreams:group.length,now,
        onEvent:({stream,data,receivedAt})=>{if(!/bookticker/i.test(stream))return;const symbol=String(data?.s||stream.split('@')[0]||'').toUpperCase();const tick={symbol,bid:Number(data?.b),ask:Number(data?.a),eventTime:Number(data?.E)||receivedAt,receivedAt,shard:index};latest.set(symbol,tick);onTick?.(tick)},
        onState:s=>onState?.({...s,shard:index})
      });
      mux.subscribe(group.map(s=>s.toLowerCase()+'@bookTicker'));mux.connect();shards.push(mux);
    }
    return health();
  }
  function health(){return{symbolCount:symbols.length,shardCount:shards.length,shards:shards.map((x,i)=>({index:i,...x.heartbeat()})),latestCount:latest.size}}
  function get(symbol){return latest.get(String(symbol||'').toUpperCase())||null}
  return{start,health,get,latest};
}
module.exports={BINANCE_USDM_PUBLIC_STREAM_URL,createBinanceFuturesWsShards};
