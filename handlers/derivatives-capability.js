'use strict';
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
let provider=null;
function getProvider(){if(!provider)provider=createBinanceProvider({});return provider}
function cleanSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');return /^[A-Z0-9]{2,20}USDT$/.test(s)?s:null}
module.exports=async function handler(req,res,ctx={}){
 if(req?.method&&req.method!=='GET')return res.status(405).json({status:'error',error:'method not allowed'});
 const p=ctx.provider||getProvider(),q=req?.query||{};
 try{
  const mode=String(q.mode||'').toLowerCase();
  if(mode==='universe')return res.status(200).json(await p.getDerivativesSupportUniverse());
  if(mode==='scan'){
   const derivUniverse=await p.getDerivativesSupportUniverse(),supportMap=new Map((derivUniverse.items||[]).map(x=>[x.symbol,x])),universeMap=new Map(),universeErrors=[...(derivUniverse.errors||[])];
   for(const x of derivUniverse.items||[])universeMap.set(x.symbol,{symbol:x.symbol,baseAsset:x.baseAsset||x.symbol.replace(/USDT$/,''),derivativesMapped:true,supportedVenues:x.supportedVenues||[]});
   try{
    const spot=await p.getSpotUniverse();
    for(const x of spot?.symbols||[]){const s=cleanSymbol(x?.symbol);if(!s)continue;if(!universeMap.has(s))universeMap.set(s,{symbol:s,baseAsset:String(x?.baseAsset||s.replace(/USDT$/,'')),derivativesMapped:false,supportedVenues:[]})}
   }catch(e){universeErrors.push({venue:'BINANCE_SPOT',error:String(e?.message||e)})}
   const universe=[...universeMap.values()].sort((a,b)=>a.symbol.localeCompare(b.symbol)),offset=Math.max(0,Math.floor(Number(q.offset)||0)),limit=Math.max(1,Math.min(50,Math.floor(Number(q.limit)||25))),slice=universe.slice(offset,offset+limit),supported=slice.filter(x=>supportMap.has(x.symbol)),probed=await p.getDerivativesCapabilities(supported.map(x=>x.symbol),{concurrency:Math.max(1,Math.min(4,Number(q.concurrency)||4))}),bySymbol=new Map(probed.map(x=>[x.symbol,x]));
   const items=slice.map(x=>bySymbol.get(x.symbol)||{symbol:x.symbol,baseAsset:x.baseAsset,derivativesSupported:false,dataAvailable:false,status:'unsupported',availabilityStatus:'not_supported',supportedVenues:[],dataVenues:[],aggregate:{openInterestUsd:null,oi1hPct:null,oi4hPct:null,oi24hPct:null,funding8hPct:null,volume24hUsd:null},venues:[],observedAt:Date.now(),estimated:false,querySkipped:true,skipReason:'no_derivatives_contract_mapping'});
   const counts={available:0,partial:0,supported_but_empty:0,not_supported:0,mapping_missing:0,query_error:0};
   for(const x of items){const k=x.availabilityStatus||'query_error';counts[k]=(counts[k]||0)+1}
   return res.status(200).json({status:'ok',mode:'scan',universeCount:universe.length,derivativesMappedCount:derivUniverse.count,offset,limit,returned:items.length,nextOffset:offset+items.length<universe.length?offset+items.length:null,counts,universeErrors,items});
  }
  const many=String(q.symbols||'').split(',').map(cleanSymbol).filter(Boolean).slice(0,50);
  if(many.length){
   const items=await p.getDerivativesCapabilities(many,{concurrency:Math.min(4,Number(q.concurrency)||4)});
   return res.status(200).json({status:'ok',count:items.length,items});
  }
  const symbol=cleanSymbol(q.symbol);
  if(!symbol)return res.status(400).json({status:'error',error:'invalid symbol'});
  return res.status(200).json({status:'ok',...(await p.getDerivativesCapability(symbol))});
 }catch(e){return res.status(Number(e?.statusCode)||500).json({status:'error',error:String(e?.message||e)})}
};
