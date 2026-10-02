(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartMultiTf=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const ORDER=['1w','1d','4h','1h','15m','5m'];
const ROLE={ '1w':'환경','1d':'환경','4h':'셋업','1h':'셋업','15m':'실행','5m':'실행' };
const finite=v=>v!=null&&v!==''&&Number.isFinite(Number(v));
function bias(frame){
 if(!frame?.available)return'UNKNOWN';let score=0;
 if(frame.structure?.key==='UPTREND')score+=2;if(frame.structure?.key==='DOWNTREND')score-=2;
 if(frame.advanced?.emaTrend==='BULL')score+=2;if(frame.advanced?.emaTrend==='BEAR')score-=2;
 const r=Number(frame.advanced?.rsi?.value);if(Number.isFinite(r)){if(r>=55)score++;else if(r<=45)score--}
 const h=Number(frame.advanced?.macd?.histNow);if(Number.isFinite(h))score+=h>0?1:h<0?-1:0;
 return score>=3?'BULL':score<=-3?'BEAR':'NEUTRAL'
}
function setupState(frame){
 if(!frame?.available)return'NO_DATA';
 const a=frame.advanced||{},recent=(a.sweeps||[]).slice(-6),bull=recent.some(x=>x.kind==='SELL_SIDE_SWEEP'),bear=recent.some(x=>x.kind==='BUY_SIDE_SWEEP');
 if(frame.setup?.state==='RETEST_CONFIRMED')return'RETEST_CONFIRMED';
 if(a.compressionState==='STRONG')return'COMPRESSION';
 if(bull&&!bear)return'SELL_SIDE_SWEPT';
 if(bear&&!bull)return'BUY_SIDE_SWEPT';
 if((a.fvg||[]).length||(a.orderBlocks||[]).length)return'ZONE_READY';
 return frame.setup?.state||'OBSERVE'
}
function execution(frame,side){
 if(!frame?.available)return{status:'NO_DATA',score:0};
 const a=frame.advanced||{},v=frame.volume||{},r=Number(a.rsi?.value),hist=Number(a.macd?.histNow),improving=a.macd?.improving,ema=a.emaTrend,rv=Number(v.rvol20),recent=(a.sweeps||[]).slice(-8);
 let score=0,evidence=[];
 if(side==='LONG'){
  if(ema==='BULL'){score+=2;evidence.push('EMA 정배열')}
  if(Number.isFinite(r)&&r>=50){score++;evidence.push('RSI≥50')}
  if(Number.isFinite(hist)&&hist>=0){score++;evidence.push('MACD≥0')}else if(improving){score+=.5;evidence.push('MACD 개선')}
  if(recent.some(x=>x.kind==='SELL_SIDE_SWEEP')){score+=2;evidence.push('하단 유동성 스윕')}
 }else{
  if(ema==='BEAR'){score+=2;evidence.push('EMA 역배열')}
  if(Number.isFinite(r)&&r<=50){score++;evidence.push('RSI≤50')}
  if(Number.isFinite(hist)&&hist<=0){score++;evidence.push('MACD≤0')}else if(improving===false){score+=.5;evidence.push('MACD 약화')}
  if(recent.some(x=>x.kind==='BUY_SIDE_SWEEP')){score+=2;evidence.push('상단 유동성 스윕')}
 }
 if(Number.isFinite(rv)&&rv>=1.2){score++;evidence.push('RVOL≥1.2')}
 return{status:score>=6?'READY':score>=4?'WATCH':'WAIT',score,evidence}
}
function synthesize(frames={}){
 const rows=ORDER.map(tf=>{const f=frames[tf];return{timeframe:tf,role:ROLE[tf],available:!!f?.available,bias:bias(f),structure:f?.structure?.key||'NO_DATA',setup:setupState(f),compression:f?.advanced?.compressionState||'N/A',rsi:f?.advanced?.rsi?.value??null,macdHist:f?.advanced?.macd?.histNow??null,rvol:f?.volume?.rvol20??null}});
 const env=rows.filter(x=>['1w','1d'].includes(x.timeframe)&&x.available),setup=rows.filter(x=>['4h','1h'].includes(x.timeframe)&&x.available),exec=rows.filter(x=>['15m','5m'].includes(x.timeframe)&&x.available);
 const envBull=env.filter(x=>x.bias==='BULL').length,envBear=env.filter(x=>x.bias==='BEAR').length;
 const regime=envBull===env.length&&env.length?'BULL':envBear===env.length&&env.length?'BEAR':'MIXED';
 const f15=frames['15m'],f5=frames['5m'],long15=execution(f15,'LONG'),long5=execution(f5,'LONG'),short15=execution(f15,'SHORT'),short5=execution(f5,'SHORT');
 const longScore=long15.score+long5.score,shortScore=short15.score+short5.score;
 const setupBull=setup.filter(x=>x.bias==='BULL'||/SELL_SIDE|RETEST/.test(x.setup)).length,setupBear=setup.filter(x=>x.bias==='BEAR'||/BUY_SIDE|RETEST/.test(x.setup)).length;
 const longState=regime==='BEAR'?'HTF_CONFLICT':longScore>=10&&setupBull?'READY':longScore>=7?'WATCH':'WAIT';
 const shortState=regime==='BULL'?'HTF_CONFLICT':shortScore>=10&&setupBear?'READY':shortScore>=7?'WATCH':'WAIT';
 return{order:ORDER,rows,regime,environment:{frames:env,bull:envBull,bear:envBear},setup:{frames:setup,bull:setupBull,bear:setupBear},execution:{frames:exec,long15,long5,short15,short5,longScore,shortScore,longState,shortState}}
}
return{ORDER,ROLE,bias,setupState,execution,synthesize};
});