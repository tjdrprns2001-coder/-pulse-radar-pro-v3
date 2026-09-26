'use strict';
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {createAstraAutoScanner,CONFIG,MANUS_CONFIG,PERPLEXITY_CONFIG,GROK_CONFIG,GEMINI_CONFIG,CLAUDE_CONFIG,METHODS,VERSION,methodOf}=require('../lib/coin-scan/astra-auto-scanner.js');
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
    if(stage==='universe')return res.status(200).json(await scanner.universe({method}));
    if(stage==='oi'){
      const symbols=symbolsOf(q);if(!symbols.length)return res.status(400).json({status:'error',version:VERSION,method,error:'symbols required'});
      return res.status(200).json(await scanner.oi(symbols,{method,asOf:n(q.asOf),market:marketOf(q)}));
    }
    if(stage==='deep'){
      const symbols=symbolsOf(q);if(!symbols.length)return res.status(400).json({status:'error',version:VERSION,method,error:'symbols required'});
      const result=await scanner.deep(symbols,{method,market:marketOf(q),asOf:n(q.asOf)});
      try{
        const adapter=require('../lib/learning/scanner-adapter.js');
        const learned=adapter.ingestScannerItems(result.items||[],{source:'astra-'+method,marketState:result.marketState||marketOf(q),asOf:result.asOf});
        result.items=learned.items;result.learning=learned.learning;
      }catch(_learningError){result.learning={shadowOnly:true,status:'degraded',error:String(_learningError?.message||_learningError),source:'astra-'+method}}
      return res.status(200).json(result);
    }
    return res.status(400).json({status:'error',version:VERSION,method,error:'unknown stage',allowed:['universe','oi','deep'],methods:Object.values(METHODS),config:{astra:CONFIG,manus:{...CONFIG,...MANUS_CONFIG},perplexity:{...CONFIG,...PERPLEXITY_CONFIG},grok:{...CONFIG,...GROK_CONFIG},gemini:{...CONFIG,...GEMINI_CONFIG},claude:{...CONFIG,...CLAUDE_CONFIG}}});
  }catch(e){return res.status(Number(e?.statusCode)||502).json({status:'error',version:VERSION,method,stage,updatedAt:Date.now(),error:String(e?.message||e)});}
};
