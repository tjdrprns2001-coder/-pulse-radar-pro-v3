(function(g){
  const RETENTION_MS=6*60*1000;
  const SAMPLE_MS=2000;
  const history=new Map();
  const n=v=>v==null||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
  const marketId=m=>m?.id||`${m?.source||'unknown'}:${m?.marketType||'unknown'}:${m?.chain||''}:${m?.pairAddress||m?.symbol||'unknown'}`;
  function prune(list,now){
    const cutoff=now-RETENTION_MS;
    while(list.length&&list[0].ts<cutoff)list.shift();
  }
  function record(market,timestamp){
    if(!market)return;
    const id=marketId(market),ts=timestamp??market.eventTime??market.receivedTime??Date.now();
    const obs={ts:Number(ts),price:n(market.priceUsd??market.price),quoteVolumeUsd:n(market.quoteVolumeUsd),txCount:n(market.txCount??market.trades),buyVolume:n(market.buyVolume),sellVolume:n(market.sellVolume),buys:n(market.buys),sells:n(market.sells)};
    if(!Number.isFinite(obs.ts)||obs.price==null)return;
    const list=history.get(id)||[];
    const last=list[list.length-1];
    if(last&&last.ts===obs.ts)list[list.length-1]=obs;
    else if(last&&obs.ts>last.ts&&obs.ts-last.ts<SAMPLE_MS)list[list.length-1]=obs;
    else if(!last||last.ts<obs.ts)list.push(obs);
    else{
      const i=list.findIndex(x=>x.ts>=obs.ts);
      if(i>=0&&list[i].ts===obs.ts)list[i]=obs;
      else if(i>=0)list.splice(i,0,obs);
      else list.push(obs);
    }
    prune(list,obs.ts);
    history.set(id,list);
  }
  function atOrBefore(list,target){
    for(let i=list.length-1;i>=0;i--)if(list[i].ts<=target)return list[i];
    return null;
  }
  function pct(now,old){return now!=null&&old!=null&&old!==0?((now-old)/old*100):null}
  function delta(now,old){return now!=null&&old!=null?now-old:null}
  function metricsFor(id,currentMarket,timestamp){
    const now=Number(timestamp??currentMarket?.eventTime??currentMarket?.receivedTime??Date.now());
    const list=history.get(id)||[];
    prune(list,now);
    const p1=atOrBefore(list,now-60000),p5=atOrBefore(list,now-300000);
    const price=n(currentMarket?.priceUsd??currentMarket?.price),vol=n(currentMarket?.quoteVolumeUsd),tx=n(currentMarket?.txCount??currentMarket?.trades);
    return {
      change1m:p1?pct(price,p1.price):null,
      change5m:p5?pct(price,p5.price):null,
      volumeDelta1m:p1?delta(vol,p1.quoteVolumeUsd):null,
      volumeDelta5m:p5?delta(vol,p5.quoteVolumeUsd):null,
      txDelta1m:p1?delta(tx,p1.txCount):null,
      txDelta5m:p5?delta(tx,p5.txCount):null
    };
  }
  function reset(){history.clear()}
  const api={record,metricsFor,reset,_debugCount:id=>(history.get(id)||[]).length,_debugOldestTs:id=>(history.get(id)||[])[0]?.ts??null,retentionMs:RETENTION_MS,sampleMs:SAMPLE_MS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;g.PulseRadarHistory=api;
})(typeof window!=='undefined'?window:globalThis);
