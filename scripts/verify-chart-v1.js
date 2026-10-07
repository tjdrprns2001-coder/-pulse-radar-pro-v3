const assert=require('assert');
const {createChartV1Service,profileFor}=require('../lib/chart-v1/service.js');

const STEP=4*60*60*1000;
const NOW=1800000000000;
function allRows(){
  const rows=[];
  const start=NOW-1200*STEP;
  for(let i=0;i<1200;i++){
    const t=start+i*STEP,c=0.08+i*.00001+Math.sin(i/11)*.001,o=c-Math.sin(i/7)*.0002,h=Math.max(o,c)+.0005,l=Math.min(o,c)-.0005,v=1000000+(i%23)*50000;
    rows.push([t,o,h,l,c,v,t+STEP-1,v*c,1000,0,v*c*.55]);
  }
  const liveOpen=NOW,liveClose=NOW+STEP-1;
  rows.push([liveOpen,.092,.093,.0915,.0925,1234567,liveClose,113000,100,0,62000]);
  return rows;
}
const master=allRows();
function rowsWithSource(rows,src='SPOT_MOCK'){const x=rows.map(r=>r.slice());Object.defineProperty(x,'_source',{value:src,enumerable:false});return x}
const oiRows=Array.from({length:25},(_,i)=>({timestamp:NOW-(24-i)*3600000,sumOpenInterest:String(1000000+i*1000),_fallbackSource:'BYBIT_LINEAR'}));
const provider={
  async getSpotKlines(_s,_tf,n){return rowsWithSource(master.slice(-n),'SPOT_MOCK')},
  async getFuturesKlines(_s,_tf,n){return rowsWithSource(master.slice(-n),'BYBIT_LINEAR')},
  async getKlines(_s,_tf,n){return rowsWithSource(master.slice(-n),'AUTO_MOCK')},
  async getKlinesAt(_s,_tf,{endTime,rows}){return rowsWithSource(master.filter(r=>r[0]<=endTime).slice(-rows),'HISTORY_MOCK')},
  async getSpotUniverse(){return{symbols:[{symbol:'DOGEUSDT',baseAsset:'DOGE',quoteAsset:'USDT',status:'TRADING'}]}},
  async getDerivativesSupportUniverse(){return{count:2,items:[{symbol:'1000000BABYDOGEUSDT',baseAsset:'1000000BABYDOGE',supportedVenues:['BYBIT']},{symbol:'DOGEUSDT',baseAsset:'DOGE',supportedVenues:['BYBIT']}],errors:[]}},
  async getCoinReportDerivatives(){return{derivativesSupported:true,dataAvailable:true,status:'data_normal',availabilityStatus:'available',supportedVenues:['BYBIT'],dataVenues:['BYBIT'],openInterest:1024000,openInterestUsd:95000,fundingPct:.005,funding8hPct:.005,fundingIntervalHours:8,capability:{aggregate:{openInterestUsd:95000,oi1hPct:.2,oi4hPct:.7,oi24hPct:2.5,funding8hPct:.005}},v2Profile:{rows:oiRows,oi1hPct:.2,oi4hPct:.7,oi24hPct:2.5},representativeSources:{funding:'BYBIT',openInterest:'BYBIT'}}},
  async getExecutionContext(){return{futures:{available:true,venue:'BYBIT',bid:.0924,ask:.0926,mid:.0925,spreadBps:2.16,depthUsd:{bid10bps:200000,ask10bps:180000,bid25bps:500000,ask25bps:450000},slippage:{}}}},
  async getV2OiProfile(){return{rows:oiRows,oi1hPct:.2,oi4hPct:.7,oi24hPct:2.5}},
  async getFundingHistory(){return Array.from({length:10},(_,i)=>({time:NOW-(9-i)*8*3600000,ratePct:(i%2?.004:.006),source:'BYBIT'}))}
};
(async()=>{
  assert.equal(profileFor('4h',{total:99999}).total,2000);
  const service=createChartV1Service({provider,now:()=>NOW+STEP/2});
  const assets=await service.searchAssets('DOGE',20);assert.equal(assets.data[0].asset_id,'asset:DOGE','exact symbol must rank before BABYDOGE-style partial matches');
  const markets=await service.getMarkets('DOGE');assert(markets.data.some(x=>x.instrument_id==='spot:DOGEUSDT'));assert(markets.data.some(x=>x.instrument_id==='perp:DOGEUSDT'));
  const candles=await service.getCandles('spot:DOGEUSDT',{timeframe:'4h',limit:800,visible:500,warmup:300,includeWarmup:true});
  assert.equal(candles.data.candles.length,800);assert.equal(candles.data.visible_range.count,500);assert.equal(candles.data.warmup_range.count,300);
  const chart=await service.chart('DOGE',{timeframe:'4h',visible:500,warmup:300,total:800,priceBins:100});
  assert.equal(chart.chart.total_candle_count,800);assert.equal(chart.chart.visible_candle_count,500);assert.equal(chart.chart.warmup_candle_count,300);assert.equal(chart.chart.max_candle_count,2000);
  assert(chart.current_candle&&chart.current_candle.is_closed===false);assert.equal(chart.data_quality.current_candle_closed,false);assert.equal(chart.data_quality.repaint_state,'provisional');
  assert.equal(chart.volume_profile.precision,'estimated');assert(chart.volume_profile.nodes.length>=50&&chart.volume_profile.nodes.length<=200);
  assert(chart.indicators.ema200.length>0);assert(chart.open_interest.series.length>0);assert.equal(chart.open_interest.status,'available');assert(chart.funding.series.length>0);assert.equal(chart.liquidations.status,'unavailable');
  assert(Array.isArray(chart.zones));assert(chart.zones.every(z=>['high','medium','limited','unknown'].includes(z.confidence)));assert(chart.zones.every(z=>z.asset_id==='asset:DOGE'));
  assert(chart.structure_events.every(e=>e.confirmed_at>=e.event_time));assert(chart.structure_events.every(e=>e.repaint_state==='confirmed'));
  assert(['valid','needs_confirmation','failed','fakeout_candidate','insufficient_data'].includes(chart.breakout.up.state));
  const q=await service.quality('DOGE',{timeframe:'4h',total:800});assert.equal(q.data.coverage.open_interest,true);assert.equal(q.data.coverage.funding,true);assert.equal(q.data.coverage.liquidations,false);assert.equal(q.data.confidence,'medium','missing trade-level profile/liquidations must cap confidence below high');
  console.log('chart v1 service PASS');
})().catch(e=>{console.error(e);process.exit(1)});
