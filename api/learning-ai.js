'use strict';

const {defaultResearchAI}=require('../lib/learning/research-ai.js');

function parseBody(req){
  let body=req?.body||{};
  if(typeof body==='string'){try{body=JSON.parse(body)}catch{body={}}}
  return body&&typeof body==='object'?body:{};
}
async function forwardToRuntime(req,res){
  const runtime=String(process.env.TRADER_RUNTIME_URL||'').replace(/\/$/,'');
  if(!runtime||String(req?.query?.local||'')==='1')return false;
  const params=new URLSearchParams();
  for(const [k,v] of Object.entries(req.query||{}))if(v!=null)params.set(k,String(v));
  params.set('local','1');
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),20000);
  try{
    const rr=await fetch(runtime+'/api/learning-ai?'+params.toString(),{
      method:req.method||'GET',
      headers:{accept:'application/json','content-type':'application/json'},
      body:(req.method&&req.method!=='GET'&&req.method!=='HEAD')?JSON.stringify(parseBody(req)):undefined,
      signal:ctrl.signal
    });
    const body=await rr.json().catch(()=>({status:'error',error:'Learning runtime invalid response'}));
    res.status(rr.status).json(body);return true;
  }finally{clearTimeout(timer)}
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  try{
    if(await forwardToRuntime(req,res))return;
    const ai=defaultResearchAI();
    await ai.hydrateRemote(false);
    const action=String(req?.query?.action||'status').toLowerCase();
    if(action==='status'){
      return res.status(200).json({status:'ok',mode:'learning-ai',action,statusData:ai.status()});
    }
    if(action==='export'){
      return res.status(200).json({status:'ok',mode:'learning-ai',action,state:ai.exportState()});
    }
    if(action==='predict'){
      if(String(req?.method||'GET').toUpperCase()!=='POST')return res.status(405).json({status:'error',error:'POST required'});
      const body=parseBody(req),item=body.item&&typeof body.item==='object'?body.item:body;
      if(!item?.symbol)return res.status(400).json({status:'error',error:'item.symbol required'});
      return res.status(200).json({status:'ok',mode:'learning-ai',action,prediction:ai.predict(item)});
    }
    if(action==='ingest'){
      if(String(req?.method||'GET').toUpperCase()!=='POST')return res.status(405).json({status:'error',error:'POST required'});
      const token=String(process.env.LEARNING_WRITE_TOKEN||'');
      if(!token)return res.status(403).json({status:'error',error:'manual ingest disabled'});
      const supplied=String(req?.headers?.['x-learning-token']||'');
      if(supplied!==token)return res.status(403).json({status:'error',error:'invalid learning token'});
      const body=parseBody(req),items=Array.isArray(body.items)?body.items:(body.item?[body.item]:[]);
      const out=ai.observe(items,{source:String(body.source||'manual')});
      return res.status(200).json({status:'ok',mode:'learning-ai',action,...out});
    }
    return res.status(400).json({status:'error',error:'unknown learning-ai action'});
  }catch(e){
    return res.status(503).json({status:'error',mode:'learning-ai',error:String(e?.message||e)});
  }
};
