'use strict';

// Independent long-only research rules. Scores are confluence, never probabilities.
const VERSION='TRADER_SCAN_1';
const TF_MS={'1w':604800000,'1d':86400000,'4h':14400000,'1h':3600000,'15m':900000,'5m':300000};
const RULES=Object.freeze({minQuoteVolume:10000000,maxChange24h:8,minChange24h:-8,minOi4h:1,
  minTaker:1.2,minRvol:1.5,maxSpreadBps:10,maxFunding8hPct:.05,minNetRR:2,
  feeBpsPerSide:5,slippageBpsPerSide:5,maxStopPct:6,maxEntryAtr:1.5});
const num=v=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
function closed(rows,now){
  const m=new Map();
  for(const r of rows||[]){
    if(!Array.isArray(r))continue;
    const t=num(r[6]),o=num(r[1]),h=num(r[2]),l=num(r[3]),c=num(r[4]),v=num(r[5]);
    if(t==null||t>=now||!(o>0&&l>0&&c>0&&h>=Math.max(o,c,l)&&l<=Math.min(o,c)&&v>=0))continue;
    m.set(t,{t,o,h,l,c,v});
  }
  return [...m.values()].sort((a,b)=>a.t-b.t);
}
function ema(a,p){let v=mean(a.slice(0,p));if(a.length<p)return null;for(const x of a.slice(p))v+=(x-v)*2/(p+1);return v}
function rsi(a){if(a.length<15)return null;let g=0,l=0;for(let i=1;i<=14;i++){const d=a[i]-a[i-1];g+=Math.max(d,0)/14;l+=Math.max(-d,0)/14}for(let i=15;i<a.length;i++){const d=a[i]-a[i-1];g=(g*13+Math.max(d,0))/14;l=(l*13+Math.max(-d,0))/14}return g===0&&l===0?50:l===0?100:100-100/(1+g/l)}
function pivots(a,side){const out=[];for(let i=2;i<a.length-2;i++){const v=a[i][side],near=[a[i-2][side],a[i-1][side],a[i+1][side],a[i+2][side]];if(near.every(x=>side==='h'?v>x:v<x))out.push({price:v,time:a[i].t})}return out}
function frameStats(rows,tf,now){
  const a=closed(rows,now),last=a.at(-1),c=a.map(x=>x.c),tr=a.slice(1).map((x,i)=>Math.max(x.h-x.l,Math.abs(x.h-a[i].c),Math.abs(x.l-a[i].c)));
  const enough=a.length>=(tf==='1w'?26:125);
  const contiguous=a.slice(-30).every((x,i,tail)=>i===0||Math.abs(x.t-tail[i-1].t-TF_MS[tf])<=1000);
  const fresh=Boolean(last&&now-last.t<=TF_MS[tf]+120000&&contiguous);
  const ma=Object.fromEntries([5,10,20,60,120].map(p=>[p,a.length>=p?mean(c.slice(-p)):null]));
  const e20=ema(c,20),priorE20=ema(c.slice(0,-3),20),atr=mean(tr.slice(-14));
  const baseline=mean(a.slice(-21,-1).map(x=>x.v));
  const obv=a.slice(-20).reduce((s,x,i,tail)=>i?s+Math.sign(x.c-tail[i-1].c)*x.v:0,0);
  const macd=ema(c,12)!=null&&ema(c,26)!=null?ema(c,12)-ema(c,26):null;
  const prevMacd=ema(c.slice(0,-1),12)!=null&&ema(c.slice(0,-1),26)!=null?ema(c.slice(0,-1),12)-ema(c.slice(0,-1),26):null;
  return{available:enough&&fresh,bars:a.length,fresh,lastClosedAt:last?.t??null,close:last?.c??null,
    sma:ma,ema20:e20,atr,rsi:rsi(c),macd,macdImproving:macd!=null&&prevMacd!=null&&macd>=prevMacd,
    obvUp:obv>0,rvol:baseline>0?last.v/baseline:null,
    trend:enough?(tf==='1w'?(last.c>ma[20]&&e20>=priorE20?'UP':last.c<ma[20]&&e20<priorE20?'DOWN':'MIXED'):(last.c>ma[60]&&ma[20]>ma[60]&&e20>=priorE20?'UP':last.c<ma[60]&&ma[20]<ma[60]?'DOWN':'MIXED')):'UNKNOWN',
    returnPct:a.length>=2?(last.c/a.at(-2).c-1)*100:null,
    compression:atr>0&&a.length>=20?(Math.max(...a.slice(-8).map(x=>x.h))-Math.min(...a.slice(-8).map(x=>x.l)))/atr:null};
}
function regimeFromFrames(frames,now){
  const benchmarks=Object.fromEntries(['BTCUSDT','ETHUSDT'].map(s=>[s,frameStats(frames[s]||[],'4h',now)]));
  const a=Object.values(benchmarks);let state='UNKNOWN';
  if(a.every(x=>x.available))state=a.every(x=>x.trend==='DOWN')||a.some(x=>x.returnPct<=-3)?'RISK_OFF':a.every(x=>x.trend==='UP')?'SUPPORTIVE':'MIXED';
  return{state,observedAt:now,benchmarks};
}
function setupFromFrames(frames,stats,now){
  const h=closed(frames['1h'],now),m=closed(frames['15m'],now),last=h.at(-1),s=stats['1h'];
  if(h.length<30||m.length<15||!s?.atr)return{type:'NONE',label:'구조 미형성',valid:false};
  const lows=h.slice(-21,-1).map(x=>x.l),floor=Math.min(...lows),priorHigh=Math.max(...h.slice(-13,-1).map(x=>x.h));
  if(last.l<floor&&last.c>floor&&last.c>last.o)return{type:'SWEEP_RECLAIM',label:'저점 스윕·회복',valid:true,level:floor};
  // The breakout reference excludes both the breakout and retest bars.
  for(let i=h.length-2;i>=Math.max(20,h.length-7);i--){
    const level=Math.max(...h.slice(i-20,i).map(x=>x.h));
    if(h[i].c>level&&last.l<=level+.25*s.atr&&last.c>level&&h.slice(i+1).every(x=>x.c>=level-.3*s.atr))
      return{type:'BREAKOUT_RETEST',label:'돌파 후 리테스트',valid:true,level};
  }
  if(stats['4h']?.trend==='UP'&&last.l<=s.ema20+.4*s.atr&&last.c>s.ema20&&last.c>=last.o)
    return{type:'TREND_PULLBACK',label:'추세 눌림·회복',valid:true,level:s.ema20};
  if(s.compression<=3.5&&s.trend!=='DOWN')return{type:'COMPRESSION',label:'압축 관찰',valid:false,level:priorHigh};
  return{type:'NONE',label:'구조 미형성',valid:false,level:priorHigh};
}
function flowStats(d,interval,now){
  const rows=(d.rows||[]).filter(x=>num(x.timestamp)!=null&&x.timestamp<=now).sort((a,b)=>a.timestamp-b.timestamp);
  const last=rows.at(-1),lastValue=num(last?.sumOpenInterest);
  const old=last?rows.filter(x=>x.timestamp<=last.timestamp-4*3600000).at(-1):null;
  const oiValid=last&&old&&now-last.timestamp<=90*60000&&last.timestamp-old.timestamp<=4.5*3600000&&num(old.sumOpenInterest)>0&&lastValue>0;
  const oi4hPct=oiValid?(lastValue/num(old.sumOpenInterest)-1)*100:null;
  const series=(d.taker15m||[]).filter(x=>num(x.timestamp)!=null&&x.timestamp+900000<=now&&num(x.ratio)!=null&&x.ratio>=0).sort((a,b)=>a.timestamp-b.timestamp).slice(-3);
  const takerValid=series.length===3&&now-series.at(-1).timestamp<=30*60000&&series.at(-1).timestamp-series[0].timestamp===1800000;
  const takerRatio=takerValid?mean(series.map(x=>num(x.ratio))):null;
  const takerBuy=takerValid&&series.filter(x=>x.ratio>RULES.minTaker).length>=2&&takerRatio>RULES.minTaker;
  const rate=num(d.fundingRate),hours=num(interval);
  const funding8hPct=rate!=null&&hours>0?rate*8/hours:null;
  return{oi4hPct,takerRatio,takerBuy,funding8hPct,oiTimestamp:last?.timestamp??null,takerTimestamp:series.at(-1)?.timestamp??null};
}
function riskPlan(frames,stats,execution,price,now){
  const entry=num(execution?.ask)??price,atr=stats['1h']?.atr;
  if(!(entry>0&&atr>0))return null;
  const rows=closed(frames['1h'],now);
  if(rows.length<5)return null;
  const stop=Math.min(...rows.slice(-5).map(x=>x.l))-.2*atr;
  const resistance=pivots(closed(frames['4h'],now),'h').filter(x=>x.price>entry).sort((a,b)=>a.price-b.price)[0];
  const target=resistance?.price??null,risk=entry-stop;
  const costs=entry*2*(RULES.feeBpsPerSide+RULES.slippageBpsPerSide)/10000;
  return{entry,stop:stop>0?stop:null,target,targetSource:target?'4h-confirmed-pivot':null,
    netRR:target&&risk>0?(target-entry-costs)/(risk+costs):null,stopPct:risk>0?risk/entry*100:null,
    feeBpsPerSide:RULES.feeBpsPerSide,slippageBpsPerSide:RULES.slippageBpsPerSide,
    note:'호가 기준 가상 계획 · 수수료·슬리피지 각 편도 5bp 가정 · 펀딩 비용 미포함'};
}
function evaluate({symbol,frames={},ticker={},derivatives={},execution={},regime={},fundingIntervalHours,now=Date.now()}){
  const stats=Object.fromEntries(Object.keys(TF_MS).map(tf=>[tf,frameStats(frames[tf]||[],tf,now)]));
  const setup=setupFromFrames(frames,stats,now),flow=flowStats(derivatives,fundingIntervalHours,now);
  const missing=[],blockers=[],waiting=[],reasons=[];
  const price=num(ticker.lastPrice),change=num(ticker.priceChangePercent),vol=num(ticker.quoteVolume);
  for(const [tf,s] of Object.entries(stats))if(!s.available)missing.push(`${tf} 확정봉 부족·지연·간격 오류`);
  if(price==null||change==null||vol==null||num(ticker.closeTime)==null||now-ticker.closeTime>120000||ticker.closeTime>now+60000)missing.push('현재 선물 시세 누락·지연');
  if(regime.state==='UNKNOWN'||!regime.state||num(regime.observedAt)==null||now-regime.observedAt>120000)missing.push('BTC·ETH 시장 상태 미확인');
  if(flow.oi4hPct==null)missing.push('4H OI 원자료 누락·지연');
  if(flow.takerRatio==null)missing.push('15분 체결 수급 3구간 누락·지연');
  if(flow.funding8hPct==null)missing.push('펀딩·정산 주기 미확인');
  if(!execution.available||num(execution.observedAt)==null||now-execution.observedAt>60000||execution.observedAt>now+1000||num(execution.spreadBps)==null||!(num(execution.bid)>0&&num(execution.ask)>=num(execution.bid)))missing.push('실시간 선물 호가 미확인');
  if(vol!=null&&vol<RULES.minQuoteVolume)blockers.push('24H 거래대금 1천만 USDT 미만');
  if(change!=null&&(change>RULES.maxChange24h||change<RULES.minChange24h))blockers.push('24H ±8% 범위 이탈');
  if(regime.state==='RISK_OFF')blockers.push('BTC·ETH 하락 위험 구간');
  if(stats['1d'].trend==='DOWN'||stats['4h'].trend==='DOWN')blockers.push('일봉·4H 하락 추세');
  if(num(execution.spreadBps)>RULES.maxSpreadBps)blockers.push('호가 스프레드 10bp 초과');
  if(flow.funding8hPct>RULES.maxFunding8hPct)blockers.push('8시간 환산 펀딩 +0.05% 초과');
  const h=stats['1h'],m=stats['15m'],five=stats['5m'];
  if(price>0&&h.atr>0&&(price-h.ema20)/h.atr>RULES.maxEntryAtr)blockers.push('1H EMA20 대비 1.5 ATR 초과 추격');
  if(flow.oi4hPct>1&&flow.takerRatio<.8&&h.returnPct<0)blockers.push('가격 하락·OI 증가·매도 우위');
  const trend=stats['1d'].trend==='UP'&&stats['4h'].trend==='UP'&&stats['1w'].trend!=='DOWN';
  if(trend)reasons.push('일봉·4H 상승 정렬 / 주봉 하락 아님');else waiting.push('일봉·4H 상승 정렬과 주봉 유지');
  if(setup.valid)reasons.push(setup.label);else waiting.push('눌림 회복·리테스트·스윕 중 하나 확인');
  const mr=closed(frames['15m'],now),prevHigh=mr.length>=13?Math.max(...mr.slice(-13,-1).map(x=>x.h)):null;
  const trigger=prevHigh!=null&&m.close>prevHigh&&m.rvol>=RULES.minRvol&&five.close>five.ema20;
  if(trigger)reasons.push('15분 확정 돌파·거래량 증가 / 5분 EMA20 유지');else waiting.push('15분 확정 돌파 + RVOL 1.5배 + 5분 지지');
  const flowOk=flow.oi4hPct>RULES.minOi4h&&flow.takerBuy;
  if(flowOk)reasons.push('4H OI +1% 초과·매수 체결 지속');else waiting.push('4H OI +1% / taker 1.2 초과 2구간 이상');
  const plan=riskPlan(frames,stats,execution,price,now);
  if(!plan?.target)waiting.push('상단 확정 저항 부족: 목표가·손익비 산출 보류');
  else if(plan.netRR<RULES.minNetRR)blockers.push('비용 반영 예상 손익비 2 미만');
  if(plan&&(!(plan.stop>0)||!(plan.stopPct>0)||plan.stopPct>RULES.maxStopPct))blockers.push('무효화 구간 0~6% 범위 밖');
  const riskOk=plan?.netRR>=RULES.minNetRR&&plan.stop>0&&plan.stopPct>0&&plan.stopPct<=RULES.maxStopPct;
  if(riskOk)reasons.push('확정 저항까지 비용 반영 손익비 2 이상');
  // Mixed markets can be watched but never promoted to an entry-confirmed signal.
  if(regime.state==='MIXED')waiting.push('BTC·ETH 4H 동반 상승 정렬 대기');
  const score=(trend?25:0)+(setup.valid?25:setup.type==='COMPRESSION'?10:0)+(flowOk?20:0)+(trigger?15:0)+(riskOk?15:0);
  const state=blockers.length?'EXCLUDED':missing.length?'DATA_GAP':trend&&setup.valid&&flowOk&&trigger&&riskOk&&regime.state==='SUPPORTIVE'?'CONFIRMED':trend&&setup.valid?'ARMED':'WATCH';
  return{version:VERSION,symbol,state,score,setup,price,change24h:change,quoteVolume24h:vol,asOf:now,
    stats,flow,regime:regime.state||'UNKNOWN',plan,reasons,missing,blockers,waiting,
    chart:closed(frames['1h'],now).slice(-48).map(x=>x.c),researchOnly:true};
}
module.exports={VERSION,RULES,TF_MS,num,closed,frameStats,regimeFromFrames,setupFromFrames,flowStats,evaluate};
