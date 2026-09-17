'use strict';
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {createScanService}=require('../lib/coin-scan/scan-service.js');
let singleton;
function service(){return singleton||(singleton=createScanService({provider:createBinanceProvider({})}))}
module.exports=async function handler(req,res,deps={}){
  const svc=deps.service||service();try{const q=req?.query||{};const out=await svc.run({mode:q.mode||'summary',category:q.category||null,sector:q.sector||null,limit:q.limit||100});res?.setHeader?.('Cache-Control','s-maxage=15, stale-while-revalidate=45');if(res?.status)res.status(200);return res?.json?res.json(out):out}catch(e){const code=e.statusCode||502;const payload={status:'error',error:String(e&&e.message||e)};if(res?.status)res.status(code);return res?.json?res.json(payload):payload}
};
