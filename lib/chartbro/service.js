'use strict';
const crypto=require('node:crypto');
const A=require('./assessment'),R=require('./research');
const D=require('./data'),E=require('./engine'),M=require('./models'),T=require('./temporal'),{Journal}=require('./journal');
const sha=x=>crypto.createHash('sha256').update(D.canonical(x)).digest('hex');
const TFS=['1M','1w','1d','12h','4h','1h','15m','5m'];
class Service{
 constructor({provider,journal=new Journal(),now=()=>Date.now()}={}){this.provider=provider;this.journal=journal;this.now=now;this.running=new Set();this.flights=new Map();this.cache=new Map();}
 validate(q){if(q.venue&&!['auto','binance','bybit','okx','bitget','gate'].includes(q.venue))throw new Error('unsupported venue');if(!/^[\p{L}\p{N}]{1,40}USDT$/u.test(q.symbol||''))throw new Error('invalid USDT symbol');if(!TFS.includes(q.tf))throw new Error('unsupported timeframe');if(q.market&&!['spot','perpetual'].includes(q.market))throw new Error('invalid market');if(q.at!=null&&(!Number.isFinite(Number(q.at))||Number(q.at)>this.now()))throw new Error('invalid decision_at');}
 async analysis(q={}){
  const live=q.at==null;q={venue:this.provider.venues?'auto':'binance',market:'perpetual',tf:'4h',symbol:'BTCUSDT',...q};q.at=live?this.now():Number(q.at);this.validate(q);
  const key=sha({...q,signal:undefined,at:live?'live':q.at}),cached=this.cache.get(key);if(cached&&this.now()-cached.at<30000)return D.copy(cached.value);if(this.flights.has(key))return this.flights.get(key);
  const calculate=async()=>{
   if(q.venue!=='auto')return this.compute(q);
   const end=Date.now()+Math.max(10,Math.min(24000,Number(q.deadline_ms)||24000)),attempts=[];let last;
   for(const venue of this.provider.venues||['binance']){
    if(q.signal?.aborted)throw new Error('request cancelled');const remaining=end-Date.now();if(remaining<=0)break;
    const controller=new AbortController();let timer,rejectAbort;const abort=()=>{controller.abort();rejectAbort?.(new Error('request cancelled'));};q.signal?.addEventListener('abort',abort,{once:true});
    try{const a=await Promise.race([this.compute({...q,venue,signal:controller.signal}),new Promise((_,reject)=>{rejectAbort=reject;timer=setTimeout(()=>{controller.abort();reject(new Error('venue deadline'));},Math.min(6000,remaining));})]);return {...a,source_selection:{requested_venue:'auto',actual_venue:venue,attempts}};}
    catch(e){last=e;attempts.push({venue,error:e.message,code:e.code||null,retry_at:e.retry_at||null});}finally{clearTimeout(timer);q.signal?.removeEventListener('abort',abort);}
   }
   if(Date.now()>=end)throw new Error('auto venue deadline');throw last||new Error('all venues unavailable');
  };
  const promise=calculate().then(value=>{this.cache.set(key,{at:this.now(),value});if(this.cache.size>60)this.cache.delete(this.cache.keys().next().value);return D.copy(value);}).catch(e=>{
   if(!live||!['BINANCE_COOLDOWN','UPSTREAM_COOLDOWN'].includes(e.code))throw e;
   const prior=this.journal.all('analyses').filter(a=>(q.venue==='auto'||a.instrument.venue===q.venue)&&a.instrument.market===q.market&&a.instrument.symbol===q.symbol&&a.timeframe===q.tf&&a.engine_version===E.VERSION&&a.decision_at<=q.at).sort((a,b)=>b.decision_at-a.decision_at)[0];if(!prior)throw e;
   const stale={...prior,stale:true,requested_at:q.at,retry_at:e.retry_at,stale_reason:e.code,data_quality:{...prior.data_quality,price:'stale',oi:prior.flow?.oi?'stale':'missing'},operational:{eligible_for_confirmation:false,reason:e.code}};return {...stale,assessment:A.assess(stale)};
  }).finally(()=>this.flights.delete(key));this.flights.set(key,promise);return promise;
 }
 async compute(q){const deadline=Date.now()+Math.max(10,Math.min(16000,Number(q.deadline_ms)||16000));const instruments=await this.provider.instruments({venue:q.venue,symbol:q.symbol,market:q.market,signal:q.signal}),instrument=instruments.find(x=>x.symbol===q.symbol);if(!instrument)throw new Error('instrument unavailable in requested market');const raw=await this.provider.bars({...q,limit:Math.max(50,Math.min(1500,Number(q.limit)||600))}),norm=D.normalize(raw,{tf:q.tf,at:q.at});if(!norm.bars.length)throw new Error('no closed bars');const result=E.analyze(norm.bars,{venue:q.venue,market:q.market,symbol:q.symbol,tf:q.tf,at:q.at,tick:instrument.tick||.01,capture_snapshots:false}),s=result.last;const flow=await this.loadFlow(q,deadline);const past=norm.bars.filter(b=>b.close_time<=s.decision_at-86400000).at(-1),tickerQuiet=!!past&&D.TF_MS[q.tf]<=86400000&&Math.abs(norm.bars.at(-1).close/past.close-1)<=.1,ratio=flow.taker?.at(-1)?.ratio??null;
 const dataset_version=sha({identity:result.identity,bars:norm.bars}),config_hash=sha(Object.fromEntries(Object.entries(result.config).filter(([k])=>!['at','capture_snapshots'].includes(k)))),analysis_id=sha({dataset_version,config_hash,flow,decision_cutoff:q.at,version:E.VERSION,assessment_version:A.VERSION});
 const snapshot={analysis_id,instrument:{venue:q.venue,market:q.market,symbol:q.symbol,native_symbol:instrument.native_symbol||q.symbol,tick_size:instrument.tick??null},decision_at:q.at,last_closed_bar_at:s.last_closed_bar_at,dataset_version,engine_version:E.VERSION,config_hash,range_id:s.range_id,features:s.features,feature_series:result.features,objects:s.objects,setups:s.setups,structure:s.structure,range:s.range,targets:s.targets,iof:s.iof,volume_echo:s.volume_echo,astra:M.astra({quiet:tickerQuiet,volume_echo:!!s.volume_echo,taker_ratio:ratio,oi:flow.oi,price_stable:tickerQuiet,at:q.at}),flow,divergences:result.divergences,three_drive:result.three_drive,institutional_swings:result.institutional_swings,swing_metrics:result.swing_metrics,volume_profile:result.volume_profile,amd:result.ranges.map(range=>T.pathModel(range,norm.bars,result.events)),mmxm:result.ranges.map(range=>T.mmxm(range,norm.bars,result.events,result.zones)),data_quality:{...norm.quality,price:q.at-s.last_closed_bar_at>(D.TF_MS[q.tf]||31*86400000)*2?'stale':'fresh',oi:flow.oi?.quality||'missing',tick_size:instrument.tick?'verified':'missing',availability_assumption:'bar_close'},bars:norm.bars,events:result.events,pivots:result.pivots,timeframe:q.tf,config:result.config,rule_origin:'independent_research',persistence:this.journal.kind||(this.journal.durable?'disk_journal':'ephemeral'),source_verification:'metadata_only_user_supplied'};
 snapshot.assessment=A.assess(snapshot);this.journal.put('analyses',analysis_id,snapshot);this.saveCandidates(snapshot);this.resolveCandidateOutcomes(snapshot);if(!this.journal.durable&&this.journal.all('analyses').length>100)this.journal.tables.get('analyses').delete(this.journal.tables.get('analyses').keys().next().value);return snapshot;
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
    frames[tf]={analysis_id:x.analysis_id,venue:x.instrument.venue,decision_at:x.decision_at,features:x.features,structure:x.structure,range:x.range,setup:x.setups.at(-1)??null,data_quality:x.data_quality};
   }catch(e){errors[tf]=e.message;}finally{clearTimeout(timer);}
  }
  return {decision_at:at,frames,errors,crosses:['macd','ema','stochastic'].map(indicator=>M.crossMatrix(frames,{indicator,at,mode:q.cross_mode||'window',window_ms:Number(q.window_ms)||86400000})),partial:Object.keys(errors).length>0};
 }
 async universe(q={}){
  const market=q.market||'perpetual',venue=q.venue||(this.provider.venues?'auto':'binance');this.validate({symbol:'BTCUSDT',tf:q.tf||'4h',market,...(venue==='all'?{}:{venue})});
  const venues=venue==='all'||venue==='auto'?(this.provider.venues||['binance']):[venue],errors=[],deadline=Date.now()+24000;
  const collect=async v=>{const controller=new AbortController();let timer;try{return await Promise.race([(async()=>{const instruments=await this.provider.instruments({venue:v,market,signal:controller.signal}),tickers=await this.provider.tickers({venue:v,market,signal:controller.signal}),map=new Map(tickers.map(t=>[t.symbol,t]));
   const items=instruments.map(i=>({...i,...map.get(i.symbol),venue:v,market,symbol:i.symbol})),symbols=items.filter(t=>D.num(t.priceChangePercent)!=null&&Math.abs(D.num(t.priceChangePercent))<=10&&(q.volume_cut===false||D.num(t.quoteVolume)!=null&&D.num(t.quoteVolume)>=10000000)).map(t=>t.symbol);
   return {venue:v,market,universe_count:instruments.length,quiet_filter_count:symbols.length,missing_price_count:items.filter(t=>D.num(t.priceChangePercent)==null).length,missing_volume_count:items.filter(t=>D.num(t.quoteVolume)==null).length,symbols,items,received_at:this.now()};})(),new Promise((_,reject)=>timer=setTimeout(()=>{controller.abort();reject(Error('universe deadline'));},Math.max(1,Math.min(10000,deadline-Date.now()))))]);}finally{clearTimeout(timer);}};
  let groups=[];if(venue==='auto'){for(const v of venues){if(Date.now()>=deadline){errors.push({venue:v,error:'universe deadline'});break;}try{const g=await collect(v);if(g.symbols.length||Array.isArray(q.symbols)&&q.symbols.every(s=>g.items.some(i=>i.symbol===s))){groups=[g];break;}errors.push({venue:v,error:'No eligible population for selected quiet/turnover filters'});}catch(e){errors.push({venue:v,error:e.message});}}if(!groups.length)throw Error('No usable scan universe: '+errors.map(x=>x.venue+' '+x.error).join('; '));}
  else{const xs=await Promise.allSettled(venues.map(v=>collect(v)));xs.forEach((r,i)=>r.status==='fulfilled'?groups.push(r.value):errors.push({venue:venues[i],error:r.reason.message}));if(!groups.length)throw Error('All scan universe requests failed: '+errors.map(x=>x.error).join('; '));}
  return {decision_at:this.now(),market,groups,errors,partial:errors.length>0,volume_cut:q.volume_cut!==false,source_selection:{requested_venue:venue,actual_venues:groups.map(g=>g.venue),attempts:errors}};
 }
 async createJob(q={}){if(q.venue==='all')throw Error('All-venue jobs require one job per venue');const population=await this.universe(q),group=population.groups[0];let at=this.now();const market=q.market||'perpetual',tf=q.tf||'4h',universe=group.items.map(x=>x.symbol);let symbols,quietCount=null;
 if(Array.isArray(q.symbols)){symbols=[...new Set(q.symbols)];if(symbols.some(x=>!universe.includes(x)))throw Error('symbol outside current universe');}else{symbols=group.symbols;quietCount=symbols.length;}
 const timeframes=q.timeframes||(q.tf?[tf]:['1w','1d','12h','4h','1h','15m','5m']);if(!Array.isArray(timeframes)||!timeframes.length||timeframes.length>8||timeframes.some(t=>!TFS.includes(t))||new Set(timeframes).size!==timeframes.length)throw new Error('invalid timeframes');if(symbols.length>5000)throw new Error('scan universe exceeds limit');at=this.now();const job={id:crypto.randomUUID(),state:'QUEUED',created_at:at,decision_at:at,venue:group.venue,source_selection:population.source_selection||null,universe_count:universe.length,requested:symbols.length,quiet_filter_count:quietCount,symbols,market,tf,timeframes,stage_processed:0,partial_symbols:0,volume_cut:q.volume_cut!==false,flow:q.flow!==false,processed:0,success:0,failures:0,passed:0,missing:0,cursor:0,last_success_stage:'UNIVERSE',config_hash:sha({venue:group.venue,market,tf,timeframes,flow:q.flow!==false,volume_cut:q.volume_cut!==false}),cancel_requested:false,updated_at:at};this.journal.project('jobs',job.id,job);return job;
 }
 getJob(id){const j=this.journal.get('jobs',id);if(!j)throw new Error('unknown job');return j;}
 results(id){return this.journal.all('job_results').filter(x=>x.job_id===id);}
 cancel(id){const j=this.getJob(id);if(['COMPLETED','FAILED'].includes(j.state))return j;j.cancel_requested=true;j.state='CANCELLED';j.updated_at=this.now();return this.journal.project('jobs',id,j);}
 resume(id){const j=this.getJob(id);if(j.state==='COMPLETED')return j;j.cancel_requested=false;j.state='QUEUED';j.updated_at=this.now();return this.journal.project('jobs',id,j);}
 saveCandidates(a){
  for(const setup of a.setups||[]){
   const key=sha({engine:a.engine_version,config:a.config_hash,instrument:{venue:a.instrument?.venue,market:a.instrument?.market,symbol:a.instrument?.symbol},timeframe:a.timeframe,setup:setup.id});
   const record={id:key,setup_id:setup.id,instrument:a.instrument,timeframe:a.timeframe??null,engine_version:a.engine_version,config_hash:a.config_hash,episode_id:setup.episode_id,known_at:setup.known_at,side:setup.side,range_id:setup.range_id,sweep_event_id:setup.sweep_event_id,invalidation_level:setup.invalidation_level};
   this.journal.put('candidates',key,D.copy(record));
   this.journal.put('candidate_observations',key+':'+a.analysis_id,{id:key+':'+a.analysis_id,candidate_id:key,analysis_id:a.analysis_id,decision_at:a.decision_at,dataset_version:a.dataset_version,last_closed_bar_at:a.last_closed_bar_at??null,state:setup.state,trigger_at:setup.trigger_at??null,setup:D.copy(setup),targets:D.copy(a.targets||[]),assessment:a.assessment??null});
  }
 }
 candidateHistory(a){
  const same=c=>c.instrument?.venue===a.instrument?.venue&&c.instrument?.market===a.instrument?.market&&c.instrument?.symbol===a.instrument?.symbol&&c.timeframe===(a.timeframe??null)&&c.engine_version===a.engine_version&&c.config_hash===a.config_hash;
  const observations=this.journal.all('candidate_observations').filter(o=>o.decision_at<=a.decision_at),outcomes=this.journal.all('research_outcomes').filter(o=>o.evaluated_at<=a.decision_at);
  const items=this.journal.all('candidates').filter(same).map(c=>({...c,observations:observations.filter(o=>o.candidate_id===c.id).sort((x,y)=>x.decision_at-y.decision_at),outcomes:outcomes.filter(o=>o.candidate_id===c.id)})).filter(c=>c.observations.length);
  return {analysis_id:a.analysis_id,as_of:a.decision_at,persistence:this.journal.durable?'durable':'ephemeral',status:'research_only_no_verified_oos_performance',items};
 }
 resolveCandidateOutcomes(a){
  const history=this.candidateHistory(a),duration=D.TF_MS[a.timeframe];if(!duration||a.stale||a.data_quality?.price!=='fresh')return;
  for(const c of history.items){
   const observation=c.observations.find(o=>o.state==='TRIGGER_CONFIRMED'&&Number.isFinite(o.trigger_at)&&o.trigger_at===o.last_closed_bar_at&&o.trigger_at<=o.decision_at);if(!observation)continue;
   const trigger=observation.trigger_at,setup=observation.setup,stop=setup?.invalidation_level;
   const price=setup?.trigger_price??a.bars?.find(b=>b.close_time===trigger)?.close;
   const target=(observation.targets||[]).filter(t=>Number.isFinite(t.price)&&(c.side==='long'?t.price>price:t.price<price)).sort((x,y)=>Math.abs(x.price-price)-Math.abs(y.price-price))[0]?.price;
   if(!Number.isFinite(price)||!Number.isFinite(stop)||!Number.isFinite(target))continue;
   const bars=(a.bars||[]).filter(b=>b.close_time<=a.decision_at&&b.open_time>trigger);
   if(!bars.length||bars[0].open_time-trigger>duration)continue;
   for(const hours of [24,72]){
    const horizon_ms=hours*3600000,id=c.id+':'+horizon_ms+':cost-v1';if(this.journal.get('research_outcomes',id)||bars.at(-1).close_time<trigger+horizon_ms)continue;
    const xs=bars.filter(b=>b.open_time<=trigger+horizon_ms);if(xs.some((b,i)=>i&&b.open_time-xs[i-1].open_time!==duration))continue;
    const value=R.outcome({...setup,id:c.setup_id,episode_id:c.episode_id,side:c.side,known_at:trigger,stop,target},xs,{horizon_ms,fee_rate:.0004,slippage:0,funding_return:0});
    if(['UNFILLED','UNRESOLVED'].includes(value.result))continue;
    this.journal.put('research_outcomes',id,{...value,id,candidate_id:c.id,trigger_at:trigger,evaluated_at:a.decision_at,analysis_id:a.analysis_id,dataset_version:a.dataset_version,cost_policy:'cost-v1: fee 0.04% each side; slippage/funding assumed zero',execution_is_virtual:true});
   }
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
    try{const a=await this.analysis({venue:j.venue||'binance',symbol,tf,market:j.market,at:j.decision_at,flow:j.flow});stage={id:id+':'+symbol+':'+tf,job_id:id,venue:j.venue||'binance',symbol,tf,ok:true,analysis_id:a.analysis_id,data_hash:a.dataset_version};}
    catch(e){stage={id:id+':'+symbol+':'+tf,job_id:id,venue:j.venue||'binance',symbol,tf,ok:false,error:e.message};}
    this.journal.put('job_stages',stage.id,stage);stages.push(stage);
   }
   j=this.getJob(id);j.stage_processed=this.journal.all('job_stages').filter(x=>x.job_id===id).length;j.last_success_stage='HTF_FEATURES';j.updated_at=this.now();
   if(stages.length<timeframes.length)return this.journal.project('jobs',id,j);
   const frames=Object.fromEntries(stages.filter(x=>x.ok).map(x=>[x.tf,this.getAnalysis(x.analysis_id)])),values=Object.values(frames),multi=timeframes.length>1;
   const structural=multi?M.compose(frames,j.decision_at):{confirmed:values.some(a=>a.setups.some(s=>s.state==='TRIGGER_CONFIRMED'&&s.trigger_at===a.last_closed_bar_at)),role_model:'single_timeframe_research'};
   const flow=values.find(a=>a.timeframe==='15m')?.flow||values[0]?.flow,flowGood=flow?.taker?.at(-1)?.coverage!=='partial'&&flow?.taker?.at(-1)?.eligible_for_confirmation!==false&&flow?.taker?.at(-1)?.ratio>=1.15&&flow.taker.at(-1).observed_at<=j.decision_at&&j.decision_at-flow.taker.at(-1).observed_at<=1800000,complete=stages.every(x=>x.ok);
   const r={id:id+':'+symbol,job_id:id,venue:j.venue||'binance',symbol,ok:complete,partial:!complete&&values.length>0,pass:complete&&structural.confirmed,astra_eligible:complete&&structural.confirmed&&flowGood&&values.some(a=>['A','A+B','B','C'].includes(a.astra?.type)),structural,flow_check:{queried:j.flow,fresh_taker:!!flowGood,oi:flow?.oi?.quality||'missing'},frames:stages,missing:values.some(a=>a.data_quality.oi==='missing')||!complete,stage:'REPORT',analysis_id:frames[j.tf]?.analysis_id??values[0]?.analysis_id??null,errors:stages.filter(x=>!x.ok).map(x=>({tf:x.tf,error:x.error}))};
   this.journal.put('job_results',r.id,r);
   j=this.getJob(id);j.cursor++;j.processed++;if(r.ok)j.success++;else j.failures++;if(r.partial)j.partial_symbols++;if(r.pass)j.passed++;if(r.missing)j.missing++;j.last_success_stage='REPORT';j.updated_at=this.now();
   if(j.cancel_requested)j.state='CANCELLED';else if(j.cursor>=j.symbols.length)return finish();
   return this.journal.project('jobs',id,j);
  }finally{this.running.delete(id);}
 }
 async scheduleScans(config={}){
  if(!config.enabled)return [];if(!this.journal.durable)throw Error('Durable storage required for scheduled scans');
  const interval=config.interval_ms||3600000,slot=Math.floor(this.now()/interval)*interval,hash=sha(Object.fromEntries(Object.entries(config).filter(([k])=>k!=='limit'))),runs=[];
  for(const venue of config.venues||['auto']){
   const id=hash+':'+venue+':'+slot;if(this.journal.get('scheduled_runs',id))continue;
   const busy=this.journal.all('jobs').some(j=>j.venue===venue&&['QUEUED','RUNNING'].includes(j.state));let run={id,venue,slot,known_at:this.now(),config_hash:hash};
   if(busy)run.state='SKIPPED_BUSY';else try{const j=await this.createJob({venue,market:'perpetual',volume_cut:config.volume_cut===true,flow:config.flow!==false,timeframes:config.timeframes||['1w','1d','12h','4h','1h','15m','5m']});run={...run,state:'QUEUED',job_id:j.id};}catch(e){run={...run,state:'FAILED',error:e.message};}
   this.journal.put('scheduled_runs',id,run);runs.push(run);if(runs.length>=(config.limit||Infinity))break;
  }return runs;
 }
 async pollOutcomes({interval_ms=3600000,limit=1}={}){
  if(!this.journal.durable)throw Error('Durable storage required for outcome polling');const now=this.now(),tasks=new Map(),observations=this.journal.all('candidate_observations'),done=this.journal.all('research_outcomes');
  for(const c of this.journal.all('candidates')){
   const o=observations.find(o=>o.candidate_id===c.id&&o.state==='TRIGGER_CONFIRMED'&&Number.isFinite(o.trigger_at)&&o.trigger_at===o.last_closed_bar_at&&o.decision_at<=now);
   if(!o||now-o.trigger_at<24*3600000||now-o.trigger_at>7*86400000||![24,72].some(h=>now-o.trigger_at>=h*3600000&&!done.some(r=>r.candidate_id===c.id&&r.horizon_ms===h*3600000)))continue;
   const instrument=c.instrument,tf=c.timeframe;if(!instrument?.venue||!TFS.includes(tf))continue;const id=sha({instrument,tf}),prior=this.journal.get('outcome_polling',id);if(prior&&now-prior.checked_at<interval_ms)continue;
   tasks.set(id,{id,instrument,tf});
  }
  const results=[];for(const task of [...tasks.values()].slice(0,limit)){let record={...task,checked_at:now,state:'CHECKED'};try{const a=await this.analysis({...task.instrument,tf:task.tf,flow:false,limit:1500,at:now});record.analysis_id=a.analysis_id;}catch(e){record.state='FAILED';record.error=e.message;}this.journal.project('outcome_polling',task.id,record);results.push(record);}return results;
 }
 operations(config={}){
  const jobs=this.journal.all('jobs').sort((a,b)=>b.created_at-a.created_at).slice(0,20).map(j=>Object.fromEntries(['id','venue','market','state','created_at','decision_at','updated_at','requested','processed','stage_processed','success','failures','passed','missing','partial_symbols','timeframes'].map(k=>[k,j[k]??null])));
  return {as_of:this.now(),durable:this.journal.durable,storage:this.journal.kind||(this.journal.durable?'disk':'ephemeral'),scheduler:{enabled:config.enabled===true&&this.journal.durable,requested:config.enabled===true,interval_ms:config.interval_ms||3600000,venues:config.venues||[],volume_cut:config.volume_cut===true,next_slot_at:config.enabled&&this.journal.durable?(Math.floor(this.now()/(config.interval_ms||3600000))+1)*(config.interval_ms||3600000):null},worker:this.journal.get('runtime','worker'),jobs,runs:this.journal.all('scheduled_runs').sort((a,b)=>b.known_at-a.known_at).slice(0,10),polling:this.journal.all('outcome_polling').sort((a,b)=>b.checked_at-a.checked_at).slice(0,10),candidate_count:this.journal.all('candidates').length,outcome_count:this.journal.all('research_outcomes').length};
 }
 async backgroundCycle(config={}){
  if(!this.journal.durable)throw Error('Durable storage required for background worker');const now=this.now(),prior=this.journal.get('runtime','worker');
  if(!prior||now-prior.last_tick_at>=60000)this.journal.project('runtime','worker',{last_tick_at:now,scheduler_enabled:config.enabled===true});
  if((await this.scheduleScans({...config,limit:1})).length)return;
  if((await this.pollOutcomes({limit:1})).length)return;
  return this.tick();
 }
 async tick(){const job=this.journal.all('jobs').filter(j=>['QUEUED','RUNNING'].includes(j.state)&&!j.cancel_requested).sort((a,b)=>a.updated_at-b.updated_at)[0];if(job)return this.stepJob(job.id);return null;}
}
module.exports={Service,TFS,sha};
