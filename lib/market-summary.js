'use strict';
// Only the market-list view consumes these compact fields. The complete endpoint
// contract remains unchanged unless view=summary is explicitly requested.
const MARKET_ROW_FIELDS=Object.freeze([
  'symbol','baseAsset','market','price','change24','quoteVol24',
  'change1h','change4h','pass','preScore','surgeScore','preRank','preTopPct',
  'exchangeCount','exchanges','primaryExchange','hasFutures',
  'futuresExchangeCount','futuresExchanges','primaryFuturesExchange',
  'deepSupported','detailSymbol','dataStatus','dataNote'
]);

function summarizeRow(row){
  const out={};
  for(const key of MARKET_ROW_FIELDS)
    if(Object.prototype.hasOwnProperty.call(row,key))out[key]=row[key];
  return out;
}
function summarizeMarket(payload){
  if(!payload||!payload.ok||!Array.isArray(payload.results))return payload;
  return {...payload,view:'summary',results:payload.results.map(summarizeRow)};
}
module.exports={MARKET_ROW_FIELDS,summarizeRow,summarizeMarket};
