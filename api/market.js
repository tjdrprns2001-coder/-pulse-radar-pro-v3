const BASES=['https://data-api.binance.vision','https://api.binance.com','https://api-gcp.binance.com'];
const stableBases=new Set(['USDC','FDUSD','TUSD','USDP','DAI','EUR','TRY','BRL','JPY','GBP','AUD']);
async function getJson(path,params={}){
  let last;
  const qs=new URLSearchParams(params).toString();
  for(const base of BASES){
    try{
      const r=await fetch(base+path+(qs?'?'+qs:''),{headers:{'User-Agent':'PulseRadar-Pro/3.3'}});
      const text=await r.text();
      if(!r.ok){
        let detail=text;
        try{const j=JSON.parse(text); detail=j.msg||j.message||text}catch{}
        throw new Error(`Binance ${r.status}: ${detail}`);
      }
      return JSON.parse(text);
    }catch(e){last=e}
  }
  throw last||new Error('Binance request failed');
}
function n(v,f=0){v=Number(v);return Number.isFinite(v)?v:f}
function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,v))}
function percentile(rows,key){const vals=rows.map(r=>({s:r.symbol,v:n(r[key],NaN)})).filter(x=>Number.isFinite(x.v)).sort((a,b)=>a.v-b.v);const out=new Map(),d=Math.max(1,vals.length-1);vals.forEach((x,i)=>out.set(x.s,i/d*100));return out}
function score(r){const momentum=clamp((r.p1>=95?9:r.p1>=90?7:r.p1>=80?5:r.p1>=60?2:0)+(r.p4>=95?7:r.p4>=90?5:r.p4>=80?3:0)+(r.change1h>0?2:0)+(r.change4h>0?2:0),0,20);const volume=clamp((r.pv>=95?12:r.pv>=90?10:r.pv>=80?7:r.pv>=60?4:1)+(r.quoteVol24>=50e6?8:r.quoteVol24>=10e6?5:r.quoteVol24>=1e6?3:0),0,20);const rs=clamp((r.p1>=95?4:r.p1>=90?3:r.p1>=80?2:r.p1>=50?1:0)+(r.p4>=95?3:r.p4>=90?2:r.p4>=80?1:0)+(r.btcRel>=3?3:r.btcRel>=1?1:0),0,10);let surge=Math.round(clamp(((momentum+volume+rs)/50)*100-(r.change24>=30?12:0)));let pre=0;if(r.change1h>=-1&&r.change1h<=2)pre+=25;else if(r.change1h>-2&&r.change1h<3)pre+=10;if(r.pv>=65&&r.pv<=95)pre+=25;else if(r.pv>50)pre+=12;if(r.p1>=80&&r.p1<98)pre+=25;else if(r.p1>=65)pre+=12;if(r.change24<12)pre+=15;else if(r.change24<20)pre+=7;if(r.btcRel>0)pre+=10;return{surgeScore:surge,preScore:Math.round(clamp(pre)),axis:{volume,momentum,relativeStrength:rs}}}
function chunks(arr,size=100){const out=[];for(let i=0;i<arr.length;i+=size)out.push(arr.slice(i,i+size));return out}
async function rollingFor(symbols,windowSize){
  const groups=chunks(symbols,100);
  const responses=await Promise.all(groups.map(g=>getJson('/api/v3/ticker',{symbols:JSON.stringify(g),windowSize,type:'FULL'})));
  return responses.flatMap(x=>Array.isArray(x)?x:[x]).filter(Boolean);
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=20, stale-while-revalidate=40');
  try{
    const min=n(req.query.minVolume,500000);
    const [ex,t24]=await Promise.all([getJson('/api/v3/exchangeInfo'),getJson('/api/v3/ticker/24hr')]);
    const tradSymbols=(ex.symbols||[]).filter(s=>s.status==='TRADING'&&s.quoteAsset==='USDT'&&s.isSpotTradingAllowed!==false&&!stableBases.has(s.baseAsset)).map(s=>s.symbol);
    const trad=new Set(tradSymbols);
    const [t1,t4]=await Promise.all([rollingFor(tradSymbols,'1h'),rollingFor(tradSymbols,'4h')]);
    const m1=new Map(t1.map(x=>[x.symbol,x])),m4=new Map(t4.map(x=>[x.symbol,x]));
    let rows=(Array.isArray(t24)?t24:[]).filter(x=>trad.has(x.symbol)).map(x=>{const a=m1.get(x.symbol)||{},b=m4.get(x.symbol)||{},q24=n(x.quoteVolume),q1=n(a.quoteVolume);return{symbol:x.symbol,price:n(x.lastPrice),change24:n(x.priceChangePercent),quoteVol24:q24,change1h:n(a.priceChangePercent),change4h:n(b.priceChangePercent),velocity:q24?q1/(q24/24):0,pass:q24>=min}});
    const p1=percentile(rows,'change1h'),p4=percentile(rows,'change4h'),pv=percentile(rows,'velocity');
    const btc=rows.find(r=>r.symbol==='BTCUSDT'),btc1=btc?.change1h||0;
    rows=rows.map(r=>{const e={...r,p1:p1.get(r.symbol)||0,p4:p4.get(r.symbol)||0,pv:pv.get(r.symbol)||0,btcRel:r.change1h-btc1};return{...e,...score(e)}}).sort((a,b)=>Math.max(b.surgeScore,b.preScore)-Math.max(a.surgeScore,a.preScore)||b.quoteVol24-a.quoteVol24);
    res.status(200).json({ok:true,updatedAt:new Date().toISOString(),total:rows.length,eligible:rows.filter(r=>r.pass).length,results:rows});
  }catch(e){
    res.status(502).json({ok:false,error:e?.message||'Data fetch failed'});
  }
};
