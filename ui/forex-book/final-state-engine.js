(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseFinalStateEngine=api})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number.isFinite(Number(v))?Number(v):0));
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
function dnaSummary(dna){const p=dna?.pattern||{},best=Array.isArray(p.similarity)?p.similarity[0]:null;return{available:!!dna?.available,score:n(p.score),bestScore:n(best?.score),phase:String(p.phase||''),preStage:String(p.preSurgeDna?.stage||''),volumeStage:String(p.volumeMaDna?.stage||''),flowType:String(p.flowType?.key||''),controlRisk:!!p.controlRisk,shock:String(p.volumeShockMemory?.status||''),bestName:best?.name||best?.label||null}}
function classify(input={}){const mtf=input.mtf||{},pre=input.preSurge||{},dna=dnaSummary(input.dna),priceChange24=n(input.priceChange24,0),mtfScore=n(mtf?.consensus?.score),higher=n(mtf?.higherScore),lower=n(mtf?.lowerScore),preScore=n(pre?.score),preState=String(pre?.state||'N/A'),preDir=String(pre?.direction||''),agreement=n(mtf?.consensus?.agreement),reasons=[],risks=[];
 const risk=preState==='RISK'||dna.controlRisk||preDir==='하락/롱주의'||String(dna.flowType).includes('SQUEEZE')&&dna.bestScore>=70;
 if(risk){if(preState==='RISK')risks.push('파생 PRE-SURGE 위험');if(dna.controlRisk)risks.push('과거 대조군 DNA 유사');if(preDir==='하락/롱주의')risks.push('OI/Taker 롱 주의');}
 if(mtfScore>=20)reasons.push('멀티TF 상승 합의');else if(mtfScore<=-20)risks.push('멀티TF 하락 합의');else reasons.push('멀티TF 혼조');
 if(preState==='PRE-SURGE')reasons.push('PRE-SURGE 조건 확인');else if(preState==='SURGE')reasons.push('SURGE 진행');else if(preState==='WATCH')reasons.push('파생 WATCH');
 if(dna.bestScore>=70)reasons.push('급등 DNA '+Math.round(dna.bestScore)+'% 유사');else if(dna.bestScore>=50)reasons.push('급등 DNA 중간 유사');
 if(['IGNITION','EXPANSION'].includes(dna.volumeStage))reasons.push('거래량 '+dna.volumeStage);if(['DIRECT_BUILD','CLEAN_REBUILD','ABSORPTION'].includes(dna.flowType))reasons.push('Flow '+dna.flowType);
 const evidence=clamp((Math.abs(mtfScore)*.28)+(preScore*.30)+(dna.score*.18)+(dna.bestScore*.24));
 let state='준비중',stageScore=evidence,next='상위TF 구조 + 거래량/OI 선행 신호를 더 확인';
 const progressed=Math.abs(priceChange24)>=12||preState==='SURGE'||dna.phase==='PROGRESSED'||dna.volumeStage==='EXPANSION';
 const ignitionEarly=!risk&&!progressed&&mtfScore>=15&&preScore>=60&&preDir==='상승 확인'&&dna.bestScore>=55&&(dna.volumeStage==='IGNITION'||dna.preStage.includes('PRE')||dna.shock==='REIGNITION');
 const ignitionWait=!risk&&!progressed&&higher>=10&&preScore>=40&&dna.bestScore>=45;
 if(risk){state='위험';stageScore=Math.max(55,evidence);next='롱 회피 조건 해소: Taker 회복·OI 정리·구조 재확인';}
 else if(progressed){state='이미진행';stageScore=Math.max(65,evidence);next='추격보다 눌림/재압축·유동성 재구성 확인';}
 else if(ignitionEarly){state='점화초기';stageScore=Math.max(70,evidence);next='15m→1H 구조 유지와 거래량 재가속 확인';}
 else if(ignitionWait){state='점화대기';stageScore=Math.max(55,evidence);next='15m MSS/거래량 점화 + OI/Taker 동행 확인';}
 const freshness=[pre?.freshnessMs].filter(v=>Number.isFinite(Number(v)));const completeness=[mtf?.frames?.length>=4,pre?.available,dna.available].filter(Boolean).length;
 return{state,stageScore:Math.round(clamp(stageScore)),evidenceCompleteness:Math.round(completeness/3*100),reasons:reasons.slice(0,5),risks:risks.slice(0,4),next,metrics:{mtfScore,higher,lower,agreement,preScore,preState,preDir,dnaScore:dna.score,dnaBestScore:dna.bestScore,dnaBestName:dna.bestName,priceChange24},disclaimer:'최종 상태는 승률/매수신호가 아니라 MTF·파생·DNA 근거의 연구용 단계 분류입니다.'}}
return{classify,dnaSummary};
});