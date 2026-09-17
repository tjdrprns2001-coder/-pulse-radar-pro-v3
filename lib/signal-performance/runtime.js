'use strict';
const {createBlobStore}=require('./store.js');
const {createBinanceResolver}=require('./binance-resolver.js');
const {createSignalPerformanceService}=require('./service.js');
const {createAlertService}=require('./alerts.js');
const {createBackfillService}=require('./backfill.js');
const {classifyHistorical}=require('./backfill-classifier.js');
const {createBinanceProvider}=require('../coin-scan/binance-provider.js');
function createSignalRuntime({getStore,now=()=>Date.now(),fetchImpl=globalThis.fetch}={}){
  if(typeof getStore!=='function')throw new Error('Netlify Blobs getStore adapter required');
  const store=createBlobStore({getStore});
  const provider=createBinanceProvider({fetchImpl,now});
  const resolver=createBinanceResolver({fetchImpl,now});
  const performance=createSignalPerformanceService({store,resolver,now});
  const alerts=createAlertService({store,now});
  const backfill=createBackfillService({provider,store,classifyAt:classifyHistorical,now,maxStepsPerRun:8});
  return{store,provider,resolver,performance,alerts,backfill,now};
}
module.exports={createSignalRuntime};
