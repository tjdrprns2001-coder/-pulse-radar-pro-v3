'use strict';
function header(req,name){const h=req?.headers||{};return h[name]??h[name.toLowerCase()]??null}
async function proxyToResearchRuntime(req,res){
 const base=String(process.env.BOWL224_RUNTIME_URL||'https://pulseradar-pro-v5.netlify.app').replace(/\/$/,'');
 const q=req?.query||{},params=new URLSearchParams();
 for(const [k,v] of Object.entries(q)){if(k==='route'||v==null)continue;params.set(k,String(v))}
 const url=base+'/api/bowl224-research'+(params.toString()?'?'+params.toString():'');
 const headers={accept:'application/json','content-type':'application/json'};
 const admin=header(req,'x-bowl224-admin-token');if(admin)headers['x-bowl224-admin-token']=String(admin);
 const method=String(req?.method||'GET').toUpperCase(),opts={method,headers};
 if(method!=='GET'&&method!=='HEAD')opts.body=JSON.stringify(req?.body&&typeof req.body==='object'?req.body:{});
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),25000);opts.signal=ctrl.signal;
 try{
  const rr=await fetch(url,opts),body=await rr.json().catch(()=>({status:'error',error:'bowl224 runtime invalid response'}));
  return res.status(rr.status).json(body);
 }finally{clearTimeout(timer)}
}
module.exports=async function handler(req,res,ctx={}){
 res.setHeader('Cache-Control','no-store, max-age=0');
 const runtime=ctx.runtime;
 if(!runtime){
  try{return await proxyToResearchRuntime(req,res)}
  catch(e){return res.status(503).json({status:'error',error:String(e?.message||e)})}
 }
 const method=String(req?.method||'GET').toUpperCase(),q=req?.query||{},action=String(q.action||'status').toLowerCase();
 try{
  if(method==='GET'){
   if(action==='status')return res.status(200).json({status:'ok',data:await runtime.status()});
   if(action==='stats')return res.status(200).json({status:'ok',data:await runtime.stats()});
   if(action==='events')return res.status(200).json({status:'ok',items:await runtime.events({limit:Math.max(1,Math.min(200,Number(q.limit)||50)),cohort:q.cohort||null,group:q.group||null})});
   return res.status(400).json({status:'error',error:'invalid action'});
  }
  if(method!=='POST')return res.status(405).json({status:'error',error:'GET 또는 POST만 지원합니다.'});
  if(!['run','evaluate'].includes(action))return res.status(400).json({status:'error',error:'invalid action'});
  const token=String(ctx.adminToken??process.env.BOWL224_RESEARCH_ADMIN_TOKEN??'');if(!token)return res.status(503).json({status:'error',error:'bowl224 admin token is not configured'});
  if(String(header(req,'x-bowl224-admin-token')||'')!==token)return res.status(401).json({status:'error',error:'unauthorized'});
  const body=req?.body&&typeof req.body==='object'?req.body:{},data=action==='run'?await runtime.run(body):await runtime.evaluate(body);
  return res.status(200).json({status:'ok',data});
 }catch(e){return res.status(503).json({status:'error',error:String(e?.message||e)})}
};
