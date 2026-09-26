import {env} from 'cloudflare:workers';
import {Store} from './store.mjs';
import {Binance} from './binance.mjs';
import {createJob,stepJob,publicJob} from './engine.mjs';
const ORIGINS=['https://pulseradar-pro-unified-0926.onrender.com'];
function output(data:unknown,status=200,origin:string|null=null){const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};if(origin&&ORIGINS.includes(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Methods']='GET, OPTIONS';}return new Response(JSON.stringify(data),{status,headers});}
export async function handle(request:Request){const url=new URL(request.url),path=url.pathname.replace(/^\/api\/v1\/?/,'').split('/').filter(Boolean),origin=request.headers.get('origin');if(request.method==='OPTIONS')return output({},200,origin);
 if(request.method==='POST'&&origin&&origin!==url.origin)return output({error:'교차 출처 실행 요청 차단'},403,origin);
 try{if(!env.DB)throw new Error('검색기 저장소 연결 불가');const store=new Store(env.DB);
 if(request.method==='GET'){
 if(path[0]==='health')return output({ok:true,version:'1.0',provider:'Binance',clock:Date.now()},200,origin);
 if(path[0]==='samples')return output({samples:await store.samples()},200,origin);
 if(path[0]==='results'){const j=await store.latest('scan');if(!j)return output({schemaVersion:'1.0',status:'empty',candidates:[]},200,origin);const p=publicJob(j);return output(p,200,origin);}
 if(path[0]==='jobs'&&path[1]){const j=await store.job(path[1]);return output(j?publicJob(j):{error:'작업을 찾을 수 없습니다.'},j?200:404,origin);}
 }
 if(request.method==='POST'){
 if(path[0]==='scans'||path[0]==='samples'&&path[1]==='collect'){let body={};try{body=await request.json();}catch{}const j=await createJob(store,path[0]==='scans'?'scan':'sample',body);return output(publicJob(j),202,origin);}
 if(path[0]==='jobs'&&path[1]&&path[2]==='step'){const j=await store.job(path[1]);if(!j)return output({error:'작업 없음'},404,origin);const next=await stepJob(store,new Binance(store),j.id);return output(next?.busy?{busy:true}:publicJob(next),200,origin);}
 if(path[0]==='jobs'&&path[1]&&path[2]==='cancel'){if(!await store.acquire(path[1]))return output({error:'진행 중인 배치가 끝난 후 다시 시도하세요.'},409,origin);try{const j=await store.job(path[1]);if(!j)return output({error:'작업 없음'},404,origin);j.status='cancelled';await store.save(j);return output(publicJob(j),200,origin);}finally{await store.release(path[1]);}}
 }
 return output({error:'지원하지 않는 경로'},404,origin);
 }catch(e){return output({error:e instanceof Error?e.message:'검색기 오류'},503,origin);}}
