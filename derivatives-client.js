(()=>{
  const num=v=>{v=Number(v);return Number.isFinite(v)?v:null};
  const avg=a=>{const v=a.filter(Number.isFinite);return v.length?v.reduce((s,x)=>s+x,0)/v.length:null};
  const pct=(a,b)=>{a=num(a);b=num(b);return a!=null&&b!=null&&a!==0?(b-a)/Math.abs(a)*100:null};
  async function j(url,ms=6500){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url,{cache:'no-store',signal:c.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}finally{clearTimeout(t)}}
  function classify(d){const flags=[];const oi=num(d.openInterestChange24hPct),fund=num(d.fundingRatePct),taker=num(d.takerBuySellRatio);if(oi!=null&&oi>=15)flags.push('OI 증가');if(oi!=null&&oi<=-15)flags.push('OI 감소');if(fund!=null&&Math.abs(fund)>=.03)flags.push(fund>0?'양(+) 펀딩':'음(-) 펀딩');if(taker!=null&&taker>=1.15)flags.push('공격적 매수 우위');if(taker!=null&&taker<=.87)flags.push('공격적 매도 우위');return{flags,pressure:flags.length>=3?'레버리지 과열':flags.length?'레버리지 확대':'중립'}}
  async function enrich(){
    try{
      if(typeof symbol==='undefined'||!symbol)return;
      const s=String(symbol).toUpperCase();
      const base='https://fapi.binance.com';
      const [histR,takerR,premiumR,oiR]=await Promise.allSettled([
        j(`${base}/futures/data/openInterestHist?symbol=${encodeURIComponent(s)}&period=1h&limit=25`),
        j(`${base}/futures/data/takerlongshortRatio?symbol=${encodeURIComponent(s)}&period=1h&limit=24`),
        j(`${base}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(s)}`),
        j(`${base}/fapi/v1/openInterest?symbol=${encodeURIComponent(s)}`)
      ]);
      const patch={available:true,symbol:s};
      if(histR.status==='fulfilled'&&Array.isArray(histR.value)&&histR.value.length>1){const h=histR.value;patch.openInterestChange24hPct=pct(h[0]?.sumOpenInterestValue??h[0]?.sumOpenInterest,h.at(-1)?.sumOpenInterestValue??h.at(-1)?.sumOpenInterest)}
      if(takerR.status==='fulfilled'&&Array.isArray(takerR.value)&&takerR.value.length){const t=takerR.value,ratios=t.map(x=>num(x.buySellRatio)).filter(Number.isFinite);let ratio=avg(ratios);if(ratio==null){const bv=t.map(x=>num(x.buyVol)).filter(Number.isFinite),sv=t.map(x=>num(x.sellVol)).filter(Number.isFinite),b=avg(bv),s2=avg(sv);ratio=b!=null&&s2>0?b/s2:null}patch.takerBuySellRatio=ratio}
      if(premiumR.status==='fulfilled'){const p=premiumR.value||{},fr=num(p.lastFundingRate),mark=num(p.markPrice);if(fr!=null)patch.fundingRatePct=fr*100;if(mark!=null)patch.markPrice=mark}
      if(oiR.status==='fulfilled'){const c=num(oiR.value?.openInterest),m=num(patch.markPrice);if(c!=null){patch.openInterestContracts=c;if(m!=null)patch.openInterestUsdApprox=c*m}}
      const old=(typeof DER!=='undefined'&&DER&&typeof DER==='object')?DER:{};
      const merged={...old,...Object.fromEntries(Object.entries(patch).filter(([,v])=>v!=null))};
      const cls=classify(merged);merged.flags=cls.flags;merged.pressure=cls.pressure;merged.source=(old.source?old.source+' + ':'')+'Binance browser public derivatives';merged.available=true;merged.browserEnrichedAt=new Date().toISOString();
      if(typeof DER!=='undefined')DER=merged;
      if(typeof render==='function')render();
    }catch(e){console.debug('derivatives browser enrichment unavailable',e?.message||e)}
  }
  function loop(){enrich().finally(()=>setTimeout(loop,60000))}
  setTimeout(loop,1200);
})();
