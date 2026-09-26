'use strict';

const Library=require('./master-samples.js');

const ARCHETYPE_LABELS=Object.freeze({
  A:'A형 · OI 선행축적',
  B:'B형 · OI 잠복+taker 이상왕복',
  'A+B':'A+B형 · OI축적+taker 왕복',
  C:'C형 · 디레버리징 후 반전 대기',
  X:'X형 · 타 거래소 OI 선행',
  'X+B':'X+B형 · 타 거래소 OI+taker 선행',
  'X+A':'X+A형 · 타 거래소 OI→Binance OI 확산',
  'X+A+B':'X+A+B형 · XOI→taker→Binance OI 확산',
  NEUTRAL:'중립 · 샘플 불충분'
});
const PHASE_LABELS=Object.freeze({
  LATENT:'잠복',
  'IGNITION-WAIT':'점화대기',
  'IGNITION-EARLY':'점화초기',
  REIGNITION:'재점화',
  PROGRESSED:'이미진행',
  DELEVERAGING:'디레버리징',
  BROKEN:'패턴깨짐',
  OBSERVE:'관찰'
});
const LIQUIDITY_LABELS=Object.freeze({
  'DOUBLE-SWEEP':'SSL+BSL 양방향 청소',
  'BSL-EXPANSION':'SSL 보존 · BSL 연쇄확장',
  'SSL-SWEEP':'SSL 스윕/리클레임 관찰',
  'SSL-HOLD':'하단 유동성 보존',
  'RANGE-HOLD':'박스권 유동성 유지',
  UNKNOWN:'유동성 판정 보류'
});
const SWEEP_LABELS=Object.freeze({
  SSL_SWEEP_RECLAIM:'SSL 스윕 → 리클레임',
  BSL_PROBE_REATTACK:'BSL 선탐색 → 재공격',
  DOUBLE_SWEEP:'SSL+BSL 양방향 청소',
  NO_SWEEP_COMPRESSION:'무스윕 압축',
  FAILED_BREAK_REBUILD:'첫 돌파 실패 → 반대편 청소/재구성'
});
const TIME_LABELS=Object.freeze({
  FAST_RECLAIM:'FAST · 빠른 회수',
  TIME_SYMMETRY:'1:1 · 기간대칭',
  ABSORPTION_TIME:'흡수 · 시간사용',
  LONG_REBUILD:'LONG · 장기 재구축',
  UNKNOWN:'기간 판정 보류'
});
const RESET_LABELS=Object.freeze({
  HTF_RESET_LTF_REIGNITION:'1H 리셋 → 15m/5m 재점화',
  '15M_RESET_5M_REIGNITION':'15m 리셋 → 5m 재점화',
  RESET_WAIT:'모멘텀 리셋 · 재점화 대기',
  NO_RESET:'리셋 구조 없음'
});

const MA_CLUSTER_LABELS=Object.freeze({
  TIGHT:'이평 초압축 · 20/60/112/224 밀집',
  NEAR:'이평 근접 · 장단기 이평 수렴',
  WIDE:'이평 이격 · 확장/추세 구간',
  UNKNOWN:'이평 압축 판정 보류'
});
const VOLUME_STAGE_LABELS=Object.freeze({
  NONE:'거래량 대기',
  PRE_SPARK:'PRE-SPARK · 이평 압축 초기 거래량',
  IGNITION:'IGNITION · 이평 압축 점화 거래량',
  ABSORPTION:'ABSORPTION · 리셋/하락봉 대량흡수',
  EXPANSION:'EXPANSION · 이격 확장 거래량'
});
const FLOW_TYPE_LABELS=Object.freeze({
  DIRECT_BUILD:'DIRECT-BUILD · taker→OI 직접 구축',
  CLEAN_REBUILD:'CLEAN-REBUILD · OI 청소→재구축',
  SQUEEZE:'SQUEEZE · 가격↑/OI↓',
  ABSORPTION:'ABSORPTION · 하락봉/리셋 대량흡수',
  EVENT_EXTREME:'EVENT/EXTREME · 이벤트성 거래량 재평가',
  PRICE_LED:'PRICE-LED · 가격주도/OI 정체',
  OBSERVE:'FLOW 관찰'
});

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,Number.isFinite(Number(v))?Number(v):0))}
function avg(values){const a=(values||[]).map(finite).filter(v=>v!=null);return a.length?a.reduce((s,v)=>s+v,0)/a.length:null}
function val(row,index){return Array.isArray(row)?finite(row[index]):null}

function deriveOiProfile(rows=[]){
  const values=(rows||[]).map(x=>finite(x?.sumOpenInterest??x?.openInterest??x?.value??x)).filter(v=>v!=null&&v>0);
  if(values.length<2)return{changePct:null,drawdownPct:null,min:null,max:null,samples:values.length};
  const first=values[0],last=values[values.length-1],min=Math.min(...values),max=Math.max(...values);
  return{
    changePct:first?((last/first)-1)*100:null,
    drawdownPct:first?((min/first)-1)*100:null,
    min,max,samples:values.length
  };
}

function deriveTakerProfile(rows=[]){
  const ratios=(rows||[]).map(x=>finite(x?.buySellRatio??x?.takerBuySellRatio??x?.ratio??x)).filter(v=>v!=null&&v>0);
  if(!ratios.length)return{min:null,max:null,range:null,last:null,spikes15:0,spikes20:0,samples:0};
  const min=Math.min(...ratios),max=Math.max(...ratios);
  return{min,max,range:max-min,last:ratios[ratios.length-1],spikes15:ratios.filter(v=>v>=1.5).length,spikes20:ratios.filter(v=>v>=2).length,samples:ratios.length};
}

function normalizeXoiProfile(raw={}){
  const exchanges=raw&&typeof raw.exchanges==='object'?raw.exchanges:{};
  const active=Object.entries(exchanges).map(([exchange,p])=>({exchange,...p})).filter(x=>finite(x.changePct)!=null);
  const leader=active.slice().sort((a,b)=>finite(b.changePct)-finite(a.changePct))[0]||null;
  const leaderChangePct=finite(raw.leaderChangePct??leader?.changePct);
  const aggregateChangePct=finite(raw.aggregateChangePct??avg(active.map(x=>x.changePct)));
  const breadth=Number.isFinite(Number(raw.breadth))?Number(raw.breadth):active.length;
  const positiveBreadth=Number.isFinite(Number(raw.positiveBreadth))?Number(raw.positiveBreadth):active.filter(x=>finite(x.changePct)>=1.2).length;
  const strongBreadth=Number.isFinite(Number(raw.strongBreadth))?Number(raw.strongBreadth):active.filter(x=>finite(x.changePct)>=2.5).length;
  return{
    available:Boolean(raw.available||active.length),
    exchanges,breadth,positiveBreadth,strongBreadth,
    leaderExchange:raw.leaderExchange||leader?.exchange||null,
    leaderChangePct,aggregateChangePct,samples:Number(raw.samples)||active.reduce((s,x)=>s+(Number(x.samples)||0),0)
  };
}

