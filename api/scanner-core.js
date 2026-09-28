'use strict';
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {createScanService}=require('../lib/coin-scan/scan-service.js');
let service=null;
function scanner(){if(!service)service=createScanService({provider:createBinanceProvider({})});return service}
module.exports=async function handler(req,res){
 const q=req?.query||{},stage=String(q.stage||'fast').toLowerCase(),limit=Math.max(1,Math.min(40,Number(q.limit)||20));
 res.setHeader('Cache-Control','no-store, max-age=0');
 try{
  const s=scanner();
  if(stage==='fast'){
   const out=await s.run({mode:'prescan',limit,persistObservations:false});
   return res.status(200).json({...out,standalone:true,validationMode:'off',items:(out.items||[]).slice(0,limit)});
  }
  const pre=await s.run({mode:'prescan',limit:40,persistObservations:false});
  const symbols=(pre.candidateSymbols||[]).slice(0,Math.min(30,limit)).filter(Boolean);
  const validation=['off','light','full'].includes(String(q.validation||'light'))?String(q.validation||'light'):'light';
  const out=await s.run({mode:'deep',symbols,limit:symbols.length||limit,precision:false,validation,persistObservations:false});
  return res.status(200).json({...out,standalone:true,validationMode:validation,prescanMeta:pre.prescan||null});
 }catch(e){return res.status(503).json({status:'error',error:String(e?.message||e),standalone:true})}
};