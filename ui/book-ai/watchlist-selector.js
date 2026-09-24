(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseBookAiWatchlistSelector=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const VERSION='BOOK_AI_WATCHLIST_SELECTOR_v1';
const BLOCKED=new Set(['POST-SURGE','DISTRIBUTION-RISK','PUMP-RISK','STALE']);
const CLASS_BONUS={'PRE-SURGE':28,'ACCUMULATION-PRE':22,'META-PRE':18,'SECTOR-ROTATION':12,'ANOMALY':8};
const V2_BONUS={'A-pre':18,'A':14,'A→A+B':10,'NFB-SQ':6,'C':4,'B':0,'A+B':-8,'PROGRESSED':-12,'미완성':0};
const V3_BONUS={PASS:18,SOFT_FAIL:8,MIXED:-6,'N/A':0};
function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function key(x){return String(x?.scanClass?.key||'STALE')}
function score(x){
  if(!x||x.dataState==='failed'||x.v3Invalidation||BLOCKED.has(key(x)))return null;
  const change=n(x.priceChange24h),quote=n(x.quoteVolume24h),candidate=n(x.candidateScore)||0,alignment=n(x.v3AlignmentPct);
  if(quote!=null&&quote<5_000_000)return null;
  if(change!=null&&Math.abs(change)>12)return null;
  let s=(CLASS_BONUS[key(x)]||0)+(V2_BONUS[String(x.v2Type||'미완성')]||0)+(V3_BONUS[String(x.v3LongTier||'N/A')]||0);
  s+=Math.min(20,Math.max(0,candidate*.2));
  if(alignment!=null)s+=Math.max(-8,Math.min(12,(alignment-50)*.24));
  if(change!=null){if(Math.abs(change)<=3)s+=10;else if(Math.abs(change)<=6)s+=6;else if(change>8)s-=8}
  const rvol=n(x.v3Rvol?.ignition15m?.value??x.volumeAcceleration15m),oi=n(x.oi4hChangePct),taker=n(x.trueTakerRatio);
  if(rvol!=null&&rvol>=1.5&&rvol<6)s+=5;if(oi!=null&&oi>1)s+=4;if(taker!=null&&taker>1.2)s+=4;
  return Math.round(s*10)/10;
}
function reasons(x){
  const out=[],k=key(x),change=n(x.priceChange24h),align=n(x.v3AlignmentPct),oi=n(x.oi4hChangePct),tk=n(x.trueTakerRatio);
  if(CLASS_BONUS[k]>=18)out.push(k==='PRE-SURGE'?'급등 전조':'축적/선행 구조');
  if(['A-pre','A','A→A+B'].includes(String(x.v2Type)))out.push('v2 '+x.v2Type);
  if(x.v3LongTier==='PASS')out.push('장기필터 PASS'); else if(x.v3LongTier==='SOFT_FAIL')out.push('장기필터 SOFT');
  if(change!=null&&Math.abs(change)<=6)out.push('24H 덜 진행 '+(change>=0?'+':'')+change.toFixed(1)+'%');
  if(align!=null&&align>=60)out.push('HTF 정렬 '+align.toFixed(0)+'%');
  if(oi!=null&&oi>1)out.push('OI 4H +'+oi.toFixed(1)+'%');
  if(tk!=null&&tk>1.2)out.push('taker '+tk.toFixed(2));
  return out.slice(0,4);
}
function select(items=[],limit=8){
  return items.map(x=>({item:x,watchScore:score(x)})).filter(x=>x.watchScore!=null).sort((a,b)=>b.watchScore-a.watchScore||String(a.item.symbol).localeCompare(String(b.item.symbol))).slice(0,limit).map(({item,watchScore})=>({symbol:item.symbol,watchScore,scanClass:key(item),v2Type:item.v2Type||'미완성',v3Tier:item.v3LongTier||'N/A',marketScope:item.marketScope||'unknown',spotListed:Boolean(item.spotListed),futuresListed:Boolean(item.futuresListed),priceChange24h:n(item.priceChange24h),candidateScore:n(item.candidateScore),reasons:reasons(item)}));
}
return{VERSION,BLOCKED,CLASS_BONUS,V2_BONUS,V3_BONUS,score,reasons,select};
});