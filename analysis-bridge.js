(()=>{
  const FAPI=['https://fapi.binance.com','https://fapi1.binance.com','https://fapi2.binance.com'];
  const n=v=>{v=Number(v);return Number.isFinite(v)?v:null};
  const avg=a=>{a=a.filter(Number.isFinite);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null};
  const pct=(a,b)=>{a=n(a);b=n(b);return a!=null&&b!=null&&a!==0?(b-a)/Math.abs(a)*100:null};
  async function jget(path){let last;for(const base of FAPI){try{const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),4500),r=await fetch(base+path,{cache:'no-store',signal:ctl.signal});clearTimeout(to);if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}catch(e){last=e}}throw last||Error('public futures fetch failed')}
  async function loadDirectDerivatives(){
    try{
      if(typeof symbol==='undefined'||!symbol)return;
      const s=encodeURIComponent(symbol);
      const [pR,oR,hR,tR,qR]=await Promise.allSettled([
        jget(`/fapi/v1/premiumIndex?symbol=${s}`),
        jget(`/fapi/v1/openInterest?symbol=${s}`),
        jget(`/futures/data/openInterestHist?symbol=${s}&period=1h&limit=25`),
        jget(`/futures/data/takerlongshortRatio?symbol=${s}&period=1h&limit=24`),
        jget(`/fapi/v1/ticker/24hr?symbol=${s}`)
      ]);
      const p=pR.status==='fulfilled'?pR.value:null,o=oR.status==='fulfilled'?oR.value:null,h=hR.status==='fulfilled'&&Array.isArray(hR.value)?hR.value:[],t=tR.status==='fulfilled'&&Array.isArray(tR.value)?tR.value:[],q=qR.status==='fulfilled'?qR.value:null;
      if(!p&&!o&&!h.length&&!t.length&&!q)return;
      const mark=n(p?.markPrice),contracts=n(o?.openInterest),oiUsd=contracts!=null&&mark!=null?contracts*mark:null,oi24=h.length>1?pct(h[0]?.sumOpenInterestValue??h[0]?.sumOpenInterest,h.at(-1)?.sumOpenInterestValue??h.at(-1)?.sumOpenInterest):null,funding=n(p?.lastFundingRate),fundingPct=funding!=null?funding*100:null;
      let ratios=t.map(x=>n(x.buySellRatio)).filter(Number.isFinite);if(!ratios.length)ratios=t.map(x=>{let b=n(x.buyVol),s=n(x.sellVol);return b!=null&&s>0?b/s:null}).filter(Number.isFinite);const taker=avg(ratios);
      const flags=[];if(oi24!=null&&oi24>=15)flags.push('OI 증가');if(oi24!=null&&oi24<=-15)flags.push('OI 감소');if(fundingPct!=null&&Math.abs(fundingPct)>=.03)flags.push(fundingPct>0?'양(+) 펀딩':'음(-) 펀딩');if(taker!=null&&taker>=1.15)flags.push('공격적 매수 우위');if(taker!=null&&taker<=.87)flags.push('공격적 매도 우위');
      const pressure=flags.length>=3?'레버리지 과열':flags.length?'레버리지 확대':'중립';
      DER={available:true,symbol,markPrice:mark,openInterestContracts:contracts,openInterestUsdApprox:oiUsd,openInterestChange24hPct:oi24,fundingRate:funding,fundingRatePct:fundingPct,nextFundingTime:n(p?.nextFundingTime),takerBuySellRatio:taker,priceChange24h:n(q?.priceChangePercent),quoteVolume24h:n(q?.quoteVolume),pressure,flags,source:'Binance USD-M browser public REST'};
      if(typeof render==='function')render();
    }catch(e){console.warn('direct derivatives fallback',e)}
  }
  addEventListener('load',()=>{setTimeout(loadDirectDerivatives,1200);setInterval(loadDirectDerivatives,30000)});
})();
