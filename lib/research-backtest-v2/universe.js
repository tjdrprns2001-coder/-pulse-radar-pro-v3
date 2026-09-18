'use strict';
const {finite,deepFreeze}=require('./contracts.js');
function createUniverseSnapshot({exchangeInfo={},version,mode='current-survivors-only',observedAt=Date.now(),source='binance-exchangeInfo'}={}){
  const universeVersion=String(version||'').trim();if(!universeVersion)throw new Error('universe version required');
  const ts=finite(observedAt);if(ts==null)throw new Error('observedAt required');
  const symbols=(Array.isArray(exchangeInfo.symbols)?exchangeInfo.symbols:[]).filter(x=>
    String(x?.quoteAsset||'').toUpperCase()==='USDT'&&String(x?.status||'')==='TRADING'&&x?.isSpotTradingAllowed!==false
  ).map(x=>({symbol:String(x.symbol||'').toUpperCase(),baseAsset:String(x.baseAsset||'').toUpperCase(),quoteAsset:'USDT',listedAt:finite(x.listedAt),delistedAt:finite(x.delistedAt)})).filter(x=>x.symbol);
  const universeMode=String(mode||'current-survivors-only');
  return deepFreeze({universeVersion,universeMode,survivorshipSafe:universeMode!=='current-survivors-only',availabilitySource:String(source),observedAt:ts,symbols});
}
function eligibleSymbolsAt(universe,ts){
  const t=finite(ts);return (universe?.symbols||[]).filter(x=>(x.listedAt==null||x.listedAt<=t)&&(x.delistedAt==null||x.delistedAt>t)).map(x=>x.symbol);
}
module.exports={createUniverseSnapshot,eligibleSymbolsAt};
