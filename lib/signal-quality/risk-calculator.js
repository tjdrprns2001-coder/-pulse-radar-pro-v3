(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PulseRiskCalculator=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
function n(v){if(v==null||typeof v==='boolean'||typeof v==='object'||String(v).trim()==='')return null;v=Number(v);return Number.isFinite(v)?v:null}
function rejected(reason){return{valid:false,reason,riskAmount:null,stopDistance:null,quantity:null,notional:null,targets:[],stagedExits:[],referenceOnly:true}}
function calculate(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))return rejected('INVALID_INPUT');
 const accountSize=n(input.accountSize),riskPct=n(input.riskPct),entry=n(input.entry),invalidation=n(input.invalidation);
 if(accountSize==null||accountSize<=0||riskPct==null||riskPct<=0||riskPct>100||entry==null||entry<=0||invalidation==null||invalidation<=0||invalidation===entry)return rejected('INVALID_INPUT');
 if(input.targets!=null&&!Array.isArray(input.targets)||input.exitWeights!=null&&!Array.isArray(input.exitWeights))return rejected('INVALID_TARGETS');
 const targets=(input.targets||[]).map(n),weights=(input.exitWeights||[]).map(n),side=invalidation<entry?'long':'short';
 if(targets.some(x=>x==null||x<=0||(side==='long'?x<=entry:x>=entry)))return rejected('INVALID_TARGETS');
 if(weights.some(x=>x==null||x<0)||weights.length&&weights.length!==targets.length)return rejected('INVALID_WEIGHTS');
 const riskAmount=accountSize*(riskPct/100),stopDistance=Math.abs(entry-invalidation),quantity=riskAmount/stopDistance,notional=quantity*entry,stopPct=stopDistance/entry*100;
 if(![riskAmount,stopDistance,quantity,notional,stopPct].every(x=>Number.isFinite(x)&&x>0))return rejected('OUT_OF_RANGE');
 const targetRows=targets.map((price,i)=>{const rewardDistance=side==='long'?price-entry:entry-price;return{index:i+1,price,rewardDistance,rewardRisk:rewardDistance/stopDistance}});
 if(targetRows.some(t=>!Number.isFinite(t.rewardRisk)))return rejected('OUT_OF_RANGE');
 let normalized=weights.length?weights:targets.map(()=>1),sum=normalized.reduce((a,b)=>a+b,0);
 if(!Number.isFinite(sum))return rejected('OUT_OF_RANGE');
 if(sum<=0){normalized=targets.map(()=>1);sum=targets.length}
 const stagedExits=targetRows.map((t,i)=>({target:t.price,weightPct:normalized[i]/sum*100,quantity:quantity*(normalized[i]/sum),rewardRisk:t.rewardRisk}));
 return{valid:true,referenceOnly:true,accountSize,riskPct,riskAmount,entry,invalidation,side,stopDistance,stopPct,quantity,notional,targets:targetRows,stagedExits};
}
return{calculate};
});
