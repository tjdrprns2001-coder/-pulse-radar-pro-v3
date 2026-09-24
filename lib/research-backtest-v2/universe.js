'use strict';
const {finite,deepFreeze}=require('./contracts.js');
function createUniverseSnapshot({exchangeInfo={},version,mode='current-survivors-only',observedAt=Date.now(),source='binance-exchangeInfo',exchange='BINANCE',marketType='spot',quoteAsset='USDT',lineageComplete=false}={}){
  const universeVersion=String(version||'').trim();if(!universeVersion)throw new Error('universe version required');
  const ts=finite(observedAt);if(ts==null)throw new Error('observedAt required');
  const quote=String(quoteAsset||'USDT').toUpperCase(),mt=String(marketType||'spot');
  const symbols=(Array.isArray(exchangeInfo.symbols)?exchangeInfo.symbols:[]).filter(x=>
    String(x?.quoteAsset||'').toUpperCase()===quote&&String(x?.status||'')==='TRADING'&&(mt!=='spot'||x?.isSpotTradingAllowed!==false)
  ).map(x=>({symbol:String(x.symbol||'').toUpperCase(),baseAsset:String(x.baseAsset||'').toUpperCase(),quoteAsset:quote,exchange:String(x.exchange||exchange||'BINANCE').toUpperCase(),marketType:String(x.marketType||mt),listedAt:finite(x.listedAt??x.onboardDate),delistedAt:finite(x.delistedAt??x.deliveryDate),contractType:x.contractType?String(x.contractType):null})).filter(x=>x.symbol);
  const universeMode=String(mode||'current-survivors-only');
  const survivorshipSafe=universeMode!=='current-survivors-only'&&Boolean(lineageComplete);
  return deepFreeze({universeVersion,universeMode,survivorshipSafe,lineageComplete:Boolean(lineageComplete),exchange:String(exchange||'BINANCE').toUpperCase(),marketType:mt,quoteAsset:quote,availabilitySource:String(source),observedAt:ts,symbols});
}
function eligibleSymbolsAt(universe,ts){
  const t=finite(ts);return (universe?.symbols||[]).filter(x=>(x.listedAt==null||x.listedAt<=t)&&(x.delistedAt==null||x.delistedAt>t)).map(x=>x.symbol);
}
module.exports={createUniverseSnapshot,eligibleSymbolsAt};
