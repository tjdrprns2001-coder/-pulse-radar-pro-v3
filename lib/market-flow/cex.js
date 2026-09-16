const finite=v=>v==null||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
function splitSymbol(raw,venue){
  const s=String(raw.symbol||raw.market||raw.instId||raw.product_id||raw.pair||'').toUpperCase();
  if(s.includes('-')){const [a,b]=s.split('-');if(['KRW','USD','USDT','USDC'].includes(a))return{baseAsset:b,quoteAsset:a};return{baseAsset:a,quoteAsset:b}}
  if(s.includes('_')){const [a,b]=s.split('_');return{baseAsset:a,quoteAsset:b}}
  const m=s.match(/^(.+?)(USDT|USDC|FDUSD|USD|KRW|BTC|ETH)$/);return m?{baseAsset:m[1],quoteAsset:m[2]}:{baseAsset:s,quoteAsset:''};
}
function normalizeCexTicker(raw={},venue='Unknown',marketType='spot',fxContext={}){
  const sym=splitSymbol(raw,venue),lastPrice=finite(raw.lastPrice??raw.trade_price??raw.last??raw.price??raw.lastPr??raw.close??raw.priceUsd),quoteVolumeNative=finite(raw.quoteVolume??raw.acc_trade_price_24h??raw.volCcy24h??raw.turnover24h??raw.volumeUsd??raw.quote_volume),change=finite(raw.priceChangePercent??(raw.signed_change_rate!=null?Number(raw.signed_change_rate)*100:raw.change24h??raw.price24hPcnt!=null?Number(raw.price24hPcnt)*100:null));
  let priceUsd=null,quoteVolumeUsd=null;
  if(['USDT','USDC','FDUSD','USD'].includes(sym.quoteAsset)){priceUsd=lastPrice;quoteVolumeUsd=quoteVolumeNative}
  else if(sym.quoteAsset==='KRW'&&finite(fxContext.usdKrw)>0){priceUsd=lastPrice==null?null:lastPrice/Number(fxContext.usdKrw);quoteVolumeUsd=quoteVolumeNative==null?null:quoteVolumeNative/Number(fxContext.usdKrw)}
  return{venue,marketType,baseAsset:sym.baseAsset,quoteAsset:sym.quoteAsset,symbol:raw.symbol||raw.market||raw.instId||raw.product_id||`${sym.baseAsset}-${sym.quoteAsset}`,lastPrice,priceUsd,quoteVolumeNative,quoteVolumeUsd,change24hPct:change,sourceConfidence:finite(raw.sourceConfidence)??90,freshnessMs:finite(raw.freshnessMs)??0};
}
function compareCexMarkets(records=[]){
  const groups=new Map();for(const r of records){if(!r?.baseAsset)continue;const q=['USDT','USDC','FDUSD','USD'].includes(r.quoteAsset)?'USD':r.quoteAsset;const k=`${r.baseAsset}:${q}`;(groups.get(k)||groups.set(k,[]).get(k)).push(r)}
  const out=[];for(const [key,rows] of groups){const vols=rows.filter(r=>finite(r.quoteVolumeUsd)!=null),total=vols.reduce((s,r)=>s+Number(r.quoteVolumeUsd),0),shares={};for(const r of vols)shares[r.venue]=total?Number(r.quoteVolumeUsd)/total:0;const prices=rows.map(r=>finite(r.priceUsd)).filter(v=>v!=null&&v>0),hi=prices.length?Math.max(...prices):null,lo=prices.length?Math.min(...prices):null,mid=hi!=null&&lo!=null?(hi+lo)/2:null;out.push({key,baseAsset:rows[0].baseAsset,quoteGroup:key.split(':')[1],venueCount:new Set(rows.map(r=>r.venue)).size,venueVolumeShares:shares,highestPriceUsd:hi,lowestPriceUsd:lo,priceSpreadPct:mid?((hi-lo)/mid)*100:null,totalQuoteVolumeUsd:total||null,records:rows})}
  return out;
}
module.exports={normalizeCexTicker,compareCexMarkets,splitSymbol};
