(function(root,factory){const dep=typeof module==='object'&&module.exports?require('./math.js'):root.PulseAutoChartMath;const api=factory(dep);if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartIndicators=api;})(typeof globalThis!=='undefined'?globalThis:this,function(MathX){'use strict';
function movingAverages(candles,periods=[20,60]){const close=(candles||[]).map(x=>x.close),out={};for(const p of periods)out[p]=MathX.ema(close,p);return out}
return{movingAverages};
});