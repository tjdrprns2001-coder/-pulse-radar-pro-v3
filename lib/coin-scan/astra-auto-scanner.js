'use strict';

const VERSION='ASTRA_AUTO_SCAN_v1';
const TIMEFRAMES=Object.freeze(['1w','3d','1d','12h','4h','2h','1h','15m','5m']);
const CONFIG=Object.freeze({
  maxAbs24hPct:10,
  minQuoteVolume:10_000_000,
  minOi4hPct:1,
  ignitionRvol:3,
  ignitionTaker:1.2,
  watchScore:60,
  waitScore:40,
  maxOiSymbols:24,
  maxDeepSymbols:4
});

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,Number(v)||0))}
function pct(oldV,newV){oldV=finite(oldV);newV=finite(newV);return oldV&&newV!=null?((newV/oldV)-1)*100:null}
function avg(a=[]){const xs=a.map(finite).filter(Number.isFinite);return xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:null}
function sma(values=[],period=20){if(values.length<period)return null;return avg(values.slice(-period))}
function emaSeries(values=[],period=12){if(!values.length)return[];const alpha=2/(period+1);let e=finite(values[0]);if(e==null)return[];const out=[e];for(let i=1;i<values.length;i++){const v=finite(values[i]);if(v==null){out.push(e);continue}e=v*alpha+e*(1-alpha);out.push(e)}return out}
function rsiWilder(values=[],period=14){const a=values.map(finite).filter(Number.isFinite);if(a.length<=period)return null;let g=0,l=0;for(let i=1;i<=period;i++){const d=a[i]-a[i-1];if(d>0)g+=d;else l-=d}g/=period;l/=period;for(let i=period+1;i<a.length;i++){const d=a[i]-a[i-1];g=(g*(period-1)+Math.max(d,0))/period;l=(l*(period-1)+Math.max(-d,0))/period}return l===0?100:100-(100/(1+g/l))}
function intervalMs(tf){return({'5m':300000,'15m':900000,'1h':3600000,'2h':7200000,'4h':14400000,'12h':43200000,'1d':86400000,'3d':259200000,'1w':604800000})[tf]||0}
function confirmed(rows=[],now=Date.now()){
  return (Array.isArray(rows)?rows:[]).filter(x=>Array.isArray(x)&&x.length>=7&&finite(x[4])!=null&&(finite(x[6])==null||finite(x[6])<now));
}
function candleMetrics(rows=[],now=Date.now()){
  const a=confirmed(rows,now),c=a.map(x=>Number(x[4])),v=a.map(x=>Number(x[5]||0));
  if(c.length<25)return{available:false,bars:c.length};
  const last=a.at(-1),previous=a.slice(-21,-1),baseVol=avg(v.slice(-21,-1)),rv=baseVol>0?Number(last[5]||0)/baseVol:null;
  const e12=emaSeries(c,12),e26=emaSeries(c,26),mac=c.map((_,i)=>e12[i]-e26[i]),sig=emaSeries(mac,9),hist=mac.map((x,i)=>x-sig[i]);
  const mas={};for(const n of [5,10,20,60,120])mas[n]=sma(c,n);
  const low=previous.length?Math.min(...previous.map(x=>Number(x[3]))):null,high=previous.length?Math.max(...previous.map(x=>Number(x[2]))):null,close=Number(last[4]);
  return{
    available:true,bars:c.length,close,rsi14:rsiWilder(c,14),rvol:rv,
    sma:mas,above20:mas[20]!=null?close>mas[20]:null,above60:mas[60]!=null?close>mas[60]:null,
    stack:mas[5]!=null&&mas[10]!=null&&mas[20]!=null?mas[5]>mas[10]&&mas[10]>mas[20]:null,
    macd:mac.at(-1),macdSignal:sig.at(-1),macdHist:hist.at(-1),macdUp:hist.length>1?hist.at(-1)>hist.at(-2):null,
    support:low,resistance:high,
    sweepLow:low!=null?Number(last[3])<low&&close>low:false,
    sweepHigh:high!=null?Number(last[2])>high&&close<high:false,
    closeTime:finite(last[6])
  };
}
function lastConfirmedTaker(rows=[],period='15m',now=Date.now()){
  const ms=intervalMs(period),src=(Array.isArray(rows)?rows:[]).filter(x=>{
    const ts=finite(x?.timestamp);return ts!=null&&(!ms||ts+ms<=now);
  });
  const row=src.at(-1)||null;if(!row)return null;
  const buy=finite(row.buyVol),sell=finite(row.sellVol),ratio=buy!=null&&sell>0?buy/sell:finite(row.ratio??row.buySellRatio);
  return ratio==null?null:{timestamp:finite(row.timestamp),ratio,buyVol:buy,sellVol:sell};
}
function buildUniverse(exchangeInfo={},tickers=[]){
  const tickerMap=new Map((Array.isArray(tickers)?tickers:[]).map(x=>[String(x?.symbol||'').toUpperCase(),x]));
  const rows=[];
  for(const s of Array.isArray(exchangeInfo?.symbols)?exchangeInfo.symbols:[]){
    if(String(s?.status)!=='TRADING'||String(s?.contractType)!=='PERPETUAL'||String(s?.quoteAsset)!=='USDT')continue;
    const symbol=String(s.symbol||'').toUpperCase(),t=tickerMap.get(symbol);if(!t)continue;
    rows.push({symbol,baseAsset:String(s.baseAsset||''),lastPrice:finite(t.lastPrice),priceChange24h:finite(t.priceChangePercent),quoteVolume24h:finite(t.quoteVolume),closeTime:finite(t.closeTime),ticker:t});
  }
  return rows;
}
function initialFilter(rows=[],config=CONFIG){return rows.filter(x=>x.priceChange24h!=null&&Math.abs(x.priceChange24h)<=config.maxAbs24hPct&&x.quoteVolume24h!=null&&x.quoteVolume24h>=config.minQuoteVolume)}
function oiFromProfile(profile={}){return{oi1hPct:finite(profile.oi1hPct),oi4hPct:finite(profile.oi4hPct),oi8hPct:finite(profile.oi8hPct),oi12hPct:finite(profile.oi12hPct),oi24hPct:finite(profile.oi24hPct),oiDrawdownPct:finite(profile.oiDrawdownPct)}}
function structureScore(tf={}){
  let s=0;for(const k of ['1d','4h','1h']){const m=tf[k];if(!m?.available)continue;if(m.above20)s+=3;if(m.above60)s+=2;if(m.stack)s+=2;if(m.macdUp)s+=1}return Math.min(20,s);
}
function scoreCandidate(row={}){
  const oi4=finite(row.oi4hPct),oi8=finite(row.oi8hPct),t15=finite(row.taker15m),t5=finite(row.taker5m),r15=finite(row.tf?.['15m']?.rvol),r5=finite(row.tf?.['5m']?.rvol),ch=finite(row.priceChange24h),rsi4=finite(row.tf?.['4h']?.rsi14),rsi1=finite(row.tf?.['1h']?.rsi14);
  let s=0;if(oi4!=null)s+=Math.min(24,Math.max(0,oi4)*8);if(oi8>0)s+=Math.min(8,oi8*3);
  if(t15!=null)s+=t15>=1.5?12:t15>=1.2?9:t15>=1?4:t15<.8?-8:0;
  if(t5!=null)s+=t5>=1.5?12:t5>=1.2?9:t5>=1?4:t5<.8?-8:0;
  if(r15!=null)s+=r15>=3?10:r15>=1.5?6:r15>=1?2:0;if(r5!=null)s+=r5>=3?10:r5>=1.5?6:r5>=1?2:0;
  s+=structureScore(row.tf);
  if(ch!=null){const a=Math.abs(ch);if(a<=3)s+=8;else if(a<=6)s+=5;else if(ch>=9)s-=10}
  if(rsi4>=75||rsi1>=78)s-=10;if(finite(row.fundingRatePct)>=.08)s-=4;
  return Math.round(clamp(s));
}
function classify(row={}){
  const oi4=finite(row.oi4hPct),r15=finite(row.tf?.['15m']?.rvol),r5=finite(row.tf?.['5m']?.rvol),t15=finite(row.taker15m),t5=finite(row.taker5m),ch=finite(row.priceChange24h),rsi4=finite(row.tf?.['4h']?.rsi14),rsi1=finite(row.tf?.['1h']?.rsi14),h4=row.tf?.['4h']||{},h1=row.tf?.['1h']||{};
  const reasons=[];
  if(oi4!=null)reasons.push(`4H OI ${oi4>=0?'+':''}${oi4.toFixed(2)}%`);
  if(r15!=null)reasons.push(`15m RVOL ${r15.toFixed(2)}x`);if(r5!=null)reasons.push(`5m RVOL ${r5.toFixed(2)}x`);
  if(t15!=null)reasons.push(`15m taker ${t15.toFixed(2)}`);if(t5!=null)reasons.push(`5m taker ${t5.toFixed(2)}`);
  const ignition=oi4>=CONFIG.minOi4hPct&&r15>=CONFIG.ignitionRvol&&r5>=CONFIG.ignitionRvol&&t15>=CONFIG.ignitionTaker&&t5>=CONFIG.ignitionTaker&&h4.above20!==false&&h1.above20!==false;
  const progressed=ch>=9&&(rsi4>=70||rsi1>=75);
  const score=scoreCandidate(row);
  if(ignition)return{key:'IGNITION_CONFIRMED',label:'🔥 점화 확정',score,reasons};
  if(progressed)return{key:'PROGRESSED',label:'🔵 이미 진행',score,reasons:[...reasons,'24H 과진행/단기 과열']};
  if(score>=CONFIG.watchScore)return{key:'WATCH_PRIORITY',label:'🟡 관찰 우선',score,reasons};
  if(score>=CONFIG.waitScore)return{key:'WAIT',label:'⚪ 점화 대기',score,reasons};
  return{key:'HOLD',label:'⏸ 보류',score,reasons};
}
async function safeMapLimit(provider,items,workers,worker){
  if(typeof provider?.mapLimitWith==='function')return provider.mapLimitWith(items,workers,worker);
  const src=Array.from(items||[]),out=new Array(src.length);let next=0;async function run(){while(true){const i=next++;if(i>=src.length)return;out[i]=await worker(src[i],i)}}await Promise.all(Array.from({length:Math.min(Math.max(1,workers),src.length||1)},run));return out;
}
function normalizeSymbols(symbols=[],max=24){const src=Array.isArray(symbols)?symbols:String(symbols||'').split(',');return [...new Set(src.map(x=>String(x||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')).filter(Boolean))].slice(0,max)}
function createAstraAutoScanner({provider,now=()=>Date.now()}={}){
  if(!provider)throw new Error('provider required');
  async function universe(){
    const [ex,tickers]=await Promise.all([provider.getFuturesUniverse(),provider.getFuturesTickers()]);
    const rows=buildUniverse(ex,tickers),filtered=initialFilter(rows),stamp=now(),sorted=filtered.slice().sort((a,b)=>(b.quoteVolume24h||0)-(a.quoteVolume24h||0));
    const changes=rows.map(x=>x.priceChange24h).filter(Number.isFinite),majors=Object.fromEntries(['BTCUSDT','ETHUSDT'].map(s=>[s,rows.find(x=>x.symbol===s)||null]));
    return{status:'ok',stage:'universe',version:VERSION,updatedAt:stamp,config:CONFIG,universeCount:rows.length,filteredCount:sorted.length,breadth:{up:changes.filter(x=>x>0).length,down:changes.filter(x=>x<0).length,flat:changes.filter(x=>x===0).length,total:changes.length},majors,items:sorted.map(({ticker,...x})=>x)};
  }
  async function oi(symbols=[]){
    const list=normalizeSymbols(symbols,CONFIG.maxOiSymbols),stamp=now();
    const items=await safeMapLimit(provider,list,6,async symbol=>{
      try{const p=await provider.getV2OiProfile(symbol);const o=oiFromProfile(p);return{symbol,...o,pass:o.oi4hPct!=null&&o.oi4hPct>=CONFIG.minOi4hPct,error:null}}
      catch(e){return{symbol,oi1hPct:null,oi4hPct:null,oi8hPct:null,oi12hPct:null,oi24hPct:null,pass:false,error:String(e?.message||e)}}
    });
    return{status:'ok',stage:'oi',version:VERSION,updatedAt:stamp,requested:list.length,passCount:items.filter(x=>x.pass).length,items};
  }
  async function deep(symbols=[]){
    const list=normalizeSymbols(symbols,CONFIG.maxDeepSymbols),stamp=now();let fundingMap=new Map(),spotMap=new Map(),futuresMap=new Map();
    try{fundingMap=await provider.getFundingMap()}catch{}
    try{const rows=await provider.getSpotTickers();spotMap=new Map((Array.isArray(rows)?rows:[]).map(x=>[String(x.symbol||'').toUpperCase(),x]))}catch{}
    try{const rows=await provider.getFuturesTickers();futuresMap=new Map((Array.isArray(rows)?rows:[]).map(x=>[String(x.symbol||'').toUpperCase(),x]))}catch{}
    const items=await safeMapLimit(provider,list,2,async symbol=>{
      const frames={},errors=[];
      await safeMapLimit(provider,TIMEFRAMES,3,async tf=>{try{frames[tf]=await provider.getFuturesKlines(symbol,tf,tf==='1d'?180:150)}catch(e){errors.push(`${tf}:${String(e?.message||e)}`)}});
      let oiProfile={},t15=[],t5=[];
      try{[oiProfile,t15,t5]=await Promise.all([provider.getV2OiProfile(symbol),provider.getV2TakerSeries(symbol,'15m',8),provider.getV2TakerSeries(symbol,'5m',8)])}catch(e){errors.push(`derivatives:${String(e?.message||e)}`)}
      const tf=Object.fromEntries(TIMEFRAMES.map(x=>[x,candleMetrics(frames[x]||[],stamp)])),tak15=lastConfirmedTaker(t15,'15m',stamp),tak5=lastConfirmedTaker(t5,'5m',stamp),oiPack=oiFromProfile(oiProfile),ft=futuresMap.get(symbol)||{},st=spotMap.get(symbol)||{};
      const row={symbol,lastPrice:finite(ft.lastPrice)??finite(tf['5m']?.close),priceChange24h:finite(ft.priceChangePercent),quoteVolume24h:finite(ft.quoteVolume),spotPriceChange24h:finite(st.priceChangePercent),fundingRatePct:finite(fundingMap.get(symbol)),...oiPack,taker15m:finite(tak15?.ratio),taker5m:finite(tak5?.ratio),taker15mAt:finite(tak15?.timestamp),taker5mAt:finite(tak5?.timestamp),tf,errors};
      const verdict=classify(row);return{...row,verdict};
    });
    items.sort((a,b)=>{const order={IGNITION_CONFIRMED:0,WATCH_PRIORITY:1,WAIT:2,HOLD:3,PROGRESSED:4};return(order[a.verdict?.key]??9)-(order[b.verdict?.key]??9)||(b.verdict?.score||0)-(a.verdict?.score||0)});
    return{status:'ok',stage:'deep',version:VERSION,updatedAt:stamp,requested:list.length,items};
  }
  return{universe,oi,deep};
}

module.exports={VERSION,TIMEFRAMES,CONFIG,finite,pct,confirmed,candleMetrics,lastConfirmedTaker,buildUniverse,initialFilter,oiFromProfile,scoreCandidate,classify,normalizeSymbols,createAstraAutoScanner};
