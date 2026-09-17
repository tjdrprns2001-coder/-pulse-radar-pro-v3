const assert=require('assert');
const {createScanService}=require('../lib/coin-scan/scan-service.js');
const api=require('../api/coin-scan.js');
const mk=(open,close,vol,buy=.6)=>[0,String(open),String(close*1.01),String(open*.99),String(close),String(vol),0,String(vol*close),10,String(vol*buy),String(vol*close*buy),0];
const up=Array.from({length:90},(_,i)=>mk(100+i,101+i,1000+i*20,.65));
const frames={'1w':up,'1d':up,'4h':up,'1h':up,'15m':up,'5m':up};
const exchangeInfo={symbols:[
 {symbol:'XLMUSDT',baseAsset:'XLM',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true},
 {symbol:'PEPEUSDT',baseAsset:'PEPE',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true},
 {symbol:'BADUSDT',baseAsset:'BAD',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true}
]};
const tickers=[
 {symbol:'XLMUSDT',priceChangePercent:'2',quoteVolume:'1000000',lastPrice:'1'},
 {symbol:'PEPEUSDT',priceChangePercent:'22',quoteVolume:'1000000',lastPrice:'1'},
 {symbol:'BADUSDT',priceChangePercent:'1',quoteVolume:'1000000',lastPrice:'1'}
];
const provider={getUniverse:async()=>exchangeInfo,getTickers:async()=>tickers,scanDeepCandidates:async syms=>({results:Object.fromEntries(syms.filter(s=>s!=='BADUSDT').map(s=>[s,frames])),errors:syms.includes('BADUSDT')?[{symbol:'BADUSDT',interval:'1h',error:'boom'}]:[]})};
(async()=>{
 const svc=createScanService({provider,now:()=>12345});
 const out=await svc.run({limit:100});
 assert.equal(out.status,'ok');assert.equal(out.scanCount,3);assert(out.deepScanCount<=40);assert.equal(out.partial,true);
 const bad=out.items.find(x=>x.symbol==='BADUSDT');assert(bad);assert.equal(bad.category,'데이터 부족·판정 보류');
 const pepe=out.items.find(x=>x.symbol==='PEPEUSDT');assert.equal(pepe.category,'이미 급등함');
 for(const k of ['symbol','category','sector','priority','dataState','reasons','tfState','summary','updatedAt'])assert(k in out.items[0]);
 const filtered=await svc.run({sector:'MEME',limit:100});assert(filtered.items.every(x=>x.sector.includes('MEME')));
 let status=0,payload,headers={};const req={query:{limit:'2'}};const res={setHeader:(k,v)=>headers[k]=v,status(c){status=c;return this},json(v){payload=v;return v}};
 await api(req,res,{service:svc});assert.equal(status||200,200);assert.equal(payload.status,'ok');assert(headers['Cache-Control'].includes('s-maxage=15'));
 console.log('coin scan api PASS');
})().catch(e=>{console.error(e);process.exit(1)});
