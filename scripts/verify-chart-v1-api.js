const assert=require('assert');
const handler=require('../api/v1.js');
function makeRes(){let code=200,body=null;return{status(n){code=n;return this},json(v){body=v;return v},get code(){return code},get body(){return body}}}
const service={
  async searchAssets(){return{data:[{asset_id:'asset:DOGE',symbol:'DOGE'}],pagination:{limit:20,next_cursor:null}}},
  async getAsset(){return{data:{asset_id:'asset:DOGE',symbol:'DOGE'}}},
  async getMarkets(){return{data:[{instrument_id:'spot:DOGEUSDT'}]}},
  async getCandles(){return{data:{candles:[]},meta:{data_status:'valid'}}},
  async openInterest(){return{data:[],meta:{status:'available'}}},
  async funding(){return{data:[],meta:{status:'partial'}}},
  async liquidations(){return{data:[{side:'long'}],meta:{status:'available'}}},
  async orderbookTelemetry(){return{data:{available:true,spread_bps:1.2},meta:{status:'available'}}},
  async alerts(){return{data:[{alert_type:'zone_approach'}],meta:{status:'available'}}},
  async replay(){return{data:{available:true},meta:{lookahead_safe:true}}},
  async backtest(){return{data:{sample_size:4,assumptions:{no_future_data:true}},meta:{lookahead_safe:true}}},
  async runtimeHealth(){return{persistence:{kind:'file',durable:false},live:{websocket_available:true}}},
  async structure(){return{data:[],meta:{timeframe:'4h'}}},
  async zones(){return{data:[],meta:{timeframe:'4h'}}},
  async overview(){return{data:{asset_id:'asset:DOGE'},meta:{algorithm_version:'x'}}},
  async chart(){return{asset:{asset_id:'asset:DOGE'},chart:{timeframe:'4h'},data_quality:{status:'valid'}}},
  async quality(){return{data:{asset_id:'asset:DOGE',overall_status:'valid'}}}
};
(async()=>{
  let r=makeRes();await handler({method:'GET',path:'/api/v1/assets',query:{query:'doge'}},r,{service});assert.equal(r.code,200);assert.equal(r.body.data[0].symbol,'DOGE');
  r=makeRes();await handler({method:'GET',path:'/api/v1/assets/DOGE/markets',query:{}},r,{service});assert.equal(r.code,200);
  r=makeRes();await handler({method:'GET',path:'/api/v1/markets/spot%3ADOGEUSDT/candles',query:{timeframe:'4h'}},r,{service});assert.equal(r.code,200);
  r=makeRes();await handler({method:'GET',path:'/api/v1/markets/perp%3ADOGEUSDT/liquidations',query:{}},r,{service});assert.equal(r.code,200);assert.equal(r.body.meta.status,'available');
  r=makeRes();await handler({method:'GET',path:'/api/v1/markets/perp%3ADOGEUSDT/orderbook-telemetry',query:{}},r,{service});assert.equal(r.code,200);assert.equal(r.body.data.available,true);
  r=makeRes();await handler({method:'GET',path:'/api/v1/assets/DOGE/alerts',query:{}},r,{service});assert.equal(r.code,200);
  r=makeRes();await handler({method:'GET',path:'/api/v1/assets/DOGE/replay',query:{as_of:'2026-10-01T00:00:00Z'}},r,{service});assert.equal(r.code,200);assert.equal(r.body.meta.lookahead_safe,true);
  r=makeRes();await handler({method:'GET',path:'/api/v1/assets/DOGE/backtest',query:{}},r,{service});assert.equal(r.code,200);assert.equal(r.body.data.assumptions.no_future_data,true);
  r=makeRes();await handler({method:'GET',path:'/api/v1/runtime/health',query:{}},r,{service});assert.equal(r.code,200);assert.equal(r.body.data.live.websocket_available,true);
  r=makeRes();await handler({method:'GET',path:'/api/v1/assets/DOGE/analysis/overview',query:{timeframe:'4h'}},r,{service});assert.equal(r.code,200);
  r=makeRes();await handler({method:'GET',path:'/api/v1/chart/DOGE',query:{timeframe:'4h'}},r,{service});assert.equal(r.code,200);
  r=makeRes();await handler({method:'GET',path:'/api/v1/data-quality/DOGE',query:{}},r,{service});assert.equal(r.code,200);
  r=makeRes();await handler({method:'GET',path:'/api/v1/nope',query:{}},r,{service});assert.equal(r.code,404);
  r=makeRes();await handler({method:'POST',path:'/api/v1/assets',query:{}},r,{service});assert.equal(r.code,405);
  console.log('chart v1 api PASS');
})().catch(e=>{console.error(e);process.exit(1)});
