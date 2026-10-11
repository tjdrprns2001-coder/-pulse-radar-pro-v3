import {derivativeMarkets,derivativeCandles,derivativeCapabilities,derivativesFrames} from './derivatives.js';
export const exchanges = [
 {id:'binance',name:'Binance',quote:'USDT',frames:['1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','3d','1w','1M']},
 {id:'bybit',name:'Bybit',quote:'USDT',frames:['1m','3m','5m','15m','30m','1h','2h','4h','6h','12h','1d','1w','1M']},
 {id:'okx',name:'OKX',quote:'USDT',frames:['1m','3m','5m','15m','30m','1h','2h','4h','6h','12h','1d','1w','1M']},
 {id:'upbit',name:'Upbit',quote:'KRW',frames:['1m','3m','5m','10m','15m','30m','1h','4h','1d','1w','1M']},
 {id:'bitget',name:'Bitget',quote:'USDT',frames:['1m','3m','5m','15m','30m','1h','4h','6h','12h','1d','1w','1M']},
 {id:'gate',name:'Gate',quote:'USDT',frames:['1m','5m','15m','30m','1h','4h','8h','1d','7d','30d']},
 {id:'kucoin',name:'KuCoin',quote:'USDT',frames:['1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','1w','1M']},
 {id:'coinbase',name:'Coinbase',quote:'USD',frames:['1m','5m','15m','1h','6h','1d']},
 {id:'kraken',name:'Kraken',quote:'USD',frames:['1m','5m','15m','30m','1h','4h','1d','1w','15d']}
];
export function frameSeconds(f){const m=/^(\d+)([mhdwM])$/.exec(f); if(!m)throw Error('지원하지 않는 시간봉');return +m[1]*({m:60,h:3600,d:86400,w:604800,M:2592000}[m[2]]);}
const market=(id,base,quote,name)=>({id,base,quote,name:name||base+'/'+quote});
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(16000),headers:{Accept:'application/json'}});if(!r.ok)throw Error('거래소 응답 '+r.status+' — 잠시 후 재시도하거나 다른 거래소를 선택하세요.');return r.json();}
export async function markets(id,type='spot'){if(type!=='spot')return derivativeMarkets(id,type);let d;
 switch(id){
 case 'binance':d=await get('https://data-api.binance.vision/api/v3/exchangeInfo');return d.symbols.filter(s=>s.status==='TRADING'&&s.isSpotTradingAllowed).map(s=>market(s.symbol,s.baseAsset,s.quoteAsset));
 case 'bybit':d=await get('https://api.bybit.com/v5/market/instruments-info?category=spot');if(d.retCode)throw Error(d.retMsg);return d.result.list.filter(s=>s.status==='Trading').map(s=>market(s.symbol,s.baseCoin,s.quoteCoin));
 case 'okx':d=await get('https://www.okx.com/api/v5/public/instruments?instType=SPOT');if(d.code!=='0')throw Error(d.msg);return d.data.filter(s=>s.state==='live').map(s=>market(s.instId,s.baseCcy,s.quoteCcy));
 case 'upbit':d=await get('https://api.upbit.com/v1/market/all?isDetails=false');return d.map(s=>{const [q,b]=s.market.split('-');return market(s.market,b,q,s.korean_name+' · '+b+'/'+q);});
 case 'bitget':d=await get('https://api.bitget.com/api/v2/spot/public/symbols');if(d.code!=='00000')throw Error(d.msg);return d.data.filter(s=>s.status==='online').map(s=>market(s.symbol,s.baseCoin,s.quoteCoin));
 case 'gate':d=await get('https://api.gateio.ws/api/v4/spot/currency_pairs');return d.filter(s=>s.trade_status==='tradable').map(s=>market(s.id,s.base,s.quote));
 case 'kucoin':d=await get('https://api.kucoin.com/api/v2/symbols');if(d.code!=='200000')throw Error(d.msg);return d.data.filter(s=>s.enableTrading).map(s=>market(s.symbol,s.baseCurrency,s.quoteCurrency));
 case 'coinbase':d=await get('https://api.exchange.coinbase.com/products');return d.filter(s=>s.status==='online'&&!s.trading_disabled).map(s=>market(s.id,s.base_currency,s.quote_currency));
 case 'kraken':d=await get('https://api.kraken.com/0/public/AssetPairs');if(d.error.length)throw Error(d.error.join(' '));return Object.entries(d.result).filter(([k,s])=>s.wsname&&!k.endsWith('.d')&&(!s.status||s.status==='online')).map(([k,s])=>{const [b,q]=s.wsname.split('/');return market(k,b.replace('XBT','BTC'),q);});
 default:throw Error('지원하지 않는 거래소');
 }
}
export async function candles(id,symbol,frame,limit=600,type='spot',route=''){if(type!=='spot')return derivativeCandles(id,symbol,frame,limit,type,route);const e=exchanges.find(x=>x.id===id);if(!e||!e.frames.includes(frame))throw Error('이 거래소에서 지원하지 않는 시간봉입니다.');if(!/^[A-Za-z0-9_.:/-]{2,80}$/.test(symbol))throw Error('유효하지 않은 마켓');limit=Math.max(50,Math.min(1000,Math.floor(limit)||600));const s=encodeURIComponent(symbol);let d,rows;const sec=frameSeconds(frame);
 switch(id){
 case 'binance':d=await get(`https://data-api.binance.vision/api/v3/klines?symbol=${s}&interval=${frame}&limit=${limit}`);rows=d.map(r=>[r[0]/1000,r[1],r[2],r[3],r[4],r[5]]);break;
 case 'bybit':{const f={ '1h':'60','2h':'120','4h':'240','6h':'360','12h':'720','1d':'D','1w':'W','1M':'M'}[frame]||frame.replace('m','');d=await get(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${s}&interval=${f}&limit=${limit}`);if(d.retCode)throw Error(d.retMsg);rows=d.result.list.map(r=>[r[0]/1000,...r.slice(1,6)]);break;}
 case 'okx':{const f={'1h':'1H','2h':'2H','4h':'4H','6h':'6Hutc','12h':'12Hutc','1d':'1Dutc','1w':'1Wutc','1M':'1Mutc'}[frame]||frame;d=await get(`https://www.okx.com/api/v5/market/candles?instId=${s}&bar=${f}&limit=300`);if(d.code!=='0')throw Error(d.msg);rows=d.data.map(r=>[r[0]/1000,...r.slice(1,6)]);break;}
 case 'upbit':{const kind=frame==='1d'?'days':frame==='1w'?'weeks':frame==='1M'?'months':'minutes/'+sec/60;d=await get(`https://api.upbit.com/v1/candles/${kind}?market=${s}&count=200`);rows=d.map(r=>[Date.parse(r.candle_date_time_utc+'Z')/1000,r.opening_price,r.high_price,r.low_price,r.trade_price,r.candle_acc_trade_volume]);break;}
 case 'bitget':{const f={'1h':'1h','4h':'4h','6h':'6h','12h':'12h','1d':'1day','1w':'1week','1M':'1M'}[frame]||frame+'in';d=await get(`https://api.bitget.com/api/v2/spot/market/candles?symbol=${s}&granularity=${f}&limit=${Math.min(1000,limit)}`);if(d.code!=='00000')throw Error(d.msg);rows=d.data.map(r=>[r[0]/1000,...r.slice(1,6)]);break;}
 case 'gate':d=await get(`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${s}&interval=${frame}&limit=${limit}`);rows=d.map(r=>[r[0],r[5],r[3],r[4],r[2],r[6]]);break;
 case 'kucoin':{const f={ '1m':'1min','3m':'3min','5m':'5min','15m':'15min','30m':'30min','1h':'1hour','2h':'2hour','4h':'4hour','6h':'6hour','8h':'8hour','12h':'12hour','1d':'1day','1w':'1week','1M':'1month'}[frame];d=await get(`https://api.kucoin.com/api/v1/market/candles?symbol=${s}&type=${f}&startAt=${Math.floor(Date.now()/1000-sec*limit)}`);if(d.code!=='200000')throw Error(d.msg);rows=d.data.map(r=>[r[0],r[1],r[3],r[4],r[2],r[5]]);break;}
 case 'coinbase':d=await get(`https://api.exchange.coinbase.com/products/${s}/candles?granularity=${sec}`);rows=d.map(r=>[r[0],r[3],r[2],r[1],r[4],r[5]]);break;
 case 'kraken':d=await get(`https://api.kraken.com/0/public/OHLC?pair=${s}&interval=${sec/60}`);if(d.error.length)throw Error(d.error.join(' '));rows=Object.entries(d.result).find(([k])=>k!=='last')[1].map(r=>[r[0],r[1],r[2],r[3],r[4],r[6]]);break;
 }
 const out=rows.map(r=>({time:+r[0],open:+r[1],high:+r[2],low:+r[3],close:+r[4],volume:+r[5]})).filter(c=>Object.values(c).every(Number.isFinite)&&c.time>0&&c.volume>=0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)).sort((a,b)=>a.time-b.time);return [...new Map(out.map(c=>[c.time,c])).values()].slice(-limit);
}

export function exchangeCatalog(){return exchanges.map(e=>({...e,types:['spot',...(derivativeCapabilities[e.id]||[])],derivativeFrames:derivativesFrames(e.id)}));}
