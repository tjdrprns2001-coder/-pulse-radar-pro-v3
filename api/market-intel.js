'use strict';
const {createCoinGeckoProvider}=require('../lib/market-intel/coingecko.js');
const {createCoinMarketCapProvider}=require('../lib/market-intel/coinmarketcap.js');
const {createCoinGeckoMcpProvider,createCoinMarketCapMcpProvider}=require('../lib/market-intel/mcp-provider.js');
const {createMarketIntelService}=require('../lib/market-intel/service.js');
let singleton=null;
function defaultService(){if(!singleton)singleton=createMarketIntelService({coinGecko:createCoinGeckoProvider({}),coinMarketCap:createCoinMarketCapProvider({}),coinGeckoMcp:createCoinGeckoMcpProvider({}),coinMarketCapMcp:createCoinMarketCapMcpProvider({})});return singleton}
module.exports=async function handler(req,res,ctx={}){res.setHeader?.('Cache-Control','s-maxage=30, stale-while-revalidate=120');if(req?.method&&req.method!=='GET')return res.status(405).json({status:'error',error:'method not allowed'});const service=ctx.service||defaultService(),q=req?.query||{},mode=String(q.mode||'overview');try{if(mode==='asset')return res.status(200).json(await service.getAsset(q.symbol));if(mode==='dex')return res.status(200).json(await service.getDexDiscovery());if(mode==='overview')return res.status(200).json(await service.getOverview());return res.status(400).json({status:'error',error:'invalid mode'})}catch(e){return res.status(Number(e?.statusCode)||500).json({status:'error',error:String(e?.message||e)})}}
module.exports._defaultService=defaultService;