function deriveSequenceTag({oiProfile={},takerProfile={},xoiProfile={}}={}){
  const oi=finite(oiProfile.changePct),tmin=finite(takerProfile.min),tmax=finite(takerProfile.max);
  const x=normalizeXoiProfile(xoiProfile);
  const xBuild=x.available&&((x.leaderChangePct!=null&&x.leaderChangePct>=1.2)||x.positiveBreadth>=1);
  if(!xBuild)return null;
  const takerExtreme=tmax!=null&&tmin!=null&&tmax>=1.8&&tmin<=.8;
  const binanceBuild=oi!=null&&oi>=1.2;
  if(takerExtreme&&binanceBuild)return'XOI-A+B';
  if(takerExtreme&&!binanceBuild)return'XOI-B2+';
  if(binanceBuild)return'XOI-A';
  return'XOI';
}

function derivePriceProfile(rows=[]){
  const a=(Array.isArray(rows)?rows:[]).filter(Array.isArray).slice(-32);
  if(a.length<8)return{priceChange8hPct:null,range8hPct:null,volumeRatio:null,lastPrice:null};
  const firstOpen=val(a[0],1),lastClose=val(a[a.length-1],4);
  const highs=a.map(x=>val(x,2)).filter(v=>v!=null),lows=a.map(x=>val(x,3)).filter(v=>v!=null),vols=a.map(x=>val(x,5)).filter(v=>v!=null);
  const recent=avg(vols.slice(-8)),prior=avg(vols.slice(-16,-8));
  return{
    priceChange8hPct:firstOpen&&lastClose!=null?((lastClose/firstOpen)-1)*100:null,
    range8hPct:highs.length&&lows.length&&Math.min(...lows)>0?((Math.max(...highs)/Math.min(...lows))-1)*100:null,
    volumeRatio:recent!=null&&prior>0?recent/prior:null,
    lastPrice:lastClose
  };
}


