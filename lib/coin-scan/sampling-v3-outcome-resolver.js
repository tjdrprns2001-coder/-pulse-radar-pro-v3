'use strict';

const SPOT_BASES=['https://data-api.binance.vision','https://api.binance.com','https://api1.binance.com','https://api2.binance.com'];
const FUTURES_BASES=['https://fapi.binance.com','https://fapi1.binance.com','https://fapi2.binance.com'];

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function bar(row){return{openTime:finite(row?.[0]),open:finite(row?.[1]),high:finite(row?.[2]),low:finite(row?.[3]),close:finite(row?.[4]),closeTime:finite(row?.[6])}}
async function fetchWindow(symbol,startTs,endTs,market='futures',fetchImpl=fetch){
  const futures=market==='futures',bases=futures?FUTURES_BASES:SPOT_BASES,path=futures?'/fapi/v1/klines':'/api/v3/klines';
  const out=[];let cursor=Math.floor(Number(startTs)||0),lastErr=null,pages=0;
  const end=Math.floor(Number(endTs)||0);
  while(cursor<=end&&pages<3){
    const remaining=Math.max(1,Math.ceil((end-cursor)/60000)+1),limit=Math.max(1,Math.min(1500,remaining));
    let data=null;
    for(const base of bases){
      try{
        const qs='symbol='+encodeURIComponent(String(symbol||'').toUpperCase())+'&interval=1m&startTime='+cursor+'&endTime='+end+'&limit='+limit;
        const r=await fetchImpl(base+path+'?'+qs,{headers:{accept:'application/json'}});
        if(!r.ok)throw new Error('Binance '+market+' HTTP '+r.status);
        const j=await r.json();if(Array.isArray(j)){data=j;break}
      }catch(e){lastErr=e}
    }
    if(!Array.isArray(data))throw lastErr||new Error('Binance '+market+' klines unavailable');
    if(!data.length)break;
    out.push(...data);
    const lastOpen=finite(data.at(-1)?.[0]);if(lastOpen==null)break;
    const next=lastOpen+60000;if(next<=cursor)break;cursor=next;pages++;
    if(data.length<limit)break;
  }
  const seen=new Set();
  return out.map(bar).filter(x=>x.openTime!=null&&x.openTime>=startTs&&x.openTime<=end&&x.high!=null&&x.low!=null&&x.close!=null)
    .filter(x=>{if(seen.has(x.openTime))return false;seen.add(x.openTime);return true}).sort((a,b)=>a.openTime-b.openTime);
}
function resolveBarrierPath(rows=[],snapshot={},targetTs=null){
  const entry=finite(snapshot.entryPrice??snapshot.price),start=finite(snapshot.capturedAt??snapshot.startTime),target=finite(targetTs);
  if(!(entry>0)||start==null||target==null)return{status:'invalid'};
  const upperPct=Math.max(.01,finite(snapshot.upperPct)??2),lowerPct=Math.max(.01,finite(snapshot.lowerPct)??1);
  const upper=entry*(1+upperPct/100),lower=entry*(1-lowerPct/100);
  let mfe=0,mae=0,last=null;
  for(const x of rows){
    if(x.openTime<start||x.openTime>target)continue;
    last=x;
    mfe=Math.max(mfe,((x.high/entry)-1)*100);
    mae=Math.min(mae,((x.low/entry)-1)*100);
    const up=x.high>=upper,down=x.low<=lower;
    if(up&&down)return{status:'evaluated',label:'UNRESOLVED',reason:'AMBIGUOUS_SAME_BAR',entryPrice:entry,upperPct,lowerPct,upperPrice:upper,lowerPrice:lower,triggerTs:x.openTime,mfePct:mfe,maePct:mae};
    if(up)return{status:'evaluated',label:'SURGE',reason:'UPPER_BARRIER_HIT',entryPrice:entry,upperPct,lowerPct,upperPrice:upper,lowerPrice:lower,triggerTs:x.openTime,mfePct:mfe,maePct:mae};
    if(down)return{status:'evaluated',label:'FAILED_BOS',reason:'LOWER_BARRIER_HIT',entryPrice:entry,upperPct,lowerPct,upperPrice:upper,lowerPrice:lower,triggerTs:x.openTime,mfePct:mfe,maePct:mae};
  }
  if(!last)return{status:'unavailable',label:'UNRESOLVED',reason:'NO_MARKET_ROWS',entryPrice:entry,upperPct,lowerPct};
  const ret=((last.close/entry)-1)*100;
  return{status:'evaluated',label:'NO_TRIGGER',reason:'TIME_EXPIRED',entryPrice:entry,upperPct,lowerPct,upperPrice:upper,lowerPrice:lower,exitTs:last.openTime,exitPrice:last.close,returnPct:ret,mfePct:mfe,maePct:mae};
}
function createSamplingV3OutcomeResolver({fetchImpl=fetch,fetchKlines=null}={}){
  const fetcher=fetchKlines||((symbol,start,end,market)=>fetchWindow(symbol,start,end,market,fetchImpl));
  return{
    async resolve(snapshot,targetTs,nowTs=Date.now()){
      const target=finite(targetTs),now=finite(nowTs),start=finite(snapshot?.capturedAt);
      if(target==null||start==null)throw new Error('sampling target/capture timestamp required');
      if(now==null||now<target)return{status:'pending',targetTs:target};
      const preferFutures=snapshot?.futuresListed!==false,order=preferFutures?['futures','spot']:['spot','futures'];
      let attempted=0;
      for(const market of order){
        if(market==='futures'&&snapshot?.futuresListed===false)continue;
        if(market==='spot'&&snapshot?.spotListed===false)continue;
        attempted++;
        try{
          const rows=await fetcher(snapshot.symbol,start,target,market);
          const result=resolveBarrierPath(rows,snapshot,target);
          if(result.status==='evaluated')return{...result,targetTs:target,market,rowCount:rows.length};
        }catch(_e){}
      }
      return{status:'unavailable',label:'UNRESOLVED',reason:'MARKET_DATA_UNAVAILABLE',targetTs:target,attemptedMarkets:attempted};
    }
  };
}
module.exports={SPOT_BASES,FUTURES_BASES,fetchWindow,resolveBarrierPath,createSamplingV3OutcomeResolver};
