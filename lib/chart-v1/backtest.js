'use strict';

const DQ=require('../coin-report/modules/data-quality.js');
const VP=require('../coin-report/modules/volume-profile.js');
const MS=require('../coin-report/modules/market-structure.js');
const LQ=require('../coin-report/modules/liquidity.js');
const ICT=require('../coin-report/modules/ict.js');
const CF=require('../coin-report/modules/confluence.js');

const VERSION='CHART_REPLAY_BACKTEST_v1.0.0';
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function avg(a){const x=a.filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function med(a){const x=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return null;const i=Math.floor(x.length/2);return x.length%2?x[i]:(x[i-1]+x[i])/2}
function quantile(a,q){const x=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return null;const p=(x.length-1)*q,i=Math.floor(p),f=p-i;return x[i+1]==null?x[i]:x[i]+f*(x[i+1]-x[i])}
function sideReturn(side,entry,price){if(!(entry>0)||!Number.isFinite(price))return null;return side==='bearish'?(entry/price-1)*100:(price/entry-1)*100}
function directionalExcursions(side,entry,rows){let mfe=0,mae=0;for(const b of rows){const fav=side==='bearish'?(entry-b.l)/entry*100:(b.h-entry)/entry*100,adv=side==='bearish'?(b.h-entry)/entry*100:(entry-b.l)/entry*100;mfe=Math.max(mfe,fav);mae=Math.max(mae,adv)}return{mfe_pct:mfe,mae_pct:mae}}
function summarize(rows,key){const a=rows.map(x=>finite(x[key])).filter(Number.isFinite);return{n:a.length,mean:avg(a),median:med(a),positive_rate:a.length?a.filter(x=>x>0).length/a.length:null,p10:quantile(a,.10),p25:quantile(a,.25),p75:quantile(a,.75),p90:quantile(a,.90),min:a.length?Math.min(...a):null,max:a.length?Math.max(...a):null}}
function buildBars(raw,tf,asOf){return DQ.normalizeFrame(raw,{tf,nowMs:asOf}).bars}

function replaySnapshot(raw,{tf='4h',asOf=Date.now(),bins=100,execution=null}={}){
  const bars=buildBars(raw,tf,asOf).filter(x=>(x.ct??x.t)<=asOf);
  if(bars.length<20)return{version:VERSION,available:false,reason:'insufficient_history',as_of:asOf,timeframe:tf,bars:bars.length};
  const currentPrice=bars.at(-1).c,profile=VP.analyze(bars,{bins}),structure=MS.analyze(bars,{tf}),liquidity=LQ.analyze({bars,structure,execution,currentPrice}),ict=ICT.analyze({bars,structure,liquidity,currentPrice}),rawZones=CF.sourceZones({volumeProfile:profile,liquidity,ict,structure,currentPrice}),tol=Math.max((liquidity.atr||0)*.2,currentPrice*.0015),zones=CF.mergeZones(rawZones,{tolerance:tol});
  return{version:VERSION,available:true,as_of:asOf,timeframe:tf,bar_count:bars.length,last_closed_candle:bars.at(-1).ct??bars.at(-1).t,current_price:currentPrice,market_structure:{trend:structure.trend,last_bos:structure.lastBos,last_choch:structure.lastChoch,range:structure.range},volume_profile:{precision:profile.approximation?'estimated':'exact',poc:profile.poc,vah:profile.vah,val:profile.val,hvn:profile.hvn,lvn:profile.lvn},liquidity:{levels:liquidity.levels||[],sweeps:liquidity.sweeps||[],orderbook:liquidity.orderbook||{available:false}},ict:{order_blocks:ict.orderBlocks||[],fvgs:ict.fvgs||[],sweeps:ict.sweeps||[]},zones:zones.map(z=>({zone_id:z.zoneId,types:z.types,price_low:z.from,price_high:z.to,status:z.status,origin_time:Math.min(...(z.items||[]).map(x=>finite(x.originTimestamp)).filter(Number.isFinite),Infinity)})).map(z=>({...z,origin_time:Number.isFinite(z.origin_time)?z.origin_time:null})),causal_policy:'only candles with close_time <= as_of are visible; swings require right-side confirmation before structure events can exist'}
}
function backtestStructure(raw,{tf='4h',asOf=Date.now(),horizonBars=10,feeBps=4,slippageBps=2,minWarmup=200}={}){
  const bars=buildBars(raw,tf,asOf),structure=MS.analyze(bars,{tf}),h=Math.max(1,Math.min(100,Math.floor(Number(horizonBars)||10))),friction=(Math.max(0,Number(feeBps)||0)+Math.max(0,Number(slippageBps)||0))*2/100;
  const byClose=new Map(bars.map((b,i)=>[Number(b.ct??b.t),i])),events=[];
  for(const e of structure.events||[]){
    const idx=byClose.get(Number(e.eventAt));if(idx==null||idx<minWarmup||idx+1+h>=bars.length)continue;
    const entryBar=bars[idx+1],entry=entryBar.o,window=bars.slice(idx+1,idx+1+h),exit=window.at(-1)?.c;if(!(entry>0)||!Number.isFinite(exit))continue;
    const gross=sideReturn(e.side,entry,exit),ex=directionalExcursions(e.side,entry,window),net=gross-friction;
    events.push({event_type:e.type,direction:e.side,event_time:e.eventAt,level:e.level,entry_time:entryBar.t,entry_price:entry,exit_time:window.at(-1).ct??window.at(-1).t,exit_price:exit,horizon_bars:h,gross_return_pct:gross,net_return_pct:net,mfe_pct:ex.mfe_pct,mae_pct:ex.mae_pct,friction_pct:friction})
  }
  const groups={};for(const row of events){const k=row.event_type+':'+row.direction;if(!groups[k])groups[k]=[];groups[k].push(row)}
  const groupSummary=Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,{count:v.length,net:summarize(v,'net_return_pct'),mfe:summarize(v,'mfe_pct'),mae:summarize(v,'mae_pct')}]));
  return{version:VERSION,timeframe:tf,history_bars:bars.length,history_start:bars[0]?.t??null,history_end:bars.at(-1)?.ct??bars.at(-1)?.t??null,assumptions:{signal:'confirmed BOS/CHoCH close event',entry:'next confirmed candle open',horizon_bars:h,fee_bps:Number(feeBps)||0,slippage_bps:Number(slippageBps)||0,round_trip_friction_pct:friction,no_future_data:true},sample_size:events.length,summary:{net:summarize(events,'net_return_pct'),mfe:summarize(events,'mfe_pct'),mae:summarize(events,'mae_pct')},by_event:groupSummary,events:events.slice(-300).reverse()}
}
module.exports={VERSION,replaySnapshot,backtestStructure};
