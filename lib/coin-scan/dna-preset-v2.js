'use strict';
// Evidence-based DNA research presets; all bars MUST be closed at asOf.
const registry=require('../../data/presets/active-dna-v2.json');
const VERSION=registry.version, MS={ '1d':86400000,'4h':14400000,'1h':3600000,'15m':900000,'5m':300000 };
function num(v){if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function bars(raw=[],tf='4h',asOf=Date.now()){
 const period=MS[tf],seen=new Map();
 for(const r of Array.isArray(raw)?raw:[]){
  const t=num(Array.isArray(r)?r[0]:r?.openTime??r?.time),end=num(Array.isArray(r)?r[6]:r?.closeTime)??(t==null?null:t+period-1);
  const o=num(Array.isArray(r)?r[1]:r?.open),h=num(Array.isArray(r)?r[2]:r?.high),l=num(Array.isArray(r)?r[3]:r?.low),c=num(Array.isArray(r)?r[4]:r?.close),v=num(Array.isArray(r)?r[5]:r?.volume);
  const q=num(Array.isArray(r)?r[7]:r?.quoteVolume);
  if(t==null||end==null||end>=asOf||[o,h,l,c,v].some(x=>x==null)||v<0||h<l||c<=0||o<=0)continue;
  seen.set(t,{t,end,o,h,l,c,v,q});
 }
 return [...seen.values()].sort((a,b)=>a.t-b.t);
}
function emaSeries(a,n){const out=Array(a.length).fill(null);if(a.length<n)return out;let v=a.slice(0,n).reduce((s,x)=>s+x.c,0)/n;out[n-1]=v;const k=2/(n+1);for(let i=n;i<a.length;i++){v=k*a[i].c+(1-k)*v;out[i]=v}return out}
function volumeRatio(a,i,period=20){if(i<period)return null;const avg=a.slice(i-period,i).reduce((s,x)=>s+x.v,0)/period;return avg>0?a[i].v/avg:null}
function breakout(a,i,lookback=12){if(i<lookback)return null;const prev=a.slice(i-lookback,i),level=Math.max(...prev.map(x=>x.h)),rv=volumeRatio(a,i);return{level,rv,passed:a[i].c>level&&rv!=null&&rv>=1.5}}
function springProxy(a,from,to){for(let i=Math.max(12,from);i<to;i++){const p=a.slice(i-12,i),low=Math.min(...p.map(x=>x.l));if(a[i].l<low*.995&&a[i].c>low)return{time:a[i].end,level:low}}return null}
function echoProxy(a,i,ema14){if(i<24||volumeRatio(a,i)>1.2||!(a[i].c>ema14))return null;for(let j=i-2;j>=Math.max(20,i-18);j--){const rv=volumeRatio(a,j);if(rv!=null&&rv>=2&&a[i].c>=a[j].c*.97&&Math.min(...a.slice(j+1,i+1).map(x=>x.l))>=a[j].l*.995)return{anchorAt:a[j].end,anchorRvol:rv}}return null}
function subordinate(a,tf){if(a.length<30)return{available:false,breakout:false,rvol:null};const i=a.length-1,ma=emaSeries(a,14)[i],prev=breakout(a,i);return{available:true,breakout:Boolean(prev?.passed&&a[i].c>ma),rvol:prev?.rv??null,time:a[i].end}}
function entry5(a){if(a.length<100)return{available:false,status:'INSUFFICIENT_DATA'};const i=a.length-1,e=[14,28,57,92].map(p=>emaSeries(a,p)[i]),p=a.slice(-100),allQuote=p.every(x=>x.q!=null),vw=allQuote?p.reduce((s,x)=>s+x.q,0)/p.reduce((s,x)=>s+x.v,0):null,rv=volumeRatio(a,i);const b=breakout(a,i);return{available:true,status:'REFERENCE_ONLY',emaAbove:e.every(x=>x!=null&&a[i].c>x),vwapAbove:vw!=null?a[i].c>vw:null,breakout:Boolean(b?.passed),rvol:rv,notTradePermission:true}}
function evaluate({frames={},row={},market={},asOf=Date.now()}={}){
 const a=bars(frames['4h'],'4h',asOf),h1=bars(frames['1h'],'1h',asOf),m15=bars(frames['15m'],'15m',asOf),m5=bars(frames['5m'],'5m',asOf);
 const missing=[],evidence=[],warnings=[];const oi=num(row.oi4hPct),oi1=num(row.oi1hPct),draw=num(row.oiDrawdownPct);
 if(a.length<115)return{version:VERSION,status:'INCOMPLETE',type:'UNKNOWN',stage:'INCOMPLETE',score:null,missing:['4H_closed_history_115'],evidence:[],warnings:['Do not promote without sufficient closed bars'],researchOnly:true};
 const i=a.length-1,close=a[i].c,emas=[14,28,57,92].map(n=>emaSeries(a,n)[i]),width=100*(Math.max(...emas)/Math.min(...emas)-1),aboveAll=close>Math.max(...emas);
 const b=breakout(a,i),recent=a.slice(Math.max(20,i-3),i).map((x,j)=>({index:Math.max(20,i-3)+j})).filter(x=>breakout(a,x.index)?.passed);
 const prevBreak=recent.at(-1),retest=prevBreak!=null&&a[i].l<=breakout(a,prevBreak.index).level*1.01&&close>=breakout(a,prevBreak.index).level*.995;
 const sweep=springProxy(a,i-24,i),echo=echoProxy(a,i,emas[0]);
 const h=subordinate(h1,'1h'),f=subordinate(m15,'15m'),entry=entry5(m5);
 const ch=num(row.priceChange24h),btc=num(market.btc24hChange??market.marketState?.btc24hChange),relative=ch!=null&&btc!=null?ch-btc:null;
 const extended=(ch!=null&&ch>=20)||close>emas[0]*1.1;
 const oiA=oi!=null&&oi>=1,oiC=draw!=null&&draw<=-2&&oi1!=null&&oi1>=.3;
 const flow=Boolean(b?.passed||retest),type=oiC?'C':oiA&&flow?'A+B':oiA?'A':flow?'B':'PRE';
 const spot=num(row.spotPriceChange24h);const spotDirection=spot!=null&&ch!=null&&spot>0&&ch>0;
 if(oi==null)missing.push('OI_OPTIONAL_UNAVAILABLE');if(spot==null)missing.push('SPOT_DIRECTION_UNAVAILABLE');
 if(width<=5)evidence.push('4H_EMA_COMPRESSION_CONTEXT');if(aboveAll)evidence.push('4H_ABOVE_EMA_ALL');
 if(sweep)evidence.push('SWEEP_PROXY_NOT_WYCKOFF_PROOF');if(echo)evidence.push('VOLUME_ECHO_PROXY');
 if(b?.passed)evidence.push('4H_12BAR_BREAKOUT_RVOL');if(retest)evidence.push('4H_RETEST_PROXY');
 if(h.breakout)evidence.push('1H_BREAKOUT_RVOL');if(f.breakout)evidence.push('15M_BREAKOUT_RVOL');
 if(oiA)evidence.push('OI_A_LEAD');if(oiC)evidence.push('OI_C_REBUILD');
 if(relative>0)evidence.push('BTC_RELATIVE_STRENGTH_24H');if(spotDirection)evidence.push('SPOT_DIRECTION_ONLY_NOT_4H_CONFIRMATION');
 if(extended)warnings.push('EXTENDED_DO_NOT_CHASE');
 if(!b?.passed&&!retest&&width<=5)warnings.push('COMPRESSION_ALONE_NON_DISCRIMINATIVE');
 if(oi!=null&&!oiA&&!oiC)warnings.push('OI_BELOW_1PCT_IS_NOT_A_B_C_GLOBAL_REJECTION');
 if(!h.available)missing.push('1H_BARS');if(!f.available)missing.push('15M_BARS');if(!entry.available)missing.push('5M_BARS');
 const preCandidate=Boolean((echo&&relative!=null&&relative>1)||(sweep&&width<=5&&relative!=null&&relative>2)||(h.breakout&&relative!=null&&relative>1&&(width<=10||f.breakout)));
 let stage=extended?'EXTENDED':b?.passed?'IGNITION_CONFIRM':retest?'RETEST_WATCH':preCandidate?'PRE_WATCH':'WAIT';
 // A conservative experimental ranking, NOT a calibrated predictive probability.
 let score=20+(width<=5?5:0)+(aboveAll?5:0)+(sweep?3:0)+(echo?8:0)+(relative>0?8:0)+(oiA?8:0)+(oiC?8:0)+(h.breakout?8:0)+(f.breakout?8:0)+(b?.passed?20:0)+(retest?10:0)+(spotDirection?4:0)-(extended?25:0);
 score=Math.max(0,Math.min(100,Math.round(score)));
 return{version:VERSION,registryStatus:registry.status,status:'OK',stage,type,score,scoreMeaning:'experimental rank; not win rate',researchOnly:true,indicators:{emaWidthPct:+width.toFixed(2),aboveAll,breakoutLevel:b?.level??null,breakout4h:Boolean(b?.passed),rvol4h:b?.rv??null,retest,priceChange24h:ch,btcRelative24hPp:relative,oi4hPct:oi,oi1hPct:oi1,oiDrawdownPct:draw,spotDirection,sweep,echo,h1:h,m15:f,m5:entry},evidence,warnings,missing,asOf};
}
module.exports={VERSION,registry,bars,emaSeries,volumeRatio,breakout,springProxy,echoProxy,evaluate};
