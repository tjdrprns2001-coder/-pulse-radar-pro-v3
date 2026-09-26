'use strict';
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {createAstraAutoScanner,CONFIG,MANUS_CONFIG,METHODS,VERSION,methodOf}=require('../lib/coin-scan/astra-auto-scanner.js');
let singleton=null;
function defaultScanner(){if(!singleton)singleton=createAstraAutoScanner({provider:createBinanceProvider({})});return singleton}
function symbolsOf(q={}){return String(q.symbols||'').split(',').map(x=>x.trim()).filter(Boolean)}
function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function marketOf(q={}){
  return{
    regime:String(q.regime||'NEUTRAL').toUpperCase(),
    breadthRatio:n(q.breadth),
    btc24hChange:n(q.btc),
    eth24hChange:n(q.eth),
    median24hChange:n(q.median),
    positiveVolumeRatio:n(q.positiveVolumeRatio)
  };
}
module.exports=async function handler(req,res,ctx={}){
  const q=req?.query||{},stage=String(q.stage||'universe').toLowerCase(),method=methodOf(q.method),scanner=ctx.scanner||defaultScanner();
  res.setHeader('Cache-Control','no-store, max-age=0');
  try{
    if(stage==='universe')return res.status(200).json(await scanner.universe({method}));
    if(stage==='oi'){
      const symbols=symbolsOf(q);if(!symbols.length)return res.status(400).json({status:'error',version:VERSION,method,error:'symbols required'});
      return res.status(200).json(await scanner.oi(symbols,{method}));
    }
    if(stage==='deep'){
      const symbols=symbolsOf(q);if(!symbols.length)return res.status(400).json({status:'error',version:VERSION,method,error:'symbols required'});
      return res.status(200).json(await scanner.deep(symbols,{method,market:marketOf(q),asOf:n(q.asOf)}));
    }
    return res.status(400).json({status:'error',version:VERSION,method,error:'unknown stage',allowed:['universe','oi','deep'],methods:Object.values(METHODS),config:{astra:CONFIG,manus:{...CONFIG,...MANUS_CONFIG}}});
  }catch(e){return res.status(Number(e?.statusCode)||502).json({status:'error',version:VERSION,method,stage,updatedAt:Date.now(),error:String(e?.message||e)});}
};