function smaAt(values,index,period){
  if(!Array.isArray(values)||index-period+1<0)return null;
  let sum=0;
  for(let i=index-period+1;i<=index;i++){const n=finite(values[i]);if(n==null)return null;sum+=n}
  return sum/period;
}
function stochRsiAt(series,index,period=14){
  if(!Array.isArray(series)||index-period+1<0||series[index]==null)return null;
  const w=series.slice(index-period+1,index+1).filter(v=>finite(v)!=null);
  if(w.length<period)return null;
  const lo=Math.min(...w),hi=Math.max(...w),cur=finite(series[index]);
  return hi===lo?50:((cur-lo)/(hi-lo))*100;
}
function maSnapshot(rows=[]){
  const a=closedRows(rows),closes=a.map(x=>val(x,4)),i=closes.length-1;
  if(i<19)return{key:'UNKNOWN',label:MA_CLUSTER_LABELS.UNKNOWN,price:null,spreadPct:null,distances:{},shortOrder:'UNKNOWN',available:0};
  const price=closes[i],periods=[5,10,20,60,112,224],mas={},distances={};
  for(const p of periods){const m=smaAt(closes,i,p);mas[p]=m;distances[p]=m&&price?((price/m)-1)*100:null}
  const clusterMas=[20,60,112,224].map(p=>mas[p]).filter(v=>v!=null&&v>0);
  const spreadPct=clusterMas.length>=3&&price?((Math.max(...clusterMas)-Math.min(...clusterMas))/price)*100:null;
  let key='UNKNOWN';
  if(spreadPct!=null)key=spreadPct<=4?'TIGHT':spreadPct<=10?'NEAR':'WIDE';
  const shortOrder=mas[5]!=null&&mas[10]!=null&&mas[20]!=null?(mas[5]>mas[10]&&mas[10]>mas[20]?'BULL':mas[5]<mas[10]&&mas[10]<mas[20]?'BEAR':'MIXED'):'UNKNOWN';
  const longDistances=[60,112,224].map(p=>distances[p]).filter(v=>v!=null);
  return{key,label:MA_CLUSTER_LABELS[key],price,spreadPct,distances,mas,shortOrder,available:clusterMas.length,
    nearestLongDistancePct:longDistances.length?Math.min(...longDistances.map(Math.abs)):null};
}
function deriveMaClusterProfile(frames={}){
  const snapshots={};
  for(const tf of ['1d','4h','1h','15m'])if(Array.isArray(frames[tf]))snapshots[tf]=maSnapshot(frames[tf]);
  const candidates=Object.entries(snapshots).filter(([,x])=>x.spreadPct!=null).sort((a,b)=>a[1].spreadPct-b[1].spreadPct);
  const primary=candidates[0]?{frame:candidates[0][0],...candidates[0][1]}:{frame:null,...maSnapshot([])};
  const d=snapshots['1d'],h4=snapshots['4h'];
  let transition='UNKNOWN';
  if(d&&h4){
    if(d.shortOrder==='BULL'&&h4.shortOrder==='BULL')transition='HTF_ALIGNED';
    else if(d.shortOrder!=='BULL'&&h4.shortOrder==='BULL')transition='LTF_LEADS_HTF';
    else if((d.key==='TIGHT'||d.key==='NEAR')&&(h4.key==='TIGHT'||h4.key==='NEAR'))transition='BASE_BUILD';
    else transition='MIXED';
  }
  return{key:primary.key,label:primary.label,primaryFrame:primary.frame,spreadPct:primary.spreadPct,transition,snapshots};
}
function deriveVolumeMaDna({frames={},maClusterProfile={}}={}){
  const events=[],nowTs=Math.max(0,...Object.values(frames).flatMap(rows=>closedRows(rows||[]).slice(-1).map(x=>val(x,0)||0)));
  const settings={'4h':{bars:12},'1h':{bars:48},'15m':{bars:120}};
  for(const [tf,cfg] of Object.entries(settings)){
    const rows=closedRows(frames[tf]||[]);if(rows.length<22)continue;
    const closes=rows.map(x=>val(x,4)),vols=rows.map(x=>val(x,5)),rsi=rsiSeries(closes,14);
    const start=Math.max(20,rows.length-cfg.bars);
    for(let i=start;i<rows.length;i++){
      const base=avg(vols.slice(i-20,i).filter(v=>v!=null&&v>=0)),v=vols[i],rvol=base&&v!=null?v/base:null;
      if(rvol==null||rvol<1.5)continue;
      const price=closes[i],periods=[20,60,112,224],mas={},dists={};
      for(const p of periods){const m=smaAt(closes,i,p);mas[p]=m;dists[p]=m&&price?((price/m)-1)*100:null}
      const maVals=periods.map(p=>mas[p]).filter(x=>x!=null&&x>0),spread=maVals.length>=3&&price?((Math.max(...maVals)-Math.min(...maVals))/price)*100:null;
      const longD=[60,112,224].map(p=>dists[p]).filter(x=>x!=null).map(Math.abs);
      const nearestLong=longD.length?Math.min(...longD):null;
      const resetRsi=rsi[i]!=null&&rsi[i]<=45,st=stochRsiAt(rsi,i),resetStoch=st!=null&&st<=20;
      const red=val(rows[i],4)!=null&&val(rows[i],1)!=null&&val(rows[i],4)<val(rows[i],1);
      const clusterNear=(spread!=null&&spread<=10)||(nearestLong!=null&&nearestLong<=5);
      let stage='EXPANSION';
      if(red&&(resetRsi||resetStoch)&&rvol>=3&&clusterNear)stage='ABSORPTION';
      else if(clusterNear&&rvol>=3)stage='IGNITION';
      else if(clusterNear&&rvol>=1.5)stage='PRE_SPARK';
      else if(rvol>=10)stage='EXPANSION';
      const ts=val(rows[i],0),ageHours=nowTs&&ts?Math.max(0,(nowTs-ts)/3600000):null;
      events.push({frame:tf,index:i,openTime:ts,ageHours,rvol,stage,label:VOLUME_STAGE_LABELS[stage],red,rsi:rsi[i],stochRsi:st,spreadPct:spread,nearestLongDistancePct:nearestLong,distances:dists,price});
    }
  }
  const recent=events.filter(e=>e.ageHours==null||e.ageHours<=24),rank={ABSORPTION:5,IGNITION:5,PRE_SPARK:4,EXPANSION:2};
  const best=recent.slice().sort((a,b)=>(rank[b.stage]-rank[a.stage])||((b.rvol||0)-(a.rvol||0))||((a.ageHours||0)-(b.ageHours||0)))[0]||null;
  return{found:Boolean(best),stage:best?best.stage:'NONE',label:best?best.label:VOLUME_STAGE_LABELS.NONE,best,maxRvol:recent.length?Math.max(...recent.map(e=>e.rvol)):null,eventCount:recent.length,
    clusterKey:maClusterProfile&&maClusterProfile.key||'UNKNOWN',events:recent.sort((a,b)=>(b.openTime||0)-(a.openTime||0)).slice(0,12)};
}
function deriveFlowType({priceProfile={},oiProfile={},takerProfile={},volumeMaDna={}}={}){
  const price=finite(priceProfile.priceChange8hPct),oi=finite(oiProfile.changePct),dd=finite(oiProfile.drawdownPct),tmax=finite(takerProfile.max);
  let key='OBSERVE';
  if(volumeMaDna.stage==='ABSORPTION')key='ABSORPTION';
  else if(price!=null&&price>=1&&oi!=null&&oi<=-1)key='SQUEEZE';
  else if(oi!=null&&oi>=1.2&&dd!=null&&dd<=-1.5)key='CLEAN_REBUILD';
  else if(oi!=null&&oi>=1.2&&tmax!=null&&tmax>=1.8)key='DIRECT_BUILD';
  else if(volumeMaDna.stage==='EXPANSION'&&finite(volumeMaDna.maxRvol)>=10)key='EVENT_EXTREME';
  else if(price!=null&&price>=2&&oi!=null&&Math.abs(oi)<=1.5)key='PRICE_LED';
  return{key,label:FLOW_TYPE_LABELS[key]};
}
function derivePreSurgeDna({priceProfile={},maCluster={},volumeMaDna={},resetReignition={},flowType={},oiProfile={},takerProfile={}}={}){
  const price=finite(priceProfile.priceChange8hPct),tmax=finite(takerProfile.max),oi=finite(oiProfile.changePct);
  let score=0;const reasons=[];
  if(maCluster.key==='TIGHT'){score+=20;reasons.push('20/60/112/224 이평 초압축')}else if(maCluster.key==='NEAR'){score+=12;reasons.push('장단기 이평 근접')}
  if(maCluster.transition==='LTF_LEADS_HTF'){score+=12;reasons.push('4H 이평이 1D보다 먼저 전환')}else if(maCluster.transition==='HTF_ALIGNED'){score+=8;reasons.push('1D·4H 이평 동시 정렬')}
  if(volumeMaDna.stage==='PRE_SPARK'){score+=18;reasons.push('PRE-SPARK 거래량 선행')}else if(volumeMaDna.stage==='IGNITION'){score+=24;reasons.push('이평 압축 자리 거래량 점화')}else if(volumeMaDna.stage==='ABSORPTION'){score+=24;reasons.push('리셋 하락봉 대량흡수')}else if(volumeMaDna.stage==='EXPANSION'){score-=6;reasons.push('거래량은 이미 확장 단계')}
  if(resetReignition.key==='RESET_WAIT'){score+=10;reasons.push('하위봉 리셋 대기')}else if(['HTF_RESET_LTF_REIGNITION','15M_RESET_5M_REIGNITION'].includes(resetReignition.key)){score+=15;reasons.push('리셋 후 재점화')}
  if(tmax!=null&&tmax>=1.8){score+=15;reasons.push('taker 최고 '+tmax.toFixed(2)+'x')}
  if(flowType.key==='DIRECT_BUILD'){score+=16;reasons.push('taker→OI 직접 구축')}else if(flowType.key==='CLEAN_REBUILD'){score+=18;reasons.push('OI 청소→재구축')}else if(flowType.key==='ABSORPTION'){score+=14;reasons.push('흡수형 거래량')}else if(flowType.key==='SQUEEZE'){score+=6;reasons.push('OI 감소형 squeeze')}else if(flowType.key==='EVENT_EXTREME'){score-=12;reasons.push('이벤트성 과확장 감점')}
  if(oi!=null&&oi>=1)score+=6;
  if(price!=null&&Math.abs(price)<=5){score+=10;reasons.push('가격 아직 ±5% 내')}else if(price!=null&&price>=10)score-=18;
  score=Math.round(clamp(score));
  const eligible=score>=55&&flowType.key!=='EVENT_EXTREME'&&['PRE_SPARK','IGNITION','ABSORPTION','NONE'].includes(volumeMaDna.stage);
  let stage='WATCH';
  if(score>=75&&eligible)stage='PRE-SURGE';else if(score>=55&&eligible)stage='READY';else if(volumeMaDna.stage==='EXPANSION'||flowType.key==='EVENT_EXTREME')stage='PROGRESSED';
  return{version:'v4',score,eligible,stage,label:eligible?'PRE-SURGE DNA '+score:'샘플 DNA '+score,reasons:reasons.slice(0,8)};
}

