(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PulseResearchLinks=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
function build(path,params={}){const base=String(path||'/'),pairs=[];for(const [k,v] of Object.entries(params)){if(v==null||v==='')continue;pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)}return base+(pairs.length?(base.includes('?')?'&':'?')+pairs.join('&'):'')}
function bundle({symbol='BTCUSDT',tf='4h',source='scanner',context='research'}={}){const p={symbol:String(symbol).toUpperCase(),tf,source,context};return{analysis:build('/technique-lab.html',p),snapshot:build('/snapshot-analysis-restored.html',p),ict:build('/ict-narrative-lab.html',p),performance:build('/performance-dashboard.html',p),risk:build('/risk-calculator.html',p)}}
return{build,bundle};
});
