const assert=require('assert');
const {createDerivativesCapabilityProvider,historyDeltas,normalizeFunding,statusFor,availabilityStatus}=require('../lib/coin-scan/derivatives-capability.js');
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');

function ok(body){return{ok:true,status:200,async json(){return body}}}
function bad(status=503){return{ok:false,status,async json(){return{}}}}
function mockFetch(url){
  url=String(url);
  if(url.includes('fapi.binance.com'))return Promise.resolve(bad(451));
  if(url.includes('bybit.com/v5/market/instruments-info'))return Promise.resolve(ok({retCode:0,result:{list:[{symbol:'DOGEUSDT',status:'Trading',quoteCoin:'USDT',contractType:'LinearPerpetual',fundingInterval:'480'}]}}));
  if(url.includes('bybit.com/v5/market/tickers'))return Promise.resolve(ok({retCode:0,result:{list:[{symbol:'DOGEUSDT',openInterest:'1000000',openInterestValue:'90000',lastPrice:'0.09',markPrice:'0.0901',fundingRate:'-0.0001',turnover24h:'10000000'}]}}));
  if(url.includes('bybit.com/v5/market/open-interest'))return Promise.resolve(ok({retCode:0,result:{list:Array.from({length:25},(_,i)=>({timestamp:String(1000000+i*3600000),openInterest:String(800000+i*10000)})).reverse()}}));
  if(url.includes('okx.com/api/v5/public/instruments'))return Promise.resolve(ok({code:'0',data:[{instId:'DOGE-USDT-SWAP',state:'live',ctVal:'10',ctValCcy:'DOGE'}]}));
  if(url.includes('okx.com/api/v5/public/open-interest'))return Promise.resolve(ok({code:'0',data:[]}));
  if(url.includes('okx.com/api/v5/public/funding-rate'))return Promise.resolve(ok({code:'0',data:[]}));
  if(url.includes('okx.com/api/v5/market/ticker'))return Promise.resolve(ok({code:'0',data:[]}));
  if(url.includes('gateio.ws/api/v4/futures/usdt/contracts/'))return Promise.resolve(bad(404));
  throw new Error('unexpected url '+url)
}
(async()=>{
  const d=historyDeltas([
    {timestamp:0,openInterest:100},{timestamp:3600000,openInterest:110},{timestamp:4*3600000,openInterest:120},{timestamp:24*3600000,openInterest:150}
  ]);
  assert(Number.isFinite(d.oi1hPct));assert(Number.isFinite(d.oi4hPct));assert(Number.isFinite(d.oi24hPct));
  const f=normalizeFunding(.0001,8);assert.equal(f.fundingRatePct,.01);assert.equal(f.funding8hEquivalentPct,.01);
  assert.equal(statusFor({supported:true,openInterest:null,fundingRatePct:null}),'provider_data_unavailable');
  assert.equal(availabilityStatus({derivativesSupported:true,dataAvailable:false,status:'provider_data_unavailable'}),'supported_but_empty');
  assert.equal(availabilityStatus({derivativesSupported:false,dataAvailable:false,status:'unsupported'}),'not_supported');

  const p=createDerivativesCapabilityProvider({fetchImpl:mockFetch,now:()=>99999999,timeoutMs:1000});
  const r=await p.probe('DOGEUSDT');
  assert.equal(r.derivativesSupported,true);
  assert.equal(r.dataAvailable,true);
  assert.equal(r.status,'partial_venue_data');
  assert.equal(r.availabilityStatus,'partial');
  assert(r.supportedVenues.includes('BYBIT'));
  assert(r.supportedVenues.includes('OKX'));
  assert(r.dataVenues.includes('BYBIT'));
  assert(!r.dataVenues.includes('OKX'));
  const bybit=r.venues.find(x=>x.venue==='BYBIT'),okx=r.venues.find(x=>x.venue==='OKX'),gate=r.venues.find(x=>x.venue==='GATE');
  assert.equal(bybit.status,'data_normal');
  assert.equal(okx.status,'provider_data_unavailable');
  assert.equal(gate.status,'unsupported');
  assert.equal(bybit.openInterestUsd,90000);
  assert.equal(bybit.fundingRatePct,-.01);
  assert.equal(bybit.fundingIntervalHours,8);
  assert.equal(r.estimated,false);

  const many=await p.probeMany(['DOGEUSDT','DOGEUSDT'],{concurrency:2});
  assert.equal(many.length,1);
  const provider=createBinanceProvider({fetchImpl:mockFetch,crossOiProvider:{async getProfile(){return{}}},futuresBases:['https://fapi.binance.com']});
  const reportDeriv=await provider.getCoinReportDerivatives('DOGEUSDT');
  assert.equal(reportDeriv.fundingPct,-.01,'representative funding must come from a venue that actually returned funding');
  assert.equal(reportDeriv.fundingIntervalHours,8);
  assert.equal(reportDeriv.openInterest,1000000,'representative OI must come from a venue that actually returned current OI');
  assert.equal(reportDeriv.representativeSources.funding,'BYBIT');
  assert.equal(reportDeriv.representativeSources.openInterest,'BYBIT');
  assert.equal(reportDeriv.source,'multi-venue derivatives');
  assert.equal(reportDeriv.availabilityStatus,'partial');
  console.log('derivatives capability PASS');
})().catch(e=>{console.error(e);process.exit(1)});
