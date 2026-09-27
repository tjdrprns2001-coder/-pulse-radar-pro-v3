import {TF,analyze,rank,classify,vector,similarity,pct,resample3h} from './indicators.mjs';
import {pool} from './binance.mjs';
export const DEFAULTS={maxChange:10,minVolume:10000000,minOi:1,top:30};
export function options(input={}){const o={...DEFAULTS};for(const [k,lo,hi] of [['maxChange',1,20],['minVolume',1000000,1000000000],['minOi',0,10],['top',20,40]]){if(input[k]!=null){const n=Number(input[k]);if(!Number.isFinite(n)||n<lo||n>hi)throw new Error(`${k} 범위 ${lo}~${hi}`);o[k]=k==='top'?Math.round(n):n;}}return o;}
export async function createJob(store,kind,input){const previous=await store.latest(kind);if(previous&&['running','paused'].includes(previous.status)&&Date.now()-previous.updatedAt<900000)return previous;
 if(!await store.gate('create:'+kind,30000))throw new Error('새 작업은 30초 간격으로 시작할 수 있습니다.');
 const job={id:crypto.randomUUID(),kind,status:'running',stage:'universe',createdAt:Date.now(),updatedAt:Date.now(),asOf:null,config:options(input),counts:{universe:0,filtered:0,oi:0,prescan:0,candidates:0,deep:0},cursor:0,rows:[],candidates:[],errors:[],excluded:[],metrics:{requests:0,hits:0,errors:0,weight:0,failovers:0},timings:{},samplesAdded:0};await store.save(job);return job;}
