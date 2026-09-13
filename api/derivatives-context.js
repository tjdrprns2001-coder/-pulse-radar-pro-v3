const BASES=['https://fapi.binance.com','https://fapi1.binance.com','https://fapi2.binance.com'];

async function get(path){
  let lastErr;
  for(const base of BASES){
    const ctl=new AbortController();
    const timer=setTimeout(()=>ctl.abort(),4500);
    try{
      const r=await fetch(base+path,{signal:ctl.signal,headers:{'accept':'application/json'}});
      const t=await r.text();
      clearTimeout(timer);
      if(!r.ok){ lastErr=new Error(`HTTP ${r.status}`); continue; }
      return JSON.parse(t);
    }catch(e){ clearTimeout(timer); lastErr=e; }
  }
  throw lastErr||new Error('Binance futures fetch failed');
}

const n=v=>Number.isFinite(Number(v))?Number(v):null;
const pct=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b!==0?(a-b)/Math.abs(b)*100:null;

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=20, stale-while-revalidate=40');
  const symbol=String(req.query.symbol||'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g,'');
  try{
    const [premium,oi,ticker,oiHist,taker]=await Promise.allSettled([
      get(`/fapi/v1/premiumIndex?symbol=${symbol}`),
      get(`/fapi/v1/openInterest?symbol=${symbol}`),
      get(`/fapi/v1/ticker/24hr?symbol=${symbol}`),
      get(`/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=25`),
      get(`/futures/data/takerlongshortRatio?symbol=${symbol}&period=1h&limit=24`)
    ]);
    const p=premium.status==='fulfilled'?premium.value:null;
    const o=oi.status==='fulfilled'?oi.value:null;
    const t=ticker.status==='fulfilled'?ticker.value:null;
    const hist=oiHist.status==='fulfilled'&&Array.isArray(oiHist.value)?oiHist.value:[];
    const tk=taker.status==='fulfilled'&&Array.isArray(taker.value)?taker.value:[];
    if(!p&&!o&&!t&&!hist.length&&!tk.length){
      return res.status(200).json({ok:true,available:false,symbol,note:'Binance USD-M 선물 데이터 없음'});
    }
    const first=hist[0],last=hist.at(-1);
    const oiFirst=n(first?.sumOpenInterestValue)??n(first?.sumOpenInterest);
    const oiLast=n(last?.sumOpenInterestValue)??n(last?.sumOpenInterest);
    const takerRatios=tk.map(x=>n(x.buySellRatio)).filter(Number.isFinite);
    const takerAvg=takerRatios.length?takerRatios.reduce((a,b)=>a+b,0)/takerRatios.length:null;
    const funding=n(p?.lastFundingRate);
    const markPrice=n(p?.markPrice);
    const indexPrice=n(p?.indexPrice);
    const openInterest=n(o?.openInterest);
    const priceChangePct=n(t?.priceChangePercent);
    const quoteVolume=n(t?.quoteVolume);
    const oiChange24h=pct(oiLast,oiFirst);
    let pressure='중립';
    const notes=[];
    if(Number.isFinite(oiChange24h)){
      if(oiChange24h>=15){pressure='레버리지 확대';notes.push(`OI 24h +${oiChange24h.toFixed(1)}%`)}
      else if(oiChange24h<=-15){pressure='레버리지 축소';notes.push(`OI 24h ${oiChange24h.toFixed(1)}%`)}
    }
    if(Number.isFinite(funding)){
      const fp=funding*100;
      if(fp>=0.03)notes.push(`양(+) 펀딩 ${fp.toFixed(4)}%`);
      if(fp<=-0.03)notes.push(`음(-) 펀딩 ${fp.toFixed(4)}%`);
    }
    if(Number.isFinite(takerAvg)){
      if(takerAvg>=1.15)notes.push(`공격적 매수 우위 ${takerAvg.toFixed(2)}x`);
      else if(takerAvg<=0.87)notes.push(`공격적 매도 우위 ${takerAvg.toFixed(2)}x`);
    }
    return res.status(200).json({
      ok:true,available:true,symbol,updatedAt:new Date().toISOString(),
      markPrice,indexPrice,openInterest,oiValue:oiLast,oiChange24h,
      fundingRate:funding,fundingPct:Number.isFinite(funding)?funding*100:null,
      priceChange24h:priceChangePct,quoteVolume24h:quoteVolume,
      takerBuySellRatio:takerAvg,pressure,notes,
      source:'Binance USD-M public market data',
      caveat:'공개 파생시장 데이터 기반 진단이며 청산 총액/개별 포지션 정보는 포함하지 않음'
    });
  }catch(e){
    return res.status(200).json({ok:true,available:false,symbol,error:e?.message||'Derivatives context unavailable'});
  }
}
