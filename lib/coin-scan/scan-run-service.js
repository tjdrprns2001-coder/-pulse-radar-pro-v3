'use strict';

const VERSION='SCAN_RUN_v2';
const DEEP_CHUNK=8;
const DEEP_WORKERS=2;
const FULL_VALIDATION_CHUNKS=2;
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function idNow(now=Date.now()){return 'scan-'+Number(now).toString(36)+'-'+Math.random().toString(36).slice(2,8)}
function slimMeta(x={}){
  return{updatedAt:x.updatedAt,scanCount:x.scanCount,deepScanCount:x.deepScanCount,dataHealth:x.dataHealth,marketBreadth:x.marketBreadth,marketCoverage:x.marketCoverage,marketSource:x.marketSource,derivativesSource:x.derivativesSource,sourceWarning:x.sourceWarning,partial:x.partial,staleFallback:x.staleFallback,universeMeta:x.universeMeta,prescan:x.prescan||null};
}
function mergeItems(base=[],next=[]){
  const m=new Map((base||[]).filter(x=>x?.symbol).map(x=>[x.symbol,x]));
  for(const x of next||[])if(x?.symbol){const prev=m.get(x.symbol)||{};m.set(x.symbol,{...prev,...x,preScan:x.preScan??prev.preScan??null})}
  return [...m.values()];
}
function mergeScreening(current={},next={}){
  const buckets=['candidates','watchlist','eventRisk','conflicted','riskFiltered','insufficientData','rejected'];
  const allMap=new Map((current.all||[]).filter(x=>x?.symbol).map(x=>[x.symbol,x]));
  for(const x of next.all||[])if(x?.symbol)allMap.set(x.symbol,x);
  const all=[...allMap.values()];
  const out={all};
  for(const b of buckets){const m=new Map((current[b]||[]).filter(x=>x?.symbol).map(x=>[x.symbol,x]));for(const x of next[b]||[])if(x?.symbol)m.set(x.symbol,x);out[b]=[...m.values()]}
  return out;
}
function createScanRunService({scanService,store,now=()=>Date.now()}={}){
  if(!scanService||typeof scanService.run!=='function')throw new Error('scanService required');
  if(!store||typeof store.putState!=='function'||typeof store.getState!=='function')throw new Error('state store required');
  const key=id=>'scan-run:'+String(id);
  async function save(run){run.updatedAt=now();await store.putState(key(run.id),clone(run));return clone(run)}
  async function get(id){const x=await store.getState(key(id));return x?clone(x):null}
  async function start({precision=false}={}){
    const id=idNow(now()),run={version:VERSION,id,status:'QUEUED',stage:'queued',createdAt:now(),updatedAt:now(),precision:Boolean(precision),deepDone:0,deepTotal:0,candidateSymbols:[],items:[],autoScreening:{all:[]},meta:null,error:null};
    return save(run);
  }
  async function execute(id){
    let run=await get(id);if(!run)throw Object.assign(new Error('scan run not found'),{statusCode:404});
    if(run.status==='DONE')return run;
    if(run.status==='RUNNING'&&now()-(Number(run.updatedAt)||0)<30000)return run;
    run.status='RUNNING';run.stage='summary';run.error=null;await save(run);
    try{
      const summary=await scanService.run({mode:'summary',limit:500,precision:run.precision,persistObservations:false});
      run.items=summary.items||[];run.meta=slimMeta(summary);run.candidateSymbols=(summary.candidateSymbols||[]).slice(0,40);run.stage='prescan';await save(run);

      let candidates=run.candidateSymbols.slice();
      try{
        const prescan=await scanService.run({mode:'prescan',limit:120,precision:run.precision,persistObservations:false});
        if(Array.isArray(prescan.candidateSymbols)&&prescan.candidateSymbols.length)candidates=prescan.candidateSymbols.slice(0,40);
        const pre=new Map((prescan.items||[]).filter(x=>x?.symbol).map(x=>[x.symbol,x.preScan]));
        run.items=run.items.map(x=>pre.has(x.symbol)?{...x,preScan:pre.get(x.symbol)}:x);
        run.meta={...(run.meta||{}),prescan:prescan.prescan||null};
      }catch(e){run.prescanError=String(e?.message||e)}
      run.candidateSymbols=candidates;run.deepTotal=candidates.length;run.deepDone=0;run.stage='deep';await save(run);

      const chunks=[];for(let i=0;i<candidates.length;i+=DEEP_CHUNK)chunks.push({index:chunks.length,symbols:candidates.slice(i,i+DEEP_CHUNK)});
      let next=0,completed=0,commit=Promise.resolve();
      async function applyChunk(entry,deep){
        commit=commit.then(async()=>{
          run.items=mergeItems(run.items,deep.items||[]);
          run.autoScreening=mergeScreening(run.autoScreening,deep.autoScreening||{});
          completed+=entry.symbols.length;run.deepDone=Math.min(run.deepTotal,completed);
          run.meta={...(run.meta||{}),...slimMeta(deep),prescan:run.meta?.prescan||null};
          run.partial=Boolean(run.partial||deep.partial);
          if(deep.auxiliary?.status==='degraded')run.auxiliary=deep.auxiliary;
          await save(run);
        });
        return commit;
      }
      async function worker(){
        while(true){
          const entry=chunks[next++];if(!entry)return;
          const validation=entry.index<FULL_VALIDATION_CHUNKS?(run.precision?'full':'light'):'off';
          const deep=await scanService.run({mode:'deep',limit:entry.symbols.length,symbols:entry.symbols,precision:run.precision,validation,persistObservations:false});
          await applyChunk(entry,deep);
        }
      }
      await Promise.all(Array.from({length:Math.min(DEEP_WORKERS,chunks.length||1)},worker));
      await commit;
      run.status='DONE';run.stage='complete';run.completedAt=now();return save(run);
    }catch(e){
      run.status='FAILED';run.stage='failed';run.error=String(e?.message||e);run.failedAt=now();await save(run);throw e;
    }
  }
  return{VERSION,DEEP_CHUNK,DEEP_WORKERS,FULL_VALIDATION_CHUNKS,start,get,execute};
}
module.exports={VERSION,DEEP_CHUNK,DEEP_WORKERS,FULL_VALIDATION_CHUNKS,mergeItems,mergeScreening,createScanRunService};
