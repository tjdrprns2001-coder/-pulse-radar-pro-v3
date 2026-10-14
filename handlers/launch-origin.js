'use strict';
const tracker=require('../lib/onchain/launch-origin.js');
const transfers=require('../lib/onchain/launch-token-transfers.js');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','public, max-age=0, s-maxage=120');
 if(req.method&&req.method!=='GET')return res.status(405).json({ok:false,error:'GET only'});
 try{
  const result=await tracker.analyze({network:req.query?.network,token:req.query?.token});
  if(result.ok&&req.query?.transfers==='1')result.recentTransfers=await transfers.readRecent({network:result.network,token:result.token});
  return res.status(result.ok?200:400).json(result);
 }catch(e){return res.status(502).json({ok:false,status:'UPSTREAM_ERROR',error:String(e?.message||e)})}
};
