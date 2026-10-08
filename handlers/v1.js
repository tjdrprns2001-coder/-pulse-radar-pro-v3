'use strict';
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {createChartV1Service}=require('../lib/chart-v1/service.js');
const {defaultChartRuntime}=require('../lib/chart-v1/runtime.js');

let singleton=null,providerSingleton=null;
function defaultService(){if(!singleton){providerSingleton=providerSingleton||createBinanceProvider({});const runtime=defaultChartRuntime({provider:providerSingleton});singleton=createChartV1Service({provider:providerSingleton,runtime})}return singleton}
function int(v,d,min,max){const n=Math.floor(Number(v));return Number.isFinite(n)?Math.max(min,Math.min(max,n)):d}
function bool(v,d=true){if(v==null)return d;return !['0','false','no','off'].includes(String(v).toLowerCase())}
function error(res,status,code,message,details={},req={}){
  const requestId=String(req?.headers?.['x-request-id']||req?.headers?.['X-Request-ID']||('req_'+Date.now().toString(36)));
  return res.status(status).json({error:{code,message,details,request_id:requestId}})
}
function pathOf(req){
  const direct=String(req?.query?.routePath||req?.query?.path||'').trim();
  if(direct)return direct.replace(/^\/+|\/+$/g,'');
  const p=String(req?.path||req?.url||'').split('?')[0];
  return p.replace(/^\/api\/v1\/?/,'').replace(/^\/+|\/+$/g,'')
}
function opts(q={}){
  return{timeframe:String(q.timeframe||q.tf||'4h').toLowerCase(),market:String(q.market||'spot').toLowerCase()==='perpetual'?'perpetual':'spot',visible:int(q.visible||q.visible_candles,500,50,1000),warmup:int(q.warmup||q.warmup_candles,300,0,1000),total:int(q.limit||q.total||q.total_candles,800,50,2000),priceBins:int(q.price_bins||q.bins,100,50,200)}
}
module.exports=async function handler(req,res,ctx={}){
  if(req?.method&&req.method!=='GET')return error(res,405,'INVALID_PARAMETER','Only GET is supported.',{},req);
  const service=ctx.service||defaultService(),q=req?.query||{},path=pathOf(req),parts=path.split('/').filter(Boolean).map(decodeURIComponent);
  try{
    if(!parts.length)return res.status(200).json({data:{version:'v1.1',endpoints:['assets','markets/{instrument_id}/candles','markets/{instrument_id}/open-interest','markets/{instrument_id}/funding','markets/{instrument_id}/liquidations','markets/{instrument_id}/orderbook-telemetry','assets/{asset_id}/analysis/structure','assets/{asset_id}/analysis/zones','assets/{asset_id}/analysis/overview','assets/{asset_id}/analysis/mtf','assets/{asset_id}/analysis/flow-ignition','assets/{asset_id}/alerts','assets/{asset_id}/replay','assets/{asset_id}/backtest','chart/{asset_id}','data-quality/{asset_id}','runtime/health'],websocket:'/ws/v1/market'}});
    if(parts[0]==='assets'&&parts.length===1)return res.status(200).json(await service.searchAssets(q.query||'',int(q.limit,20,1,100)));
    if(parts[0]==='assets'&&parts.length===2)return res.status(200).json(await service.getAsset(parts[1]));
    if(parts[0]==='assets'&&parts.length===3&&parts[2]==='markets')return res.status(200).json(await service.getMarkets(parts[1]));
    if(parts[0]==='assets'&&parts.length===4&&parts[2]==='analysis'){
      const o=opts(q);
      if(parts[3]==='flow-ignition')return res.status(200).json(await service.flowIgnition(parts[1],{timeframe:o.timeframe}));
      if(parts[3]==='mtf')return res.status(200).json(await service.mtf(parts[1]));
      if(parts[3]==='structure')return res.status(200).json(await service.structure(parts[1],o));
      if(parts[3]==='zones')return res.status(200).json(await service.zones(parts[1],o));
      if(parts[3]==='overview')return res.status(200).json(await service.overview(parts[1],o));
    }
    if(parts[0]==='markets'&&parts.length===3){
      const instrument=parts[1];
      if(parts[2]==='candles')return res.status(200).json(await service.getCandles(instrument,{...opts(q),includeWarmup:bool(q.include_warmup,true),before:q.before||null}));
      if(parts[2]==='open-interest')return res.status(200).json(await service.openInterest(instrument,opts(q)));
      if(parts[2]==='funding')return res.status(200).json(await service.funding(instrument));
      if(parts[2]==='liquidations')return res.status(200).json(await service.liquidations(instrument,{limit:int(q.limit,500,1,2000)}));
      if(parts[2]==='orderbook-telemetry')return res.status(200).json(await service.orderbookTelemetry(instrument));
    }
    if(parts[0]==='assets'&&parts.length===3&&parts[2]==='alerts')return res.status(200).json(await service.alerts(parts[1],{limit:int(q.limit,100,1,1000)}));
    if(parts[0]==='assets'&&parts.length===3&&parts[2]==='replay')return res.status(200).json(await service.replay(parts[1],{timeframe:String(q.timeframe||q.tf||'4h'),asOf:q.as_of||q.asOf||null,bars:int(q.bars||q.limit,800,100,1500),priceBins:int(q.price_bins||q.bins,100,50,200)}));
    if(parts[0]==='assets'&&parts.length===3&&parts[2]==='backtest')return res.status(200).json(await service.backtest(parts[1],{timeframe:String(q.timeframe||q.tf||'4h'),bars:int(q.bars||q.limit,1500,300,2000),horizonBars:int(q.horizon_bars||q.horizon,10,1,100),feeBps:Number(q.fee_bps??4),slippageBps:Number(q.slippage_bps??2)}));
    if(parts[0]==='runtime'&&parts[1]==='health')return res.status(200).json({data:await service.runtimeHealth(),meta:{as_of:Date.now()}});
    if(parts[0]==='chart'&&parts.length===2)return res.status(200).json(await service.chart(parts[1],opts(q)));
    if(parts[0]==='data-quality'&&parts.length===2)return res.status(200).json(await service.quality(parts[1],opts(q)));
    return error(res,404,'DATA_NOT_FOUND','Unknown v1 endpoint.',{path},req);
  }catch(e){
    const msg=String(e?.message||e),status=Number(e?.statusCode)||(/unsupported timeframe/i.test(msg)?400:/not found/i.test(msg)?404:/insufficient|unavailable/i.test(msg)?503:500);
    const code=status===400?/timeframe/i.test(msg)?'UNSUPPORTED_TIMEFRAME':'INVALID_PARAMETER':status===404?'ASSET_NOT_FOUND':status===503?'DATA_PARTIAL':'INTERNAL_ERROR';
    return error(res,status,code,msg,{path},req)
  }
};
