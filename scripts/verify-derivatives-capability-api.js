const assert=require('assert');
const handler=require('../handlers/derivatives-capability.js');
function res(){let code=200,body=null;return{status(n){code=n;return this},json(v){body=v;return v},get code(){return code},get body(){return body}}}
(async()=>{
 const provider={
  async getDerivativesSupportUniverse(){return{status:'ok',count:3,items:[{symbol:'AAAUSDT'},{symbol:'BBBUSDT'},{symbol:'CCCUSDT'}],errors:[]}},
  async getSpotUniverse(){return{symbols:[{symbol:'AAAUSDT',baseAsset:'AAA'},{symbol:'BBBUSDT',baseAsset:'BBB'},{symbol:'CCCUSDT',baseAsset:'CCC'},{symbol:'DDDUSDT',baseAsset:'DDD'}]}},
  async getDerivativesCapabilities(symbols){return symbols.map((s,i)=>({symbol:s,availabilityStatus:i===0?'available':'partial',derivativesSupported:true,dataAvailable:true}))},
  async getDerivativesCapability(symbol){return{symbol,availabilityStatus:'supported_but_empty',derivativesSupported:true,dataAvailable:false}}
 };
 let r=res();await handler({method:'GET',query:{mode:'scan',offset:'0',limit:'4'}},r,{provider});assert.equal(r.code,200);assert.equal(r.body.mode,'scan');assert.equal(r.body.returned,4);assert.equal(r.body.universeCount,4);assert.equal(r.body.counts.available,1);assert.equal(r.body.counts.partial,2);assert.equal(r.body.counts.not_supported,1);assert.equal(r.body.items.find(x=>x.symbol==='DDDUSDT').querySkipped,true);assert.equal(r.body.nextOffset,null);
 r=res();await handler({method:'GET',query:{mode:'universe'}},r,{provider});assert.equal(r.code,200);assert.equal(r.body.count,3);
 r=res();await handler({method:'GET',query:{symbol:'AAAUSDT'}},r,{provider});assert.equal(r.code,200);assert.equal(r.body.availabilityStatus,'supported_but_empty');
 r=res();await handler({method:'GET',query:{symbol:'BAD'}},r,{provider});assert.equal(r.code,400);
 console.log('derivatives capability api PASS');
})().catch(e=>{console.error(e);process.exit(1)});
