'use strict';
const crypto=require('crypto');
const Machine=require('./setup-state-machine.js');

function cleanSymbol(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')}
function hash(v){return crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex')}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function stateKey(symbol,setupType){return 'setup-state:'+cleanSymbol(symbol)+':'+String(setupType)}
function eventId({symbol,setupType,fromState,toState,candleCloseTime}={}){
  return 'setup:'+hash([cleanSymbol(symbol),setupType,fromState,toState,candleCloseTime].join('|')).slice(0,32);
}
function createSetupStateTracker({store,now=()=>Date.now()}={}){
  const memory=new Map(),evidenceMemory=[];
  async function readState(symbol,setupType){
    const k=stateKey(symbol,setupType);
    if(store&&typeof store.getState==='function'){const v=await store.getState(k);if(v)return v}
    return clone(memory.get(k)||null);
  }
  async function writeState(symbol,setupType,value){
    const k=stateKey(symbol,setupType);memory.set(k,clone(value));
    if(store&&typeof store.putState==='function')await store.putState(k,value);
  }
  async function appendEvidence(row){
    evidenceMemory.push(clone(row));if(evidenceMemory.length>5000)evidenceMemory.shift();
    if(store&&typeof store.putEvidence==='function')await store.putEvidence(row.eventId,row);
  }
  async function observeOne(item){
    const symbol=cleanSymbol(item?.symbol),f=item?.setupFeatures;
    if(!symbol||!f)return{symbol,skipped:true};
    const ctx={candleCloseTime:f.candleCloseTime,observedAt:f.observedAt??now(),availableAt:f.availableAt??now(),decisionTime:f.decisionTime??now()};
    const out={symbol,transitions:[]};
    for(const [key,setupType] of [['bottom',Machine.SETUP_TYPE.BOTTOM],['breakout',Machine.SETUP_TYPE.BREAKOUT]]){
      const features=f[key];if(!features)continue;
      const prev=await readState(symbol,setupType)||Machine.initial(setupType);
      const next=Machine.update(prev,features,ctx);
      const changed=next.state!==prev.state;
      if(changed){
        const row={
          kind:'setup-transition',schemaVersion:'setup-transition-r0.1',
          eventId:eventId({symbol,setupType,fromState:prev.state,toState:next.state,candleCloseTime:ctx.candleCloseTime}),
          symbol,setupType,fromState:prev.state,toState:next.state,
          candleCloseTime:ctx.candleCloseTime,observedAt:ctx.observedAt,availableAt:ctx.availableAt,decisionTime:ctx.decisionTime,
          transitionCount:next.transitionCount,failureReason:next.failureReason,expiryReason:next.expiryReason,
          entryReady:Machine.isEntryReady(next.state),watch:Machine.isWatch(next.state),
          features:clone(features)
        };
        await appendEvidence(row);out.transitions.push(row);
      }
      await writeState(symbol,setupType,next);
      if(key==='bottom'){item.bottomSetupState=next.state;item.bottomSetup=next}
      else{item.breakoutSetupState=next.state;item.breakoutSetup=next}
    }
    item.setupEntryReady=Boolean(Machine.isEntryReady(item.bottomSetupState)||Machine.isEntryReady(item.breakoutSetupState));
    item.setupTransitions=out.transitions.map(x=>({eventId:x.eventId,setupType:x.setupType,fromState:x.fromState,toState:x.toState,decisionTime:x.decisionTime}));
    return out;
  }
  async function observe(items=[]){
    const result={observed:0,transitions:0,errors:[]};
    for(const item of Array.isArray(items)?items:[]){
      try{const r=await observeOne(item);if(!r.skipped){result.observed++;result.transitions+=r.transitions.length}}
      catch(e){result.errors.push(String(item?.symbol||'?')+':'+String(e?.message||e))}
    }
    return result;
  }
  async function listEvidence({symbol=null,setupType=null,limit=100}={}){
    let rows;
    if(store&&typeof store.listEvidence==='function')rows=await store.listEvidence();else rows=evidenceMemory.slice();
    const sym=symbol?cleanSymbol(symbol):null,type=setupType?String(setupType):null;
    return rows.filter(x=>x?.kind==='setup-transition'&&(!sym||x.symbol===sym)&&(!type||x.setupType===type))
      .sort((a,b)=>Number(b.decisionTime||0)-Number(a.decisionTime||0)).slice(0,Math.max(1,Math.min(500,Number(limit)||100)));
  }
  async function getStates(symbol){
    const sym=cleanSymbol(symbol);if(!sym)return null;
    return{
      symbol:sym,
      bottom:await readState(sym,Machine.SETUP_TYPE.BOTTOM)||Machine.initial(Machine.SETUP_TYPE.BOTTOM),
      breakout:await readState(sym,Machine.SETUP_TYPE.BREAKOUT)||Machine.initial(Machine.SETUP_TYPE.BREAKOUT)
    };
  }
  return{observe,observeOne,listEvidence,getStates};
}
module.exports={stateKey,eventId,createSetupStateTracker};