function deriveVolumeShockMemory({frames={},oiProfile={},takerProfile={}}={}){
  const rows=closedRows(frames['5m']||[]).slice(-300);
  if(rows.length<22)return{found:false,eligible:false,status:'NONE',dna:null,shockCount:0,maxRvol:null,currentRvol:null,ageHours:null,memoryWindowHours:24,recheckHours:[1,3,6,12,24],reason:'5m 확정봉 이력 부족'};
  const start=Math.max(20,rows.length-288),shocks=[];
  for(let i=start;i<rows.length;i++){
    const base=avg(rows.slice(i-20,i).map(x=>val(x,5)).filter(v=>v!=null&&v>=0));
    const v=val(rows[i],5),r=base&&v!=null?v/base:null;
    if(r!=null&&r>=3)shocks.push({index:i,rvol:r,price:val(rows[i],4),low:val(rows[i],3),openTime:val(rows[i],0)});
  }
  if(!shocks.length){
    const base=avg(rows.slice(-21,-1).map(x=>val(x,5)).filter(v=>v!=null&&v>=0)),v=val(rows[rows.length-1],5);
    return{found:false,eligible:false,status:'NONE',dna:null,shockCount:0,maxRvol:null,currentRvol:base&&v!=null?v/base:null,ageHours:null,memoryWindowHours:24,recheckHours:[1,3,6,12,24],reason:'최근 24H closed 5m RVOL 3x 충격 없음'};
  }
  const first=shocks[0],latest=shocks[shocks.length-1],last=rows[rows.length-1],currentPrice=val(last,4);
  const base=avg(rows.slice(-21,-1).map(x=>val(x,5)).filter(v=>v!=null&&v>=0)),currentVol=val(last,5),currentRvol=base&&currentVol!=null?currentVol/base:null;
  const post=rows.slice(first.index),postLow=Math.min(...post.map(x=>val(x,3)).filter(v=>v!=null)),postHigh=Math.max(...post.map(x=>val(x,2)).filter(v=>v!=null));
  const priceFromSignalPct=first.price&&currentPrice!=null?((currentPrice/first.price)-1)*100:null;
  const maxExtensionPct=first.price&&postHigh!=null?((postHigh/first.price)-1)*100:null;
  const priceHeld=first.price&&currentPrice!=null?currentPrice>=first.price*.97:false;
  const structureBroken=Boolean(first.low&&postLow<first.low*.985&&!priceHeld);
  const ageHours=(rows.length-1-first.index)*5/60;
  const oi=finite(oiProfile?.changePct),takerMax=finite(takerProfile?.max);
  const a=oi!=null&&oi>=1,b=takerMax!=null&&takerMax>=1.8;
  const dna=a&&b?'D+A+B':a?'D+A':b?'D+B':'D';
  let status='WATCH';
  if(structureBroken||(priceFromSignalPct!=null&&priceFromSignalPct<=-5))status='BROKEN';
  else if(maxExtensionPct!=null&&maxExtensionPct>=10)status='PROGRESSED';
  else if(priceHeld&&currentRvol!=null&&currentRvol>=3&&(a||b))status='REIGNITION';
  else if(priceHeld&&(a||b))status='REIGNITION_READY';
  else if(priceHeld)status='LATENT';
  const eligible=ageHours<=24&&['LATENT','REIGNITION_READY','REIGNITION'].includes(status);
  return{
    found:true,eligible,status,dna,shockCount:shocks.length,maxRvol:Math.max(...shocks.map(x=>x.rvol)),currentRvol,ageHours,
    memoryWindowHours:24,recheckHours:[1,3,6,12,24],signalPrice:first.price,signalLow:first.low,signalOpenTime:first.openTime,
    latestShockOpenTime:latest.openTime,latestShockRvol:latest.rvol,currentPrice,priceFromSignalPct,maxExtensionPct,priceHeld,structureBroken,
    oiConfirmed:a,takerConfirmed:b,memoryExpiresInHours:Math.max(0,24-ageHours),
    reason:eligible?`closed 5m RVOL ≥3x 충격을 ${ageHours.toFixed(1)}H 유지 · ${dna}`:status==='PROGRESSED'?'신호 후 +10% 이상 진행':status==='BROKEN'?'신호가격/구조 이탈':'잠복 메모리 비대상'
  };
}

function deriveLiquidityPattern(rows15m=[]){
  const rows=(Array.isArray(rows15m)?rows15m:[]).filter(Array.isArray).slice(-48);
  if(rows.length<32)return{key:'UNKNOWN',label:LIQUIDITY_LABELS.UNKNOWN,earlyLow:null,lateLow:null,earlyHigh:null,lateHigh:null,lowSweep:false,highSweep:false};
  const split=Math.floor(rows.length/2),early=rows.slice(0,split),late=rows.slice(split);
  const earlyLow=Math.min(...early.map(x=>val(x,3)).filter(v=>v!=null));
  const lateLow=Math.min(...late.map(x=>val(x,3)).filter(v=>v!=null));
  const earlyHigh=Math.max(...early.map(x=>val(x,2)).filter(v=>v!=null));
  const lateHigh=Math.max(...late.map(x=>val(x,2)).filter(v=>v!=null));
  const lowSweep=lateLow<earlyLow*.9995,highSweep=lateHigh>earlyHigh*1.0005,lowHeld=lateLow>earlyLow*1.001;
  let key='RANGE-HOLD';
  if(lowSweep&&highSweep)key='DOUBLE-SWEEP';
  else if(highSweep&&!lowSweep)key='BSL-EXPANSION';
  else if(lowSweep&&!highSweep)key='SSL-SWEEP';
  else if(lowHeld)key='SSL-HOLD';
  return{key,label:LIQUIDITY_LABELS[key],earlyLow,lateLow,earlyHigh,lateHigh,lowSweep,highSweep};
}


