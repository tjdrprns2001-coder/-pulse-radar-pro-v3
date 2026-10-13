'use strict';
function classify(data){
 if(data?.status!=='ok'||data?.stage!=='universe'||data?.method!=='dna'||!Array.isArray(data?.items))return {status:'FAIL',reason:'Invalid DNA universe response'};
 const s=data.sourceState;
 if(!s||typeof s.marketSource!=='string')return {status:'FAIL',reason:'Missing exchange provenance'};
 const blocked=Number(s.futuresBlockedUntil)>Date.now();
 const fallback=Boolean(s.futuresFallbackUsed)||s.marketSource!=='binance-futures';
 return {status:blocked||fallback?'DEGRADED':'PASS',marketSource:s.marketSource,fallbackSource:s.futuresFallbackSource||null,blocked};
}
module.exports={classify};
