'use strict';

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function normalizeKline(k){
  if(!Array.isArray(k)||k.length<7)throw new Error('invalid Binance kline');
  return{
    openTime:finite(k[0]),open:finite(k[1]),high:finite(k[2]),low:finite(k[3]),close:finite(k[4]),volume:finite(k[5]),
    closeTime:finite(k[6]),quoteVolume:finite(k[7]),tradeCount:finite(k[8]),takerBuyBase:finite(k[9]),takerBuyQuote:finite(k[10]),partial:false,isClosed:true
  };
}
function dedupeSort(rows=[]){
  const m=new Map();
  for(const r of rows){const k=Number(r.openTime??r.time);if(Number.isFinite(k))m.set(k,r)}
  return[...m.values()].sort((a,b)=>Number(a.openTime??a.time)-Number(b.openTime??b.time));
}
async function fetchHistoricalDaily(provider,{symbol,startTs,endTs,pageSize=1500,maxPages=8}={}){
  if(!provider||typeof provider.getKlinesAt!=='function')throw new Error('provider.getKlinesAt required');
  const s=String(symbol||'').toUpperCase().trim();if(!s)throw new Error('symbol required');
  const start=finite(startTs),end=finite(endTs);if(start==null||end==null||end<=start)throw new Error('valid startTs/endTs required');
  const n=Math.max(2,Math.min(1500,Number(pageSize)||1500)),cap=Math.max(1,Math.min(50,Number(maxPages)||8));
  let cursor=end,all=[],pages=0,done=false;
  while(!done&&pages<cap){
    const raw=await provider.getKlinesAt(s,'1d',{endTime:cursor,rows:n});
    const page=(Array.isArray(raw)?raw:[]).map(normalizeKline).filter(x=>x.openTime!=null&&x.closeTime!=null);
    pages++;
    if(!page.length)break;
    all=all.concat(page);
    const first=page[0].openTime;
    if(first<=start||page.length<n){done=true;break}
    cursor=first-1;
  }
  const rows=dedupeSort(all).filter(x=>x.openTime>=start&&x.closeTime<=end);
  return{
    symbol:s,interval:'1d',startTs:start,endTs:end,pages,rows,
    historyStart:rows[0]?.openTime??null,historyEnd:rows.at(-1)?.closeTime??null,
    complete:Boolean(rows.length&&rows[0].openTime<=start+86400000)
  };
}
module.exports={finite,normalizeKline,dedupeSort,fetchHistoricalDaily};
