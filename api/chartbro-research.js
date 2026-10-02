'use strict';

const Oos=require('../lib/coin-scan/chartbro-oos-service.js');
const REMOTE=String(process.env.CHARTBRO_RESEARCH_URL||'https://pulseradar-chartbro-oos-runtime.onrender.com/api/chartbro-research').replace(/\/$/,'');

async function remote(q={}){
  if(String(process.env.CHARTBRO_RESEARCH_REMOTE||'1')==='0')return null;
  const p=new URLSearchParams();for(const [k,v] of Object.entries(q||{}))if(v!==null&&v!==undefined&&v!=='')p.set(k,String(v));
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),8000);
  try{const r=await fetch(REMOTE+'?'+p.toString(),{headers:{accept:'application/json'},signal:ctrl.signal});if(!r.ok)return null;const x=await r.json();return x?.status==='ok'?x:null}catch{return null}finally{clearTimeout(timer)}
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(String(req?.method||'GET').toUpperCase()!=='GET')return res.status(405).json({status:'error',error:'GET only'});
  const q=req?.query||{},view=String(q.view||'stats').toLowerCase(),limit=Math.max(1,Math.min(500,Number(q.limit)||100)),symbol=q.symbol?String(q.symbol):null;
  try{
    const canonical=await remote({view,limit,symbol});if(canonical)return res.status(200).json({...canonical,canonical:true,source:'render-kv-oos-runtime'});
    const svc=Oos.defaultChartBroOosService();
    if(view==='stats')return res.status(200).json({status:'ok',...svc.stats(),canonical:false,source:'local-runtime-fallback'});
    if(view==='experiments')return res.status(200).json({status:'ok',version:Oos.VERSION,competition:svc.experiments(),canonical:false,source:'local-runtime-fallback'});
    if(['observations','transitions','failures','alerts'].includes(view))return res.status(200).json({status:'ok',version:Oos.VERSION,view,items:svc.list({kind:view,symbol,limit}),canonical:false,source:'local-runtime-fallback'});
    return res.status(400).json({status:'error',error:'unknown view',allowed:['stats','experiments','observations','transitions','failures','alerts']});
  }catch(e){return res.status(503).json({status:'error',error:String(e?.message||e)})}
};
