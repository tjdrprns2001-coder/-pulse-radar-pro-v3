'use strict';

const crypto=require('crypto');
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function cleanSymbol(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function hash(v){return crypto.createHash('sha1').update(String(v)).digest('hex').slice(0,16)}
function pct(a,b){return b?((a/b)-1)*100:null}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function quantile(a,q){const x=a.filter(Number.isFinite).sort((m,n)=>m-n);if(!x.length)return null;const p=(x.length-1)*q,i=Math.floor(p),f=p-i;return x[i+1]==null?x[i]:x[i]+f*(x[i+1]-x[i])}

function normalizeTrade(x,source='unknown'){
  if(Array.isArray(x)){
    const price=finite(x[1]??x[0]),qty=finite(x[2]??x[1]),time=finite(x[5]??x[4]??x[0]),maker=x[6]??x.m;
    if(!(price>0)||!(qty>=0)||time==null)return null;
    return{trade_id:String(x[0]??[time,price,qty].join(':')),time,price,quantity:qty,quote_value:price*qty,side:maker===true?'sell':maker===false?'buy':'unknown',source}
  }
  const price=finite(x?.p??x?.price),qty=finite(x?.q??x?.qty??x?.quantity),time=finite(x?.T??x?.time??x?.timestamp),maker=x?.m??x?.isBuyerMaker;
  if(!(price>0)||!(qty>=0)||time==null)return null;
  return{trade_id:String(x?.a??x?.id??x?.tradeId??[time,price,qty].join(':')),time,price,quantity:qty,quote_value:price*qty,side:maker===true?'sell':maker===false?'buy':'unknown',source}
}
function tradeVolumeProfile(trades=[],{bins=100,startTime=null,endTime=null}={}){
  const rows=trades.map(x=>x?.price?x:normalizeTrade(x)).filter(Boolean).filter(x=>(startTime==null||x.time>=startTime)&&(endTime==null||x.time<=endTime));
  if(!rows.length)return{available:false,precision:'unknown',nodes:[],poc:null,vah:null,val:null,total_quote:0,trade_count:0};
  const prices=rows.map(x=>x.price),lo=Math.min(...prices),hi=Math.max(...prices),count=Math.max(20,Math.min(200,Math.floor(Number(bins)||100))),step=hi>lo?(hi-lo)/count:Math.max(Math.abs(lo)*1e-8,1e-12),nodes=Array.from({length:count},(_,i)=>({price_low:lo+i*step,price_high:i===count-1?hi:lo+(i+1)*step,price:lo+(i+.5)*step,volume:0,buy_quote:0,sell_quote:0,trades:0}));
  let total=0;for(const t of rows){const idx=clamp(Math.floor((t.price-lo)/step),0,count-1),q=finite(t.quote_value)??t.price*t.quantity,n=nodes[idx];n.volume+=q;n.trades++;if(t.side==='buy')n.buy_quote+=q;else if(t.side==='sell')n.sell_quote+=q;total+=q}
  const sorted=[...nodes].sort((a,b)=>b.volume-a.volume),poc=sorted[0]||null,target=total*.70;let acc=0,selected=[];for(const n of sorted){if(acc>=target)break;selected.push(n);acc+=n.volume}
  const vah=selected.length?Math.max(...selected.map(x=>x.price_high)):null,val=selected.length?Math.min(...selected.map(x=>x.price_low)):null;
  return{available:true,precision:'trade_exact_window',source:'aggregated_trades',start_time:rows[0].time,end_time:rows.at(-1).time,trade_count:rows.length,total_quote:total,poc:poc?{price:poc.price,volume:poc.volume,share:total?poc.volume/total:null}:null,vah,val,nodes,coverage:{requested_start:startTime,requested_end:endTime,actual_start:rows[0].time,actual_end:rows.at(-1).time,complete:Boolean((startTime==null||rows[0].time<=startTime)&&(endTime==null||rows.at(-1).time>=endTime))}}
}

function depthStats(bids=[],asks=[],time=Date.now()){
  const b=(bids||[]).map(x=>({price:finite(x?.[0]??x?.price),qty:finite(x?.[1]??x?.quantity)})).filter(x=>x.price>0&&x.qty>=0).sort((x,y)=>y.price-x.price);
  const a=(asks||[]).map(x=>({price:finite(x?.[0]??x?.price),qty:finite(x?.[1]??x?.quantity)})).filter(x=>x.price>0&&x.qty>=0).sort((x,y)=>x.price-y.price);
  if(!b.length||!a.length)return{available:false,observed_at:time};
  const bid=b[0].price,ask=a[0].price,mid=(bid+ask)/2,spread=ask-bid,within=(rows,side,pctBand)=>rows.filter(x=>side==='bid'?x.price>=mid*(1-pctBand/100):x.price<=mid*(1+pctBand/100)).reduce((s,x)=>s+x.price*x.qty,0);
  const bid01=within(b,'bid',.1),ask01=within(a,'ask',.1),bid05=within(b,'bid',.5),ask05=within(a,'ask',.5),bid1=within(b,'bid',1),ask1=within(a,'ask',1);
  const vals=[...b,...a].map(x=>x.price*x.qty),med=quantile(vals,.5)||0,wallThreshold=Math.max(med*3,quantile(vals,.9)||0);
  const walls=[...b.map(x=>({...x,side:'bid'})),...a.map(x=>({...x,side:'ask'}))].filter(x=>x.price*x.qty>=wallThreshold).map(x=>({...x,quote_value:x.price*x.qty}));
  return{available:true,observed_at:time,bid,ask,mid,spread,spread_bps:mid?spread/mid*10000:null,depth_usd:{bid_0_1_pct:bid01,ask_0_1_pct:ask01,bid_0_5_pct:bid05,ask_0_5_pct:ask05,bid_1_pct:bid1,ask_1_pct:ask1},imbalance:{pct_0_1:(bid01+ask01)?(bid01-ask01)/(bid01+ask01):null,pct_0_5:(bid05+ask05)?(bid05-ask05)/(bid05+ask05):null,pct_1:(bid1+ask1)?(bid1-ask1)/(bid1+ask1):null},walls,precision:'top_book_observed'}
}
function priceKey(price,mid){if(!(price>0))return'';const digits=mid>=1000?2:mid>=1?4:8;return Number(price).toFixed(digits)}
function updateWallState(prev={},snapshot,tradesSince=[]){
  const now=snapshot?.observed_at||Date.now(),mid=snapshot?.mid||1,current=new Map((snapshot?.walls||[]).map(w=>[w.side+':'+priceKey(w.price,mid),w])),prior=prev.levels||{},levels={},disappeared=0,executedLikely=0;
  for(const [key,w] of current){const p=prior[key]||{};levels[key]={side:w.side,price:w.price,quantity:w.qty,quote_value:w.quote_value,first_seen:p.first_seen||now,last_seen:now,observations:(p.observations||0)+1,peak_quote:Math.max(p.peak_quote||0,w.quote_value),cancel_count:p.cancel_count||0,execution_count:p.execution_count||0}}
  for(const [key,p] of Object.entries(prior)){if(current.has(key))continue;disappeared++;const hit=(tradesSince||[]).some(t=>Math.abs(t.price-p.price)/Math.max(p.price,1e-12)<=.00015);if(hit)executedLikely++;else p.cancel_count=(p.cancel_count||0)+1;p.execution_count=(p.execution_count||0)+(hit?1:0);levels[key]={...p,last_seen:p.last_seen||now,active:false}}
  const active=Object.values(levels).filter(x=>x.active!==false),persistent=active.filter(x=>now-x.first_seen>=5000&&x.observations>=3),priorDisappear=Number(prev.disappeared||0)+disappeared,priorExec=Number(prev.executed_likely||0)+executedLikely,cancelled=Math.max(0,priorDisappear-priorExec);
  return{observed_at:now,levels,active_walls:active.length,persistent_walls:persistent.sort((a,b)=>b.quote_value-a.quote_value).slice(0,20),disappeared:priorDisappear,executed_likely:priorExec,cancelled_likely:cancelled,cancel_rate_estimated:priorDisappear?cancelled/priorDisappear:null,precision:'snapshot_inference',warning:'주문 취소율은 top-book 스냅샷 변화와 근접 체결을 이용한 추정치이며 거래소의 실제 취소 메시지 집계값이 아닙니다.'}
}

function normalizeLiquidation(data,source='BINANCE_FUTURES'){
  const o=data?.o||data?.order||data||{},price=finite(o?.ap??o?.p??o?.price),qty=finite(o?.z??o?.q??o?.quantity),time=finite(data?.E??o?.T??o?.time??Date.now()),side=String(o?.S??o?.side||'').toUpperCase();
  if(!(price>0)||!(qty>0)||!time)return null;
  const liquidationSide=side==='SELL'?'long':side==='BUY'?'short':'unknown';
  return{liquidation_id:'liq:'+hash([source,time,price,qty,side].join('|')),event_time:time,side:liquidationSide,order_side:side.toLowerCase(),quantity:qty,price,notional_usd:price*qty,source}
}
function liquidationSummary(rows=[],windowMs=3600000,now=Date.now()){
  const recent=(rows||[]).filter(x=>Number(x.event_time)>=now-windowMs),long=recent.filter(x=>x.side==='long').reduce((s,x)=>s+(finite(x.notional_usd)||0),0),short=recent.filter(x=>x.side==='short').reduce((s,x)=>s+(finite(x.notional_usd)||0),0),total=long+short;
  return{window_ms:windowMs,count:recent.length,long_usd:long,short_usd:short,total_usd:total,imbalance:total?(short-long)/total:null}
}

function alertCandidates(analysis={}){
  const out=[],symbol=cleanSymbol(analysis.symbol||analysis.base),stamp=Number(analysis.stamp)||Date.now(),tf=String(analysis.tf||'4h');
  for(const [dir,b] of Object.entries(analysis.breakout||{})){if(!b||!['valid','fakeout_candidate','failed'].includes(String(b.state)))continue;out.push({alert_id:'alt:'+hash([symbol,tf,'breakout',dir,b.state,analysis.dataQuality?.last_closed_candle].join('|')),symbol,timeframe:tf,alert_type:'breakout_'+b.state,direction:dir,captured_at:stamp,status:b.state,evidence:b,confidence:analysis.dataQuality?.confidence||'limited',invalidation_condition:dir==='up'?'close_back_below_breakout_level':'close_back_above_breakout_level'})}
  const near=(analysis.zones||[]).filter(z=>z.status==='active').slice(0,5);for(const z of near){const mid=(Number(z.price_low)+Number(z.price_high))/2,dist=analysis.currentPrice?Math.abs(mid-analysis.currentPrice)/analysis.currentPrice:null;if(dist!=null&&dist<=.01&&['high','medium'].includes(z.confidence))out.push({alert_id:'alt:'+hash([symbol,tf,'zone',z.zone_id,analysis.dataQuality?.last_closed_candle].join('|')),symbol,timeframe:tf,alert_type:'zone_approach',captured_at:stamp,status:'needs_confirmation',zone_id:z.zone_id,price_low:z.price_low,price_high:z.price_high,distance_pct:dist*100,confidence:z.confidence,evidence:z.evidence,invalidation_condition:z.invalidation_condition})}
  return out
}

module.exports={normalizeTrade,tradeVolumeProfile,depthStats,updateWallState,normalizeLiquidation,liquidationSummary,alertCandidates};
