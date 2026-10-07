const assert=require('assert');
const A=require('../lib/coin-report/pro-analyzer.js');
function frame(start=1,dir=1,step=3600000,now=300*86400000){
 const out=[];for(let i=0;i<260;i++){const base=start+i*.001*dir+Math.sin(i/4)*.01,c=Math.max(.01,base),o=Math.max(.01,c-.002*dir),h=Math.max(o,c)+.006,l=Math.max(.001,Math.min(o,c)-.006),v=1000+(i%17)*25+(i>245?500:0),t=i*step;out.push([t,o,h,l,c,v,t+step-1,v*c,0,0,v*c*.56])}
 out.push([now+step,start,start*3,start*.2,start*2,999999,now+2*step,0,0,0,0]);
 return out
}
const now=300*86400000;
const frames={'1h':frame(.08,1,3600000,now),'4h':frame(.08,1,4*3600000,now),'1d':frame(.08,1,86400000,now)};
const r=A.analyzeProfessional({symbol:'DOGEUSDT',frames,nowMs:now,market:{currentPrice:.34,change24hPct:-2.5,change7dPct:3.2,quoteVolume24h:150000000,btc24hPct:-1,btc7dPct:1,eth24hPct:-1.7,eth7dPct:2},derivatives:{fundingPct:.01,globalLongShortRatio:2.2,topTraderPositionRatio:1.8,openInterest:123456,v2Profile:{oi1hPct:-1,oi4hPct:-2,oi24hPct:-5,taker1h:[{ratio:.82}]}}});
assert.equal(r.version,'PRO_ANALYSIS_v1');
assert.equal(r.symbol,'DOGEUSDT');
assert(r.timeframes['1h'].available);
assert(Number.isFinite(r.timeframes['1h'].ema[200].value),'EMA200 requires deep history');
assert(Number.isFinite(r.timeframes['4h'].rsi14));
assert(Number.isFinite(r.timeframes['1d'].macd.hist));
assert(r.fibonacci&&Number.isFinite(r.fibonacci.levels['50']));
assert(r.pivot&&Number.isFinite(r.pivot.p));
assert.equal(r.derivatives.oi24hPct,-5);
assert.equal(r.derivatives.globalLongShortRatio,2.2);
assert.equal(r.relativeStrength.vsBtc24hPct,-1.5);
assert(!r.timeframes['1h'].candles.some(x=>x.v===999999),'in-progress candle must be excluded');
assert(['bullish','bearish','neutral'].includes(r.judgement.state));
assert(r.scenarios.bullish&&r.scenarios.bearish&&r.scenarios.neutral);

const missing=A.analyzeProfessional({symbol:'MISSUSDT',frames,nowMs:now,market:{currentPrice:.34},derivatives:{globalLongShortRatio:null,topTraderPositionRatio:undefined,openInterest:null,v2Profile:{oi24hPct:null,taker1h:[{ratio:null}]}}});
assert.equal(missing.derivatives.globalLongShortRatio,null,'null long/short must stay unavailable');
assert.equal(missing.derivatives.topTraderPositionRatio,null,'undefined top trader ratio must stay unavailable');
assert.equal(missing.derivatives.openInterest,null,'null OI must stay unavailable');
assert.equal(missing.derivatives.taker1hRatio,null,'null taker ratio must stay unavailable');
if(r.levels.resistances.length>1)assert(r.levels.resistances[0].mid<=r.levels.resistances[1].mid,'resistances must be ordered nearest-up first');
if(r.levels.supports.length>1)assert(r.levels.supports[0].mid>=r.levels.supports[1].mid,'supports must be ordered nearest-down first');
console.log('professional coin analysis PASS');
