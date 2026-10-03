'use strict';
const crypto=require('node:crypto');
const D=require('./data'),E=require('./engine'),M=require('./models'),T=require('./temporal'),{Journal}=require('./journal');
const sha=x=>crypto.createHash('sha256').update(D.canonical(x)).digest('hex');
const TFS=['1M','1w','1d','12h','4h','1h','15m','5m'];
class Service{
 constructor({provider,journal=new Journal(),now=()=>Date.now()}={}){this.provider=provider;this.journal=journal;this.now=now;this.running=new Set();this.flights=new Map();this.cache=new Map();}
 validate(q){if(q.venue&&q.venue!=='binance')throw new Error('Binance venue required');if(!/^[\p{L}\p{N}]{1,40}USDT$/u.test(q.symbol||''))throw new Error('invalid USDT symbol');if(!TFS.includes(q.tf))throw new Error('unsupported timeframe');if(q.market&&!['spot','perpetual'].includes(q.market))throw new Error('invalid market');if(q.at!=null&&(!Number.isFinite(Number(q.at))||Number(q.at)>this.now()))throw new Error('invalid decision_at');}
 async analysis(q={}){q={venue:'binance',market:'perpetual',tf:'4h',symbol:'BTCUSDT',...q};q.at=q.at==null?this.now():Number(q.at);this.validate(q);const key=sha({...q,signal:undefined,at:q.at}),cached=this.cache.get(key);if(cached&&this.now()-cached.at<15000)return D.copy(cached.value);if(this.flights.has(key))return this.flights.get(key);const promise=this.compute(q).then(value=>{this.cache.set(key,{at:this.now(),value});if(this.cache.size>60)this.cache.delete(this.cache.keys().next().value);return D.copy(value);}).finally(()=>this.flights.delete(key));this.flights.set(key,promise);return promise;}
 async compute(q){const deadline=Date.now()+Math.max(10,Math.min(16000,Number(q.deadline_ms)||16000));const instruments=await this.provider.instruments({market:q.market}),instrument=instruments.find(x=>x.symbol===q.symbol);if(!instrument)throw new Error('instrument unavailable in requested market');const raw=await this.provider.bars({...q,limit:Math.max(50,Math.min(1500,Number(q.limit)||600))}),norm=D.normalize(raw,{tf:q.tf,at:q.at});if(!norm.bars.length)throw new Error('no closed bars');const result=E.analyze(norm.bars,{venue:q.venue,market:q.market,symbol:q.symbol,tf:q.tf,at:q.at,tick:instrument.tick||.01,capture_snapshots:false}),s=result.last;const flow=await this.loadFlow(q,deadline);const past=norm.bars.filter(b=>b.close_time<=s.decision_at-86400000).at(-1),tickerQuiet=!!past&&D.TF_MS[q.tf]<=86400000&&Math.abs(norm.bars.at(-1).close/past.close-1)<=.1,ratio=flow.taker?.at(-1)?.ratio??null;
 const dataset_version=sha({identity:result.identity,bars:norm.bars}),config_hash=sha(Object.fromEntries(Object.entries(result.config).filter(([k])=>!['at','capture_snapshots'].includes(k)))),analysis_id=sha({dataset_version,config_hash,flow,decision_cutoff:q.at,version:E.VERSION});
 const snapshot={analysis_id,instrument:{venue:q.venue,market:q.market,symbol:q.symbol,tick_size:instrument.tick??null},decision_at:q.at,last_closed_bar_at:s.last_closed_bar_at,dataset_version,engine_version:E.VERSION,config_hash,range_id:s.range_id,features:s.features,feature_series:result.features,objects:s.objects,setups:s.setups,structure:s.structure,range:s.range,targets:s.targets,iof:s.iof,volume_echo:s.volume_echo,astra:M.astra({quiet:tickerQuiet,volume_echo:!!s.volume_echo,taker_ratio:ratio,oi:flow.oi,price_stable:tickerQuiet,at:q.at}),flow,divergences:result.divergences,three_drive:result.three_drive,institutional_swings:result.institutional_swings,swing_metrics:result.swing_metrics,volume_profile:result.volume_profile,amd:result.ranges.map(range=>T.pathModel(range,norm.bars,result.events)),mmxm:result.ranges.map(range=>T.mmxm(range,norm.bars,result.events,result.zones)),data_quality:{...norm.quality,price:q.at-s.last_closed_bar_at>(D.TF_MS[q.tf]||31*86400000)*2?'stale':'fresh',oi:flow.oi?.quality||'missing',tick_size:instrument.tick?'verified':'missing',availability_assumption:'bar_close'},bars:norm.bars,events:result.events,pivots:result.pivots,timeframe:q.tf,config:result.config,rule_origin:'independent_research',persistence:this.journal.durable?'disk_journal':'ephemeral',source_verification:'metadata_only_user_supplied'};
 this.journal.put('analyses',analysis_id,snapshot);this.saveCandidates(snapshot);if(!this.journal.durable&&this.journal.all('analyses').length>100)this.journal.tables.get('analyses').delete(this.journal.tables.get('analyses').keys().next().value);return snapshot;
 }
 async loadFlow(q,deadline){
  if(!q.flow||!this.provider.flow)return {oi:null,funding:null,taker:null};
  const remaining=deadline-Date.now();if(remaining<=0)return {oi:null,funding:null,taker:null,errors:['analysis deadline']};
  const controller=new AbortController();let timer;
  try{return await Promise.race([this.provider.flow({...q,signal:controller.signal}),new Promise((_,reject)=>timer=setTimeout(()=>{controller.abort();reject(new Error('flow deadline'));},remaining))]);}
  catch(e){return {oi:null,funding:null,taker:null,errors:[e.message]};}finally{clearTimeout(timer);}
 }
 getAnalysis(id){return this.journal.get('analyses',id);}
 async matrix(q){
  const at=q.at==null?this.now():Number(q.at),frames={},errors={},end=Date.now()+Math.max(10,Math.min(16000,Number(q.deadline_ms)||16000));
  for(const tf of TFS){
   const remaining=end-Date.now();if(remaining<=0){errors[tf]='matrix deadline';continue;}
   const controller=new AbortController();let timer;
   try{
    const x=await Promise.race([this.analysis({...q,tf,at,signal:controller.signal}),new Promise((_,reject)=>timer=setTimeout(()=>{controller.abort();reject(new Error('matrix deadline'));},remaining))]);
    frames[tf]={analysis_id:x.analysis_id,decision_at:x.decision_at,features:x.features,structure:x.structure,range:x.range,setup:x.setups.at(-1)??null,data_quality:x.data_quality};
   }catch(e){errors[tf]=e.message;}finally{clearTimeout(timer);}
  }
  return {decision_at:at,frames,errors,crosses:['macd','ema','stochastic'].map(indicator=>M.crossMatrix(frames,{indicator,at,mode:q.cross_mode||'window',window_ms:Number(q.window_ms)||86400000})),partial:Object.keys(errors).length>0};
 }
 async createJob(q={}){let at=this.now();const market=q.market||'perpetual',tf=q.tf||'4h';this.validate({symbol:'BTCUSDT',tf,market});const instruments=await this.provider.instruments({market}),universe=instruments.map(x=>x.symbol);let symbols,quietCount=null;if(Array.isArray(q.symbols)){symbols=[...new Set(q.symbols)];if(symbols.some(x=>!universe.includes(x)))throw new Error('symbol outside current universe');}else{const tickers=await this.provider.tickers({market}),map=new Map(tickers.map(t=>[t.symbol,t]));symbols=universe.filter(s=>{const t=map.get(s);return t&&Math.abs(Number(t.priceChangePercent))<=10&&(q.volume_cut===false||Number(t.quoteVolume)>=10000000);});quietCount=symbols.length;}
 const timeframes=q.timeframes||(q.tf?[tf]:['1w','1d','12h','4h','1h','15m','5m']);if(!Array.isArray(timeframes)||!timeframes.length||timeframes.length>8||timeframes.some(t=>!TFS.includes(t))||new Set(timeframes).size!==timeframes.length)throw new Error('invalid timeframes');if(symbols.length>800)throw new Error('scan universe exceeds limit');at=this.now();const job={id:crypto.randomUUID(),state:'QUEUED',created_at:at,decision_at:at,universe_count:universe.length,requested:symbols.length,quiet_filter_count:quietCount,symbols,market,tf,timeframes,stage_processed:0,partial_symbols:0,volume_cut:q.volume_cut!==false,flow:q.flow!==false,processed:0,success:0,failures:0,passed:0,missing:0,cursor:0,last_success_stage:'UNIVERSE',config_hash:sha({market,tf,timeframes,flow:q.flow!==false,volume_cut:q.volume_cut!==false}),cancel_requested:false,updated_at:at};this.journal.project('jobs',job.id,job);return job;
 }
 getJob(id){const j=this.journal.get('jobs',id);if(!j)throw new Error('unknown job');return j;}
 results(id){return this.journal.all('job_results').filter(x=>x.job_id===id);}
 cancel(id){const j=this.getJob(id);if(['COMPLETED','FAILED'].includes(j.state))return j;j.cancel_requested=true;j.state='CANCELLED';j.updated_at=this.now();return this.journal.project('jobs',id,j);}
 resume(id){const j=this.getJob(id);if(j.state==='COMPLETED')return j;j.cancel_requested=false;j.state='QUEUED';j.updated_at=this.now();return this.journal.project('jobs',id,j);}
 saveCandidates(a){
  for(const setup of a.setups||[]){
   const key=[a.engine_version,a.config_hash,a.dataset_version,setup.id].join(':');
   const record={id:key,setup_id:setup.id,instrument:a.instrument,engine_version:a.engine_version,config_hash:a.config_hash,episode_id:setup.episode_id,known_at:setup.known_at,side:setup.side,range_id:setup.range_id,sweep_event_id:setup.sweep_event_id,invalidation_level:setup.invalidation_level};
   this.journal.put('candidates',key,record);
   this.journal.put('candidate_observations',key+':'+a.analysis_id,{id:key+':'+a.analysis_id,candidate_id:key,analysis_id:a.analysis_id,decision_at:a.decision_at,dataset_version:a.dataset_version,state:setup.state,trigger_at:setup.trigger_at??null});
  }
 }
 async stepJob(id){
  if(this.running.has(id))return this.getJob(id);this.running.add(id);
  try{
   let j=this.getJob(id);if(j.cancel_requested||['COMPLETED','FAILED','CANCELLED'].includes(j.state))return j;
   const saved=this.results(id),done=new Set(saved.map(x=>x.symbol));
   j.success=saved.filter(x=>x.ok).length;j.failures=saved.filter(x=>!x.ok).length;j.processed=saved.length;j.passed=saved.filter(x=>x.pass).length;j.missing=saved.filter(x=>x.missing).length;j.partial_symbols=saved.filter(x=>x.partial).length;
   while(j.cursor<j.symbols.length&&done.has(j.symbols[j.cursor]))j.cursor++;
   const finish=()=>{j.state=j.failures?(j.success||j.partial_symbols?'PARTIAL':'FAILED'):'COMPLETED';j.updated_at=this.now();return this.journal.project('jobs',id,j);};
   if(j.cursor>=j.symbols.length)return finish();
   const symbol=j.symbols[j.cursor],timeframes=j.timeframes||[j.tf],stages=this.journal.all('job_stages').filter(x=>x.job_id===id&&x.symbol===symbol),seen=new Set(stages.map(x=>x.tf)),tf=timeframes.find(t=>!seen.has(t));
   j.state='RUNNING';this.journal.project('jobs',id,j);
   if(tf){
    let stage;
    try{const a=await this.analysis({symbol,tf,market:j.market,at:j.decision_at,flow:j.flow});stage={id:id+':'+symbol+':'+tf,job_id:id,symbol,tf,ok:true,analysis_id:a.analysis_id,data_hash:a.dataset_version};}
    catch(e){stage={id:id+':'+symbol+':'+tf,job_id:id,symbol,tf,ok:false,error:e.message};}
    this.journal.put('job_stages',stage.id,stage);stages.push(stage);
   }
   j=this.getJob(id);j.stage_processed=this.journal.all('job_stages').filter(x=>x.job_id===id).length;j.last_success_stage='HTF_FEATURES';j.updated_at=this.now();
   if(stages.length<timeframes.length)return this.journal.project('jobs',id,j);
   const frames=Object.fromEntries(stages.filter(x=>x.ok).map(x=>[x.tf,this.getAnalysis(x.analysis_id)])),values=Object.values(frames),multi=timeframes.length>1;
   const structural=multi?M.compose(frames,j.decision_at):{confirmed:values.some(a=>a.setups.some(s=>s.state==='TRIGGER_CONFIRMED'&&s.trigger_at===a.last_closed_bar_at)),role_model:'single_timeframe_research'};
   const flow=values.find(a=>a.timeframe==='15m')?.flow||values[0]?.flow,flowGood=flow?.taker?.at(-1)?.ratio>=1.15&&flow.taker.at(-1).observed_at<=j.decision_at&&j.decision_at-flow.taker.at(-1).observed_at<=1800000,complete=stages.every(x=>x.ok);
   const r={id:id+':'+symbol,job_id:id,symbol,ok:complete,partial:!complete&&values.length>0,pass:complete&&structural.confirmed,astra_eligible:complete&&structural.confirmed&&flowGood,structural,flow_check:{queried:j.flow,fresh_taker:!!flowGood,oi:flow?.oi?.quality||'missing'},frames:stages,missing:values.some(a=>a.data_quality.oi==='missing')||!complete,stage:'REPORT',analysis_id:frames[j.tf]?.analysis_id??values[0]?.analysis_id??null,errors:stages.filter(x=>!x.ok).map(x=>({tf:x.tf,error:x.error}))};
   this.journal.put('job_results',r.id,r);
   j=this.getJob(id);j.cursor++;j.processed++;if(r.ok)j.success++;else j.failures++;if(r.partial)j.partial_symbols++;if(r.pass)j.passed++;if(r.missing)j.missing++;j.last_success_stage='REPORT';j.updated_at=this.now();
   if(j.cancel_requested)j.state='CANCELLED';else if(j.cursor>=j.symbols.length)return finish();
   return this.journal.project('jobs',id,j);
  }finally{this.running.delete(id);}
 }
 async tick(){const job=this.journal.all('jobs').find(j=>['QUEUED','RUNNING'].includes(j.state)&&!j.cancel_requested);if(job)return this.stepJob(job.id);return null;}
}
module.exports={Service,TFS,sha};
