import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalScannerSource,routedFetcher} from './scanner-runtime.mjs';

test('local scanner source starts disabled for deterministic tests',async()=>{
  const source=createLocalScannerSource({env:{},autoStart:false,now:()=>123});
  assert.equal(await source(),null);
  const health=source.health();
  assert.equal(health.mode,'local-render');
  assert.equal(health.state,'INIT');
  assert.equal(health.hasSnapshot,false);
  assert.equal(health.hasCompleted,false);
  assert.equal(health.startedAt,123);
});

test('Binance proxy router fails over across regions before direct access',async()=>{
  const calls=[];
  const token='a'.repeat(43);
  const fetcher=async(url)=>{
    calls.push(String(url));
    if(String(url).startsWith('https://proxy-a.test/'))return new Response('blocked',{status:451});
    if(String(url).startsWith('https://proxy-b.test/'))return Response.json({serverTime:123});
    throw new Error('direct Binance should not be needed');
  };
  const routed=routedFetcher({
    IGNITION_BINANCE_PROXY_URLS:'https://proxy-a.test, https://proxy-b.test',
    IGNITION_BINANCE_PROXY_TOKEN:token
  },fetcher,()=>1000);
  const response=await routed('https://fapi.binance.com/fapi/v1/time');
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{serverTime:123});
  assert.equal(calls.length,2);
  assert.match(calls[0],/^https:\/\/proxy-a\.test\/fetch\?url=/);
  assert.match(calls[1],/^https:\/\/proxy-b\.test\/fetch\?url=/);
});

test('non-Binance traffic bypasses proxy router',async()=>{
  const calls=[];
  const fetcher=async(url)=>{calls.push(String(url));return new Response('ok',{status:200});};
  const routed=routedFetcher({
    IGNITION_BINANCE_PROXY_URLS:'https://proxy-a.test,https://proxy-b.test',
    IGNITION_BINANCE_PROXY_TOKEN:'a'.repeat(43)
  },fetcher,()=>1000);
  const response=await routed('https://api.bybit.com/v5/market/tickers?category=linear');
  assert.equal(response.status,200);
  assert.deepEqual(calls,['https://api.bybit.com/v5/market/tickers?category=linear']);
});


test('Binance proxy router pauses at the next minute when observed IP weight is high',async()=>{
  let clock=121000;
  const sleeps=[];
  const token='a'.repeat(43);
  let calls=0;
  const fetcher=async()=>{
    calls++;
    return new Response(JSON.stringify({serverTime:clock}),{
      status:200,
      headers:{'content-type':'application/json','x-mbx-used-weight-1m':'1800'}
    });
  };
  const sleeper=async ms=>{sleeps.push(ms);clock+=ms;};
  const routed=routedFetcher({
    IGNITION_BINANCE_PROXY_URLS:'https://proxy-a.test',
    IGNITION_BINANCE_PROXY_TOKEN:token,
    IGNITION_BINANCE_PROXY_GAP_MS:'0',
    IGNITION_BINANCE_WEIGHT_SOFT_LIMIT:'1700',
    IGNITION_BINANCE_WEIGHT_RESET_SAFETY_MS:'1500'
  },fetcher,()=>clock,sleeper);
  assert.equal((await routed('https://fapi.binance.com/fapi/v1/time')).status,200);
  assert.equal((await routed('https://fapi.binance.com/fapi/v1/time')).status,200);
  assert.equal(calls,2);
  assert.deepEqual(sleeps,[60500]);
});