function closedRows(rows=[]){
  const a=(Array.isArray(rows)?rows:[]).filter(Array.isArray);
  return a.length>20?a.slice(0,-1):a;
}
function deriveLocalSweepPattern(rows5m=[]){
  const rows=closedRows(rows5m).slice(-60);
  if(rows.length<16)return{key:'NO_SWEEP_COMPRESSION',label:SWEEP_LABELS.NO_SWEEP_COMPRESSION,events:[],ssl:null,bsl:null,bslBroken:false,acceptance:0};
  const events=[];
  for(let i=12;i<rows.length;i++){
    const prev=rows.slice(i-12,i),sl=Math.min(...prev.map(x=>val(x,3)).filter(v=>v!=null)),bl=Math.max(...prev.map(x=>val(x,2)).filter(v=>v!=null));
    const l=val(rows[i],3),h=val(rows[i],2),c=val(rows[i],4);
    if(l!=null&&c!=null&&l<sl&&c>sl)events.push({type:'SSL',index:i,level:sl});
    if(h!=null&&c!=null&&h>bl&&c<bl)events.push({type:'BSL',index:i,level:bl});
  }
  const recent=events.filter(e=>e.index>=rows.length-24),hasS=recent.some(e=>e.type==='SSL'),hasB=recent.some(e=>e.type==='BSL');
  const lastB=[...recent].reverse().find(e=>e.type==='BSL'),sAfterB=lastB&&recent.some(e=>e.type==='SSL'&&e.index>lastB.index);
  let key='NO_SWEEP_COMPRESSION';
  if(lastB&&sAfterB)key='FAILED_BREAK_REBUILD';
  else if(hasS&&hasB)key='DOUBLE_SWEEP';
  else if(hasS)key='SSL_SWEEP_RECLAIM';
  else if(hasB)key='BSL_PROBE_REATTACK';
  const prior=rows.slice(-13,-1),last=rows[rows.length-1],ssl=Math.min(...prior.map(x=>val(x,3)).filter(v=>v!=null)),bsl=Math.max(...prior.map(x=>val(x,2)).filter(v=>v!=null)),lastClose=val(last,4);
  const acceptance=rows.slice(-7).filter(x=>val(x,4)!=null&&val(x,4)>bsl).length;
  return{key,label:SWEEP_LABELS[key],events:recent.slice(-6),ssl,bsl,bslBroken:lastClose!=null&&lastClose>bsl,acceptance,
    distanceToBslPct:lastClose&&bsl?((bsl/lastClose)-1)*100:null,distanceFromSslPct:lastClose&&ssl?((lastClose/ssl)-1)*100:null};
}
function timeTag(ratio){
  if(ratio==null||!Number.isFinite(ratio))return'UNKNOWN';
  if(ratio<.5)return'FAST_RECLAIM';
  if(ratio<=1.3)return'TIME_SYMMETRY';
  if(ratio<=3)return'ABSORPTION_TIME';
  return'LONG_REBUILD';
}
function deriveTimeSymmetry(rows=[],minutesPerBar=15){
  const a=closedRows(rows);
  if(a.length<20)return{ratio:null,tag:'UNKNOWN',label:TIME_LABELS.UNKNOWN,declineMinutes:null,recoveryMinutes:null};
  const ix=a.length-1,start=Math.max(2,ix-48),lows=[],highs=[];
  for(let i=start;i<=Math.min(ix-1,a.length-3);i++){
    const l=val(a[i],3),h=val(a[i],2);
    if(l!=null&&l<=val(a[i-1],3)&&l<=val(a[i-2],3)&&l<=val(a[i+1],3)&&l<=val(a[i+2],3))lows.push(i);
    if(h!=null&&h>=val(a[i-1],2)&&h>=val(a[i-2],2)&&h>=val(a[i+1],2)&&h>=val(a[i+2],2))highs.push(i);
  }
  const lowIdx=lows.filter(i=>i<ix).at(-1);
  if(lowIdx==null)return{ratio:null,tag:'UNKNOWN',label:TIME_LABELS.UNKNOWN,declineMinutes:null,recoveryMinutes:null};
  const highIdx=highs.filter(i=>i<lowIdx).at(-1);
  if(highIdx==null)return{ratio:null,tag:'UNKNOWN',label:TIME_LABELS.UNKNOWN,declineMinutes:null,recoveryMinutes:null};
  const declineMinutes=(lowIdx-highIdx)*minutesPerBar,recoveryMinutes=(ix-lowIdx)*minutesPerBar,ratio=declineMinutes>0?recoveryMinutes/declineMinutes:null,tag=timeTag(ratio);
  return{ratio,tag,label:TIME_LABELS[tag],declineMinutes,recoveryMinutes,pivotHigh:val(a[highIdx],2),pivotLow:val(a[lowIdx],3)};
}
function emaSeries(values,period){
  const src=(values||[]).map(finite);if(src.length<period)return[];const k=2/(period+1),out=Array(src.length).fill(null);let e=src.slice(0,period).reduce((s,v)=>s+v,0)/period;out[period-1]=e;
  for(let i=period;i<src.length;i++){e=src[i]*k+e*(1-k);out[i]=e}return out;
}
function rsiSeries(values,period=14){
  const src=(values||[]).map(finite),out=Array(src.length).fill(null);if(src.length<=period)return out;let gain=0,loss=0;
  for(let i=1;i<=period;i++){const d=src[i]-src[i-1];gain+=Math.max(d,0);loss+=Math.max(-d,0)}
  let ag=gain/period,al=loss/period;out[period]=al===0?100:100-(100/(1+ag/al));
  for(let i=period+1;i<src.length;i++){const d=src[i]-src[i-1];ag=(ag*(period-1)+Math.max(d,0))/period;al=(al*(period-1)+Math.max(-d,0))/period;out[i]=al===0?100:100-(100/(1+ag/al))}
  return out;
}
function indicatorDna(rows=[]){
  const a=closedRows(rows),closes=a.map(x=>val(x,4)).filter(v=>v!=null),rsi=rsiSeries(closes,14);if(closes.length<30)return{rsi:null,stochK:null,stochD:null,macdHist:null,obvTrend:null};
  const raw=Array(closes.length).fill(null);
  for(let i=27;i<closes.length;i++){const w=rsi.slice(i-13,i+1).filter(v=>v!=null);if(w.length<14)continue;const lo=Math.min(...w),hi=Math.max(...w);raw[i]=hi===lo?50:(rsi[i]-lo)/(hi-lo)*100}
  function smooth(src,n){const out=Array(src.length).fill(null);for(let i=n-1;i<src.length;i++){const w=src.slice(i-n+1,i+1);if(w.every(v=>v!=null))out[i]=w.reduce((s,v)=>s+v,0)/n}return out}
  const sk=smooth(raw,3),sd=smooth(sk,3),e12=emaSeries(closes,12),e26=emaSeries(closes,26),macd=closes.map((_,i)=>e12[i]!=null&&e26[i]!=null?e12[i]-e26[i]:null),sig=emaSeries(macd.filter(v=>v!=null),9);
  let macdHist=null,j=0;for(let i=0;i<macd.length;i++)if(macd[i]!=null){const s=sig[j++];if(s!=null)macdHist=macd[i]-s}
  let obv=0,baseObv=0;for(let i=1;i<a.length;i++){const prev=val(a[i-1],4),cur=val(a[i],4),v=val(a[i],5)||0;if(cur>prev)obv+=v;else if(cur<prev)obv-=v;if(i===Math.max(1,a.length-11))baseObv=obv}
  const den=a.slice(-10).reduce((s,x)=>s+(val(x,5)||0),0);
  return{rsi:rsi.at(-1),stochK:sk.at(-1),stochD:sd.at(-1),macdHist,obvTrend:den?(obv-baseObv)/den:null};
}
function deriveResetReignition(frames={}){
  const one=indicatorDna(frames['1h']||[]),fifteen=indicatorDna(frames['15m']||[]),five=indicatorDna(frames['5m']||[]);
  const reset1=one.stochK!=null&&one.stochK<=20,reset15=fifteen.stochK!=null&&fifteen.stochK<=20;
  const rec15=fifteen.stochK!=null&&fifteen.stochD!=null&&fifteen.stochK>fifteen.stochD&&fifteen.rsi!=null&&fifteen.rsi>=45;
  const ignite5=five.stochK!=null&&five.stochD!=null&&five.stochK>five.stochD&&five.stochK>=40&&five.rsi!=null&&five.rsi>=50&&five.macdHist!=null&&five.macdHist>0&&(five.obvTrend==null||five.obvTrend>=0);
  let key='NO_RESET';
  if(reset1&&rec15&&ignite5)key='HTF_RESET_LTF_REIGNITION';
  else if(reset15&&ignite5)key='15M_RESET_5M_REIGNITION';
  else if(reset1||reset15)key='RESET_WAIT';
  return{key,label:RESET_LABELS[key],oneHour:one,fifteenMin:fifteen,fiveMin:five,reset1h:reset1,reset15m:reset15,reignition5m:ignite5};
}
function deriveDormancyProfile({phase,priceProfile,archetype,score,volumeShockMemory}={}){
  if(volumeShockMemory?.eligible)return{
    eligible:true,memoryWindowHours:24,recheckHours:[1,3,6,12,24],source:'RVOL_5M_SHOCK',
    signalPrice:volumeShockMemory.signalPrice,ageHours:volumeShockMemory.ageHours,dna:volumeShockMemory.dna,status:volumeShockMemory.status,
    reason:volumeShockMemory.reason
  };
  const p=finite(priceProfile?.priceChange8hPct),eligible=['LATENT','IGNITION-WAIT','OBSERVE'].includes(String(phase||''))&&p!=null&&Math.abs(p)<=5&&String(archetype||'NEUTRAL')!=='NEUTRAL'&&finite(score)>=45;
  return{eligible,memoryWindowHours:24,recheckHours:[1,3,6,12,24],source:eligible?'SAMPLE_DNA':null,reason:eligible?'첫 이상징후를 24시간 유지하며 재점화 확인':'잠복 메모리 비대상'};
}

