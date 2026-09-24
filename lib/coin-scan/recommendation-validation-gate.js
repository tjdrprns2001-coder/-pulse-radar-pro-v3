'use strict';

const PROMOTABLE=new Set(['RECOMMEND','CONFIRMED','READY']);
const RANK={RECOMMEND:0,CONFIRMED:1,READY:2,WATCH:3,WAIT:4,EXCLUDE:5};
function n(v){if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null}
function uniq(a=[]){return [...new Set(a.filter(Boolean).map(String))]}
function capState(current,cap){
  const a=RANK[String(current)]??99,b=RANK[String(cap)]??99;
  return a<b?cap:current;
}
function executionSummary(execution={}){
  const rows=[execution.spot,execution.futures].filter(x=>x&&x.available);
  if(!rows.length)return{available:false,status:'INSUFFICIENT_DATA',reasonCodes:['INSUFFICIENT_EXECUTION_DATA'],worst:null};
  const assessed=rows.map(x=>{
    const depths=[n(x.depthUsd?.bid10bps),n(x.depthUsd?.ask10bps)].filter(v=>v!=null),depth10=depths.length?Math.min(...depths):null;
    const slips=[...(x.slippage?.buy||[]),...(x.slippage?.sell||[])].filter(Boolean).filter(y=>n(y.notional)>=10000).map(y=>n(y.slippageBps)).filter(v=>v!=null);
    const maxSlip=slips.length?Math.max(...slips):null,spread=n(x.spreadBps);
    let status='VALIDATED',reason=null;
    if(spread==null||depth10==null){status='INSUFFICIENT_DATA';reason='INSUFFICIENT_EXECUTION_DATA'}
    else if(spread>25||depth10<10000||(maxSlip!=null&&maxSlip>40)){status='INVALIDATED';reason='ILLIQUID'}
    else if(spread>10||depth10<50000||(maxSlip!=null&&maxSlip>20)){status='CONFLICTED';reason='EXECUTION_COST_RISK'}
    return{marketType:x.marketType||'unknown',status,reason,spreadBps:spread,depth10Usd:depth10,maxSlippageBps:maxSlip};
  });
  const worst=assessed.find(x=>x.status==='INVALIDATED')||assessed.find(x=>x.status==='CONFLICTED')||assessed.find(x=>x.status==='INSUFFICIENT_DATA')||assessed[0];
  return{available:true,status:worst.status,reasonCodes:uniq(assessed.map(x=>x.reason)),worst,markets:assessed};
}
function marketConflict(item={}){
  const m=item.marketIntelligence||{},disp=n(m.maxPriceDispersionPct);
  return{dispersionPct:disp,conflicted:disp!=null&&disp>3};
}
function crowding(item={}){
  const oi=n(item.oi4hChangePct),fund=n(item.fundingRate),taker=n(item.trueTakerRatio??item.takerRatio);
  const crowded=oi!=null&&oi>=5&&fund!=null&&fund>0.03;
  return{crowded,oi4hPct:oi,fundingRate:fund,takerRatio:taker};
}
function statsPolicy(stats={}){
  const h=stats?.byStatus?.VALIDATED?.horizons?.h24||{},lift=stats?.validationLift?.h24||{},nEval=Number(h.evaluatedCount)||0,mean=n(lift.meanReturnLiftPct),pos=n(lift.positiveRatioLift);
  const mature=nEval>=50;
  return{mature,evaluatedCount:nEval,meanReturnLiftPct:mean,positiveRatioLift:pos,positiveEvidence:Boolean(mature&&mean!=null&&mean>0&&pos!=null&&pos>0),negativeEvidence:Boolean(mature&&((mean!=null&&mean<0)||(pos!=null&&pos<0)))};
}
function apply(row,{execution=null,stats=null,checked=false}={}){
  const out={...row,reasons:[...(row.reasons||[])],missing:[...(row.missing||[])],invalidations:[...(row.invalidations||[])]};
  const perf=statsPolicy(stats||{}),conflict=marketConflict(row.item||{}),crowd=crowding(row.item||{});
  let state=String(out.state||'WATCH'),status='VALIDATED',reasonCodes=[];
  if(!checked&&PROMOTABLE.has(state)){state='WATCH';status='INSUFFICIENT_DATA';reasonCodes.push('EXECUTION_NOT_CHECKED');out.missing.push('실시간 체결성 검증')}
  if(checked){
    const ex=executionSummary(execution||{});
    if(ex.status==='INVALIDATED'){state='EXCLUDE';status='INVALIDATED';reasonCodes.push(...ex.reasonCodes);out.invalidations.push('체결성 기준 미달')}
    else if(ex.status==='CONFLICTED'){state=capState(state,'WATCH');status='CONFLICTED';reasonCodes.push(...ex.reasonCodes);out.invalidations.push('스프레드/슬리피지 관찰 필요')}
    else if(ex.status==='INSUFFICIENT_DATA'){state=capState(state,'WATCH');status='INSUFFICIENT_DATA';reasonCodes.push(...ex.reasonCodes);out.missing.push('체결성 데이터')}
    out.executionValidation=ex;
  }
  if(conflict.conflicted){state=capState(state,'WAIT');status=status==='INVALIDATED'?status:'CONFLICTED';reasonCodes.push('PRICE_SOURCE_CONFLICT');out.invalidations.push('거래소 가격편차 '+conflict.dispersionPct.toFixed(2)+'%')}
  if(crowd.crowded){state=capState(state,'WAIT');status=status==='INVALIDATED'?status:'CONFLICTED';reasonCodes.push('DERIVATIVES_CROWDING');out.invalidations.push('OI+funding crowding 위험')}
  if(perf.negativeEvidence&&PROMOTABLE.has(state)){state='WATCH';status=status==='VALIDATED'?'CONFLICTED':status;reasonCodes.push('VALIDATION_LIFT_NEGATIVE');out.invalidations.push('검증 성과 표본에서 lift 음수')}
  if(perf.positiveEvidence)out.reasons.push('시장검증 성과 표본 통과');
  out.state=state;out.label=state==='RECOMMEND'?'추천':state==='CONFIRMED'?'확정':state==='READY'?'준비':state==='WATCH'?'관찰':state==='WAIT'?'대기':'제외';
  out.validationGate={version:'RECOMMENDATION_VALIDATION_GATE_v1',status,checked:Boolean(checked),reasonCodes:uniq(reasonCodes),marketConflict:conflict,crowding:crowd,performance:perf};
  out.reasons=uniq(out.reasons).slice(0,10);out.missing=uniq(out.missing).slice(0,10);out.invalidations=uniq(out.invalidations).slice(0,10);
  return out;
}
function bundle(rows=[],limit=30){
  const sorted=rows.slice().sort((a,b)=>(RANK[a.state]??99)-(RANK[b.state]??99)||(Number(b.score)||0)-(Number(a.score)||0)||String(a.symbol).localeCompare(String(b.symbol)));
  return{
    recommended:sorted.filter(x=>x.state==='RECOMMEND').slice(0,limit),
    confirmed:sorted.filter(x=>x.state==='CONFIRMED').slice(0,limit),
    ready:sorted.filter(x=>x.state==='READY').slice(0,limit),
    watch:sorted.filter(x=>x.state==='WATCH').slice(0,limit),
    wait:sorted.filter(x=>x.state==='WAIT').slice(0,limit),
    excluded:sorted.filter(x=>x.state==='EXCLUDE').slice(0,limit)
  };
}
module.exports={PROMOTABLE,RANK,executionSummary,marketConflict,crowding,statsPolicy,apply,bundle};
