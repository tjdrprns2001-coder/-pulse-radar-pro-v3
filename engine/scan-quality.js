import {candleEnd,confirmedCandles} from './model.js';
// Missing candles are not synthesized: that would distort volume and RSI.
export function validateScanData(data,frame,now=Date.now()/1000){
 if(!Array.isArray(data)||!data.length)throw Error('캔들 데이터가 없습니다.');
 for(let i=0;i<data.length;i++){const c=data[i];if(!c||!['time','open','high','low','close','volume'].every(k=>Number.isFinite(c[k]))||c.time<0||c.low<=0||c.volume<0||c.high<Math.max(c.open,c.close,c.low)||c.low>Math.min(c.open,c.close))throw Error('유효하지 않은 OHLCV 데이터');
  if(c.time>now)throw Error('미래 시각의 캔들 데이터');
  if(i&&Math.abs(c.time-candleEnd(data[i-1].time,frame))>1)throw Error('캔들 중복·역순·누락으로 분석 보류');
 }
 const closed=confirmedCandles(data,frame,now);if(!closed.length)throw Error('확정봉이 없습니다.');
 const last=closed.at(-1),end=candleEnd(last.time,frame),duration=end-last.time;
 if(now-end>duration+120)throw Error('최신 확정봉이 오래되어 분석 보류');
 return data;
}
