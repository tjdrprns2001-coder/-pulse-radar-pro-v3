'use strict';

/**
 * PTB-EARLY / Cross-Exchange Lead
 * Additive research layer: never deduplicates samples. Multiple DNA matches
 * are retained so overlap can be scored downstream.
 */
const DEFAULTS=Object.freeze({
  windowHours:[24,48,72],
  quietPricePct:10,
  spotVolumeLeadMin:2,
  futuresVolumeLeadMin:2,
  oiBuild4hPct:1,
  oiStrong4hPct:3,
  reclaimMaxHours:8,
  takerLeadMin:1.2,
  takerCooldownMax:1.0,
  cooldownPriceHoldPct:3
});
function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function pct(a,b){a=n(a);b=n(b);return a!=null&&b>0?(a/b-1)*100:null}
function ratio(a,b){a=n(a);b=n(b);return a!=null&&b>0?a/b:null}
function normalizeExchange(x={}){
  return {exchange:String(x.exchange||'unknown').toLowerCase(),market:String(x.market||'spot').toLowerCase(),
    timestamp:n(x.timestamp),price:n(x.price),volume:n(x.volume),baselineVolume:n(x.baselineVolume),
    volumeRatio:n(x.volumeRatio)??ratio(x.volume,x.baselineVolume),oi:n(x.oi),oiBaseline:n(x.oiBaseline),
    oiChangePct:n(x.oiChangePct)??pct(x.oi,x.oiBaseline)};
}
function detectSweepReclaim(rows=[]){
  if(!Array.isArray(rows)||rows.length<4)return{found:false};
  const a=rows.map(r=>({timestamp:n(r.timestamp??r[0]),low:n(r.low??r[3]),close:n(r.close??r[4])})).filter(r=>r.low!=null&&r.close!=null);
  if(a.length<4)return{found:false};
  for(let i=2;i<a.length-1;i++){
    const priorLow=Math.min(...a.slice(0,i).map(r=>r.low));
    if(a[i].low<priorLow&&a.slice(i+1).some(r=>r.close>priorLow))
      return{found:true,sweepAt:a[i].timestamp,reclaimLevel:priorLow};
  }
  return{found:false};
}
function detectTakerCooldownPriceHold(rows=[],cfg=DEFAULTS){
  const a=(rows||[]).map(x=>({timestamp:n(x.timestamp),ratio:n(x.ratio??x.buySellRatio),price:n(x.price)})).filter(x=>x.ratio!=null);
  const lead=a.findIndex(x=>x.ratio>=cfg.takerLeadMin);
  if(lead<0)return{found:false};
  const cool=a.findIndex((x,i)=>i>lead&&x.ratio<=cfg.takerCooldownMax);
  if(cool<0)return{found:false,leadAt:a[lead].timestamp};
  const lp=a[lead].price,cp=a[cool].price;
  const draw=lp!=null&&cp!=null&&lp>0?(cp/lp-1)*100:null;
  const held=draw==null||draw>=-cfg.cooldownPriceHoldPct;
  return{found:held,leadAt:a[lead].timestamp,cooldownAt:a[cool].timestamp,priceHoldPct:draw};
}
function analyzeCrossExchangeLead({symbol,priceChangePct,spot=[],futures=[],binanceOi4hPct,binanceOi8hPct,priceRows=[],takerRows=[],eventCatalyst=false}={},cfg=DEFAULTS){
  const S=(spot||[]).map(normalizeExchange),F=(futures||[]).map(normalizeExchange);
  const spotLeads=S.filter(x=>x.volumeRatio!=null&&x.volumeRatio>=cfg.spotVolumeLeadMin).sort((a,b)=>(a.timestamp||Infinity)-(b.timestamp||Infinity));
  const futuresLeads=F.filter(x=>x.volumeRatio!=null&&x.volumeRatio>=cfg.futuresVolumeLeadMin).sort((a,b)=>(a.timestamp||Infinity)-(b.timestamp||Infinity));
  const oi4=n(binanceOi4hPct),oi8=n(binanceOi8hPct),quiet=n(priceChangePct)!=null&&Math.abs(n(priceChangePct))<=cfg.quietPricePct;
  const sweep=detectSweepReclaim(priceRows);
  const takerCooldown=detectTakerCooldownPriceHold(takerRows,cfg);
  const events=[];
  for(const x of spotLeads)events.push({type:'SPOT_VOLUME_LEAD',exchange:x.exchange,timestamp:x.timestamp,value:x.volumeRatio});
  for(const x of futuresLeads)events.push({type:'FUTURES_VOLUME_LEAD',exchange:x.exchange,timestamp:x.timestamp,value:x.volumeRatio});
  if(takerCooldown.found)events.push({type:'TAKER_COOLDOWN_PRICE_HOLD',exchange:'binance',timestamp:takerCooldown.cooldownAt,value:takerCooldown.priceHoldPct});
  if(sweep.found)events.push({type:'SWEEP_RECLAIM',exchange:'price',timestamp:sweep.sweepAt,value:sweep.reclaimLevel});
  if(oi4!=null&&oi4>=cfg.oiBuild4hPct)events.push({type:'BINANCE_OI_BUILD',exchange:'binance',timestamp:null,value:oi4});
  events.sort((a,b)=>(a.timestamp??Infinity)-(b.timestamp??Infinity));
  const first=events[0]||null;
  let score=0,reasons=[];
  if(quiet){score+=15;reasons.push('price still quiet')}
  if(spotLeads.length){score+=25;reasons.push('cross-exchange spot volume leads')}
  if(futuresLeads.length){score+=20;reasons.push('futures volume leads')}
  if(sweep.found){score+=15;reasons.push('liquidity sweep/reclaim')}
  if(takerCooldown.found){score+=15;reasons.push('taker lead then cooldown while price holds')}
  if(eventCatalyst){score+=5;reasons.push('event catalyst present')}
  if(oi4!=null&&oi4>=cfg.oiBuild4hPct){score+=10;reasons.push('Binance OI build confirmation')}
  if(oi4!=null&&oi4>=cfg.oiStrong4hPct){score+=10;reasons.push('Binance OI strong acceleration')}
  if(oi8!=null&&oi8>=2){score+=5;reasons.push('8H OI persistence')}
  return {version:'ptb-early-v1',symbol:String(symbol||'').toUpperCase(),eligible:Boolean(quiet&&(spotLeads.length||futuresLeads.length)),
    score:Math.min(100,score),firstSignal:first,leadSequence:events,spotLeads,futuresLeads,sweep,takerCooldown,eventCatalyst:Boolean(eventCatalyst),
    binanceOi4hPct:oi4,binanceOi8hPct:oi8,reasons,
    tags:[...(spotLeads.length?['PTB_EARLY_SPOT_LEAD']:[]),...(futuresLeads.length?['PTB_EARLY_FUTURES_VOLUME']:[]),...(sweep.found?['PTB_EARLY_SWEEP_RECLAIM']:[]),...(takerCooldown.found?['TAKER_COOLDOWN_PRICE_HOLD']:[]),...(eventCatalyst?['EVENT_PRE_SURGE']:[]),...(oi4!=null&&oi4>=cfg.oiBuild4hPct?['PTB_EARLY_OI_CONFIRM']:[])],
    preserveDuplicateSamples:true};
}
function appendSample(existing=[],sample){
  // Deliberately append-only: identical/overlapping samples are research evidence.
  return [...(Array.isArray(existing)?existing:[]),sample];
}
module.exports={DEFAULTS,normalizeExchange,detectSweepReclaim,detectTakerCooldownPriceHold,analyzeCrossExchangeLead,appendSample};
