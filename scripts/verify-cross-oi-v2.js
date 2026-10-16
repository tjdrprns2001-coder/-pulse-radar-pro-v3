const assert=require('assert');
const {createCrossOiProvider}=require('../lib/coin-scan/cross-oi-provider.js');

(async()=>{
  const now=Date.UTC(2026,9,16,9,0,0),last=now-300000;
  const calls=[];
  const fetchImpl=async url=>{
    calls.push(url);
    if(url.includes('bybit'))return{ok:true,json:async()=>({retCode:10001,retMsg:'blocked'})};
    if(url.includes('okx.com'))return{ok:true,json:async()=>({code:'0',data:[[last,'103'],[last-300000,'101'],[last-600000,'100']]})};
    if(url.includes('gateio.ws'))return{ok:true,json:async()=>[
      {time:(last-600000)/1000,open_interest:'100'},{time:(last-300000)/1000,open_interest:'101'},{time:last/1000,open_interest:'102.5'}
    ]};
    return{ok:false,status:404,json:async()=>({})};
  };
  const p=createCrossOiProvider({fetchImpl,now:()=>now});
  const out=await p.getProfile('XLMUSDT');
  assert.equal(out.available,true);
  assert.equal(out.breadth,2,'OKX + Gate should survive Bybit failure');
  assert(out.exchanges.okx.available);
  assert(out.exchanges.gate.available);
  assert.equal(out.exchanges.bybit.available,false);
  assert(out.positiveBreadth>=2);
  assert.equal(out.exchanges.okx.dataStatus,'OBSERVED');
  assert.equal(out.exchanges.gate.dataStatus,'OBSERVED');
  const stale=createCrossOiProvider({fetchImpl,now:()=>now+86400000});
  const staleOut=await stale.getProfile('XLMUSDT');
  assert.equal(staleOut.available,false,'stale cross-exchange OI cannot lead the breadth ranking');
  assert.equal(staleOut.positiveBreadth,0);
  assert.equal(staleOut.exchanges.okx.dataStatus,'STALE');
  const badAdapter=createCrossOiProvider({fetchImpl,now:()=>now,adapters:[{name:'untimed',getProfile:async()=>({available:true,changePct:50})}]});
  const adapterResult=await badAdapter.getProfile('XLMUSDT');
  assert.equal(adapterResult.exchanges.untimed.available,false,'untimestamped adapter must be excluded');
  assert(['okx','gate'].includes(out.leaderExchange));
  assert(calls.some(x=>x.includes('ccy=XLM')),'OKX base symbol mapping required');
  assert(calls.some(x=>x.includes('XLM_USDT')),'Gate contract mapping required');
  console.log('cross OI v2 PASS');
})().catch(e=>{console.error(e);process.exit(1)});
