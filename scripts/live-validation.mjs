import {writeFile,mkdir} from 'node:fs/promises';
import {MemoryStore} from '../tests/memory-store.mjs';
import {Binance} from '../lib/scanner/binance.mjs';
import {createJob,stepJob,publicJob} from '../lib/scanner/engine.mjs';
const store=new MemoryStore();await mkdir('outputs',{recursive:true});
const prefix=process.argv[2]||'live';
for(const kind of (process.argv.includes('--scan-only')?['scan']:['scan','sample'])){const j=await createJob(store,kind,{top:20});let steps=0;console.log('START',kind,j.id);
 while(j.status==='running'&&steps++<300){await stepJob(store,new Binance(store),j.id);console.log(JSON.stringify({kind,stage:j.stage,cursor:j.cursor,status:j.status,counts:j.counts,ms:Date.now()-j.createdAt,requests:j.metrics.requests,errors:j.errors.slice(-1)}));await writeFile('outputs/'+prefix+'-'+kind+'.json',JSON.stringify(publicJob(j),null,2));if(j.status==='paused')break;}
 console.log('FINISH',kind,j.status,j.metrics,j.timings);}
await writeFile('outputs/'+prefix+'-samples.json',JSON.stringify(await store.samples(),null,2));
