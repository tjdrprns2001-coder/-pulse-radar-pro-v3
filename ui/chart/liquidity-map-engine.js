(function(root,factory){
  const Smc=typeof module==='object'&&module.exports?require('./smc-engine.js'):root?.PulseSmcEngine;
  const Liquidity=typeof module==='object'&&module.exports?require('./liquidity-engine.js'):root?.PulseLiquidityEngine;
  const api=factory(Smc,Liquidity);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseLiquidityMapEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Smc,Liquidity){'use strict';

const VERSION='LIQUIDITY_SNAPSHOT_v1';
const TF_ORDER=['1w','1d','4h','1h','15m'];
const finite=v=>Number.isFinite(Number(v)),n=(v,d=null)=>finite(v)?Number(v):d,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function sec(t){const x=n(t,0);return x>1e12?Math.trunc(x/1000):Math.trunc(x)}
function normalizeCandles(rows=[]){
  return (Array.isArray(rows)?rows:[]).filter(Boolean).filter(x=>x.partial!==true).map((x,i)=>({
    time:n(x.time??x.openTime,i),open:n(x.open),high:n(x.high),low:n(x.low),close:n(x.close),volume:n(x.volume,0),
    closeTime:n(x.closeTime,null),partial:false,index:i
  })).filter(x=>[x.open,x.high,x.low,x.close].every(finite)).sort((a,b)=>sec(a.time)-sec(b.time));
}
function latestEvent(events=[]){return [...(Array.isArray(events)?events:[])].filter(Boolean).sort((a,b)=>n(a.confirmedAt,a.i??a.index??0)-n(b.confirmedAt,b.i??b.index??0)).at(-1)||null}
function normalizeDir(v){const s=String(v||'').toLowerCase();if(s.includes('up')||s.includes('bull'))return'up';if(s.includes('down')||s.includes('bear'))return'down';return'neutral'}
function lastAlternatingRange(swings=[],candles=[]){
  const s=[...(Array.isArray(swings)?swings:[])].filter(x=>finite(x.price)&&['H','L'].includes(String(x.type))).sort((a,b)=>n(a.confirmedAt,a.pivotIndex??a.index??0)-n(b.confirmedAt,b.pivotIndex??b.index??0));
  for(let i=s.length-1;i>0;i--){if(s[i].type!==s[i-1].type){const a=s[i-1],b=s[i],low=Math.min(Number(a.price),Number(b.price)),high=Math.max(Number(a.price),Number(b.price));if(high>low)return{low,high,mid:(low+high)/2,source:'canonical-swing',a,b}}}
  const c=candles.slice(-80);if(!c.length)return{low:null,high:null,mid:null,source:'none'};
  const low=Math.min(...c.map(x=>x.low)),high=Math.max(...c.map(x=>x.high));return{low,high,mid:(low+high)/2,source:'recent-80'};
}
function zoneStateOk(z){return z&&!['violated','expired','consumed'].includes(String(z.state||'active').toLowerCase())}
function collectPdArrays(smc={},current,atr){
  const all=[
    ...(smc.fvgs||[]).map(x=>({...x,kind:'FVG'})),
    ...(smc.orderBlocks||[]).map(x=>({...x,kind:'OB'})),
    ...(smc.breakers||[]).map(x=>({...x,kind:'BREAKER'}))
  ].filter(zoneStateOk).filter(z=>finite(z.low)&&finite(z.high));
  return all.map(z=>{
    const lo=Number(z.low),hi=Number(z.high),mid=(lo+hi)/2,distanceAtr=atr>0?Math.abs(mid-current)/atr:null;
    let score=n(z.quality,50);if(z.kind==='BREAKER')score+=7;if(z.state==='mitigated')score+=5;if(z.state==='approaching')score+=4;if(distanceAtr!=null)score-=Math.min(20,distanceAtr*2.2);
    return{...z,low:lo,high:hi,mid,distanceAtr,score:Number(score.toFixed(1))};
  }).sort((a,b)=>b.score-a.score||Math.abs(a.mid-current)-Math.abs(b.mid-current));
}
function levelLabel(l){
  const t=String(l.type||l.kind||'').toUpperCase();
  if(t==='EQH'||t==='EQL'||t==='PDH'||t==='PDL'||t==='PWH'||t==='PWL')return t;
  return l.side==='buy'?'BSL':'SSL';
}
function dedupeLevels(levels=[],atr=0){
  const out=[],tol=Math.max(Math.abs(atr)*.08,1e-12);
  for(const x of [...levels].sort((a,b)=>a.price-b.price)){
    const hit=out.find(y=>y.side===x.side&&Math.abs(y.price-x.price)<=tol);
    if(!hit)out.push(x);else if((x.score||0)>(hit.score||0))Object.assign(hit,x);
  }
  return out;
}
function scoreLiquidityLevel(l,{current,atr,range}={}){
  const type=String(l.type||'').toUpperCase(),side=String(l.side||''),price=Number(l.price);
  let score=25+n(l.quality,0)*.2;
  if(type==='EQH'||type==='EQL')score+=28;
  else if(type==='PWH'||type==='PWL')score+=22;
  else if(type==='PDH'||type==='PDL')score+=18;
  else score+=12;
  const external=range&&finite(range.low)&&finite(range.high)&&(side==='buy'?price>=range.high-atr*.12:price<=range.low+atr*.12);
  if(external)score+=18;
  if(n(l.touches,0)>=2)score+=Math.min(12,n(l.touches,0)*3);
  const distanceAtr=atr>0?Math.abs(price-current)/atr:null;
  if(distanceAtr!=null)score-=Math.min(24,distanceAtr*2);
  if(String(l.state||'active').toLowerCase()==='swept'||String(l.state||'').toLowerCase()==='consumed')score-=35;
  return{score:Number(clamp(score,0,100).toFixed(1)),external,distanceAtr};
}
function collectLiquidityLevels(liq={},current,atr,range){
  const src=(liq.levels||[]).filter(x=>finite(x.price)&&['buy','sell'].includes(String(x.side))).map(x=>{
    const price=Number(x.price),calc=scoreLiquidityLevel(x,{current,atr,range});
    return{...x,price,label:levelLabel(x),...calc,bucket:calc.external?'external':'internal',distancePct:current?((price/current)-1)*100:null};
  });
  const deduped=dedupeLevels(src,atr);
  return deduped.filter(x=>x.side==='buy'?x.price>current:x.price<current).sort((a,b)=>b.score-a.score||Math.abs(a.price-current)-Math.abs(b.price-current));
}
function sweepIndex(s){return n(s?.index,s?.sweepIndex??s?.confirmedAt??-1)}
function sweepDir(s){
  const d=normalizeDir(s?.dir||s?.direction);if(d!=='neutral')return d;
  const k=String(s?.kind||s?.type||'').toUpperCase();if(k.includes('BSL')||k.includes('HIGH'))return'up';if(k.includes('SSL')||k.includes('LOW'))return'down';return'neutral';
}
function recentSweepState(smc={},liq={},candles=[]){
  const list=[...(liq.sweeps||[]),...(smc.sweeps||[])].filter(Boolean).sort((a,b)=>sweepIndex(a)-sweepIndex(b));
  const last=list.at(-1);if(!last)return{state:'NONE',last:null,confirmed:false,dir:'neutral'};
  const idx=sweepIndex(last),dir=sweepDir(last),mss=(smc.mss||[]).filter(x=>sweepIndex(x)>idx).at(-1)||null,disp=(smc.displacements||[]).filter(x=>sweepIndex(x)>idx).at(-1)||null;
  const oppositeMss=mss&&((dir==='down'&&normalizeDir(mss.dir)==='up')||(dir==='up'&&normalizeDir(mss.dir)==='down'));
  const oppositeDisp=disp&&((dir==='down'&&normalizeDir(disp.dir)==='up')||(dir==='up'&&normalizeDir(disp.dir)==='down'));
  const explicit=Boolean(last.confirmed||last.reclaimConfirmed||last.mssConfirmed);
  const confirmed=Boolean(explicit||oppositeMss||oppositeDisp);
  return{state:confirmed?'RECLAIM_CONFIRMED':'SWEEP_WAIT_RECLAIM',last,confirmed,dir,index:idx,mss:mss||null,displacement:disp||null,barsAgo:candles.length?Math.max(0,candles.length-1-idx):null};
}
function chooseReactionZone(pd=[],direction,current){
  const aligned=pd.filter(z=>direction==='up'?normalizeDir(z.dir)==='up':direction==='down'?normalizeDir(z.dir)==='down':true);
  const usable=aligned.length?aligned:pd;
  return [...usable].sort((a,b)=>Math.abs(a.mid-current)-Math.abs(b.mid-current)||b.score-a.score)[0]||null;
}
function targetSideFromBias(bias,sweep){
  if(sweep?.confirmed&&sweep.dir==='down')return'buy';
  if(sweep?.confirmed&&sweep.dir==='up')return'sell';
  if(bias==='up')return'buy';if(bias==='down')return'sell';return null;
}
function buildScenario({current,range,levels,pd,smc,liq,canonicalEvents,htfBias,atr,candles}={}){
  const event=latestEvent(canonicalEvents),localBias=normalizeDir(event?.dir),higher=normalizeDir(htfBias),sweep=recentSweepState(smc,liq,candles);
  let bias=localBias;if(higher!=='neutral'&&localBias==='neutral')bias=higher;if(higher!=='neutral'&&localBias!=='neutral'&&higher!==localBias)bias='neutral';
  let desired=targetSideFromBias(bias,sweep);
  const buys=levels.filter(x=>x.side==='buy'),sells=levels.filter(x=>x.side==='sell');
  if(!desired){const a=buys[0],b=sells[0];desired=!a?'sell':!b?'buy':a.score>b.score?'buy':b.score>a.score?'sell':Math.abs(a.price-current)<Math.abs(b.price-current)?'buy':'sell'}
  const target=(desired==='buy'?buys:sells)[0]||null;
  const direction=desired==='buy'?'up':'down',reaction=chooseReactionZone(pd,direction,current);
  let phase='PRE_SWEEP',phaseLabel='스윕 전 · 유동성 접근 관찰';
  if(sweep.state==='SWEEP_WAIT_RECLAIM'){phase='SWEEP_WAIT_RECLAIM';phaseLabel='스윕 발생 · 리클레임/MSS 확인 대기'}
  if(sweep.state==='RECLAIM_CONFIRMED'){phase='POST_SWEEP_DRAW';phaseLabel='스윕·리클레임 확인 · 반대편 유동성 Draw 관찰'}
  const invalidation=direction==='up'?(sells[0]?.price??range?.low??null):(buys[0]?.price??range?.high??null);
  const primary=target?(target.label+' '+(target.external?'외부':'내부')+' 유동성 '+target.price):'유동성 타겟 N/A';
  const zone=reaction?(reaction.kind+' '+reaction.low+'~'+reaction.high):'근접 PD Array N/A';
  const biasKo=bias==='up'?'상방':bias==='down'?'하방':'중립/혼조';
  const narrative=phase==='POST_SWEEP_DRAW'
    ? ('최근 '+(sweep.dir==='down'?'하단 SSL':'상단 BSL')+' 스윕 뒤 리클레임/구조 확인 신호가 있어 반대편 '+(target?.label||'유동성')+'을 Draw on Liquidity 후보로 관찰합니다.')
    : phase==='SWEEP_WAIT_RECLAIM'
      ? '최근 유동성 스윕은 확인됐지만 리클레임·MSS/Displacement 확인이 부족합니다. 현재는 추격보다 구조 확인이 우선입니다.'
      : (biasKo+' 구조와 미청산 유동성 점수를 함께 보면 '+(target?.label||'가까운 유동성')+'이 우선 관찰 타겟입니다. 실제 스윕 여부는 wick 침투 후 종가 리클레임과 구조 전환으로 확인합니다.');
  return{bias,htfBias:higher,localBias,phase,phaseLabel,direction,target,reactionZone:reaction,invalidation,sweep,primary,zone,narrative};
}
function buildOverlayObjects({levels=[],pd=[],smc={},scenario,current,range}={}){
  const out=[];
  for(const l of levels.slice(0,10))out.push({type:'liquidity-line',price:l.price,label:l.label,side:l.side,score:l.score,bucket:l.bucket,priority:70+(l.external?15:0)+(String(l.type).startsWith('EQ')?10:0)});
  for(const z of pd.slice(0,5))out.push({type:'zone',low:z.low,high:z.high,label:z.kind,dir:normalizeDir(z.dir),score:z.score,priority:60});
  if(range&&finite(range.mid))out.push({type:'equilibrium',price:range.mid,label:'EQ 50%',priority:35});
  const sw=scenario?.sweep?.last;if(sw&&finite(sw.level??sw.price))out.push({type:'sweep',price:Number(sw.level??sw.price),index:sweepIndex(sw),label:scenario.sweep.confirmed?'SWEEP + RECLAIM':'SWEEP · 확인대기',dir:scenario.sweep.dir,priority:95});
  for(const m of (smc.mss||[]).slice(-2))if(finite(m.level))out.push({type:'structure',price:Number(m.level),index:sweepIndex(m),label:'MSS '+String(m.dir||'').toUpperCase(),dir:normalizeDir(m.dir),priority:88});
  if(scenario?.target)out.push({type:'scenario-target',price:scenario.target.price,label:'우선 타겟 '+scenario.target.label,side:scenario.target.side,priority:100});
  if(finite(scenario?.invalidation))out.push({type:'invalidation',price:Number(scenario.invalidation),label:'반증/무효화 관찰',priority:92});
  out.push({type:'current',price:current,label:'현재가',priority:100});
  return out.sort((a,b)=>(b.priority||0)-(a.priority||0));
}
function buildLiquidityMap(input={}){
  if(!Smc||!Liquidity)throw new Error('SMC/Liquidity engine unavailable');
  const candles=normalizeCandles(input.candles||[]);if(candles.length<30)return{ok:false,version:VERSION,error:'확정봉 데이터 부족',candles};
  const canonicalSwings=Array.isArray(input.canonicalSwings)&&input.canonicalSwings.length?input.canonicalSwings:Smc.confirmedPivots(candles,{left:3,right:3});
  const canonicalEvents=Array.isArray(input.canonicalEvents)?input.canonicalEvents:[];
  const current=Number(candles.at(-1).close),atrSeries=Smc.atrSeries(candles),atr=Number(atrSeries.at(-1)||0);
  const smc=Smc.analyzeSmcV2({candles,canonicalSwings,canonicalEvents,htf:{bias:input.htfBias||'neutral'}});
  const liq=Liquidity.analyzeLiquidity({candles,pivots:canonicalSwings,equalLevels:smc.equalLevels,sweeps:smc.sweeps,timeframe:input.timeframe||''});
  const range=smc.pdOte?.available?{low:Number(smc.pdOte.low),high:Number(smc.pdOte.high),mid:Number(smc.pdOte.equilibrium),position:smc.pdOte.position,source:'PD_OTE'}:lastAlternatingRange(canonicalSwings,candles);
  const levels=collectLiquidityLevels(liq,current,atr,range),pd=collectPdArrays(smc,current,atr);
  const scenario=buildScenario({current,range,levels,pd,smc,liq,canonicalEvents,htfBias:input.htfBias,atr,candles});
  const overlays=buildOverlayObjects({levels,pd,smc,scenario,current,range});
  const nearestBuy=levels.filter(x=>x.side==='buy').sort((a,b)=>Math.abs(a.price-current)-Math.abs(b.price-current))[0]||null;
  const nearestSell=levels.filter(x=>x.side==='sell').sort((a,b)=>Math.abs(a.price-current)-Math.abs(b.price-current))[0]||null;
  return{ok:true,version:VERSION,timeframe:String(input.timeframe||''),current,atr,candles,canonicalSwings,canonicalEvents,range,smc,liquidity:liq,levels,pdArrays:pd,scenario,overlays,summary:{nearestBsl:nearestBuy,nearestSsl:nearestSell,position:range.position||(current>range.mid?'premium':current<range.mid?'discount':'equilibrium'),phase:scenario.phase,bias:scenario.bias}};
}
return{VERSION,TF_ORDER,normalizeCandles,lastAlternatingRange,collectPdArrays,collectLiquidityLevels,recentSweepState,buildScenario,buildOverlayObjects,buildLiquidityMap};
});