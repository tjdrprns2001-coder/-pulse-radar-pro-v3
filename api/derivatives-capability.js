'use strict';
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
let provider=null;
function getProvider(){if(!provider)provider=createBinanceProvider({});return provider}
function cleanSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');return /^[A-Z0-9]{2,20}USDT$/.test(s)?s:null}
module.exports=async function handler(req,res,ctx={}){
 if(req?.method&&req.method!=='GET')return res.status(405).json({status:'error',error:'method not allowed'});
 const p=ctx.provider||getProvider(),q=req?.query||{};
 try{
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
