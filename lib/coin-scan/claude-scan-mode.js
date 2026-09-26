'use strict';

const TIMEFRAMES=Object.freeze(['1w','3d','1d','12h','4h','1h','15m','5m']);
const CONFIG=Object.freeze({
  maxAbs24hPct:10,
  volumePercentile:0.70,
  htfDiscountPct:35,
  midTermPremiumPct:80,
  takerWeak:0.8,
  takerImprove:1.2,
  takerStrong:1.5,
  rvolPreSpark:1.5,
  rvolIgnition:3,
  rvolExpansion:10,
  fundingNfbPct:0,
  directionBars:3,
  directionMinImprove:2,
  provisionalParams:['volumePercentile','htfDiscountPct','midTermPremiumPct','fundingNfbPct']
});
const EMA_PERIODS=Object.freeze([12,14,26,28,57,92,268,378]);
const SMA_PERIODS=Object.freeze([5,10,14,20,28,57,60,92,120,260,378]);

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function avg(a=[]){const x=a.map(finite).filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function percentile(a=[],p=.5){const x=a.map(finite).filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return null;const i=(x.length-1)*Math.max(0,Math.min(1,p)),lo=Math.floor(i),hi=Math.ceil(i);return lo===hi?x[lo]:x[lo]+(x[hi]-x[lo])*(i-lo)}
function dynamicUniverse(rows=[],config=CONFIG){
  const q=rows.map(x=>finite(x.quoteVolume24h)).filter(x=>x>0),threshold=percentile(q,config.volumePercentile);
  return{threshold,percentile:config.volumePercentile,items:rows.filter(x=>finite(x.priceChange24h)!=null&&Math.abs(x.priceChange24h)<=config.maxAbs24hPct&&finite(x.quoteVolume24h)!=null&&(threshold==null||x.quoteVolume24h>=threshold))};
}
function confirmedKlines(rows=[],asOf=Date.now()){return(Array.isArray(rows)?rows:[]).filter(x=>Array.isArray(x)&&x.length>=7&&finite(x[4])!=null&&(finite(x[6])==null||finite(x[6])<asOf))}
function pct(a,b){const x=finite(a),y=finite(b);return x!=null&&y>0?((x/y)-1)*100:null}
function oiPath(profile={}){
  const rows=(Array.isArray(profile?.rows)?profile.rows:[]).map(x=>({...x,timestamp:finite(x?.timestamp),sumOpenInterest:finite(x?.sumOpenInterest),sumOpenInterestValue:finite(x?.sumOpenInterestValue)})).filter(x=>x.timestamp!=null&&x.sumOpenInterest>0).sort((a,b)=>a.timestamp-b.timestamp);
  if(rows.length<13)return{status:'MISSING',path:'N/A',eligible:false,segments:{h0_4:null,h4_8:null,h8_12:null},oiValueUsdt:rows.at(-1)?.sumOpenInterestValue??null};
  const a=rows.at(-1),b=rows.at(-5),c=rows.at(-9),d=rows.at(-13),s0=pct(a.sumOpenInterest,b.sumOpenInterest),s1=pct(b.sumOpenInterest,c.sumOpenInterest),s2=pct(c.sumOpenInterest,d.sumOpenInterest);
  const sign=v=>v==null?'?':v>0?'+':v<0?'-':'0',path=[sign(s0),sign(s1),sign(s2)].join('/');
  let pattern='OTHER',eligible=false;if(path==='+/+/+'){pattern='CONTINUOUS_BUILD';eligible=true}else if(path==='-/+/+'){pattern='CLEAN_REBUILD';eligible=true}else if(path==='+/-/-'){pattern='BUILD_WEAKENING'}
  return{status:'SUCCESS',path,pattern,eligible,segments:{h0_4:s0,h4_8:s1,h8_12:s2},oi4hPct:s0,oiValueUsdt:a.sumOpenInterestValue,oiRawContracts:a.sumOpenInterest,observationTime:a.timestamp};
}
function rvolZone(v,config=CONFIG){const x=finite(v);if(x==null)return'MISSING';if(x<config.rvolPreSpark)return'QUIET';if(x<config.rvolIgnition)return'PRE_SPARK';if(x<=config.rvolExpansion)return'IGNITION';return'EXPANSION'}
function takerZone(v,config=CONFIG){const x=finite(v);if(x==null)return'MISSING';if(x<config.takerWeak)return'WEAK';if(x<=config.takerImprove)return'NEUTRAL';if(x<config.takerStrong)return'IMPROVE';return'STRONG'}
function rangePosition(rows=[],asOf=Date.now(),lookback=52){const a=confirmedKlines(rows,asOf).slice(-lookback);if(a.length<5)return null;const lo=Math.min(...a.map(x=>finite(x[3])).filter(Number.isFinite)),hi=Math.max(...a.map(x=>finite(x[2])).filter(Number.isFinite)),close=finite(a.at(-1)?.[4]);return close!=null&&hi>lo?((close-lo)/(hi-lo))*100:null}
function htfFlags(frames={},asOf=Date.now(),config=CONFIG){const w=rangePosition(frames['1w']||[],asOf,52),d=rangePosition(frames['1d']||[],asOf,120);return{weeklyRangePositionPct:w,dailyRangePositionPct:d,htfDiscount:w!=null&&w<=config.htfDiscountPct,midTermPremium:d!=null&&d>=config.midTermPremiumPct}}
function emaLast(values=[],n=20){if(values.length<n)return null;const a=2/(n+1);let e=finite(values[0]);if(e==null)return null;for(let i=1;i<values.length;i++){const v=finite(values[i]);if(v!=null)e=v*a+e*(1-a)}return e}
function maPack(rows=[],asOf=Date.now()){const c=confirmedKlines(rows,asOf).map(x=>finite(x[4])).filter(Number.isFinite),ema={},sma={};for(const n of EMA_PERIODS)ema[n]=emaLast(c,n);for(const n of SMA_PERIODS)sma[n]=c.length>=n?avg(c.slice(-n)):null;return{bars:c.length,ema,sma}}
function klineTaker(row){if(!Array.isArray(row))return null;const total=finite(row[5]),buy=finite(row[9]);if(total==null||buy==null)return null;const sell=total-buy;return sell>0?buy/sell:null}
function conservativeTakerSeries(klineRows=[],endpointRows=[],periodMs=3600000,asOf=Date.now(),count=3){
  const k=confirmedKlines(klineRows,asOf).map(x=>({timestamp:finite(x[0]),kline:klineTaker(x)})).filter(x=>x.timestamp!=null&&x.kline!=null),e=(Array.isArray(endpointRows)?endpointRows:[]).filter(x=>finite(x?.timestamp)!=null&&finite(x.timestamp)+periodMs<=asOf).map(x=>({timestamp:finite(x.timestamp),endpoint:finite(x.ratio??x.buySellRatio)})).filter(x=>x.endpoint!=null),out=[];
  for(const x of e.slice(-Math.max(count,6))){const y=k.find(z=>Math.abs(z.timestamp-x.timestamp)<=periodMs/2);if(!y)continue;out.push({timestamp:x.timestamp,kline:y.kline,endpoint:x.endpoint,conservative:Math.min(y.kline,x.endpoint)})}
  return out.slice(-count);
}
function directionConfirm(kline1h=[],endpoint1h=[],oi={},asOf=Date.now(),config=CONFIG){
  const rows=conservativeTakerSeries(kline1h,endpoint1h,3600000,asOf,config.directionBars),improve=rows.filter(x=>x.conservative>config.takerImprove).length,strong=rows.filter(x=>x.conservative>=config.takerStrong).length,oiBuild=finite(oi?.segments?.h0_4)>0;
  return{confirmed:rows.length>=config.directionBars&&improve>=config.directionMinImprove&&oiBuild,strongFlow:strong>=1,rows,improveCount:improve,strongCount:strong,oiBuild};
}
function classify(row={},context={},config=CONFIG){
  const path=row.claudeOiPath||{},frames=context.frames||{},flags=htfFlags(frames,row.asOf,config),dir=directionConfirm(frames['1h']||[],context.taker1hSeries||[],path,row.asOf,config),r15=finite(row.tf?.['15m']?.rvol),r5=finite(row.tf?.['5m']?.rvol),z15=rvolZone(r15,config),z5=rvolZone(r5,config),t15=Math.min(...[finite(row.takerCross?.['15m']?.klineRatio),finite(row.takerCross?.['15m']?.endpointRatio)].filter(Number.isFinite)),t5=Math.min(...[finite(row.takerCross?.['5m']?.klineRatio),finite(row.takerCross?.['5m']?.endpointRatio)].filter(Number.isFinite)),tz15=Number.isFinite(t15)?takerZone(t15,config):'MISSING',tz5=Number.isFinite(t5)?takerZone(t5,config):'MISSING',fund=finite(row.fundingRatePct),ch=finite(row.priceChange24h),spot=finite(row.spotPriceChange24h),spotAligned=spot!=null&&ch!=null&&((spot>=0&&ch>=0)||(spot<0&&ch<0)),ma={};
  for(const tf of TIMEFRAMES)ma[tf]=maPack(frames[tf]||[],row.asOf);
  const evidence=[],risks=[];if(path.pattern==='CONTINUOUS_BUILD')evidence.push('OI_CONTINUOUS_BUILD_+/+/+');if(path.pattern==='CLEAN_REBUILD')evidence.push('OI_CLEAN_REBUILD_-/+/+');if(flags.htfDiscount)evidence.push('HTF_DISCOUNT');if(flags.midTermPremium)risks.push('MID_TERM_PREMIUM');if(dir.confirmed)evidence.push(`DIRECTION_CONFIRM_${dir.improveCount}/3`);else risks.push(`DIRECTION_NONE_${dir.improveCount}/3`);if(dir.strongFlow)evidence.push('STRONG_FLOW_CONFIRM');if(spotAligned)evidence.push('SPOT_FUTURES_ALIGNED');if(tz15==='WEAK')risks.push('15M_TAKER_WEAK');if(z15==='QUIET')risks.push('15M_RVOL_QUIET');
  const negativeFunding=fund!=null&&fund<config.fundingNfbPct,nfb=negativeFunding&&path.pattern==='CONTINUOUS_BUILD',nfbSq=nfb&&dir.strongFlow&&ch>0,nfbSc=nfb&&!dir.confirmed&&ch<=0;
  let key='CLAUDE_INCOMPLETE',label='미완성';
  if(nfbSq){key='CLAUDE_NFB_SQ';label='NFB-SQ'}else if(nfbSc){key='CLAUDE_NFB_SC';label='NFB-SC'}else if(nfb){key='CLAUDE_NFB';label='NFB'}else if(path.pattern==='CLEAN_REBUILD'){key='CLAUDE_C';label='C(CLEAN→REBUILD)'}else if(path.pattern==='CONTINUOUS_BUILD'&&!dir.confirmed){key='CLAUDE_A_PRE';label='A-pre'}else if(path.pattern==='CONTINUOUS_BUILD'&&dir.confirmed&&dir.strongFlow&&['IGNITION','EXPANSION'].includes(z15)&&spotAligned&&!flags.midTermPremium){key='CLAUDE_A_B';label='A+B'}else if(path.pattern==='CONTINUOUS_BUILD'&&dir.confirmed&&['IGNITION','EXPANSION'].includes(z15)){key='CLAUDE_A_TO_AB';label='A→A+B'}else if(path.pattern==='CONTINUOUS_BUILD'&&dir.confirmed&&z15==='PRE_SPARK'){key='CLAUDE_A';label='A'}else if(path.pattern==='CONTINUOUS_BUILD'&&dir.confirmed){key='CLAUDE_B';label='B'}
  if(path.pattern==='BUILD_WEAKENING'){key='CLAUDE_INCOMPLETE';label='미완성';risks.push('OI_BUILD_WEAKENING')}
  const priority=key==='CLAUDE_A_B'?95:key==='CLAUDE_A_TO_AB'?85:key==='CLAUDE_A'?75:key==='CLAUDE_C'?70:key==='CLAUDE_NFB_SQ'?88:key==='CLAUDE_NFB'?72:key==='CLAUDE_A_PRE'?60:key==='CLAUDE_B'?55:key==='CLAUDE_NFB_SC'?45:20;
  return{key,label,priority,direction:dir.confirmed?'LONG_BIAS':'NONE',oiPath:path,htf:flags,directionConfirm:dir,strongFlowConfirm:dir.strongFlow,rvol:{'15m':{value:r15,zone:z15},'5m':{value:r5,zone:z5}},taker:{'15m':{conservative:Number.isFinite(t15)?t15:null,zone:tz15},'5m':{conservative:Number.isFinite(t5)?t5:null,zone:tz5}},fundingRatePct:fund,spotAligned,ma,evidence,risks};
}
module.exports={TIMEFRAMES,CONFIG,EMA_PERIODS,SMA_PERIODS,dynamicUniverse,oiPath,rvolZone,takerZone,htfFlags,maPack,conservativeTakerSeries,directionConfirm,classify};
