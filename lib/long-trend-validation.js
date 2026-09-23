'use strict';
const DEFAULTS=Object.freeze({kValues:[5,10,20],promotionMinSamples:120,promotionMinPrecisionAt10:.60,minStrata:4});
function stratifiedSample(rows,{strataKeys=['symbolAgeBucket','marketRegime'],perStratum=25}={}){
  const groups=new Map();for(const r of rows||[]){const key=strataKeys.map(k=>String(r?.[k]??'NA')).join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)}
  const out=[];for(const [key,items] of groups){const sorted=[...items].sort((a,b)=>String(a.eventId||'').localeCompare(String(b.eventId||'')));out.push(...sorted.slice(0,perStratum).map(x=>({...x,__stratum:key})))}
  return out;
}
function precisionAtK(rows,k,{scoreKey='score',labelKey='hit'}={}){
  const valid=(rows||[]).filter(x=>Number.isFinite(Number(x?.[scoreKey]))&&typeof x?.[labelKey]==='boolean').sort((a,b)=>Number(b[scoreKey])-Number(a[scoreKey])).slice(0,k);
  if(!valid.length)return{precision:null,k,evaluated:0,hits:0};
  const hits=valid.filter(x=>x[labelKey]).length;return{precision:hits/valid.length,k,evaluated:valid.length,hits};
}
function evaluateValidation(rows,opts={}){
  const P={...DEFAULTS,...opts},sample=stratifiedSample(rows,P),precisions=Object.fromEntries(P.kValues.map(k=>[k,precisionAtK(sample,k,P)])),strata=new Set(sample.map(x=>x.__stratum)).size,p10=precisions[10]?.precision;
  const promoted=sample.length>=P.promotionMinSamples&&strata>=P.minStrata&&Number.isFinite(p10)&&p10>=P.promotionMinPrecisionAt10;
  return{sampleCount:sample.length,strata,precisions,promoted,status:promoted?'VALIDATED_CANDIDATE':'RESEARCH_ONLY',note:'Promotion gate requires historical stratified outcomes; synthetic/unit fixtures do not qualify.'};
}
module.exports={DEFAULTS,stratifiedSample,precisionAtK,evaluateValidation};