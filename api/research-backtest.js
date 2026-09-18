'use strict';
function header(req,name){const h=req?.headers||{};return h[name]??h[name.toLowerCase()]??h[name.toUpperCase()]??null}
module.exports=async function handler(req,res,ctx={}){
  res.setHeader('Cache-Control','no-store, max-age=0');
  const runtime=ctx.runtime;if(!runtime)return res.status(503).json({status:'error',error:'research runtime unavailable'});
  const method=String(req?.method||'GET').toUpperCase(),q=req?.query||{},action=String(q.action||'status').toLowerCase();
  try{
    if(method==='GET'){
      if(action==='status')return res.status(200).json({status:'ok',data:await runtime.status()});
      if(action==='stats'){
        const split=String(q.split||'train');if(!['train','validation'].includes(split))return res.status(400).json({status:'error',error:'invalid split'});
        return res.status(200).json({status:'ok',data:await runtime.stats({split,manifestVersion:q.manifestVersion||null})});
      }
      if(action==='events'){
        const split=q.split?String(q.split):null;if(split&&!['train','validation','excluded'].includes(split))return res.status(400).json({status:'error',error:'invalid split'});
        const limit=Math.max(1,Math.min(200,Number(q.limit)||50));return res.status(200).json({status:'ok',items:await runtime.events({split,limit})});
      }
      return res.status(400).json({status:'error',error:'invalid action'});
    }
    if(method!=='POST')return res.status(405).json({status:'error',error:'GET 또는 POST만 지원합니다.'});
    if(!['run','evaluate'].includes(action))return res.status(400).json({status:'error',error:'invalid action'});
    const configured=String(ctx.adminToken??process.env.RESEARCH_BACKTEST_ADMIN_TOKEN??'');
    if(!configured)return res.status(503).json({status:'error',error:'research admin token is not configured'});
    if(String(header(req,'x-research-admin-token')||'')!==configured)return res.status(401).json({status:'error',error:'unauthorized'});
    const body=req?.body&&typeof req.body==='object'?req.body:{};
    const data=action==='run'?await runtime.runCollection(body):await runtime.evaluate(body);
    return res.status(200).json({status:'ok',data});
  }catch(e){return res.status(Number(e?.statusCode)||503).json({status:'error',error:String(e?.message||e)})}
};
