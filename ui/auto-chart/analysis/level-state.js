(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartLevelState=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';

const STATUS=Object.freeze({
  SUPPORT_HOLD:'SUPPORT_HOLD',
  RESISTANCE_HOLD:'RESISTANCE_HOLD',
  BREAKOUT_CONFIRMED:'BREAKOUT_CONFIRMED',
  BREAKDOWN_CONFIRMED:'BREAKDOWN_CONFIRMED',
  SUPPORT_FLIP_PENDING:'SUPPORT_FLIP_PENDING',
  RESISTANCE_FLIP_PENDING:'RESISTANCE_FLIP_PENDING',
  SUPPORT_FLIP_CONFIRMED:'SUPPORT_FLIP_CONFIRMED',
  RESISTANCE_FLIP_CONFIRMED:'RESISTANCE_FLIP_CONFIRMED',
  FLIP_FAILED:'FLIP_FAILED'
});
const LABELS={
  SUPPORT_HOLD:'지지 유지',RESISTANCE_HOLD:'저항 유지',
  BREAKOUT_CONFIRMED:'종가 돌파 · 지지 전환 확인 대기',
  BREAKDOWN_CONFIRMED:'종가 이탈 · 저항 전환 확인 대기',
  SUPPORT_FLIP_PENDING:'지지 전환 재테스트 진행',
  RESISTANCE_FLIP_PENDING:'저항 전환 재테스트 진행',
  SUPPORT_FLIP_CONFIRMED:'재테스트 후 지지 전환',
  RESISTANCE_FLIP_CONFIRMED:'재테스트 후 저항 전환',
  FLIP_FAILED:'재이탈 · 전환 실패'
};
function atrAt(i,series,fallback){const v=Number(series?.[i]);return Number.isFinite(v)&&v>0?v:Number(fallback)||0}
function startIndex(candles,knownAt){for(let i=0;i<candles.length;i++)if(Number(candles[i].closeTime)>=Number(knownAt||0))return i;return 0}
function event(out,state,i,c,extra={}){out.status=state;out.statusLabel=LABELS[state]||state;out.changedAt=c.closeTime;out.events.push({state,at:c.closeTime,index:i,...extra})}
function evolve(zone,candles,{atrSeries=[],atrNow,breakoutAtr=.10,retestAtr=.25}={}){
  const originRole=zone.type==='support'?'support':'resistance',out={...zone,originRole,effectiveRole:originRole,status:originRole==='support'?STATUS.SUPPORT_HOLD:STATUS.RESISTANCE_HOLD,statusLabel:originRole==='support'?LABELS.SUPPORT_HOLD:LABELS.RESISTANCE_HOLD,changedAt:zone.knownAt,events:[],breakIndex:-1,retestIndex:-1,transitionTarget:null};
  let phase='hold';
  for(let i=startIndex(candles,zone.knownAt);i<candles.length;i++){
    const c=candles[i],a=atrAt(i,atrSeries,atrNow);if(!(a>0))continue;
    const breakMargin=a*breakoutAtr,retestTol=a*retestAtr;
    if(out.effectiveRole==='resistance'&&phase==='hold'){
      if(originRole==='support'&&out.status===STATUS.RESISTANCE_FLIP_CONFIRMED&&c.close>zone.high+retestTol){out.effectiveRole='support';out.transitionTarget=null;event(out,STATUS.FLIP_FAILED,i,c,{failedTarget:'resistance'});continue}
      if(c.close>zone.high+breakMargin){out.effectiveRole='transition';out.transitionTarget='support';out.breakIndex=i;phase='flip-support';event(out,STATUS.BREAKOUT_CONFIRMED,i,c,{boundary:zone.high});continue}
    }else if(out.effectiveRole==='support'&&phase==='hold'){
      if(originRole==='resistance'&&out.status===STATUS.SUPPORT_FLIP_CONFIRMED&&c.close<zone.low-retestTol){out.effectiveRole='resistance';out.transitionTarget=null;event(out,STATUS.FLIP_FAILED,i,c,{failedTarget:'support'});continue}
      if(c.close<zone.low-breakMargin){out.effectiveRole='transition';out.transitionTarget='resistance';out.breakIndex=i;phase='flip-resistance';event(out,STATUS.BREAKDOWN_CONFIRMED,i,c,{boundary:zone.low});continue}
    }else if(phase==='flip-support'){
      if(i<=out.breakIndex)continue;
      if(c.close<zone.low-retestTol){out.effectiveRole='resistance';out.transitionTarget=null;phase='hold';event(out,STATUS.FLIP_FAILED,i,c,{failedTarget:'support'});continue}
      if(c.low<=zone.high+retestTol){
        out.retestIndex=i;
        if(c.close>=zone.high+breakMargin){out.effectiveRole='support';out.transitionTarget=null;phase='hold';event(out,STATUS.SUPPORT_FLIP_CONFIRMED,i,c);continue}
        event(out,STATUS.SUPPORT_FLIP_PENDING,i,c);
      }
    }else if(phase==='flip-resistance'){
      if(i<=out.breakIndex)continue;
      if(c.close>zone.high+retestTol){out.effectiveRole='support';out.transitionTarget=null;phase='hold';event(out,STATUS.FLIP_FAILED,i,c,{failedTarget:'resistance'});continue}
      if(c.high>=zone.low-retestTol){
        out.retestIndex=i;
        if(c.close<=zone.low-breakMargin){out.effectiveRole='resistance';out.transitionTarget=null;phase='hold';event(out,STATUS.RESISTANCE_FLIP_CONFIRMED,i,c);continue}
        event(out,STATUS.RESISTANCE_FLIP_PENDING,i,c);
      }
    }
  }
  if(phase==='flip-support'&&!out.status.includes('PENDING')){out.effectiveRole='transition';out.transitionTarget='support'}
  if(phase==='flip-resistance'&&!out.status.includes('PENDING')){out.effectiveRole='transition';out.transitionTarget='resistance'}
  out.role=out.effectiveRole;
  return out;
}
function mergeRole(items,{atrNow,currentPrice}={}){
  if(!items.length)return[];
  const gapTol=Math.max(Number(atrNow||0)*.15,Math.abs(Number(currentPrice)||1)*.0006),sorted=[...items].sort((a,b)=>a.low-b.low),groups=[];
  for(const z of sorted){
    const g=groups.at(-1);
    if(!g||z.low>g.high+gapTol){groups.push({low:z.low,high:z.high,items:[z]});continue}
    g.low=Math.min(g.low,z.low);g.high=Math.max(g.high,z.high);g.items.push(z);
  }
  return groups;
}
function mergeGroup(items,{atrNow,currentPrice}={}){
  const roles=['support','resistance','transition'],groups=roles.flatMap(role=>mergeRole((items||[]).filter(x=>(x.effectiveRole||x.role||x.type)===role),{atrNow,currentPrice}).map(g=>({role,...g})));
  return groups.map((g,idx)=>{
    const touches=g.items.reduce((s,x)=>s+Number(x.touches||0),0),statuses=[...new Set(g.items.map(x=>x.status))],timeframes=[...new Set(g.items.flatMap(x=>x.timeframes||[x.timeframe]).filter(Boolean))],role=g.role;
    const mid=g.items.reduce((sum,x)=>sum+Number(x.mid||((x.low+x.high)/2))*Math.max(1,Number(x.touches||1)),0)/Math.max(1,g.items.reduce((sum,x)=>sum+Math.max(1,Number(x.touches||1)),0));
    const best=[...g.items].sort((a,b)=>(Number(b.htfRank||0)-Number(a.htfRank||0))||(Number(b.touches||0)-Number(a.touches||0))||(Number(b.knownAt||0)-Number(a.knownAt||0)))[0];
    return{...best,id:'DISPLAY-'+(timeframes.join('+')||best.timeframe)+'-'+role+'-'+idx,kind:'display-zone',low:g.low,high:g.high,mid,role,effectiveRole:role,originRole:best.originRole,status:statuses.length===1?statuses[0]:'MERGED',statusLabel:statuses.length===1?(best.statusLabel||LABELS[best.status]):'겹치는 유효 구간 병합',touches,sourceIds:g.items.flatMap(x=>x.sourceIds||[x.id]),sourceZoneIds:g.items.map(x=>x.id),timeframes,timeframe:timeframes.length===1?timeframes[0]:timeframes.join('+'),merged:g.items.length>1,components:g.items.map(x=>({id:x.id,timeframe:x.timeframe,low:x.low,high:x.high,status:x.status,role:x.effectiveRole,htfRank:x.htfRank||0}))};
  });
}
function limits(tf){return tf==='5m'?1:tf==='15m'?2:tf==='1h'?2:tf==='4h'?2:3}
function select(levels,{atrNow,currentPrice,timeframe,maxEachSide}={}){
  const p=Number(currentPrice),a=Number(atrNow)||0,limit=maxEachSide??limits(String(timeframe||'').toLowerCase());
  const merged=mergeGroup(levels,{atrNow,currentPrice});
  const support=merged.filter(x=>x.effectiveRole==='support'&&x.low<=p+a*.25).sort((x,y)=>Math.abs(x.mid-p)-Math.abs(y.mid-p)).slice(0,limit);
  const resistance=merged.filter(x=>x.effectiveRole==='resistance'&&x.high>=p-a*.25).sort((x,y)=>Math.abs(x.mid-p)-Math.abs(y.mid-p)).slice(0,limit);
  const transition=merged.filter(x=>x.effectiveRole==='transition').sort((x,y)=>Math.abs(x.mid-p)-Math.abs(y.mid-p)).slice(0,1);
  return[...support,...resistance,...transition];
}
function evaluate(levels,candles,opts={}){return(levels||[]).map(z=>evolve(z,candles,opts))}
function nearest(levels,role,currentPrice){const p=Number(currentPrice);return(levels||[]).filter(x=>x.effectiveRole===role).sort((a,b)=>Math.abs(a.mid-p)-Math.abs(b.mid-p))[0]||null}
function sourceLabel(z){if(!z)return'';const t=z.timeframes?.length?z.timeframes.join('+'):z.timeframe;return String(t||'').toUpperCase()}
return{STATUS,LABELS,evolve,evaluate,mergeGroup,select,nearest,sourceLabel};
});