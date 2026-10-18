'use strict';
const assert=require('node:assert/strict');
const {aggregateThreeDay,DAY,D3}=require('../lib/coin-scan/three-day-aggregation.js');
const nowMs=Date.UTC(2026,9,18,13),anchor=DAY;
function mock(days,mode='normal'){
 const today=Math.floor(nowMs/DAY)*DAY,all=[];
 for(let i=0;i<days;i++){const t=today-i*DAY,p=100+days-i;all.push([String(t),String(p),String(p+5),String(p-5),String(p+1),'10','1000'])}
 const calls=[];
 async function request(path){const q=new URLSearchParams(path.split('?')[1]),limit=Number(q.get('limit')),end=q.has('end')?Number(q.get('end')):Infinity;calls.push({limit,end});
 if(mode==='invalid')return{result:{list:'bad'}};
 if(mode==='empty'&&calls.length>1)return{result:{list:[]}};
 return{result:{list:(mode==='repeat'?all:all.filter(x=>Number(x[0])<=end)).slice(0,limit)}}}
 return{request,calls};
}
async function paginate(request,bars){
 const need=(bars+1)*3,daily=[];let end=null,requests=0,stop=null,previous=Infinity;
 while(daily.length<need&&requests<3){
  const limit=Math.min(1000,need-daily.length);requests++;
  const body=await request('/v5/market/kline?category=linear&symbol=BTCUSDT&interval=D&limit='+limit+(end!=null?'&end='+end:''));
  const list=body?.result?.list;
  if(!Array.isArray(list)){stop='INVALID_RESPONSE';break}
  if(!list.length){stop='EMPTY_PAGE';break}
  let earliest=Infinity;
  for(const x of list){const t=Number(x?.[0]);if(!Number.isFinite(t))continue;earliest=Math.min(earliest,t);daily.push([t,x[1],x[2],x[3],x[4],x[5],t+DAY-1,x[6]])}
  if(!Number.isFinite(earliest)){stop='INVALID_ROWS';break}
  if(earliest>=previous){stop='REPEATED_PAGE';break}
  previous=earliest;if(list.length<limit){stop='HISTORY_EXHAUSTED';break}end=earliest-1;
 }
 const out=aggregateThreeDay(daily,{asOf:nowMs,anchorMs:anchor}).rows.slice(-bars);
 return{out,requests,stop,daily};
}
(async()=>{
 let n=0;async function check(label,fn){await fn();n++;console.log('ok - '+label)}
 await check('420 bars two pages',async()=>{const m=mock(1500),r=await paginate(m.request,420);assert.equal(m.calls.length,2);assert.equal(r.requests,2);assert.equal(r.out.length,420);assert(r.out.every(x=>(x[0]-anchor)%D3===0&&x[0]+D3<=nowMs))});
 await check('30 bars one page',async()=>{const m=mock(1500),r=await paginate(m.request,30);assert.equal(m.calls.length,1);assert.equal(r.out.length,30)});
 await check('same trailing bars across limits',async()=>{const a=await paginate(mock(1500).request,30),b=await paginate(mock(1500).request,31);assert.deepEqual(a.out,b.out.slice(-30))});
 await check('short history',async()=>{const r=await paginate(mock(200).request,420);assert.equal(r.stop,'HISTORY_EXHAUSTED');assert(r.out.length<420&&r.out.length>=60)});
 await check('repeated page',async()=>{const r=await paginate(mock(1500,'repeat').request,420);assert.equal(r.stop,'REPEATED_PAGE')});
 await check('empty page',async()=>{const r=await paginate(mock(1500,'empty').request,420);assert.equal(r.stop,'EMPTY_PAGE')});
 await check('invalid response',async()=>{const r=await paginate(mock(1500,'invalid').request,30);assert.equal(r.stop,'INVALID_RESPONSE');assert.equal(r.out.length,0)});
 console.log(n+' mock pagination checks passed; this tests a standalone harness, NOT the provider integration');
})().catch(e=>{console.error(e);process.exitCode=1});
