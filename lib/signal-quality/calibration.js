(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PulseCalibration=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
function clamp01(v){v=Number(v);return Number.isFinite(v)?Math.max(0,Math.min(1,v)):null}
function valid(samples=[]){return samples.map(x=>({p:clamp01(x.probability),y:Number(x.outcome)})).filter(x=>x.p!=null&&(x.y===0||x.y===1))}
function brierScore(samples=[]){const a=valid(samples);if(!a.length)return null;return a.reduce((s,x)=>s+(x.p-x.y)**2,0)/a.length}
function reliabilityBins(samples=[],binCount=10){const a=valid(samples),bins=Array.from({length:binCount},(_,i)=>({min:i/binCount,max:(i+1)/binCount,n:0,meanP:0,rate:0}));for(const x of a){const i=Math.min(binCount-1,Math.floor(x.p*binCount)),b=bins[i];b.n++;b.meanP+=x.p;b.rate+=x.y}return bins.map(b=>b.n?{...b,meanP:b.meanP/b.n,rate:b.rate/b.n}:b)}
function expectedCalibrationError(samples=[],binCount=10){const a=valid(samples);if(!a.length)return null;return reliabilityBins(a,binCount).reduce((s,b)=>s+(b.n/a.length)*Math.abs(b.meanP-b.rate),0)}
function saturationRate(samples=[],threshold=.95){const a=valid(samples);if(!a.length)return null;return a.filter(x=>x.p>=threshold).length/a.length}
function precisionAtFraction(samples=[],fraction=.2){const rows=samples.map(x=>({p:clamp01(x.probability),y:Number(x.outcome)})).filter(x=>x.p!=null&&(x.y===0||x.y===1)).sort((a,b)=>b.p-a.p);if(!rows.length)return null;const n=Math.max(1,Math.ceil(rows.length*Math.max(.01,Math.min(1,fraction)))),top=rows.slice(0,n);return top.reduce((s,x)=>s+x.y,0)/top.length}
function empiricalProbability(samples=[],minSamples=30){const a=valid(samples);if(a.length<minSamples)return{available:false,n:a.length,probability:null,status:'insufficient-sample'};return{available:true,n:a.length,probability:a.reduce((s,x)=>s+x.y,0)/a.length,status:'calibrated-sample'} }
function report(samples=[],opts={}){const min=Number(opts.minSamples||30),e=empiricalProbability(samples,min);return{...e,brier:brierScore(samples),ece:expectedCalibrationError(samples),saturation:saturationRate(samples),precisionTop20:precisionAtFraction(samples,.2),bins:reliabilityBins(samples)}}
return{clamp01,brierScore,reliabilityBins,expectedCalibrationError,saturationRate,precisionAtFraction,empiricalProbability,report};
});
