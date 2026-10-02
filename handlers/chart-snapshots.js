'use strict';
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  const base=String(process.env.SNAPSHOT_RUNTIME_URL||process.env.SELECTOR_RUNTIME_URL||'https://pulseradar-selector-runtime.onrender.com').replace(/\/$/,'');
  const token=String(process.env.SNAPSHOT_RUNTIME_TOKEN||'');
  if(!base||!token)return res.status(503).json({status:'error',error:'snapshot runtime not configured'});
  const q=req?.query||{},params=new URLSearchParams();
  for(const [k,v] of Object.entries(q))if(k!=='route'&&v!=null&&v!=='')params.set(k,String(v));
  const url=base+'/chart-snapshots'+(params.toString()?'?'+params.toString():'');
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),15000);
  try{
    const method=String(req?.method||'GET').toUpperCase(),headers={accept:'application/json',authorization:'Bearer '+token};
    let body;
    if(method!=='GET'&&method!=='HEAD'){headers['content-type']='application/json';body=JSON.stringify(req?.body&&typeof req.body==='object'?req.body:{})}
    const r=await fetch(url,{method,headers,body,signal:ctrl.signal,cache:'no-store'});
    const payload=await r.json().catch(()=>({status:'error',error:'snapshot runtime invalid response'}));
    return res.status(r.status).json(payload);
  }catch(e){return res.status(502).json({status:'error',error:e?.name==='AbortError'?'snapshot runtime timeout':String(e?.message||e)})}
  finally{clearTimeout(timer)}
};
