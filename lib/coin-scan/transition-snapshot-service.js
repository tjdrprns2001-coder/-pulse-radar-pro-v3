'use strict';
const Smc=require('../../ui/chart/smc-engine.js');
const Liquidity=require('../../ui/chart/liquidity-engine.js');
const Ict=require('../../ui/ict-trainer/engine.js');
const Snapshot=require('../../ui/trader/snapshot-record.js');

const TF_ORDER=['1w','3d','1d','12h','4h','1h','15m','5m'];
const TRACKED_TYPES=new Set(['A-pre','A','A→A+B','A+B','B','C','NFB','NFB-SQ','NFB-SC','미완성','INCOMPLETE','PROGRESSED']);
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function cleanSymbol(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')}
function safePart(v){return String(v||'NA').replace(/[^A-Za-z0-9+→_-]/g,'-').slice(0,72)||'NA'}
function klineToCandle(row,index){
  if(!Array.isArray(row))return null;
  const open=finite(row[1]),high=finite(row[2]),low=finite(row[3]),close=finite(row[4]),volume=finite(row[5]),openTime=finite(row[0]),closeTime=finite(row[6]);
  if(open==null||high==null||low==null||close==null||openTime==null)return null;
  return{index,time:openTime,open,high,low,close,volume:volume??0,closeTime};
}
function confirmedCandles(rows,capturedAt){
  const ts=finite(capturedAt)??Date.now();
  return(Array.isArray(rows)?rows:[]).map(klineToCandle).filter(Boolean).filter(x=>x.closeTime==null||x.closeTime<=ts).map(({closeTime,...x})=>x);
}
function analyzeFrame(tf,rows){
  const candles=rows;
  if(candles.length<40)return{candles,smc:null,liquidity:null,ict:{version:Ict.VERSION,tf,available:false,reason:'확정봉 부족'}};
  const smc=Smc.analyzeSmcV2({candles,canonicalSwings:[],canonicalEvents:[],htf:{bias:null}});
  const liquidity=Liquidity.analyzeLiquidity({
    candles,timeframe:tf,pivots:smc.internalStructure||[],equalLevels:smc.equalLevels||[],sweeps:smc.sweeps||[],
    displacement:smc.displacements||[],mss:smc.mss||[],fvgs:smc.fvgs||[],orderBlocks:smc.orderBlocks||[]
  });
  const ict=Ict.analyzeTimeframe({candles,smc,liquidity,tf});
  return{candles,smc,liquidity,ict};
}
function eventIdFor({symbol,fromType,toType,detectedAt}={}){
  const iso=new Date(finite(detectedAt)??Date.now()).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  return[safePart(cleanSymbol(symbol)),safePart(fromType),safePart(toType),iso].join('_');
}
function buildBundle({item,frames,previous,detectedAt=Date.now()}={}){
  const symbol=cleanSymbol(item?.symbol),toType=String(item?.v2Type||item?.v2Flow?.type||'미완성'),fromType=String(previous?.type||'unknown');
  const toStage=String(item?.v2Csv?.stage_label||item?.v2Stage||item?.v2Flow?.stageLabel||'unknown'),fromStage=String(previous?.stageLabel||'unknown');
  const eventId=eventIdFor({symbol,fromType,toType,detectedAt}),records=[];
  for(const tf of TF_ORDER){
    const candles=confirmedCandles(frames?.[tf],detectedAt);
    if(!candles.length)continue;
    const analysis=analyzeFrame(tf,candles);
    records.push(Snapshot.buildRecord({
      symbol,tf,candles:analysis.candles,analysis:{trendlines:{}},smc:analysis.smc,liquidity:analysis.liquidity,ict:analysis.ict,
      params:{boardVersion:Snapshot.VERSION,source:'binance-usdt-perpetual',capturedBy:'scanner-transition',transitionDetectedAt:detectedAt,typeTransition:fromType+'→'+toType,stageTransition:fromStage+'→'+toStage}
    }));
  }
  return{
    schemaVersion:'TRANSITION_SNAPSHOT_ARCHIVE_v1',eventId,symbol,detectedAt,detectedAtIso:new Date(detectedAt).toISOString(),
    eventMeta:{fromType,toType,typeTransition:fromType+'→'+toType,fromStage,toStage,stageTransition:fromStage+'→'+toStage,paramSet:item?.paramSet||item?.v2Flow?.paramSet||null,direction:item?.direction||item?.v2Flow?.direction||'none',source:'scanner-transition'},
    snapshotIds:records.map(x=>x.snapshotId),records
  };
}
function createTransitionSnapshotService({store,now=()=>Date.now()}={}){
  if(!store||typeof store.getState!=='function'||typeof store.putState!=='function')throw new Error('transition snapshot store required');
  async function observe({items=[],framesBySymbol={}}={}){
    const result={observed:0,transitions:0,archived:0,duplicates:0,skipped:0,errors:[]};
    for(const item of Array.isArray(items)?items:[]){
      const symbol=cleanSymbol(item?.symbol),type=String(item?.v2Type||item?.v2Flow?.type||''),stageLabel=String(item?.v2Csv?.stage_label||item?.v2Stage||item?.v2Flow?.stageLabel||'');
      if(!symbol||!type){result.skipped++;continue}
      const detectedAt=finite(item?.updatedAt)??now(),stateKey='v2-transition:'+symbol;
      let prev=null;try{prev=await store.getState(stateKey)}catch(e){result.errors.push(symbol+':state-read:'+String(e?.message||e))}
      const typeChanged=Boolean(prev?.type&&prev.type!==type),stageChanged=Boolean(prev?.stageLabel&&prev.stageLabel!==stageLabel),isTransition=typeChanged;
      item.typeTransition=prev?.type?prev.type+'→'+type:'unknown';
      item.stageTransition=prev?.stageLabel?prev.stageLabel+'→'+stageLabel:'unknown';
      item.isTransitionEvent=isTransition;item.isStageTransitionEvent=stageChanged;
      item.transitionAt=isTransition?detectedAt:null;
      result.observed++;
      if(isTransition){
        result.transitions++;
        const frames=framesBySymbol?.[symbol];
        if(frames&&TF_ORDER.every(tf=>Array.isArray(frames[tf])&&frames[tf].length)){
          try{
            const bundle=buildBundle({item,frames,previous:prev,detectedAt});
            item.eventSnapshotId=bundle.eventId;
            if(typeof store.putTransitionSnapshot==='function'){
              const inserted=await store.putTransitionSnapshot(bundle.eventId,bundle);
              if(inserted)result.archived++;else result.duplicates++;
            }else result.errors.push(symbol+':transition snapshot store unavailable');
          }catch(e){result.errors.push(symbol+':archive:'+String(e?.message||e))}
        }else result.errors.push(symbol+':archive:8TF frames unavailable');
      }else result.skipped++;
      try{await store.putState(stateKey,{symbol,type,stageLabel,updatedAt:detectedAt,eventSnapshotId:item.eventSnapshotId||prev?.eventSnapshotId||null})}catch(e){result.errors.push(symbol+':state-write:'+String(e?.message||e))}
    }
    return result;
  }
  async function get(eventId){if(typeof store.getTransitionSnapshot!=='function')return null;return store.getTransitionSnapshot(String(eventId||''))}
  async function list({symbol=null,limit=100}={}){
    if(typeof store.listTransitionSnapshots!=='function')return[];
    const sym=symbol?cleanSymbol(symbol):null,rows=await store.listTransitionSnapshots();
    return rows.filter(x=>!sym||x.symbol===sym).sort((a,b)=>Number(b.detectedAt)-Number(a.detectedAt)).slice(0,Math.max(1,Math.min(500,Number(limit)||100)));
  }
  return{observe,get,list};
}
module.exports={TF_ORDER,TRACKED_TYPES,confirmedCandles,analyzeFrame,eventIdFor,buildBundle,createTransitionSnapshotService};
