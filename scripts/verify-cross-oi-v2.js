const assert=require('assert');
const {createCrossOiProvider}=require('../lib/coin-scan/cross-oi-provider.js');

(async()=>{
  const calls=[];
  let sawAbortSignal=false;
  const fetchImpl=async (url,opts={})=>{
    calls.push(url);sawAbortSignal=sawAbortSignal||Boolean(opts.signal);
    if(url.includes('bybit'))return{ok:true,json:async()=>({retCode:10001,retMsg:'blocked'})};
    if(url.includes('okx.com'))return{ok:true,json:async()=>({code:'0',data:[[3000,'103'],[2000,'101'],[1000,'100']]})};
    if(url.includes('gateio.ws'))return{ok:true,json:async()=>[
      {time:1,open_interest:'100'},{time:2,open_interest:'101'},{time:3,open_interest:'102.5'}
    ]};
    return{ok:false,status:404,json:async()=>({})};
  };
  const p=createCrossOiProvider({fetchImpl});
  const out=await p.getProfile('XLMUSDT');
  assert.equal(out.available,true);
  assert.equal(out.breadth,2,'OKX + Gate should survive Bybit failure');
  assert(out.exchanges.okx.available);
  assert(out.exchanges.gate.available);
  assert.equal(out.exchanges.bybit.available,false);
  assert(out.positiveBreadth>=2);
  assert(['okx','gate'].includes(out.leaderExchange));
  assert(calls.some(x=>x.includes('ccy=XLM')),'OKX base symbol mapping required');
  assert(calls.some(x=>x.includes('XLM_USDT')),'Gate contract mapping required');
  assert(sawAbortSignal,'cross-exchange OI requests must carry a bounded timeout signal');
  console.log('cross OI v2 PASS');
})().catch(e=>{console.error(e);process.exit(1)});