function error(job,symbol,stage,r){job.errors.push({symbol,stage,message:r.error});if(job.errors.length>150)job.errors.shift();if(r.status===429){job.status='paused';job.retryAt=r.retryAt;}}
function sumMetrics(job,api){for(const k of ['requests','hits','errors','failovers'])job.metrics[k]=(job.metrics[k]||0)+(api.metrics[k]||0);job.metrics.weight=Math.max(job.metrics.weight,api.metrics.weight);}
function matches(row,samples){const a=vector(row.frames?.['1h'],row.oi?.change4h);return samples.filter(s=>s.cutoff<row.asOf&&s.symbol!==row.symbol).map(s=>({id:s.id,symbol:s.symbol,cutoff:s.cutoff,outcome:s.outcome,...similarity(a,s.features)})).filter(x=>x.score!=null).sort((a,b)=>b.score-a.score).slice(0,3);}
export async function stepJob(store,api,id){if(!await store.acquire(id))return {busy:true};let j;const start=Date.now();let stage;try{
 j=await store.job(id);if(!j)throw new Error('작업 없음');if(['complete','failed','cancelled'].includes(j.status))return j;
 if(j.status==='paused'&&j.retryAt>Date.now())return j;j.status='running';stage=j.stage;
 if(j.stage==='universe'){
 const u=await api.universe();j.asOf=u.asOf;j.counts.universe=u.rows.length;
 if(j.kind==='sample'){j.rows=u.rows.filter(r=>r.change>=10&&r.quoteVolume>=j.config.minVolume).sort((a,b)=>b.change-a.change).slice(0,12);j.counts.filtered=j.rows.length;j.stage='sample';}
 else {j.rows=u.rows.filter(r=>r.change!=null&&Math.abs(r.change)<=j.config.maxChange&&r.quoteVolume>=j.config.minVolume);j.counts.filtered=j.rows.length;j.stage='oi';}
 }
 else if(j.stage==='oi'){
 const batch=j.rows.slice(j.cursor,j.cursor+80),results=await pool(batch,16,r=>api.oi(r.symbol,j.asOf));let rateLimited=false;
 results.forEach((r,i)=>{const row=batch[i];if(r.ok){row.oi=r.value;if(r.value.change4h!=null&&r.value.change4h>j.config.minOi)row.oiPassed=true;else j.excluded.push({symbol:row.symbol,reason:r.value.change4h==null?'OI N/A':'OI 기준 미달'});}else {error(j,row.symbol,'oi',r);if(r.status===429)rateLimited=true;else j.excluded.push({symbol:row.symbol,reason:r.error});}});
 if(!rateLimited)j.cursor+=batch.length;j.counts.oi=j.rows.filter(r=>r.oiPassed).length;
 if(j.cursor>=j.rows.length){j.rows=j.rows.filter(r=>r.oiPassed);j.cursor=0;j.stage='prescan';}
 }
 else if(j.stage==='prescan'){
 const batch=j.rows.slice(j.cursor,j.cursor+8),results=await pool(batch,4,async row=>{const bars=await Promise.all([api.bars(row.symbol,'1h',j.asOf,149),api.bars(row.symbol,'4h',j.asOf,149)]);const h=analyze(bars[0],{fast:true}),q=analyze(bars[1],{fast:true});return {...row,asOf:j.asOf,frames:{'1h':h,'4h':q},score:rank(h,q,row.oi.change4h),status:'점화전',reasons:['프리스캔 · 정밀검사 대기'],detailComplete:false};});let limited=false;
 results.forEach((r,i)=>{if(r.ok){Object.assign(batch[i],r.value);}else{error(j,batch[i].symbol,'prescan',r);if(r.status===429)limited=true;}});if(!limited)j.cursor+=batch.length;j.counts.prescan=j.rows.filter(x=>x.frames).length;
 if(j.cursor>=j.rows.length){j.candidates=j.rows.filter(x=>x.frames?.['1h']?.available&&x.frames?.['4h']?.available).sort((a,b)=>b.score-a.score).slice(0,j.config.top);j.counts.candidates=j.candidates.length;j.cursor=0;j.stage='deep';j.rows=[];}
 }
 else if(j.stage==='deep'){
 const batch=j.candidates.slice(j.cursor,j.cursor+3);const result=await pool(batch,3,row=>detailCandidate(row,j,store,api));let limited=false;
 result.forEach((r,i)=>{if(!r.ok){error(j,batch[i].symbol,'deep',r);if(r.status===429)limited=true;else Object.assign(batch[i],{status:'제외',reasons:['정밀 데이터 연결 실패'],detailComplete:false,errors:[r.error]});}});
 if(!limited)j.cursor+=batch.length;j.counts.deep=j.candidates.filter(r=>r.detailComplete).length;
 if(j.cursor>=j.candidates.length){j.stage='done';j.status='complete';}
 }
 else if(j.stage==='sample'){
 if(j.cursor>=j.rows.length){j.status='complete';j.stage='done';}
 else{const row=j.rows[j.cursor],bars=await api.bars(row.symbol,'1h',j.asOf,499);const samples=extractSamples(row.symbol,bars,j.asOf);for(const s of samples){try{s.oi=await api.oi(row.symbol,s.cutoff);s.features=vector(s.frame,s.oi.change4h);}catch(e){if(e.status===429)throw e;s.oi={change4h:null,reason:e.message};}await store.sample(s);j.samplesAdded++;}j.cursor++;if(j.cursor>=j.rows.length){j.status='complete';j.stage='done';}}
 }
 if(j.status==='complete'){j.finishedAt=Date.now();await store.cleanup();}
 }catch(e){if(j){j.errors.push({stage:j.stage,message:e.message});if(e.status===429){j.status='paused';j.retryAt=e.retryAt;}else{j.status='failed';}}else throw e;}
 finally{if(j){sumMetrics(j,api);if(stage)j.timings[stage]=(j.timings[stage]||0)+Date.now()-start;await store.save(j);}await store.release(id);}
 return j;
}
// A label uses FUTURE returns, features strictly end BEFORE the breakout bar.
// Labels are descriptive positive examples, never a calibrated win probability.
export function extractSamples(symbol,bars,asOf){const found=[];let lastEvent=-99;for(let i=Math.max(121,bars.length-30);i<bars.length-5;i++){
 if(i-lastEvent<12)continue;const before=bars.slice(0,i),frame=analyze(before),entry=bars[i-1].c,future=bars.slice(i,i+6),gain=pct(Math.max(...future.map(x=>x.h)),entry),breakout=pct(bars[i].c,entry),priorMax=Math.max(...bars.slice(i-6,i).map(x=>x.h));
 if(gain>=10&&breakout>=2&&bars[i].c>priorMax){const cutoff=bars[i].t;found.push({id:`${symbol}:${cutoff}:v1`,version:1,symbol,cutoff,createdAt:asOf,features:vector(frame),frame,outcome:{horizonHours:6,maxGain:gain,maxDrawdown:pct(Math.min(...future.map(x=>x.l)),entry),closeReturn:pct(future.at(-1).c,entry)},label:'6H +10% / 1H 돌파 +2%',source:'Binance futures closed 1H',oi:null});lastEvent=i;}}
 return found.slice(-2);
}
export function publicJob(j){if(!j)return null;const {rows,...rest}=j;return {...rest,partialData:j.errors.length>0||j.candidates.some(c=>c.detailComplete&&c.coverage<10),pending:rows.length,elapsedMs:(j.finishedAt||Date.now())-j.createdAt,freshnessMs:j.asOf?Date.now()-j.asOf:null,schemaVersion:'1.0',source:'Binance USDⓈ-M',scoreMeaning:'조건 합치도 (수익 확률 아님)'};}