function classifyArchetype({priceProfile={},oiProfile={},takerProfile={},xoiProfile={}}={}){
  const price=finite(priceProfile.priceChange8hPct),oi=finite(oiProfile.changePct),dd=finite(oiProfile.drawdownPct),tmin=finite(takerProfile.min),tmax=finite(takerProfile.max),trange=finite(takerProfile.range);
  const x=normalizeXoiProfile(xoiProfile),xoi=finite(x.leaderChangePct),xoiBuild=x.available&&((xoi!=null&&xoi>=1.2)||x.positiveBreadth>=1),xoiStrong=x.available&&((xoi!=null&&xoi>=2.5)||x.strongBreadth>=1);
  const deleveraging=(dd!=null&&dd<=-3)||(oi!=null&&oi<=-2);
  const oiStableBuild=oi!=null&&oi>=1.2&&(dd==null||dd>=-1.5);
  const oiStrongBuild=oi!=null&&oi>=2.5&&(dd==null||dd>=-1.5);
  const takerExtreme=(tmax!=null&&tmax>=1.8&&tmin!=null&&tmin<=.8)||(trange!=null&&trange>=1.15);
  let archetype='NEUTRAL';
  if(xoiBuild&&oiStableBuild&&takerExtreme)archetype='X+A+B';
  else if(xoiBuild&&oiStableBuild)archetype='X+A';
  else if(xoiBuild&&takerExtreme)archetype='X+B';
  else if(xoiBuild)archetype='X';
  else if(oiStableBuild&&takerExtreme)archetype='A+B';
  else if(oiStableBuild)archetype='A';
  else if(oi!=null&&Math.abs(oi)<=1.5&&takerExtreme)archetype='B';
  else if(deleveraging)archetype='C';
  const reasons=[];
  if(price!=null&&Math.abs(price)<=3)reasons.push('가격 8H 압축');
  if(oiStrongBuild)reasons.push(`OI 선행축적 ${oi>=0?'+':''}${oi.toFixed(2)}%`);
  else if(oiStableBuild)reasons.push(`OI 완만축적 ${oi>=0?'+':''}${oi.toFixed(2)}%`);
  if(dd!=null&&dd>=-1)reasons.push(`OI DD ${dd.toFixed(2)}%로 안정`);
  if(xoiBuild)reasons.push(`XOI ${x.leaderExchange||'외부거래소'} ${xoi==null?'선행':`${xoi>=0?'+':''}${xoi.toFixed(2)}%`} · ${x.positiveBreadth}/${x.breadth} 확산`);
  if(xoiStrong&&x.strongBreadth>=2)reasons.push(`XOI 다거래소 강확산 ${x.strongBreadth}곳`);
  if(takerExtreme)reasons.push(`taker ${tmin==null?'-':tmin.toFixed(2)}↔${tmax==null?'-':tmax.toFixed(2)} 이상왕복`);
  if(deleveraging)reasons.push(`파생 유동성 청소 ${dd==null?oi.toFixed(2):dd.toFixed(2)}%`);
  return{archetype,label:ARCHETYPE_LABELS[archetype],reasons};
}

