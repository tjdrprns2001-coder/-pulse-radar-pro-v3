const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number.isFinite(Number(n))?Number(n):0));
const finite=v=>v==null||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
function estimateSideUsd(volumeUsd,buys,sells){
  const v=finite(volumeUsd),b=finite(buys),s=finite(sells);
  if(v==null||b==null||s==null||b+s<=0)return{buyUsdEstimate:null,sellUsdEstimate:null,netBuyUsdEstimate:null,buyShare:null,sellShare:null,swapImbalance:null,estimated:true};
  const total=b+s,buyShare=b/total,sellShare=s/total,buyUsdEstimate=v*buyShare,sellUsdEstimate=v*sellShare;
  return{buyUsdEstimate,sellUsdEstimate,netBuyUsdEstimate:buyUsdEstimate-sellUsdEstimate,buyShare,sellShare,swapImbalance:buyShare-sellShare,estimated:true};
}
function normalizeDexMarket(raw={},source='unknown'){
  const volume5mUsd=finite(raw.volume5mUsd??raw.volume?.m5),volume1hUsd=finite(raw.volume1hUsd??raw.volume?.h1),volume24hUsd=finite(raw.volume24hUsd??raw.volume?.h24);
  const buys5m=finite(raw.buys5m??raw.txns?.m5?.buys),sells5m=finite(raw.sells5m??raw.txns?.m5?.sells);
  const side=estimateSideUsd(volume5mUsd,buys5m,sells5m);
  const liquidityUsd=finite(raw.liquidityUsd??raw.liquidity?.usd);
  const impulse=volume5mUsd!=null&&volume1hUsd>0?volume5mUsd/Math.max(1,volume1hUsd/12):null;
  const activityScore=clamp((Math.min(4,Math.max(0,impulse??0))/4)*45+(Math.abs(side.swapImbalance??0))*30+(Math.min(1,Math.log10(Math.max(1,volume5mUsd??0))/6))*25);
  return{
    source,chain:String(raw.chain||raw.chainId||'unknown').toLowerCase(),venue:raw.venue||raw.dexId||'DEX',pairAddress:raw.pairAddress||null,tokenAddress:raw.tokenAddress||raw.baseToken?.address||null,
    symbol:raw.symbol||`${raw.baseAsset||raw.baseToken?.symbol||'?'} / ${raw.quoteAsset||raw.quoteToken?.symbol||'?'}`,baseAsset:raw.baseAsset||raw.baseToken?.symbol||'',quoteAsset:raw.quoteAsset||raw.quoteToken?.symbol||'',
    liquidityUsd,volume5mUsd,volume1hUsd,volume24hUsd,buys5m,sells5m,tx5m:finite(raw.tx5m)??(buys5m!=null&&sells5m!=null?buys5m+sells5m:null),
    volumeImpulse5m:impulse,activityScore,sourceConfidence:finite(raw.sourceConfidence)??(source==='geckoterminal'?84:80),...side
  };
}
module.exports={estimateSideUsd,normalizeDexMarket};