async function detailCandidate(row,j,store,api){const frames={};const errors=[];
 // Shared 1H request yields both 1H and UTC-aligned 3H. Other TF requests are bounded.
 const hour=await api.bars(row.symbol,'1h',j.asOf,1499);
 const result=await pool(TF,4,async tf=>{const bars=tf==='1h'?hour:tf==='3h'?resample3h(hour,j.asOf):await api.bars(row.symbol,tf,j.asOf);return analyze(bars);});
 result.forEach((r,i)=>{frames[TF[i]]=r.ok?r.value:{available:false,reason:r.error};if(!r.ok){errors.push(TF[i]+': '+r.error);error(j,row.symbol,'deep '+TF[i],r);}});
 if(j.status==='paused')throw Object.assign(new Error('요청 제한'),{status:429,retryAt:j.retryAt});
 const derivatives=await pool(['taker','funding','spot'],3,async type=>{if(type==='taker')return api.taker(row.symbol,j.asOf);if(type==='funding')return api.funding(row.symbol,j.asOf);const map=await api.spotMap();const s=map.find(s=>s.symbol===row.symbol);if(!s)return {available:false,reason:'동일 심볼 현물 없음 (임의 배수 매핑 안 함)'};const b=await api.spot(row.symbol,j.asOf),z=b.at(-1),f=hour.at(-1),metric=analyze(b,{fast:true});if(!z||!f||z.end!==f.end)return {available:false,reason:'현물/선물 확정봉 시각 불일치'};return {available:true,price:z.c,futuresPrice:f.c,asOf:z.end,basisPct:pct(f.c,z.c),quoteVolume1h:z.q,futuresQuoteVolume1h:f.q,volumeRatio:z.q>0?f.q/z.q:null,change24h:pct(+s.lastPrice,+s.openPrice),rvol:metric.rvol,rsi:metric.rsi};});
 const [taker,funding,spot]=derivatives.map((r,i)=>{if(!r.ok){errors.push(['taker','funding','spot'][i]+': '+r.error);error(j,row.symbol,'crosscheck',r);}return r.ok?r.value:null;});if(j.status==='paused')throw Object.assign(new Error('요청 제한'),{status:429,retryAt:j.retryAt});
 if(taker?.ratio!=null&&frames['1h']?.available){taker.klineRatio=frames['1h'].takerKline;const intervalMatch=taker.asOf===hour.at(-1)?.t;taker.aligned=intervalMatch;taker.discrepancy=intervalMatch&&taker.klineRatio!=null?Math.abs(taker.ratio-taker.klineRatio):null;}
 Object.assign(row,{frames,taker,funding,spot,detailComplete:true,coverage:TF.filter(t=>frames[t]?.available).length,errors});Object.assign(row,classify(row));row.matches=matches(row,await store.samples());return row;
}