function classifyPhase({priceProfile={},oiProfile={},takerProfile={},xoiProfile={},liquidity={}}={}){
  const price=finite(priceProfile.priceChange8hPct),vol=finite(priceProfile.volumeRatio),oi=finite(oiProfile.changePct),dd=finite(oiProfile.drawdownPct),tmax=finite(takerProfile.max),x=normalizeXoiProfile(xoiProfile),xoi=finite(x.leaderChangePct);
  const xoiBuild=x.available&&((xoi!=null&&xoi>=1.2)||x.positiveBreadth>=1);
  if(price!=null&&price<=-5&&oi!=null&&oi<=-2)return'BROKEN';
  if(dd!=null&&dd<=-3&&(oi==null||oi<1))return'DELEVERAGING';
  if(price!=null&&price>=10){
    if(oi!=null&&oi>=1&&vol!=null&&vol>=1.4)return'REIGNITION';
    return'PROGRESSED';
  }
  if(price!=null&&price>=5&&oi!=null&&oi>=1&&vol!=null&&vol>=1.2)return'IGNITION-EARLY';
  if(price!=null&&Math.abs(price)<=5&&oi!=null&&oi>=1){
    if(vol!=null&&vol>=1.5)return'IGNITION-EARLY';
    return'IGNITION-WAIT';
  }
  if(price!=null&&Math.abs(price)<=5&&xoiBuild&&vol!=null&&vol>=1.5)return'IGNITION-EARLY';
  if(price!=null&&Math.abs(price)<=3&&xoiBuild)return'LATENT';
  if(price!=null&&Math.abs(price)<=3&&tmax!=null&&tmax>=1.8)return'LATENT';
  if(liquidity?.key==='DOUBLE-SWEEP'&&price!=null&&Math.abs(price)<=5)return'IGNITION-WAIT';
  return'OBSERVE';
}

function scorePattern({archetype='NEUTRAL',phase='OBSERVE',priceProfile={},oiProfile={},takerProfile={},xoiProfile={},liquidity={}}={}){
  const price=finite(priceProfile.priceChange8hPct),vol=finite(priceProfile.volumeRatio),oi=finite(oiProfile.changePct),dd=finite(oiProfile.drawdownPct),tmax=finite(takerProfile.max),tmin=finite(takerProfile.min),x=normalizeXoiProfile(xoiProfile),xoi=finite(x.leaderChangePct);
  let score=0;
  if(price!=null&&Math.abs(price)<=3)score+=18;else if(price!=null&&Math.abs(price)<=5)score+=10;
  if(oi!=null&&oi>=2.5&&(dd==null||dd>=-1.5))score+=32;else if(oi!=null&&oi>=1&&(dd==null||dd>=-1.5))score+=22;
  if(x.available&&xoi!=null&&xoi>=2.5)score+=28;else if(x.available&&xoi!=null&&xoi>=1.2)score+=20;
  if(x.positiveBreadth>=2)score+=8;if(x.strongBreadth>=2)score+=6;
  if(tmax!=null&&tmin!=null&&tmax>=1.8&&tmin<=.8)score+=20;
  if(vol!=null&&vol>=1.8)score+=18;else if(vol!=null&&vol>=1.2)score+=10;
  if(liquidity?.key==='DOUBLE-SWEEP')score+=12;else if(liquidity?.key==='BSL-EXPANSION'||liquidity?.key==='SSL-HOLD')score+=7;
  if(archetype==='X+A+B')score+=12;else if(archetype==='X+B'||archetype==='X+A')score+=9;else if(archetype==='X')score+=6;else if(archetype==='A+B')score+=8;else if(archetype==='A'||archetype==='B')score+=5;else if(archetype==='C'&&phase==='DELEVERAGING')score+=5;
  if(price!=null&&price>=10)score-=15;if(price!=null&&price>=20)score-=15;
  if(dd!=null&&dd<=-5&&archetype!=='C')score-=12;
  return Math.round(clamp(score));
}

