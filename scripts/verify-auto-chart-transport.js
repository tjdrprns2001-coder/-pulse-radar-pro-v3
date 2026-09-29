const assert=require('assert'),fs=require('fs');

let binanceCalls=0,bybitCalls=0;
const STEP=4*3600000,N=90,base=Date.now()-N*STEP;
const list=[];
for(let i=0;i<N;i++){
  const t=base+i*STEP,p=100+i*.1;
  list.unshift([String(t),String(p),String(p+1),String(p-1),String(p+.2),String(1000+i),String((1000+i)*(p+.1))]);
}
global.fetch=async function(url){
  const u=String(url);
  if(u.includes('binance.com')){
    binanceCalls++;
    return{ok:false,status:418,text:async()=>JSON.stringify({code:-1003,msg:'Way too many requests; IP(1.2.3.4) banned until '+(Date.now()+600000)+'.'})};
  }
  if(u.includes('api.bybit.com')){
    bybitCalls++;
    return{ok:true,status:200,text:async()=>JSON.stringify({retCode:0,retMsg:'OK',result:{list}})};
  }
  throw new Error('unexpected URL '+u);
};
const Futures=require('../lib/futures-data.js');

(async()=>{
  const btc=await Futures.structure('BTCUSDT','4h',80);
  assert.equal(btc.ok,true);
  assert.equal(btc.market,'futures');
  assert.equal(btc.exchange,'bybit-fallback');
  assert.equal(btc.fallback,true);
  assert(/Bybit/.test(btc.dataSource));
  assert(btc.candles.length>=60);
  assert.equal(binanceCalls,1,'418 must stop rotating through more Binance hosts');
  assert(bybitCalls>=1,'Bybit fallback must be used');

  const before=binanceCalls;
  const eth=await Futures.structure('ETHUSDT','4h',80);
  assert.equal(eth.exchange,'bybit-fallback');
  assert.equal(binanceCalls,before,'open 418 circuit must skip further Binance REST attempts');

  const api=fs.readFileSync('api/index.js','utf8');
  for(const token of ['fetchStructureEdge','vercel-edge','rr.status!==418','rr.status!==429','STRUCTURE_EDGE_URL'])assert(api.includes(token),'missing edge fallback contract '+token);
  const norm=fs.readFileSync('ui/auto-chart/data/normalize.js','utf8');
  for(const token of ['sourceExchange','structureRuntime','fallbackReason'])assert(norm.includes(token),'missing source metadata '+token);
  console.log('auto chart transport fallback PASS');
})().catch(e=>{console.error(e);process.exit(1)});
