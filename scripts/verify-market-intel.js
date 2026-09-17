const assert=require('assert');

(async()=>{
  const {createCoinGeckoProvider}=require('../lib/market-intel/coingecko.js');
  const {createCoinMarketCapProvider}=require('../lib/market-intel/coinmarketcap.js');
  const {createMarketIntelService}=require('../lib/market-intel/service.js');
  const handler=require('../api/market-intel.js');

  let cgReq=[];
  const cgFetch=async(url,opts={})=>{cgReq.push({url,opts});const u=String(url);if(u.includes('/global'))return ok({data:{active_cryptocurrencies:10000,total_market_cap:{usd:2500000000000},total_volume:{usd:100000000000},market_cap_percentage:{btc:55}}});if(u.includes('/search/trending'))return ok({coins:[{item:{id:'bitcoin',symbol:'btc',name:'Bitcoin',market_cap_rank:1}}]});if(u.includes('/coins/categories'))return ok([{id:'artificial-intelligence',name:'Artificial Intelligence',market_cap:1000,market_cap_change_24h:5,volume_24h:200}]);if(u.includes('/search?'))return ok({coins:[{id:'bitcoin',symbol:'btc',name:'Bitcoin',market_cap_rank:1}]});if(u.includes('/coins/markets'))return ok([{id:'bitcoin',symbol:'btc',name:'Bitcoin',current_price:60000,market_cap:1200000000000,market_cap_rank:1,total_volume:40000000000,circulating_supply:19900000,total_supply:21000000,last_updated:'2026-09-18T00:00:00.000Z'}]);if(u.includes('/onchain/networks/trending_pools'))return ok({data:[{id:'eth_pool',attributes:{name:'AAA / WETH',address:'0x1',reserve_in_usd:'100000',volume_usd:{h24:'500000'}}}]});if(u.includes('/onchain/networks/new_pools'))return ok({data:[]});throw new Error('unexpected CG URL '+u)};
  const cg=createCoinGeckoProvider({apiKey:'CG-demo-secret',fetchImpl:cgFetch});
  const cgo=await cg.getOverview();assert.equal(cgo.global.totalMarketCapUsd,2500000000000);assert.equal(cgo.trending[0].symbol,'BTC');
  const cga=await cg.getAssetBySymbol('BTCUSDT');assert.equal(cga.symbol,'BTC');assert.equal(cga.priceUsd,60000);
  await cg.getDexDiscovery();
  assert(cgReq.every(x=>x.opts.headers['x-cg-demo-api-key']==='CG-demo-secret'));
  assert(cgReq.every(x=>!x.url.includes('CG-demo-secret')));
  assert(cgReq.every(x=>x.url.startsWith('https://api.coingecko.com/api/v3')));

  let cmcReq=[];
  const cmcFetch=async(url,opts={})=>{cmcReq.push({url,opts});if(String(url).includes('/listings/latest'))return ok({data:[{id:1,name:'Bitcoin',symbol:'BTC',cmc_rank:1,circulating_supply:19900000,total_supply:21000000,quote:{USD:{price:60100,volume_24h:41000000000,market_cap:1201000000000,last_updated:'2026-09-18T00:00:00.000Z'}}}]});if(String(url).includes('/quotes/latest'))return ok({data:{BTC:[{id:1,name:'Bitcoin',symbol:'BTC',cmc_rank:1,circulating_supply:19900000,total_supply:21000000,quote:{USD:{price:60100,volume_24h:41000000000,market_cap:1201000000000,last_updated:'2026-09-18T00:00:00.000Z'}}}]}});throw new Error('unexpected CMC URL')};
  const cmc=createCoinMarketCapProvider({apiKey:'cmc-secret',fetchImpl:cmcFetch});
  const cmca=await cmc.getAssetBySymbol('BTCUSDT');assert.equal(cmca.symbol,'BTC');assert.equal(cmca.priceUsd,60100);
  assert(cmcReq.every(x=>x.opts.headers['X-CMC_PRO_API_KEY']==='cmc-secret'));
  assert(cmcReq.every(x=>!x.url.includes('cmc-secret')));
  assert(cmcReq.every(x=>x.url.startsWith('https://pro-api.coinmarketcap.com')));

  let cgAssetCalls=0,cmcAssetCalls=0;
  const svc=createMarketIntelService({coinGecko:{available:true,getOverview:async()=>cgo,getAssetBySymbol:async()=>{cgAssetCalls++;return cga},getDexDiscovery:async()=>({pools:[]})},coinMarketCap:{available:true,getLatestListings:async()=>[cmca],getAssetBySymbol:async()=>{cmcAssetCalls++;return cmca}},cacheTtlMs:60000,now:()=>1000});
  const a1=await svc.getAsset('BTCUSDT'),a2=await svc.getAsset('BTCUSDT');assert.equal(a1.symbol,'BTCUSDT');assert(Math.abs(a1.crosscheck.priceDeltaPct)>0);assert.equal(cgAssetCalls,1);assert.equal(cmcAssetCalls,1);assert.deepEqual(a1,a2);
  const partial=createMarketIntelService({coinGecko:{available:false},coinMarketCap:{available:true,getLatestListings:async()=>[cmca],getAssetBySymbol:async()=>cmca},now:()=>1000});const po=await partial.getOverview();assert.equal(po.health.coinGecko,'unavailable');assert.equal(po.health.coinMarketCap,'live');

  const req={method:'GET',query:{mode:'asset',symbol:'BTCUSDT'}},res=mockRes();await handler(req,res,{service:svc});assert.equal(res.code,200);assert.equal(res.body.symbol,'BTCUSDT');assert(!JSON.stringify(res.body).includes('cmc-secret'));assert(!JSON.stringify(res.body).includes('CG-demo-secret'));
  const bad=mockRes();await handler({method:'GET',query:{mode:'asset',symbol:'bad!'}},bad,{service:svc});assert.equal(bad.code,400);
  const post=mockRes();await handler({method:'POST',query:{}},post,{service:svc});assert.equal(post.code,405);
  console.log('market intel PASS');
})().catch(e=>{console.error(e);process.exit(1)});

function ok(json){return{ok:true,status:200,json:async()=>json,text:async()=>JSON.stringify(json)}}
function mockRes(){return{code:0,body:null,headers:{},status(n){this.code=n;return this},json(v){this.body=v;return this},setHeader(k,v){this.headers[k]=v}}}