function analyzeSamplePattern({frames={},derivativesProfile={}}={}){
  const priceProfile=derivePriceProfile(frames['15m']||[]);
  const liquidity=deriveLiquidityPattern(frames['15m']||[]);
  const sweep=deriveLocalSweepPattern(frames['5m']||frames['15m']||[]);
  const timeSymmetry={m15:deriveTimeSymmetry(frames['15m']||[],15),h1:deriveTimeSymmetry(frames['1h']||[],60)};
  const resetReignition=deriveResetReignition(frames);
  const maCluster=deriveMaClusterProfile(frames);
  const oiProfile=derivativesProfile.oiProfile||deriveOiProfile(derivativesProfile.oiRows||[]);
  const takerProfile=derivativesProfile.takerProfile||deriveTakerProfile(derivativesProfile.takerRows||[]);
  const xoiProfile=normalizeXoiProfile(derivativesProfile.xoiProfile||{});
  const sequenceTag=deriveSequenceTag({oiProfile,takerProfile,xoiProfile});
  const volumeShockMemory=deriveVolumeShockMemory({frames,oiProfile,takerProfile});
  const volumeMaDna=deriveVolumeMaDna({frames,maClusterProfile:maCluster});
  const flowType=deriveFlowType({priceProfile,oiProfile,takerProfile,volumeMaDna});
  const preSurgeDna=derivePreSurgeDna({priceProfile,maCluster,volumeMaDna,resetReignition,flowType,oiProfile,takerProfile});
  const archetypeInfo=classifyArchetype({priceProfile,oiProfile,takerProfile,xoiProfile});
  let phase=classifyPhase({priceProfile,oiProfile,takerProfile,xoiProfile,liquidity});
  if(volumeShockMemory.status==='BROKEN')phase='BROKEN';
  else if(volumeShockMemory.status==='REIGNITION')phase='REIGNITION';
  else if(volumeShockMemory.status==='REIGNITION_READY'&&['OBSERVE','LATENT'].includes(phase))phase='IGNITION-WAIT';
  else if(volumeShockMemory.status==='LATENT'&&phase==='OBSERVE')phase='LATENT';
  let score=scorePattern({archetype:archetypeInfo.archetype,phase,priceProfile,oiProfile,takerProfile,xoiProfile,liquidity});
  const longToFast=timeSymmetry.h1.tag==='LONG_REBUILD'&&timeSymmetry.m15.tag==='FAST_RECLAIM';
  if(sweep.key!=='NO_SWEEP_COMPRESSION')score+=6;
  if(longToFast)score+=8;
  if(['HTF_RESET_LTF_REIGNITION','15M_RESET_5M_REIGNITION'].includes(resetReignition.key))score+=8;else if(resetReignition.key==='RESET_WAIT')score+=3;
  if(volumeShockMemory.found)score+=6;
  if(volumeShockMemory.eligible)score+=6;
  if(['D+A','D+B','D+A+B'].includes(volumeShockMemory.dna))score+=5;
  if(volumeShockMemory.status==='REIGNITION')score+=6;
  if(maCluster.key==='TIGHT')score+=8;else if(maCluster.key==='NEAR')score+=4;
  if(['PRE_SPARK','IGNITION','ABSORPTION'].includes(volumeMaDna.stage))score+=8;
  if(['DIRECT_BUILD','CLEAN_REBUILD','ABSORPTION'].includes(flowType.key))score+=8;
  if(preSurgeDna.eligible)score+=6;
  if(flowType.key==='EVENT_EXTREME')score-=8;
  score=Math.round(clamp(score));
  const cleanup=(finite(oiProfile.drawdownPct)!=null&&finite(oiProfile.drawdownPct)<=-2)||(finite(oiProfile.changePct)!=null&&finite(oiProfile.changePct)<=-2);
  const xoi=Boolean(xoiProfile.available&&((finite(xoiProfile.leaderChangePct)!=null&&finite(xoiProfile.leaderChangePct)>=1.2)||xoiProfile.positiveBreadth>=1));
  const takerExtreme=finite(takerProfile.max)!=null&&finite(takerProfile.max)>=1.8;
  const sampleFeatures={archetype:archetypeInfo.archetype,sweepKey:sweep.key,time15Key:timeSymmetry.m15.tag,time1hKey:timeSymmetry.h1.tag,resetKey:resetReignition.key,cleanup,xoi,takerExtreme,maClusterKey:maCluster.key,volumeStage:volumeMaDna.stage,flowType:flowType.key,htfTransition:maCluster.transition};
  const similarity=Library.compareSampleLibrary(sampleFeatures,3);
  const negativeSimilarity=typeof Library.compareNegativeSampleLibrary==='function'?Library.compareNegativeSampleLibrary(sampleFeatures,2):[];
  const controlRisk=Boolean(negativeSimilarity[0]&&negativeSimilarity[0].score>=70&&['SQUEEZE','PRICE_LED'].includes(flowType.key));
  if(controlRisk){score=Math.max(0,score-12);preSurgeDna.eligible=false;preSurgeDna.stage='CONTROL-RISK';preSurgeDna.label='대조군 유사 · '+negativeSimilarity[0].name;}
  const dormancy=deriveDormancyProfile({phase,priceProfile,archetype:archetypeInfo.archetype,score,volumeShockMemory});
  const reasons=[...archetypeInfo.reasons];
  if(priceProfile.volumeRatio!=null&&priceProfile.volumeRatio>=1.2)reasons.push(`최근 거래량 ${priceProfile.volumeRatio.toFixed(2)}x`);
  if(volumeShockMemory.found)reasons.push(`5m RVOL 충격 ${volumeShockMemory.maxRvol.toFixed(2)}x · ${volumeShockMemory.dna}`);
  if(volumeShockMemory.eligible)reasons.push(`잠복메모리 ${volumeShockMemory.ageHours.toFixed(1)}H · ${volumeShockMemory.status}`);
  if(sweep?.label)reasons.push(sweep.label);
  if(timeSymmetry.m15.tag!=='UNKNOWN')reasons.push(`기간 15m ${timeSymmetry.m15.label} R=${timeSymmetry.m15.ratio.toFixed(2)}`);
  if(longToFast)reasons.push('1H 장기축적 → 15m 빠른 회수');
  if(resetReignition.key!=='NO_RESET')reasons.push(resetReignition.label);
  if(maCluster.key!=='UNKNOWN')reasons.push(maCluster.label+(maCluster.primaryFrame?' · '+maCluster.primaryFrame:''));
  if(volumeMaDna.stage!=='NONE')reasons.push(volumeMaDna.label);
  if(flowType.key!=='OBSERVE')reasons.push(flowType.label);
  if(preSurgeDna.eligible)reasons.push('PRE-SURGE v4 '+preSurgeDna.score+'점');
  if(controlRisk)reasons.push('대조군 유사 '+negativeSimilarity[0].name+' '+negativeSimilarity[0].score+'%');
  if(similarity[0]?.score>=55)reasons.push(`샘플 유사도 ${similarity[0].name} ${similarity[0].score}%`);
  return{
    archetype:archetypeInfo.archetype,
    archetypeLabel:archetypeInfo.label,
    phase,
    phaseLabel:PHASE_LABELS[phase]||phase,
    score,
    priceProfile,
    oiProfile,
    takerProfile,
    xoiProfile,
    sequenceTag,
    liquidity,
    sweep,
    timeSymmetry,
    resetReignition,
    maCluster,
    volumeMaDna,
    flowType,
    preSurgeDna,
    volumeShockMemory,
    similarity,
    negativeSimilarity,
    controlRisk,
    dormancy,
    reasons:reasons.slice(0,8)
  };
}

module.exports={
  ARCHETYPE_LABELS,PHASE_LABELS,LIQUIDITY_LABELS,SWEEP_LABELS,TIME_LABELS,RESET_LABELS,MA_CLUSTER_LABELS,VOLUME_STAGE_LABELS,FLOW_TYPE_LABELS,
  deriveOiProfile,deriveTakerProfile,normalizeXoiProfile,deriveSequenceTag,derivePriceProfile,deriveMaClusterProfile,deriveVolumeMaDna,deriveFlowType,derivePreSurgeDna,deriveVolumeShockMemory,deriveLiquidityPattern,deriveLocalSweepPattern,deriveTimeSymmetry,deriveResetReignition,deriveDormancyProfile,
  classifyArchetype,classifyPhase,scorePattern,analyzeSamplePattern
};
