'use strict';
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {createAstraAutoScanner,CONFIG,MANUS_CONFIG,PERPLEXITY_CONFIG,GROK_CONFIG,GEMINI_CONFIG,CLAUDE_CONFIG,METHODS,VERSION,methodOf}=require('../lib/coin-scan/astra-auto-scanner.js');
const ChartBroOos=require('../lib/coin-scan/chartbro-oos-service.js');
let singleton=null;
function defaultScanner(){if(!singleton)singleton=createAstraAutoScanner({provider:createBinanceProvider({disableFuturesFallback:false,concurrency:2,intervalConcurrency:1,futuresMinIntervalMs:Number(process.env.ASTRA_FUTURES_MIN_INTERVAL_MS||275)})});return singleton}
function symbolsOf(q={}){return String(q.symbols||'').split(',').map(x=>x.trim()).filter(Boolean)}
function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,Number(v)||0))}
async function canonicalChartbroStats(){
  const base=String(process.env.CHARTBRO_RESEARCH_URL||'https://pulseradar-chartbro-oos-runtime.onrender.com/api/chartbro-research').replace(/\/$/,'');
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),6000);
  try{const r=await fetch(base+'?view=stats',{headers:{accept:'application/json'},signal:ctrl.signal});if(!r.ok)return null;const x=await r.json();return x?.status==='ok'?x:null}catch{return null}finally{clearTimeout(timer)}
}
function applyCanonicalChartbro(result,stats){
  if(!stats?.productionGate)return result;
  for(const item of result.items||[]){
    const v=item.verdict||{},prev=Number(v.chartbroAdjustment)||0,next=ChartBroOos.rankingAdjustmentForRow(item,stats),score=Number(v.score)||0;
    v.chartbroBaseScore=Number.isFinite(Number(v.chartbroBaseScore))?Number(v.chartbroBaseScore):score-prev;
    v.chartbroAdjustment=next;v.score=Math.round(clamp(score-prev+next));
    const local=item.chartbroResearch||v.chartbroResearch||{};
    item.chartbroResearch={...local,canonical:true,canonicalUpdatedAt:stats.updatedAt||null,productionGate:stats.productionGate,rankingAdjustment:next};
    v.chartbroResearch=item.chartbroResearch;item.verdict=v;
  }
  result.chartbroResearch={...stats,canonical:true,source:'chartbro-oos-runtime'};
  return result;
}

function marketOf(q={}){
  return{
    regime:String(q.regime||'NEUTRAL').toUpperCase(),
    breadthRatio:n(q.breadth),
    btc24hChange:n(q.btc),
    eth24hChange:n(q.eth),
    median24hChange:n(q.median),
    positiveVolumeRatio:n(q.positiveVolumeRatio),
    volumeWeightedBreadth:n(q.volumeWeightedBreadth),
    oiScanDegraded:String(q.oiDegraded||'').toLowerCase()==='true',
    grokOiCut:n(q.grokOiCut)
  };
}
module.exports=async function handler(req,res,ctx={}){
  const q=req?.query||{},stage=String(q.stage||'universe').toLowerCase(),method=methodOf(q.method),scanner=ctx.scanner||defaultScanner();
  res.setHeader('Cache-Control','no-store, max-age=0');
  try{
    if(stage==='universe')return res.status(200).json(await scanner.universe({method,minQuoteVolume:n(q.minQuoteVolume)}));
    if(stage==='oi'){
      const symbols=symbolsOf(q);if(!symbols.length)return res.status(400).json({status:'error',version:VERSION,method,error:'symbols required'});
      return res.status(200).json(await scanner.oi(symbols,{method,asOf:n(q.asOf),market:marketOf(q)}));
    }
    if(stage==='deep'){
      const symbols=symbolsOf(q);if(!symbols.length)return res.status(400).json({status:'error',version:VERSION,method,error:'symbols required'});
      const result=await scanner.deep(symbols,{method,market:marketOf(q),asOf:n(q.asOf)});
      try{
        const adapter=require('../lib/learning/scanner-adapter.js');
        const learned=await adapter.ingestScannerItems(result.items||[],{source:'astra-'+method,marketState:result.marketState||marketOf(q),asOf:result.asOf});
        result.items=learned.items;result.learning=learned.learning;
      }catch(_learningError){result.learning={shadowOnly:true,status:'degraded',error:String(_learningError?.message||_learningError),source:'astra-'+method}}
      if(method===METHODS.ASTRA){try{const canonical=await canonicalChartbroStats();if(canonical)applyCanonicalChartbro(result,canonical)}catch(_chartbroCanonicalError){}}
      return res.status(200).json(result);
    }
    return res.status(400).json({status:'error',version:VERSION,method,error:'unknown stage',allowed:['universe','oi','deep'],methods:Object.values(METHODS),config:{astra:CONFIG,manus:{...CONFIG,...MANUS_CONFIG},perplexity:{...CONFIG,...PERPLEXITY_CONFIG},grok:{...CONFIG,...GROK_CONFIG},gemini:{...CONFIG,...GEMINI_CONFIG},claude:{...CONFIG,...CLAUDE_CONFIG}}});
  }catch(e){const sourceState=scanner.getSourceState?.()||null,retryAt=Number(e?.retryAt||sourceState?.futuresBlockedUntil)||null,paused=retryAt>Date.now();if(paused)res.setHeader('Retry-After',String(Math.ceil((retryAt-Date.now())/1000)));return res.status(paused?503:Number(e?.statusCode)||502).json({status:'error',version:VERSION,method,stage,updatedAt:Date.now(),error:String(e?.message||e),retryAt,upstreamStatus:e?.upstreamStatus||null,sourceState});}
};
