'use strict';
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function ema(values,p){const a=values.map(finite).filter(v=>v!=null);if(a.length<p)return null;const k=2/(p+1);let x=a.slice(0,p).reduce((s,v)=>s+v,0)/p;for(let i=p;i<a.length;i++)x=a[i]*k+x*(1-k);return x}
function rsi(values,p=14){const a=values.map(finite).filter(v=>v!=null);if(a.length<p+1)return null;let g=0,l=0;for(let i=a.length-p;i<a.length;i++){const d=a[i]-a[i-1];if(d>0)g+=d;else l-=d}const ag=g/p,al=l/p;if(al===0)return 100;return 100-(100/(1+ag/al))}
function macd(values){const a=values.map(finite).filter(v=>v!=null);if(a.length<35)return null;const series=[];for(let i=26;i<=a.length;i++){const s=a.slice(0,i),e12=ema(s,12),e26=ema(s,26);if(e12!=null&&e26!=null)series.push(e12-e26)}if(series.length<9)return null;const line=series.at(-1),signal=ema(series,9);return{line,signal,hist:signal==null?null:line-signal}}
function obv(rows){if(rows.length<3)return null;let x=0;const vals=[];for(let i=1;i<rows.length;i++){const c=finite(rows[i].close),p=finite(rows[i-1].close),v=finite(rows[i].volume)||0;if(c>p)x+=v;else if(c<p)x-=v;vals.push(x)}if(vals.length<6)return null;return{value:vals.at(-1),rising:vals.at(-1)>vals.at(-6)}}
function rvol(rows,p=20){if(rows.length<p+1)return null;const last=finite(rows.at(-1).volume),base=rows.slice(-p-1,-1).map(x=>finite(x.volume)).filter(v=>v!=null);const avg=base.length?base.reduce((s,v)=>s+v,0)/base.length:null;return last!=null&&avg>0?last/avg:null}
function snapshot(rows=[]){const a=rows.filter(x=>finite(x.close)!=null),cl=a.map(x=>finite(x.close));if(a.length<30)return{available:false};const e20=ema(cl,20),e60=ema(cl,60),m=macd(cl),o=obv(a),rr=rsi(cl),rv=rvol(a);return{available:true,close:cl.at(-1),rsi14:rr,ema20:e20,ema60:e60,emaBull:e20!=null&&e60!=null?e20>e60:null,macd:m,macdBull:m?.hist!=null?m.hist>0:null,obvRising:o?.rising??null,rvol20:rv,bullVotes:[e20!=null&&e60!=null?e20>e60:null,m?.hist!=null?m.hist>0:null,rr!=null?rr>=50:null,o?.rising??null].filter(v=>v===true).length,totalVotes:[e20!=null&&e60!=null,m?.hist!=null,rr!=null,o?.rising!=null].filter(Boolean).length}}

function createCrossIndicatorProvider({fetchImpl=globalThis.fetch,cache=null}={}){
 if(typeof fetchImpl!=='function')throw new Error('fetch implementation required');
 async function json(url,key){if(cache&&cache.get){const h=cache.get(key);if(h!=null)return h}const ctrl=new AbortController(),t=setTimeout(()=>ctrl.abort(),6500);try{const r=await fetchImpl(url,{signal:ctrl.signal});if(!r||!r.ok)throw new Error('HTTP '+(r&&r.status||'ERR'));const d=await r.json();if(cache&&cache.set)cache.set(key,d,120000);return d}finally{clearTimeout(t)}}
 function base(symbol){const s=String(symbol||'').toUpperCase();return s.endsWith('USDT')?s.slice(0,-4):s}
 function parseBybit(rows){return (rows||[]).slice().reverse().map(x=>({time:finite(x[0]),open:finite(x[1]),high:finite(x[2]),low:finite(x[3]),close:finite(x[4]),volume:finite(x[5])}))}
 function parseOkx(rows){return (rows||[]).slice().reverse().map(x=>({time:finite(x[0]),open:finite(x[1]),high:finite(x[2]),low:finite(x[3]),close:finite(x[4]),volume:finite(x[5])}))}
 function parseGate(rows){return (rows||[]).slice().sort((a,b)=>finite(a.t)-finite(b.t)).map(x=>({time:(finite(x.t)||0)*1000,open:finite(x.o),high:finite(x.h),low:finite(x.l),close:finite(x.c),volume:finite(x.v)}))}
 async function bybit(symbol,tf){const interval=tf==='4h'?'240':'60',d=await json('https://api.bybit.com/v5/market/kline?category=linear&symbol='+encodeURIComponent(symbol)+'&interval='+interval+'&limit=140','xind:bybit:'+symbol+':'+tf);if(Number(d?.retCode)!==0)throw new Error(d?.retMsg||'bybit');return parseBybit(d?.result?.list)}
 async function okx(symbol,tf){const inst=base(symbol)+'-USDT-SWAP',bar=tf==='4h'?'4H':'1H',d=await json('https://www.okx.com/api/v5/market/candles?instId='+encodeURIComponent(inst)+'&bar='+bar+'&limit=140','xind:okx:'+symbol+':'+tf);if(String(d?.code??'0')!=='0')throw new Error(d?.msg||'okx');return parseOkx(d?.data)}
 async function gate(symbol,tf){const contract=base(symbol)+'_USDT',interval=tf==='4h'?'4h':'1h',d=await json('https://api.gateio.ws/api/v4/futures/usdt/candlesticks?contract='+encodeURIComponent(contract)+'&interval='+interval+'&limit=140','xind:gate:'+symbol+':'+tf);return parseGate(d)}
 async function one(name,fn,symbol){try{const [h1,h4]=await Promise.all([fn(symbol,'1h'),fn(symbol,'4h')]);return{name,available:true,timeframes:{'1h':snapshot(h1),'4h':snapshot(h4)}}}catch(e){return{name,available:false,error:String(e?.message||e),timeframes:{}}}}
 async function get(symbol){
  const rows=await Promise.all([one('bybit',bybit,symbol),one('okx',okx,symbol),one('gate',gate,symbol)]);
  const active=rows.filter(x=>x.available),out={};
  for(const tf of ['1h','4h']){const snaps=active.map(x=>x.timeframes[tf]).filter(x=>x?.available),rsiVals=snaps.map(x=>x.rsi14).filter(Number.isFinite),rv=snaps.map(x=>x.rvol20).filter(Number.isFinite);out[tf]={available:snaps.length>0,sourceCount:snaps.length,rsiMedian:rsiVals.length?rsiVals.sort((a,b)=>a-b)[Math.floor(rsiVals.length/2)]:null,emaBullBreadth:snaps.filter(x=>x.emaBull===true).length,macdBullBreadth:snaps.filter(x=>x.macdBull===true).length,obvUpBreadth:snaps.filter(x=>x.obvRising===true).length,rvolMedian:rv.length?rv.sort((a,b)=>a-b)[Math.floor(rv.length/2)]:null}}
  return{available:active.length>0,sources:rows,timeframes:out,summary:{sourceCount:active.length,h1Bull:out['1h'].emaBullBreadth+out['1h'].macdBullBreadth+out['1h'].obvUpBreadth,h4Bull:out['4h'].emaBullBreadth+out['4h'].macdBullBreadth+out['4h'].obvUpBreadth}};
 }
 return{get,snapshot};
}
module.exports={createCrossIndicatorProvider,snapshot,ema,rsi,macd,obv,rvol};
