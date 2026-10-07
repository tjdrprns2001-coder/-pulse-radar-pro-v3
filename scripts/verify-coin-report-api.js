const assert=require('assert');
const {createCoinReportService}=require('../lib/coin-report/service.js');
const handler=require('../api/coin-report.js');
function frame(){const a=[];for(let i=0;i<260;i++){const c=10+i*.03;a.push([i,c-.01,c+.05,c-.05,c,100,i,1000,0,0,550])}return a}
(async()=>{
 const provider={
  async getKlines(s,tf){if(tf==='1w')throw new Error('partial');return frame()},
  async getDerivativesContext(){return{oiChangePct:1,fundingPct:.01}}
 };
 const gateway={available:false},service=createCoinReportService({provider,gateway,now:()=>123}),r=await service.getReport('AAAUSDT');
 assert.equal(r.symbol,'AAAUSDT');assert.equal(r.updatedAt,123);assert(r.dataWarnings.some(x=>x.includes('1w')));assert.equal(r.analysisPipeline.version,'COIN_ANALYSIS_PIPELINE_v1.0.0');assert(r.analysisPipeline.dataQuality.closedCandlesOnly);
 const news=await service.getNews('AAAUSDT',r);assert.equal(news.available,false);
 let code,body;const res={status(n){code=n;return this},json(v){body=v;return v}};
 await handler({method:'GET',query:{symbol:'AAAUSDT'}},res,{service});assert.equal(code,200);assert.equal(body.status,'ok');
 await handler({method:'GET',query:{symbol:'BAD'}},res,{service});assert.equal(code,400);

 let spotCalls=0,futuresCalls=0;
 const fallbackProvider={
  async getSpotKlines(){spotCalls++;throw new Error('spot blocked')},
  async getFuturesKlines(s,tf){futuresCalls++;const rows=frame();Object.defineProperty(rows,'_source',{value:'OKX_SWAP'});return rows},
  async getSpotTickers(){throw new Error('spot ticker blocked')},
  async getFuturesTickers(){return[
   {symbol:'DOGEUSDT',lastPrice:'0.1',priceChangePercent:'-2',quoteVolume:'1000000'},
   {symbol:'BTCUSDT',lastPrice:'60000',priceChangePercent:'-1'},
   {symbol:'ETHUSDT',lastPrice:'3000',priceChangePercent:'-1.5'}
  ]},
  async getDerivativesContext(){return{oiChangePct:-1,fundingPct:0}}
 };
 const fallbackService=createCoinReportService({provider:fallbackProvider,gateway,now:()=>300000000});
 const fr=await fallbackService.getReport('DOGEUSDT');
 assert.equal(fr.status,'ok');assert(spotCalls>=5);assert(futuresCalls>=5);
 assert.equal(fr.dataSources.frames['4h'],'OKX_SWAP');
 assert(fr.dataWarnings.some(x=>x.includes('대체 소스')));
 assert.equal(fr.professional.dataSources.frames['1h'],'OKX_SWAP');
 assert.equal(fr.professional.market.currentPrice,.1);assert.equal(fr.analysisPipeline.primaryTimeframe,'4h');assert(fr.analysisPipeline.dataQuality.missingFields.includes('orderbook_depth'));
 console.log('coin report api PASS');
})().catch(e=>{console.error(e);process.exit(1)});