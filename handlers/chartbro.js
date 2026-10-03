'use strict';
const {withService}=require('../lib/chartbro/runtime'),{coverage}=require('../lib/chartbro/sources'),R=require('../lib/chartbro/research'),{timingSafeEqual,randomUUID}=require('node:crypto');
function authorized(req){const expected=process.env.CHARTBRO_WRITE_TOKEN;if(!expected)return false;const value=String(req.headers?.authorization||req.headers?.Authorization||'').replace(/^Bearer /,'');const a=Buffer.from(value),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
async function handle(req,res,s){res.setHeader('Cache-Control','no-store');const q=req.query||{},action=q.action||'analysis',method=req.method||'GET';try{if(method!=='GET'){if(!authorized(req))return res.status(403).json({ok:false,error:'Authenticated writes require CHARTBRO_WRITE_TOKEN'});if(!s.journal.durable||process.env.VERCEL||process.env.NETLIFY)return res.status(503).json({ok:false,error:'Durable worker required; serverless background writes disabled'});}
 let body=req.body||{};if(typeof body==='string'){try{body=JSON.parse(body);}catch{return res.status(400).json({ok:false,error:'invalid JSON'});}}
 if(action==='sources'&&method==='GET')return res.status(200).json({ok:true,...coverage()});
 if(action==='health'&&method==='GET')return res.status(200).json({ok:true,engine_version:require('../lib/chartbro/engine').VERSION,durable:s.journal.durable,storage:s.journal.kind||(s.journal.durable?'disk':'ephemeral'),worker:process.env.CHARTBRO_WORKER_ENABLED==='1',source_verified:false,upstream:{perpetual:s.provider.cooldown?.('perpetual')?.retry_at??null,spot:s.provider.cooldown?.('spot')?.retry_at??null}});
 if(action==='instruments'&&method==='GET')return res.status(200).json({ok:true,items:await s.provider.instruments({market:q.market||'perpetual'})});
 if(action==='analysis'&&method==='GET')return res.status(200).json({ok:true,analysis:await s.analysis({...q,flow:q.flow==='1'})});
 if(action==='matrix'&&method==='GET')return res.status(200).json({ok:true,...await s.matrix(q)});
 if(action==='snapshot'&&method==='GET'){const a=s.getAnalysis(q.id);return res.status(a?200:404).json(a?{ok:true,analysis:a}:{ok:false,error:'snapshot not found'});}
 if(['objects','evidence'].includes(action)&&method==='GET'){const a=s.getAnalysis(q.id);if(!a)return res.status(404).json({ok:false,error:'snapshot not found'});return res.status(200).json({ok:true,analysis_id:a.analysis_id,items:action==='objects'?a.objects:a.events});}
 if(action==='replay'&&method==='GET'){const a=s.getAnalysis(q.id);if(!a)return res.status(404).json({ok:false,error:'snapshot not found'});const at=Number(q.at);if(!Number.isFinite(at))throw new Error('valid at required');const r=require('../lib/chartbro/engine').analyze(a.bars,{...a.config,at,capture_snapshots:false});return res.status(200).json({ok:true,snapshot:r.last,events:r.events,bars:r.bars});}
 if(action==='jobs'&&method==='POST')return res.status(202).json({ok:true,job:await s.createJob(body)});
 if(action==='job'&&method==='GET')return res.status(200).json({ok:true,job:s.getJob(q.id)});
 if(action==='results'&&method==='GET')return res.status(200).json({ok:true,items:s.results(q.id)});
 if(action==='cancel'&&method==='POST')return res.status(200).json({ok:true,job:s.cancel(q.id)});
 if(action==='resume'&&method==='POST')return res.status(202).json({ok:true,job:s.resume(q.id)});
 if(action==='risk'&&method==='GET'){const keys=['equity','risk_fraction','entry','stop','fee_rate','slippage','lot','min_notional'];return res.status(200).json({ok:true,...R.positionSize(Object.fromEntries(keys.filter(k=>q[k]!=null).map(k=>[k,Number(q[k])])))});}
 if(action==='journal'&&method==='POST'){const fields=['plan','evidence_ids','emotion','adherence','stop_changed','chased','review','instrument','setup_id'];const value={id:randomUUID(),recorded_at:Date.now(),...Object.fromEntries(fields.filter(k=>body[k]!=null).map(k=>[k,body[k]]))};if(JSON.stringify(value).length>20000)throw new Error('journal entry too large');s.journal.put('trade_journal',value.id,value);return res.status(201).json({ok:true,entry:value});}
 if(action==='journal'&&method==='GET'){if(!authorized(req))return res.status(403).json({ok:false,error:'Authentication required'});return res.status(200).json({ok:true,items:s.journal.all('trade_journal')});}
 if(action==='cohorts'&&method==='GET')return res.status(200).json({ok:true,candidates:s.journal.all('candidates'),observations:s.journal.all('candidate_observations'),scan_population:s.journal.all('job_results'),outcomes:s.journal.all('research_outcomes'),status:'observations_only_no_verified_oos_performance'});
 return res.status(405).json({ok:false,error:'unsupported action or method'});
 }catch(e){if(e.retry_at)res.setHeader('Retry-After',String(Math.max(1,Math.ceil((e.retry_at-Date.now())/1000))));return res.status(e.statusCode||(/invalid|unsupported|outside|exceeds|required/.test(e.message)?400:502)).json({ok:false,error:e.message,code:e.code||null,retry_at:e.retry_at||null,upstream_status:e.upstream_status||null});}};

module.exports=async function handler(req,res){
 let status=200,body,headers={};const buffered={setHeader(k,v){headers[k]=v;},status(n){status=n;return this;},json(v){body=v;return this;}};
 try{await withService(async s=>{await handle(req,buffered,s);if(status>=400){const e=new Error('request failed');e.response=true;throw e;}});}catch(e){if(!e.response){status=503;body={ok:false,error:'ChartBro storage unavailable'};}}
 for(const [k,v] of Object.entries(headers))res.setHeader(k,v);return res.status(status).json(body);
};
