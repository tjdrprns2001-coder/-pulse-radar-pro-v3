'use strict';
const {num}=require('./data');
const H4=14400000,STEP=300000;
function oiDelta(rows,{at,received_at,unit,venue}){
 const xs=rows.filter(x=>num(x.time)!=null&&x.time<=at&&num(x.quantity)!=null&&x.quantity>=0).sort((a,b)=>a.time-b.time),last=xs.at(-1);
 const base=last&&xs.filter(x=>x.time<=last.time-H4).at(-1),prior=base&&xs.filter(x=>x.time<=base.time-H4).at(-1);
 if(!last||!base||base.quantity<=0||Math.abs(last.time-base.time-H4)>STEP)return null;
 const pct=(a,b)=>num(a)!=null&&num(b)>0?(a/b-1)*100:null;
 return {venue,contracts_change_pct:pct(last.quantity,base.quantity),notional_change_pct:pct(last.notional,base.notional),previous_change_pct:prior&&Math.abs(base.time-prior.time-H4)<=STEP?pct(base.quantity,prior.quantity):null,quantity:last.quantity,unit,window_start:base.time,window_end:last.time,observed_at:last.time,received_at,quality:at-last.time<=900000?'fresh':'stale',availability_assumption:'observed_at',source:'venue_history'};
}
function funding(rows,at,received_at,venue){const x=rows.filter(x=>num(x.time)!=null&&x.time<=at&&num(x.rate)!=null).sort((a,b)=>a.time-b.time).at(-1);return x?{venue,rate:num(x.rate),observed_at:x.time,received_at,kind:'settled',quality:at-x.time<=86400000?'fresh':'stale'}:null;}
async function flow(p,{symbol,at,market='perpetual',signal}={}){
 const v=p.venue,id=v==='okx'?symbol.slice(0,-4)+'-USDT-SWAP':v==='gate'?symbol.slice(0,-4)+'_USDT':symbol,qs=x=>new URLSearchParams(x),received=p.now();
 if(market!=='perpetual')return {venue:v,oi:null,funding:null,taker:null,errors:['Spot market has no perpetual OI or funding']};
 const out={venue:v,oi:null,oi_snapshot:null,funding:null,taker:null,trade_sample:null,errors:[]};
 const run=async(name,fn)=>{try{await fn();}catch(e){out.errors.push(name+': '+e.message);}};
 if(v==='bybit')await Promise.all([
  run('oi',async()=>{const j=await p.get('/v5/market/open-interest?'+qs({category:'linear',symbol,intervalTime:'5min',limit:'110',endTime:String(at)}),market,{signal});out.oi=oiDelta((j.result?.list||[]).map(x=>({time:+x.timestamp,quantity:num(x.openInterest),notional:null})),{at,received_at:p.now(),unit:'base',venue:v});}),
  run('funding',async()=>{const j=await p.get('/v5/market/funding/history?'+qs({category:'linear',symbol,limit:'10',endTime:String(at)}),market,{signal});out.funding=funding((j.result?.list||[]).map(x=>({time:+x.fundingRateTimestamp,rate:x.fundingRate})),at,p.now(),v);}),
  // Latest capped trades are a sample, never a complete closed 15m aggregate.
  run('trades',async()=>{if(Math.abs(p.now()-at)>60000)return;const j=await p.get('/v5/market/recent-trade?'+qs({category:'linear',symbol,limit:'1000'}),market,{signal});const xs=[...new Map((j.result?.list||[]).filter(x=>+x.time<=at&&+x.time>=at-900000&&num(x.size)>0&&['Buy','Sell'].includes(x.side)).map(x=>[x.execId||[x.time,x.side,x.size,x.price].join(':'),x])).values()];if(!xs.length)return;const buy=xs.filter(x=>x.side==='Buy').reduce((s,x)=>s+num(x.size),0),sell=xs.filter(x=>x.side==='Sell').reduce((s,x)=>s+num(x.size),0);out.trade_sample={venue:v,coverage:'partial',eligible_for_confirmation:false,buy_share:buy/(buy+sell),ratio:sell>0?buy/sell:null,unit:'base',count:xs.length,window_start:Math.min(...xs.map(x=>+x.time)),window_end:Math.max(...xs.map(x=>+x.time)),received_at:p.now()};})
 ]);
 else if(v==='gate')await Promise.all([
  run('oi',async()=>{const j=await p.get('/futures/usdt/contract_stats?'+qs({contract:id,interval:'5m',from:String(Math.floor((at-9*3600000)/1000)),limit:'120'}),market,{signal});out.oi=oiDelta(j.map(x=>({time:+x.time*1000,quantity:num(x.open_interest),notional:num(x.open_interest_usd)})),{at,received_at:p.now(),unit:'contracts',venue:v});}),
  run('funding',async()=>{const j=await p.get('/futures/usdt/funding_rate?'+qs({contract:id,to:String(Math.floor(at/1000)),limit:'10'}),market,{signal});out.funding=funding(j.map(x=>({time:+x.t*1000,rate:x.r})),at,p.now(),v);})
 ]);
 else await Promise.all([
  run('oi_snapshot',async()=>{if(Math.abs(p.now()-at)>60000)return;let x,time,quantity,notional,base,unit;
   if(v==='okx'){const j=await p.get('/api/v5/public/open-interest?'+qs({instType:'SWAP',instId:id}),market,{signal});x=(j.data||[]).find(x=>x.instId===id)||j.data?.[0];if(!x)return;time=num(x.ts);quantity=num(x.oi);base=num(x.oiCcy);notional=num(x.oiUsd);unit='contracts';}
   else{const j=await p.get('/api/v2/mix/market/open-interest?'+qs({symbol,productType:'USDT-FUTURES'}),market,{signal});x=j.data?.openInterestList?.find(x=>x.symbol===symbol);if(!x)return;time=num(j.data.ts);quantity=num(x.size);unit='base';base=quantity;notional=null;}
   if(time==null||quantity==null)return;out.oi_snapshot={venue:v,quantity,base_quantity:base,notional,unit,observed_at:time,received_at:p.now(),quality:time>at?'after_decision':at-time<=900000?'fresh':'stale',eligible_at_decision:time<=at,contracts_change_pct:null,source:'current_snapshot'};
  }),
  run('funding',async()=>{const j=await p.get(v==='okx'?'/api/v5/public/funding-rate-history?'+qs({instId:id,after:String(at+1),limit:'10'}):'/api/v2/mix/market/history-fund-rate?'+qs({symbol,productType:'USDT-FUTURES',pageSize:'100'}),market,{signal});out.funding=funding((j.data||[]).map(x=>({time:+x.fundingTime,rate:num(x.realizedRate)??num(x.fundingRate)})),at,p.now(),v);})
 ]);
 if(!out.oi)out.errors.push('OI 4H change unavailable; current snapshot does not confirm A/A+B');
 if(!out.taker)out.errors.push('Complete closed-window true taker unavailable; sample/account ratios do not confirm flow');
 return out;
}
module.exports={flow,oiDelta,funding};
