const assert=require('assert');
const {createScanService,applySectorRotation}=require('../lib/coin-scan/scan-service.js');
const handler=require('../api/coin-scan.js');

function frame(base=100){return Array.from({length:60},(_,i)=>[0,String(base+i*.1),String(base+i*.1+1),String(base+i*.1-1),String(base+i*.1+.2),String(1000+i*10),Date.now()-1000,String((1000+i*10)*(base+i*.1)),10,'550',String((1000+i*10)*(base+i*.1)*.56),0])}
const exchangeInfo={symbols:Array.from({length:45},(_,i)=>({symbol:`C${i}USDT`,baseAsset:`C${i}`,quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true}))};
const tickers=exchangeInfo.symbols.map((s,i)=>({symbol:s.symbol,lastPrice:'1',quoteVolume:String(10000000+i),priceChangePercent:String(i===0?30:2)}));
let deepCalls=[];
const provider={
  failAll:false,
  async getUniverse(){if(this.failAll)throw new Error('upstream down');return exchangeInfo},
  async getTickers(){if(this.failAll)throw new Error('upstream down');return tickers},
  async scanDeepCandidates(symbols,intervals){deepCalls.push(symbols.slice());const results={},errors=[];for(const s of symbols){if(s==='C1USDT'){errors.push({symbol:s,interval:'1h',error:'boom'});continue}if(s==='C2USDT'){const partial=intervals.filter(tf=>tf!=='5m');results[s]=Object.fromEntries(partial.map(tf=>[tf,frame()]));errors.push({symbol:s,interval:'5m',error:'partial'});continue}results[s]=Object.fromEntries(intervals.map(tf=>[tf,frame()]))}return{results,errors,contexts:{}}}
};
(async()=>{
  const rotated=applySectorRotation([
    {symbol:'LEADERUSDT',sector:'AI',dataState:'live',priceChange24h:8,scanClass:{key:'POST-SURGE'},reasons:[],structure:'bullish',summary:''},
    {symbol:'LAGUSDT',sector:'AI',dataState:'live',priceChange24h:2,scanClass:{key:'ANOMALY'},reasons:[],structure:'neutral',summary:''},
    {symbol:'OTHERUSDT',sector:'RWA',dataState:'live',priceChange24h:1,scanClass:{key:'ANOMALY'},reasons:[],structure:'neutral',summary:''}
  ]);
  assert.equal(rotated.find(x=>x.symbol==='LAGUSDT').scanClass.key,'SECTOR-ROTATION','same-sector laggard should become sector rotation');
  assert.equal(rotated.find(x=>x.symbol==='OTHERUSDT').scanClass.key,'ANOMALY','unrelated sector must not be relabeled');

  const service=createScanService({provider,now:()=>123456});
  deepCalls=[];
  const out=await service.run({mode:'summary',limit:100});
  assert.equal(out.status,'ok');
  assert.equal(out.scanCount,45);
  assert.equal(out.deepScanCount,0,'summary must not launch expensive 6TF deep scan');
  assert.equal(deepCalls.length,0,'summary path must stay fast');
  assert(Array.isArray(out.candidateSymbols)&&out.candidateSymbols.length>0,'summary returns candidate symbols for progressive enrichment');
  assert(out.categories&&typeof out.categories==='object');
  assert(out.scanClasses&&typeof out.scanClasses==='object','v2 scan class counts required');
  assert(out.dataHealth&&typeof out.dataHealth.live==='number');
  for(const x of out.items.slice(0,3)){
    for(const k of ['symbol','category','scanClass','sector','priority','dataState','reasons','tfState','summary','updatedAt','tradeSignal'])assert(Object.prototype.hasOwnProperty.call(x,k),`${k} required`);
    assert(x.scanClass&&typeof x.scanClass.key==='string','scanClass key required');
    assert(typeof x.scanClass.label==='string'&&x.scanClass.label.length>0,'Korean scanClass label required');
    assert(['매수 후보','관찰','제외'].includes(x.tradeSignal.level));
    assert(Number.isFinite(x.tradeSignal.confidence));
    assert(Array.isArray(x.tradeSignal.reasons));
    assert(Array.isArray(x.tradeSignal.invalidations));
  }

  deepCalls=[];
  const deep=await service.run({mode:'deep',symbols:['C0USDT','C1USDT','C2USDT'],limit:10});
  assert.equal(deep.scanCount,45);
  assert.equal(deep.deepScanCount,3);
  assert.equal(deepCalls.length,1);
  assert.deepEqual(deepCalls[0],['C0USDT','C1USDT','C2USDT']);
  for(const sym of ['C1USDT','C2USDT']){const failed=deep.items.find(x=>x.symbol===sym);assert(failed&&failed.category==='데이터 부족·판정 보류',`${sym} partial/missing TF must block`);assert.equal(failed.scanClass.key,'STALE',`${sym} failed data must map to STALE`);assert.equal(failed.tradeSignal.level,'제외',`${sym} blocked data cannot become a trade candidate`)}
  assert(deep.items.find(x=>x.symbol==='C0USDT'),'deep mode returns requested symbol');

  const cat=out.items[0]?.category;
  if(cat){const f=await service.run({mode:'summary',category:cat,limit:10});assert(f.items.every(x=>x.category===cat))}
  const sector=out.items.find(x=>x.sector)?.sector;
  if(sector){const f=await service.run({mode:'summary',sector,limit:10});assert(f.items.every(x=>x.sector===sector))}
  assert((await service.run({mode:'summary',limit:3})).items.length<=3);

  provider.failAll=true;
  const fallback=await service.run({mode:'summary',limit:100});
  assert.equal(fallback.partial,true);
  assert(fallback.items.every(x=>x.dataState==='delayed'));
  assert(fallback.items.every(x=>x.scanClass?.key==='STALE'),'delayed fallback must map to STALE');
  assert(!fallback.items.some(x=>x.category==='급등 전조 강함'),'delayed fallback cannot stay strong');
  assert(fallback.items.every(x=>x.tradeSignal?.level==='제외'),'delayed fallback cannot expose buy candidates');
  provider.failAll=false;

  const req={query:{mode:'deep',symbols:'C0USDT,C3USDT',limit:'2'}};let code=0,body=null,headers={};
  const res={setHeader(k,v){headers[k]=v},status(n){code=n;return this},json(v){body=v;return v}};
  await handler(req,res,{service});
  assert.equal(code,200);assert.equal(body.status,'ok');assert.equal(body.deepScanCount,2);assert(String(headers['Cache-Control']).includes('stale-while-revalidate'));
  console.log('coin scan api PASS');
})().catch(e=>{console.error(e);process.exit(1)});
