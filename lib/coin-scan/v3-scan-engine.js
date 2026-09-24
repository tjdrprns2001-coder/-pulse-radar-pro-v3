'use strict';

const Trend=require('../../ui/chart/long-term-trendline-engine.js');
const Card=require('../../ui/long-trend/card-engine.js');
const Aggregate=require('../../ui/long-trend/aggregate-engine.js');
const Smc=require('../../ui/chart/smc-engine.js');
const Causal=require('../../ui/chart/causal-ict-engine.js');

const VERSION='v3';
const PARAM_SET='v3_longtrend_taker_0.8_1.2';
const LONG_TFS=Object.freeze(['28d','14d','1w','3d','1d','4h']);
const FLOW_TFS=Object.freeze(['1w','3d','1d','12h','4h','1h','15m','5m']);
const MA_PERIODS=Object.freeze([14,28,57,92,268,378]);
const CARD_POLICY=Object.freeze({
  minBars:40,minConfirmedSwings:6,pivotLeft:3,pivotRight:3,
  slopeNeutralDailyPct:.02,closeToleranceAtr:.35,structureLookbackPerSide:2,
  neutralOnBreakCandidate:true,confirmedBreakStages:['BREAK_CONFIRMED','ROLE_FLIP']
});
const PARAMS=Object.freeze({
  longCore:Object.freeze(['1w','3d','28d']),
  minLongCoreUp:2,
  minAlignmentPct:50,
  minValidLongFrames:4,
  rvolLookback:20,
  htfDiscountPct:35,
  midTermPremiumPct:80
});

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function median(values=[]){const a=values.map(finite).filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function pct(a,b){a=finite(a);b=finite(b);return a!=null&&b!=null&&a!==0?(b/a-1)*100:null}
function closeTime(row){return Array.isArray(row)?finite(row[6]):finite(row?.closeTime)}
function toConfirmedCandles(rows=[],now=Date.now()){
  return(Array.isArray(rows)?rows:[]).filter(x=>{
    if(Array.isArray(x)){const ct=closeTime(x);return x.length>=7&&finite(x[4])!=null&&(ct==null||ct<now)}
    return x&&x.partial!==true&&finite(x.close)!=null&&finite(x.time??x.openTime)!=null;
  }).map(x=>Array.isArray(x)?({
    time:Number(x[0]),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4]),volume:Number(x[5]||0),closeTime:Number(x[6]),partial:false
  }):({...x,time:Number(x.time??x.openTime),open:Number(x.open??x.close),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:Number(x.volume||0),partial:false}));
}
function rollupFixedDaily(rows=[],days=14){
  const src=toConfirmedCandles(rows).sort((a,b)=>a.time-b.time),dayMs=86400000,buckets=new Map();
  for(const x of src){const key=Math.floor(Math.floor(x.time/dayMs)/days);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(x)}
  const out=[];
  for(const g of [...buckets.values()].sort((a,b)=>a[0].time-b[0].time)){
    if(g.length!==days)continue;
    let contiguous=true;for(let i=1;i<g.length;i++)if(Math.round((g[i].time-g[i-1].time)/dayMs)!==1){contiguous=false;break}
    if(!contiguous)continue;
    out.push({time:g[0].time,open:g[0].open,high:Math.max(...g.map(x=>x.high)),low:Math.min(...g.map(x=>x.low)),close:g.at(-1).close,volume:g.reduce((s,x)=>s+(finite(x.volume)||0),0),closeTime:g.at(-1).closeTime,partial:false,syntheticDays:days});
  }
  return out;
}
function buildLongFrames(frames={}){
  const oneDay=toConfirmedCandles(frames['1d']||[]);
  return{
    '28d':rollupFixedDaily(oneDay,28),
    '14d':rollupFixedDaily(oneDay,14),
    '1w':toConfirmedCandles(frames['1w']||[]),
    '3d':toConfirmedCandles(frames['3d']||[]),
    '1d':oneDay,
    '4h':toConfirmedCandles(frames['4h']||[])
  };
}
function analyzeLongTerm(frames={}){
  const longFrames=buildLongFrames(frames),cards={},analysis={};
  for(const tf of LONG_TFS){
    const rows=longFrames[tf]||[],swings=Card.extractLogCloseCanonicalSwings(rows,CARD_POLICY);
    const a=Trend.analyzeTrendlines(rows,{timeframe:tf,canonicalSwings:swings});
    const raw={candles:rows,canonicalSwings:swings};
    analysis[tf]=a;cards[tf]=Card.buildCardResult({tf,raw,analysis:a,params:CARD_POLICY});
  }
  const summary=Aggregate.buildSummary(cards,longFrames['1d']||[]);
  return{frames:longFrames,cards,analysis,summary};
}
function longFilter(cards={}){
  const valid=LONG_TFS.map(tf=>cards[tf]).filter(x=>x?.available&&['UP','DOWN','NEUTRAL'].includes(x.badgeKey));
  const up=valid.filter(x=>x.badgeKey==='UP').length,down=valid.filter(x=>x.badgeKey==='DOWN').length,neutral=valid.filter(x=>x.badgeKey==='NEUTRAL').length;
  const core=PARAMS.longCore.map(tf=>cards[tf]).filter(x=>x?.available&&['UP','DOWN','NEUTRAL'].includes(x.badgeKey));
  const coreUp=core.filter(x=>x.badgeKey==='UP').length,coreDown=core.filter(x=>x.badgeKey==='DOWN').length;
  const alignment=valid.length?Math.max(up,down)/valid.length*100:0;
  const lowCoverage=valid.length<PARAMS.minValidLongFrames,mixed=lowCoverage||alignment<PARAMS.minAlignmentPct;
  const pass=coreUp>=PARAMS.minLongCoreUp;
  const tier=mixed?'MIXED':pass?'PASS':'SOFT_FAIL';
  return{
    tier,label:tier==='PASS'?'장기정렬 통과':tier==='SOFT_FAIL'?'장기정렬 후순위':'혼조·관망',
    pass,softFail:!pass&&!mixed,mixed,lowCoverage,typeClassificationAllowed:!mixed,
    alignmentPct:Number(alignment.toFixed(1)),validFrames:valid.length,totalFrames:LONG_TFS.length,
    counts:{up,down,neutral},core:{frames:PARAMS.longCore,valid:core.length,up:coreUp,down:coreDown,requiredUp:PARAMS.minLongCoreUp},
    badges:Object.fromEntries(LONG_TFS.map(tf=>[tf,cards[tf]?.available?cards[tf].badgeKey:'N/A']))
  };
}
function rvol(rows=[],lookback=PARAMS.rvolLookback){
  const a=toConfirmedCandles(rows);if(a.length<lookback+1)return{value:null,state:'N/A',lookback,baseline:'median'};
  const current=finite(a.at(-1).volume),base=median(a.slice(-lookback-1,-1).map(x=>x.volume));
  const value=current!=null&&base>0?current/base:null;
  const state=value==null?'N/A':value>10?'EXPANSION':value>=3?'IGNITION':value>=1.5?'PRE-SPARK':'NORMAL';
  return{value:value==null?null:Number(value.toFixed(3)),state,lookback,baseline:'median'};
}
function rvolPack(frames={}){
  return{main1h:rvol(frames['1h']),ignition15m:rvol(frames['15m']),reference5m:rvol(frames['5m'])};
}
function emaSeries(values=[],period=14){
  const out=Array(values.length).fill(null);if(!values.length)return out;const alpha=2/(period+1);let prev=finite(values[0]);if(prev==null)return out;
  out[0]=prev;for(let i=1;i<values.length;i++){const v=finite(values[i]);if(v==null)continue;prev=v*alpha+prev*(1-alpha);out[i]=prev}return out;
}
function smaSeries(values=[],period=14){
  const out=Array(values.length).fill(null);let sum=0,count=0;
  for(let i=0;i<values.length;i++){const v=finite(values[i]);if(v!=null){sum+=v;count++}if(i>=period){const old=finite(values[i-period]);if(old!=null){sum-=old;count--}}if(i>=period-1&&count===period)out[i]=sum/period}
  return out;
}
function atrSeries(rows=[],period=14){
  const out=Array(rows.length).fill(null),tr=[];for(let i=0;i<rows.length;i++){const prev=i?rows[i-1].close:rows[i].close;tr.push(Math.max(rows[i].high-rows[i].low,Math.abs(rows[i].high-prev),Math.abs(rows[i].low-prev)))}
  return smaSeries(tr,period);
}
function strictlyBullish(values){return values.length>1&&values.every(Number.isFinite)&&values.every((v,i)=>i===values.length-1||v>values[i+1])}
function distPct(a,b){a=finite(a);b=finite(b);return a!=null&&b!=null&&b!==0?(a/b-1)*100:null}
function movingAverageStructure(rows=[]){
  const c=toConfirmedCandles(rows),closes=c.map(x=>x.close);if(c.length<MA_PERIODS.at(-1)+4)return{available:false,bars:c.length,requiredBars:MA_PERIODS.at(-1)+4};
  const ema=Object.fromEntries(MA_PERIODS.map(p=>[p,emaSeries(closes,p)])),sma=Object.fromEntries(MA_PERIODS.map(p=>[p,smaSeries(closes,p)])),atr=atrSeries(c,14);
  const idx=c.length-1,old=Math.max(0,idx-3);
  const valuesAt=i=>[...MA_PERIODS.map(p=>ema[p][i]),...MA_PERIODS.map(p=>sma[p][i])];
  const emaNow=MA_PERIODS.map(p=>ema[p][idx]),smaNow=MA_PERIODS.map(p=>sma[p][idx]),emaOld=MA_PERIODS.map(p=>ema[p][old]),smaOld=MA_PERIODS.map(p=>sma[p][old]);
  const widths=[];for(let i=Math.max(MA_PERIODS.at(-1)-1,idx-40);i<=idx;i++){const vals=valuesAt(i),a=atr[i];if(vals.every(Number.isFinite)&&a>0)widths.push({i,value:(Math.max(...vals)-Math.min(...vals))/a})}
  const current=widths.at(-1)?.value??null,base=median(widths.slice(-21,-1).map(x=>x.value)),compressed=current!=null&&base!=null&&current<base;
  const bullish=strictlyBullish(emaNow)&&strictlyBullish(smaNow),bullish3Ago=strictlyBullish(emaOld)&&strictlyBullish(smaOld);
  const e14=ema[14][idx],e28=ema[28][idx],e57=ema[57][idx],e92=ema[92][idx],e268=ema[268][idx],e378=ema[378][idx],p=closes[idx];
  const oldP=closes[old],oe14=ema[14][old],oe28=ema[28][old],oe57=ema[57][old],oe92=ema[92][old],oe268=ema[268][old],oe378=ema[378][old];
  const ctxNow={priceEma14:distPct(p,e14),priceEma28:distPct(p,e28),ema14Ema92:distPct(e14,e92),midLong:distPct((e57+e92)/2,(e268+e378)/2)};
  const ctxOld={priceEma14:distPct(oldP,oe14),priceEma28:distPct(oldP,oe28),ema14Ema92:distPct(oe14,oe92),midLong:distPct((oe57+oe92)/2,(oe268+oe378)/2)};
  const divergence={};for(const k of Object.keys(ctxNow))divergence[k]={value:ctxNow[k],change3Bars:ctxNow[k]!=null&&ctxOld[k]!=null?ctxNow[k]-ctxOld[k]:null};
  return{available:true,bars:c.length,periods:MA_PERIODS,bullishAligned:bullish,alignmentTransition:bullish&&!bullish3Ago,ribbonWidthAtr:current,compressionMedian20:base,compressed,compressionRatio:current!=null&&base>0?current/base:null,divergence,latest:{ema:Object.fromEntries(MA_PERIODS.map((p,i)=>[p,emaNow[i]])),sma:Object.fromEntries(MA_PERIODS.map((p,i)=>[p,smaNow[i]]))}};
}
function movingAveragePack(frames={}){
  return Object.fromEntries(['1w','3d','1d','12h','4h','1h','15m'].map(tf=>[tf,movingAverageStructure(frames[tf]||[])]));
}
function oiSegment(a,newerAgo,olderAgo){
  const val=x=>finite(x?.sumOpenInterest);
  if(!Array.isArray(a)||a.length<=olderAgo)return null;const newer=val(a[a.length-1-newerAgo]),older=val(a[a.length-1-olderAgo]);return older&&newer!=null?(newer/older-1)*100:null;
}
function oiPath(v2Profile={}){
  const a=Array.isArray(v2Profile.rows)?v2Profile.rows:[],s0=oiSegment(a,0,4),s1=oiSegment(a,4,8),s2=oiSegment(a,8,12);
  const sign=x=>x==null?'?':x>0?'+':x<0?'-':'0',pattern=[sign(s0),sign(s1),sign(s2)].join('/');
  let state='MIXED';if(s0>0&&s1>0&&s2>0)state='BUILD';else if(s0<0&&s1>0&&s2>0)state='CLEAN→REBUILD';else if(s0>0&&s1<0&&s2<0)state='WEAKENING';
  return{segments:{h0_4:s0,h4_8:s1,h8_12:s2},pattern,state,main4hPct:finite(v2Profile.oi4hPct),mainBuild:finite(v2Profile.oi4hPct)!=null&&finite(v2Profile.oi4hPct)>1};
}
function trueTakerRatio(row){const b=finite(row?.buyVol),s=finite(row?.sellVol);if(b!=null&&s>0)return b/s;return finite(row?.ratio)}
function takerState(v){v=finite(v);return v==null?'N/A':v<.8?'WEAK':v>=1.5?'STRONG':v>1.2?'IMPROVE':'NEUTRAL'}
function takerPack(v2Profile={}){
  const one=(Array.isArray(v2Profile.taker1h)?v2Profile.taker1h:[]).map(trueTakerRatio).filter(Number.isFinite),last=one.at(-1)??null,improve3=one.slice(-3).filter(x=>x>1.2).length;
  return{latest:last,state:takerState(last),series1h:one.slice(-6),improveCount3:improve3,directionConfirm:improve3>=2&&finite(v2Profile.oi4hPct)>1,definition:'buyVol / sellVol; Binance taker buy/sell volume'};
}
function nearestPd(rows=[]){
  const candles=toConfirmedCandles(rows);if(candles.length<30)return null;
  const pivots=Smc.confirmedPivots(candles,{left:3,right:3}),s=Smc.analyzeSmcV2({candles,canonicalSwings:pivots,canonicalEvents:[],htf:{}});
  const price=finite(candles.at(-1)?.close),zones=[...(s.fvgs||[]),...(s.orderBlocks||[]),...(s.breakers||[])].filter(z=>!['violated','expired'].includes(String(z.state)));
  const ranked=zones.map(z=>{const mid=(finite(z.low)+finite(z.high))/2,d=price&&mid?((price/mid)-1)*100:null;return{kind:z.kind,dir:z.dir,state:z.state,low:z.low,high:z.high,ce:z.ce,quality:z.quality,distancePct:d}}).filter(x=>x.distancePct!=null).sort((a,b)=>Math.abs(a.distancePct)-Math.abs(b.distancePct));
  return ranked[0]||null;
}
function causalSequencePack(frames={}){
  const out={version:Causal.VERSION,available:false,timeframes:{}};
  for(const tf of ['4h','1h']){
    const rows=toConfirmedCandles(frames[tf]||[]).slice(-560);if(rows.length<40)continue;
    const r=Causal.run(rows),contract=Causal.validateCausalContracts(r),counts={};
    for(const e of r.events||[])counts[e.event_type]=(counts[e.event_type]||0)+1;
    out.timeframes[tf]={bars:r.bars,sequence:r.sequence,contractPass:contract.pass,eventCounts:counts,latestEvents:(r.events||[]).slice(-12).map(e=>({type:e.event_type,bar:e.bar_index,payload:e.payload}))};
    out.available=true;
  }
  const primary=out.timeframes['4h']||out.timeframes['1h']||null;
  out.primaryTf=out.timeframes['4h']?'4h':out.timeframes['1h']?'1h':null;
  out.longStage=primary?.sequence?.long?.stage||'N/A';out.shortStage=primary?.sequence?.short?.stage||'N/A';
  out.contractPass=Object.values(out.timeframes).every(x=>x.contractPass!==false);
  return out;
}
function precisionFlags({range1wPct,range1dPct}={}){
  const w=finite(range1wPct),d=finite(range1dPct);
  return{htfDiscount:w!=null&&w<=PARAMS.htfDiscountPct,midTermPremium:d!=null&&d>=PARAMS.midTermPremiumPct,range1wPct:w,range1dPct:d};
}
function evaluate({frames={},v2Profile={},range1wPct=null,range1dPct=null,precisionMode=false}={}){
  const long=analyzeLongTerm(frames),filter=longFilter(long.cards),rvols=rvolPack(frames),ma=movingAveragePack(frames),oi=oiPath(v2Profile),taker=takerPack(v2Profile),pd=nearestPd(frames['1h']||[]),flags=precisionFlags({range1wPct,range1dPct}),causalIct=precisionMode?causalSequencePack(frames):{version:Causal.VERSION,available:false,reason:'precision-mode-only'};
  const contradictions=[],warnings=[];if(filter.core.down>=2)contradictions.push('장기 핵심 3TF 중 2개 이상 하락');if(filter.mixed)warnings.push(filter.lowCoverage?'장기추세 데이터 커버리지 부족':'6TF 정렬도 50% 미만');if(taker.state==='WEAK'&&oi.mainBuild)warnings.push('OI 증가 중 taker 매도 우위 · 방향 미확정 BUILD');
  return{version:VERSION,paramSet:PARAM_SET,longTerm:{filter,cards:long.cards,summary:long.summary},oiPath:oi,taker,rvol:rvols,movingAverage:ma,nearestPd:pd,causalIct,precision:{enabled:Boolean(precisionMode),...flags},contradictions,warnings,invalidation:contradictions.length>0||causalIct.contractPass===false,classificationAllowed:filter.typeClassificationAllowed};
}
function effectiveType(v2Flow={},v3={}){
  if(!v3?.classificationAllowed)return'미완성';
  const raw=String(v2Flow?.rawType||v2Flow?.type||'INCOMPLETE');
  if(v3?.precision?.enabled&&raw==='A'&&!v3.precision.htfDiscount)return'A-pre';
  return raw==='INCOMPLETE'?'미완성':raw;
}
function stageFor(type,v3={}){
  if(type==='NFB-SC'||v3?.invalidation)return'⚠️ 반증/무효화';
  if(v3?.rvol?.main1h?.state==='EXPANSION'||v3?.rvol?.ignition15m?.state==='EXPANSION')return'🔥 EXPANSION';
  return({'A-pre':'🟢 A-pre','A':'🟡 A','A→A+B':'🟠 A→A+B','A+B':'🔴 A+B','NFB':'🟢 NFB','NFB-SQ':'🟠 NFB-SQ','C':'🟢 C(CLEAN→REBUILD)','B':'🟡 B','미완성':'⚪ 미완성','INCOMPLETE':'⚪ 미완성'})[type]||'⚪ 관찰';
}
function badgeDots(filter={}){const map={UP:'●',NEUTRAL:'○',DOWN:'▼','N/A':'·'};return PARAMS.longCore.map(tf=>map[filter?.badges?.[tf]]||'·').join('')}
function formatOutput({symbol='',type='미완성',v3={}}={}){
  const f=v3?.longTerm?.filter||{},oi=v3?.oiPath||{},tk=v3?.taker||{},r1=v3?.rvol?.main1h||{},r15=v3?.rvol?.ignition15m||{},pd=v3?.nearestPd;
  const n=x=>finite(x)==null?'-':Number(x).toFixed(2),pdText=pd?(pd.kind+(pd.dir==='up'?'↑':pd.dir==='down'?'↓':'')+' '+n(pd.distancePct)+'%'):'N/A',invalid=v3?.invalidation?'있음':'없음';
  return'['+String(symbol||'').toUpperCase()+'] 장기정렬('+badgeDots(f)+') '+String(f.tier||'N/A')+' '+n(f.alignmentPct)+'% | '+type+' | '+stageFor(type,v3)+' | OI '+String(oi.state||'N/A')+'('+String(oi.pattern||'?/?/?')+') | taker '+n(tk.latest)+' '+String(tk.state||'N/A')+' | RVOL 1H '+n(r1.value)+'x '+String(r1.state||'N/A')+' / 15m '+n(r15.value)+'x '+String(r15.state||'N/A')+' | 근접PD '+pdText+' | 반증 '+invalid;
}
module.exports={VERSION,PARAM_SET,LONG_TFS,FLOW_TFS,MA_PERIODS,CARD_POLICY,PARAMS,toConfirmedCandles,rollupFixedDaily,buildLongFrames,analyzeLongTerm,longFilter,rvol,rvolPack,movingAverageStructure,movingAveragePack,oiPath,trueTakerRatio,takerState,takerPack,nearestPd,causalSequencePack,precisionFlags,evaluate,effectiveType,stageFor,badgeDots,formatOutput};
