'use strict';
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {createAstraAutoScanner,CONFIG,VERSION}=require('../lib/coin-scan/astra-auto-scanner.js');
let singleton=null;
function defaultScanner(){if(!singleton)singleton=createAstraAutoScanner({provider:createBinanceProvider({})});return singleton}
function symbolsOf(q={}){return String(q.symbols||'').split(',').map(x=>x.trim()).filter(Boolean)}
module.exports=async function handler(req,res,ctx={}){
  const q=req?.query||{},stage=String(q.stage||'universe').toLowerCase(),scanner=ctx.scanner||defaultScanner();
  res.setHeader('Cache-Control','no-store, max-age=0');
  try{
    if(stage==='universe')return res.status(200).json(await scanner.universe());
    if(stage==='oi'){
      const symbols=symbolsOf(q);if(!symbols.length)return res.status(400).json({status:'error',version:VERSION,error:'symbols required'});
      return res.status(200).json(await scanner.oi(symbols));
    }
    if(stage==='deep'){
      const symbols=symbolsOf(q);if(!symbols.length)return res.status(400).json({status:'error',version:VERSION,error:'symbols required'});
      return res.status(200).json(await scanner.deep(symbols));
    }
    return res.status(400).json({status:'error',version:VERSION,error:'unknown stage',allowed:['universe','oi','deep'],config:CONFIG});
  }catch(e){return res.status(Number(e?.statusCode)||502).json({status:'error',version:VERSION,stage,updatedAt:Date.now(),error:String(e?.message||e)});}
};
