'use strict';
const {num}=require('./data');
const symbolOf=(v,x)=>v==='okx'?x.instId?.replace(/-SWAP$/,'').replace('-',''):v==='gate'?(x.name||x.id||x.contract||x.currency_pair)?.replace('_',''):x.symbol;
const valid=s=>typeof s==='string'&&/^[\p{L}\p{N}]{1,40}USDT$/u.test(s);
async function instruments(p,{symbol,market='perpetual',signal}={}){
 const v=p.venue,id=symbol?(v==='okx'?symbol.slice(0,-4)+'-USDT'+(market==='perpetual'?'-SWAP':''):v==='gate'?symbol.slice(0,-4)+'_USDT':symbol):null,qs=x=>new URLSearchParams(x);let rows=[];
 if(v==='bybit'){
  let cursor='';const cursors=new Set();for(let page=0;page<10;page++){
   const j=await p.get('/v5/market/instruments-info?'+qs({category:market==='spot'?'spot':'linear',...(symbol?{symbol}:market==='spot'?{}:{limit:'1000',...(cursor?{cursor}:{})})}),market,{ttl:300000,signal});rows.push(...(j.result?.list||[]));const next=j.result?.nextPageCursor;
   if(symbol||!next)break;if(cursors.has(next)||page===9)throw Error('Bybit instrument pagination incomplete');cursors.add(next);cursor=next;
  }
  rows=rows.filter(x=>x.status==='Trading'&&(market==='spot'||x.contractType==='LinearPerpetual'&&(!x.settleCoin||x.settleCoin==='USDT'))).map(x=>({symbol:x.symbol,native_symbol:x.symbol,tick:num(x.priceFilter?.tickSize),lot:num(x.lotSizeFilter?.qtyStep),min_notional:num(x.lotSizeFilter?.minNotionalValue)}));
 }else if(v==='okx'){
  const j=await p.get('/api/v5/public/instruments?'+qs({instType:market==='spot'?'SPOT':'SWAP',...(id?{instId:id}:{})}),market,{ttl:300000,signal});rows=(j.data||[]).filter(x=>x.state==='live'&&(market==='spot'||x.ctType==='linear'&&x.settleCcy==='USDT')).map(x=>({symbol:symbolOf(v,x),native_symbol:x.instId,tick:num(x.tickSz),lot:market==='spot'?num(x.lotSz):null,contract_lot:num(x.lotSz),contract_value:num(x.ctVal),contract_value_currency:x.ctValCcy,quantity_unit:market==='spot'?'base':'contracts'}));
 }else if(v==='bitget'){
  const j=await p.get((market==='spot'?'/api/v2/spot/public/symbols?':'/api/v2/mix/market/contracts?')+qs({...(symbol?{symbol}:{}),...(market==='spot'?{}:{productType:'USDT-FUTURES'})}),market,{ttl:300000,signal});rows=(j.data||[]).filter(x=>market==='spot'?x.status==='online':x.symbolStatus==='normal'&&(!x.symbolType||x.symbolType==='perpetual')).map(x=>({symbol:x.symbol,native_symbol:x.symbol,tick:market==='spot'?10**(-Number(x.pricePrecision)):Number(x.priceEndStep)*10**(-Number(x.pricePlace)),lot:market==='spot'?10**(-Number(x.quantityPrecision)):num(x.sizeMultiplier),min_notional:num(x.minTradeUSDT)}));
 }else{
  const j=await p.get((market==='spot'?'/spot/currency_pairs':'/futures/usdt/contracts')+(id?'/'+id:''),market,{ttl:300000,signal});rows=(Array.isArray(j)?j:[j]).filter(x=>market==='spot'?x.trade_status==='tradable':!x.in_delisting&&x.type==='direct').map(x=>({symbol:symbolOf(v,x),native_symbol:x.name||x.id,tick:market==='spot'?10**(-Number(x.precision)):num(x.order_price_round),lot:market==='spot'?10**(-Number(x.amount_precision)):null,contract_value:num(x.quanto_multiplier),quantity_unit:market==='spot'?'base':'contracts'}));
 }
 return [...new Map(rows.filter(x=>valid(x.symbol)&&(!symbol||x.symbol===symbol)).map(x=>[x.symbol,{...x,venue:v,market}])).values()];
}
async function tickers(p,{market='perpetual',signal}={}){
 const v=p.venue,qs=x=>new URLSearchParams(x);let rows;
 if(v==='bybit'){const j=await p.get('/v5/market/tickers?'+qs({category:market==='spot'?'spot':'linear'}),market,{signal});rows=(j.result?.list||[]).map(x=>({symbol:x.symbol,priceChangePercent:num(x.price24hPcnt)==null?null:num(x.price24hPcnt)*100,quoteVolume:num(x.turnover24h)}));}
 else if(v==='okx'){const j=await p.get('/api/v5/market/tickers?'+qs({instType:market==='spot'?'SPOT':'SWAP'}),market,{signal});rows=(j.data||[]).map(x=>({symbol:symbolOf(v,x),priceChangePercent:num(x.last)!=null&&num(x.open24h)>0?(num(x.last)/num(x.open24h)-1)*100:null,quoteVolume:num(x.volCcyQuote24h)??(market==='spot'?num(x.volCcy24h):null),quote_volume_quality:num(x.volCcyQuote24h)!=null||market==='spot'?'reported':'unavailable'}));}
 else if(v==='bitget'){const j=await p.get(market==='spot'?'/api/v2/spot/market/tickers':'/api/v2/mix/market/tickers?productType=USDT-FUTURES',market,{signal});rows=(j.data||[]).map(x=>({symbol:x.symbol,priceChangePercent:num(x.change24h)==null?null:num(x.change24h)*100,quoteVolume:num(x.quoteVolume)}));}
 else{const j=await p.get(market==='spot'?'/spot/tickers':'/futures/usdt/tickers',market,{signal});rows=j.map(x=>({symbol:symbolOf(v,x),priceChangePercent:num(x.change_percentage),quoteVolume:num(market==='spot'?x.quote_volume:x.volume_24h_quote)}));}
 return rows.filter(x=>valid(x.symbol)).map(x=>({...x,venue:v,market,quote_volume_quality:x.quote_volume_quality||(x.quoteVolume==null?'unavailable':'reported'),received_at:p.now()}));
}
module.exports={instruments,tickers};
