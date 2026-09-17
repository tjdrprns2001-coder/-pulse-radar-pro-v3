const assert=require('assert');
const {createScanService}=require('../lib/coin-scan/scan-service.js');
const handler=require('../api/coin-scan.js');

function frame(base=100){return Array.from({length:60},(_,i)=>[0,String(base+i*.1),String(base+i*.1+1),String(base+i*.1-1),String(base+i*.1+.2),String(1000+i*10),Date.now()-1000,String((1000+i*10)*(base+i*.1)),10,'550',String((1000+i*10)*(base+i*.1)*.56),0])}
const exchangeInfo={symbols:Array.from({length:45},(_,i)=>({symbol:`C${i}USDT`,baseAsset:`C${i}`,quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true}))};
const tickers=exchangeInfo.symbols.map((s,i)=>({symbol:s.symbol,lastPrice:'1',quoteVolume:String(10000000+i),priceChangePercent:String(i===0?30:2)}));
const provider={
  failAll:false,
  async getUniverse(){if(this.failAll)throw new Error('upstream down');return exchangeInfo},
  async getTickers(){if(this.failAll)throw new Error('upstream down');return tickers},
  async scanDeepCandidates(symbols,intervals){const results={},errors=[];for(const s of symbols){if(s==='C1USDT'){errors.push({symbol:s,interval:'1h',error:'boom'});continue}if(s==='C2USDT'){const partial=intervals.filter(tf=>tf!=='5m');results[s]=Object.fromEntries(partial.map(tf=>[tf,frame()]));errors.push({symbol:s,interval:'5m',error:'partial'});continue}results[s]=Object.fromEntries(intervals.map(tf=>[tf,frame()]))}return{results,errors,contexts:{}}}
};
(async()=>{
  const service=createScanService({provider,now:()=>123456});
  const out=await service.run({limit:100});
  assert.equal(out.status,'ok');
  assert.equal(out.scanCount,45);
  assert(out.deepScanCount<=40);
  assert.equal(out.partial,true);
  assert(out.categories&&typeof out.categories==='object');
  assert(out.dataHealth&&typeof out.dataHealth.live==='number');
  for(const sym of ['C1USDT','C2USDT']){const failed=out.items.find(x=>x.symbol===sym);assert(failed&&failed.category==='데이터 부족·판정 보류',`${sym} partial/missing TF must block`)}
  for(const x of out.items.slice(0,3))for(const k of ['symbol','category','sector','priority','dataState','reasons','tfState','summary','updatedAt'])assert(Object.prototype.hasOwnProperty.call(x,k),`${k} required`);
  const cat=out.items[0]?.category;
  if(cat){const f=await service.run({category:cat,limit:10});assert(f.items.every(x=>x.category===cat))}
  const sector=out.items.find(x=>x.sector)?.sector;
  if(sector){const f=await service.run({sector,limit:10});assert(f.items.every(x=>x.sector===sector))}
  assert((await service.run({limit:3})).items.length<=3);

  provider.failAll=true;
  const fallback=await service.run({limit:100});
  assert.equal(fallback.partial,true);
  assert(fallback.items.every(x=>x.dataState==='delayed'));
  assert(!fallback.items.some(x=>x.category==='급등 전조 강함'),'delayed fallback cannot stay strong');
  provider.failAll=false;

  const req={query:{limit:'2'}};let code=0,body=null,headers={};
  const res={setHeader(k,v){headers[k]=v},status(n){code=n;return this},json(v){body=v;return v}};
  await handler(req,res,{service});
  assert.equal(code,200);assert.equal(body.status,'ok');assert(String(headers['Cache-Control']).includes('stale-while-revalidate'));
  console.log('coin scan api PASS');
})().catch(e=>{console.error(e);process.exit(1)});
