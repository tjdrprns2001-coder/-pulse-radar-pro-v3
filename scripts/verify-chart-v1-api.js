const assert=require('assert');
const handler=require('../api/v1.js');
function makeRes(){let code=200,body=null;return{status(n){code=n;return this},json(v){body=v;return v},get code(){return code},get body(){return body}}}
const service={
  async searchAssets(){return{data:[{asset_id:'asset:DOGE',symbol:'DOGE'}],pagination:{limit:20,next_cursor:null}}},
  async getAsset(){return{data:{asset_id:'asset:DOGE',symbol:'DOGE'}}},
  async getMarkets(){return{data:[{instrument_id:'spot:DOGEUSDT'}]}},
  async getCandles(){return{data:{candles:[]},meta:{data_status:'valid'}}},
  async openInterest(){return{data:[],meta:{status:'supported_but_empty'}}},
  async funding(){return{data:[],meta:{status:'partial'}}},
  async structure(){return{data:[],meta:{timeframe:'4h'}}},
  async zones(){return{data:[],meta:{timeframe:'4h'}}},
  async overview(){return{data:{asset_id:'asset:DOGE'},meta:{algorithm_version:'x'}}},
  async chart(){return{asset:{asset_id:'asset:DOGE'},chart:{timeframe:'4h'},data_quality:{status:'valid'}}},
  async quality(){return{data:{asset_id:'asset:DOGE',overall_status:'valid'}}}
};
(async()=>{
  let r=makeRes();await handler({method:'GET',path:'/api/v1/assets',query:{query:'doge'}},r,{service});assert.equal(r.code,200);assert.equal(r.body.data[0].symbol,'DOGE');
  r=makeRes();await handler({method:'GET',path:'/api/v1/assets/DOGE/markets',query:{}},r,{service});assert.equal(r.code,200);assert.equal(r.body.data[0].instrument_id,'spot:DOGEUSDT');
  r=makeRes();await handler({method:'GET',path:'/api/v1/markets/spot%3ADOGEUSDT/candles',query:{timeframe:'4h'}},r,{service});assert.equal(r.code,200);
  r=makeRes();await handler({method:'GET',path:'/api/v1/assets/DOGE/analysis/overview',query:{timeframe:'4h'}},r,{service});assert.equal(r.code,200);assert.equal(r.body.data.asset_id,'asset:DOGE');
  r=makeRes();await handler({method:'GET',path:'/api/v1/chart/DOGE',query:{timeframe:'4h'}},r,{service});assert.equal(r.code,200);assert.equal(r.body.data_quality.status,'valid');
  r=makeRes();await handler({method:'GET',path:'/api/v1/data-quality/DOGE',query:{}},r,{service});assert.equal(r.code,200);
  r=makeRes();await handler({method:'GET',path:'/api/v1/nope',query:{}},r,{service});assert.equal(r.code,404);assert.equal(r.body.error.code,'DATA_NOT_FOUND');
  r=makeRes();await handler({method:'POST',path:'/api/v1/assets',query:{}},r,{service});assert.equal(r.code,405);assert.equal(r.body.error.code,'INVALID_PARAMETER');
  console.log('chart v1 api PASS');
})().catch(e=>{console.error(e);process.exit(1)});
