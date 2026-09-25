'use strict';

const VERSION='FAKEOUT_STATE_v1';

function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function rows(raw=[]){
  const now=Date.now();
  return(Array.isArray(raw)?raw:[]).filter(Array.isArray).filter(r=>n(r[2])!=null&&n(r[3])!=null&&n(r[4])!=null&&(n(r[6])==null||n(r[6])<now)).map((r,i)=>({
    index:i,time:n(r[0])??i,open:n(r[1])??n(r[4]),high:n(r[2]),low:n(r[3]),close:n(r[4]),volume:n(r[5])??0,closeTime:n(r[6])??n(r[0])??i
  }));
}
function atr(c,p=14){const tr=c.map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-(i?c[i-1].close:x.close)),Math.abs(x.low-(i?c[i-1].close:x.close)))),o=Array(c.length).fill(null);let s=0;for(let i=0;i<tr.length;i++){s+=tr[i];if(i>=p)s-=tr[i-p];if(i>=p-1)o[i]=s/p}return o}
function analyzeLevel(c,tf,level,{closeBufferFraction=.001,minBarsBeforeFakeout=1,recoveryBufferFraction=.001}={}){
  if(c.length<8||!(level>0))return null;
  const A=atr(c),av=A.at(-1)||level*.01,breakBuffer=Math.max(level*closeBufferFraction,av*.12),recoveryBuffer=Math.max(level*recoveryBufferFraction,av*.12),window=c.slice(-16);
  let breakoutIndex=-1;
  for(let i=1;i<window.length;i++){
    if(window[i-1].close<=level+breakBuffer&&window[i].close>level+breakBuffer){breakoutIndex=i;break}
  }
  if(breakoutIndex<0)return null;
  let fakeoutIndex=-1;
  for(let i=breakoutIndex+Math.max(1,minBarsBeforeFakeout);i<window.length;i++){
    if(window[i].close<level-level*closeBufferFraction){fakeoutIndex=i;break}
  }
  if(fakeoutIndex<0){
    const last=window.at(-1),distanceAtr=(last.close-level)/Math.max(av,1e-9);
    return{version:VERSION,tf,level,stage:'BREAKOUT_ACTIVE',longBlocked:false,severity:'info',label:'돌파 유지 · 가짜 돌파 미확정',breakoutIndex,fakeoutIndex:null,recoveryIndex:null,distanceAtr};
  }
  let recoveryIndex=-1;
  for(let i=fakeoutIndex+1;i<window.length;i++){
    if(window[i].close>level+recoveryBuffer){recoveryIndex=i;break}
  }
  const last=window.at(-1),fakeBar=window[fakeoutIndex];
  if(recoveryIndex>=0){
    const post=window.slice(recoveryIndex),held=post.every(x=>x.close>=level-level*.0005);
    if(held){
      return{version:VERSION,tf,level,stage:'RECOVERED',longBlocked:false,severity:'positive',label:'가짜 돌파 후 돌파선 재회복 · 롱 회피 해제 후보',breakoutIndex,fakeoutIndex,recoveryIndex,fakeoutClose:fakeBar.close,lastClose:last.close};
    }
  }
  const resistanceTouch=window.slice(fakeoutIndex+1).some(x=>x.high>=level-av*.18&&x.close<level);
  const stage=resistanceTouch?'RESISTANCE_FLIP':'FAKEOUT_CONFIRMED';
  const label=stage==='RESISTANCE_FLIP'?'가짜 돌파 확정 · 기존 지지가 저항으로 전환 중 · 신규 롱 회피':'가짜 돌파 확정 · 돌파선 아래 종가 복귀 · 신규 롱 회피';
  return{version:VERSION,tf,level,stage,longBlocked:true,severity:'danger',label,breakoutIndex,fakeoutIndex,recoveryIndex:null,fakeoutClose:fakeBar.close,fakeoutHigh:fakeBar.high,lastClose:last.close,resistanceTouch};
}
function analyze({frames={},breakoutStates=[],closeBufferFraction=.001,minBarsBeforeFakeout=1,recoveryBufferFraction=.001}={}){
  const out=[];
  for(const b of Array.isArray(breakoutStates)?breakoutStates:[]){
    const tf=String(b?.tf||'').toLowerCase(),level=n(b?.level);if(!tf||!(level>0))continue;
    const c=rows(frames[tf]);if(!c.length)continue;
    const x=analyzeLevel(c,tf,level,{closeBufferFraction,minBarsBeforeFakeout,recoveryBufferFraction});if(x)out.push({...x,source:b.source||b.kind||'breakout'});
  }
  const rank={RESISTANCE_FLIP:5,FAKEOUT_CONFIRMED:4,RECOVERED:3,BREAKOUT_ACTIVE:1};
  const primary=out.slice().sort((a,b)=>(rank[b.stage]||0)-(rank[a.stage]||0)||({ '1d':3,'4h':2,'1h':1}[b.tf]||0)-({ '1d':3,'4h':2,'1h':1}[a.tf]||0))[0]||null;
  return{version:VERSION,primary,states:out.slice(0,8),longBlocked:Boolean(primary?.longBlocked),recovered:primary?.stage==='RECOVERED'};
}
module.exports={VERSION,rows,atr,analyzeLevel,analyze};
