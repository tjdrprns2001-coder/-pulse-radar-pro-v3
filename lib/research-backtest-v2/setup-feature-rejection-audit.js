'use strict';

const VERSION='SETUP_FEATURE_REJECTION_AUDIT_r0.1';

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function inc(o,k,n=1){o[k]=(o[k]||0)+n}
function inWindow(ts,w={}){const t=finite(ts),s=finite(w.startTs),e=finite(w.endTs);return t!=null&&(s==null||t>=s)&&(e==null||t<=e)}
function samplePush(map,key,row,limit=8){if(!map[key])map[key]=[];if(map[key].length<limit)map[key].push(row)}
function bottomReason(s={}){
  const f=s.setupFeatures?.bottom||{},state=String(s.bottomState||'NO_SETUP');
  if(state==='BOTTOM_CONFIRMED')return null;
  if(state==='BOTTOM_TRIGGER'){
    if(f.executionCoverage==='UNAVAILABLE'||f.executionPass!==true)return'execution_data_or_gate';
    if(f.netRPass!==true)return'net_r';
    if(f.zoneRetestValid!==true)return'retest';
    if(f.higherLowConfirmed!==true)return'higher_low';
    return'confirmation_other';
  }
  if(state==='WATCH_BOTTOM'){
    if(f.sweepReclaimed!==true)return'sweep';
    if(f.mssConfirmed!==true)return'mss';
    if(f.zoneCreated!==true)return'fvg';
    return'trigger_wiring';
  }
  if((finite(f.shockScore)??0)<50&&f.htfDiscountLiquidationCluster!==true)return'shock';
  return'watch_wiring';
}
function breakoutReason(s={}){
  const f=s.setupFeatures?.breakout||{},state=String(s.breakoutState||'NO_SETUP');
  if(state==='BREAKOUT_CONFIRMED')return null;
  if(state==='PREBREAKOUT_TRIGGER'){
    if(f.executionCoverage==='UNAVAILABLE'||f.executionPass!==true)return'execution_data_or_gate';
    if(f.netRPass!==true)return'net_r';
    if(f.retestHolds!==true)return'retest';
    return'confirmation_other';
  }
  if(state==='WATCH_BREAKOUT'){
    if(f.closeAboveResistance!==true)return'breakout_close';
    if(f.futuresVolumeConfirmed!==true)return'breakout_volume';
    if(f.spotVolumeConfirmed!==true)return'execution_data_or_gate';
    if(f.breakoutBodyConfirmed!==true)return'breakout_body';
    return'trigger_wiring';
  }
  if(f.resistanceDefined!==true)return'compression';
  if((finite(f.compressionScore)??0)<60)return'compression';
  if(f.crowdingReject===true)return'crowding';
  return'watch_wiring';
}
function diagnose(summary={}){
  const c=summary.counts||{},n=summary.decisionCount||0;
  const issues=[];
  if((c.execution_data_or_gate||0)>0)issues.push({kind:'wiring_or_data',reason:'execution_data_or_gate',count:c.execution_data_or_gate});
  if((c.trigger_wiring||0)+(c.watch_wiring||0)>0)issues.push({kind:'wiring',reason:'state_transition_wiring',count:(c.trigger_wiring||0)+(c.watch_wiring||0)});
  for(const reason of ['shock','compression','sweep','mss','fvg','breakout_close','breakout_volume','breakout_body','retest','higher_low','net_r']){
    const count=c[reason]||0;if(!count)continue;
    issues.push({kind:count/Math.max(1,n)>=0.2?'threshold_or_market_frequency':'sparse_feature',reason,count,rate:count/Math.max(1,n)});
  }
  return issues.sort((a,b)=>(b.count||0)-(a.count||0));
}
function auditSnapshots({symbol,snapshots=[],window={}}={}){
  const rows=(snapshots||[]).filter(x=>inWindow(x.cutoff,window));
  const counts={},examples={},nearMiss={shock:[],compression:[]};
  for(const s of rows){
    const br=bottomReason(s),pr=breakoutReason(s);
    if(br){inc(counts,br);samplePush(examples,br,{symbol,setupType:'BOTTOM_REVERSAL',cutoff:s.cutoff,state:s.bottomState,price:s.price})}
    if(pr){inc(counts,pr);samplePush(examples,pr,{symbol,setupType:'PREBREAKOUT',cutoff:s.cutoff,state:s.breakoutState,price:s.price})}
    const shock=finite(s.setupFeatures?.bottom?.shockScore);
    if(shock!=null&&shock<50&&shock>=25&&nearMiss.shock.length<20)nearMiss.shock.push({cutoff:s.cutoff,value:shock,threshold:50});
    const comp=finite(s.setupFeatures?.breakout?.compressionScore);
    if(comp!=null&&comp<60&&comp>=40&&nearMiss.compression.length<20)nearMiss.compression.push({cutoff:s.cutoff,value:comp,threshold:60});
  }
  const summary={symbol,window,decisionCount:rows.length,counts,examples,nearMiss};
  summary.diagnosis=diagnose(summary);
  return summary;
}
function mergeAudits(items=[]){
  const counts={},symbols={},diagnosisCounts={};
  let decisionCount=0;
  for(const a of items||[]){
    if(!a)continue;decisionCount+=a.decisionCount||0;symbols[a.symbol]=a;
    for(const [k,v] of Object.entries(a.counts||{}))inc(counts,k,v);
    for(const d of a.diagnosis||[])inc(diagnosisCounts,d.kind+':'+d.reason,d.count||0);
  }
  return{version:VERSION,decisionCount,counts,symbols,diagnosis:Object.entries(diagnosisCounts).map(([key,count])=>{const i=key.indexOf(':');return{kind:key.slice(0,i),reason:key.slice(i+1),count}}).sort((a,b)=>b.count-a.count)};
}
function auditReplay({symbol,snapshots=[],splits={}}={}){
  const out={version:VERSION,symbol,splits:{}};
  for(const name of ['development','walkForward','lockedOos'])out.splits[name]=auditSnapshots({symbol,snapshots,window:splits?.[name]||{}});
  return out;
}

module.exports={VERSION,bottomReason,breakoutReason,diagnose,auditSnapshots,mergeAudits,auditReplay};
