'use strict';
const {createBinanceProvider}=require('../../coin-scan/binance-provider.js');
const {createBlobBowl224Store}=require('./store.js');
const {createBowl224Runner}=require('./runner.js');
const {buildBowlStats}=require('./stats.js');
const {HYPOTHESIS_AGGREGATE}=require('./hypothesis-evidence.js');
function spotUsdtSymbols(exchangeInfo={}){
 const rows=Array.isArray(exchangeInfo?.symbols)?exchangeInfo.symbols:[];
 return rows.filter(x=>String(x?.quoteAsset||'').toUpperCase()==='USDT'&&String(x?.status||'').toUpperCase()==='TRADING'&&x?.isSpotTradingAllowed!==false).map(x=>String(x.symbol||'').toUpperCase()).filter(Boolean);
}
function createBowl224Runtime({getStore,fetchImpl=globalThis.fetch,now=()=>Date.now()}={}){
 if(typeof getStore!=='function')throw new Error('getStore required');
 const store=createBlobBowl224Store({getStore}),provider=createBinanceProvider({fetchImpl,now}),runner=createBowl224Runner({provider,store,now});
 return{
  async status(){const runs=await store.listRuns();return{initialized:runs.length>0,runs:runs.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0,20)}},
  async stats(){const [events,annotations,outcomes]=await Promise.all([store.listEvents(),store.listAnnotations(),store.listOutcomes()]);return buildBowlStats({events,annotations,outcomes,hypothesisEvidence:[HYPOTHESIS_AGGREGATE]})},
  async events({limit=50,cohort=null,group=null}={}){let rows=await store.listEvents();if(cohort)rows=rows.filter(x=>x.cohort===cohort);if(group)rows=rows.filter(x=>x.group===group);return rows.sort((a,b)=>b.signalCloseTs-a.signalCloseTs).slice(0,Math.max(1,Math.min(200,Number(limit)||50)))},
  async run(body){return runner.runBatch(body)},
  async evaluate(body){return runner.evaluateBatch(body)}
 };
}
module.exports={spotUsdtSymbols,createBowl224Runtime};