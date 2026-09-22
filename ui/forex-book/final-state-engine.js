(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseFinalStateEngine=api})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const VERSION='2.0.0';
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number.isFinite(Number(v))?Number(v):0));
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const s=v=>String(v??'');
const dir=v=>{const x=s(v).toLowerCase();return x.includes('up')||x.includes('bull')||x.includes('상승')?'up':x.includes('down')||x.includes('bear')||x.includes('하락')?'down':'neutral'};
function dnaSummary(dna){const p=dna?.pattern||{},best=Array.isArray(p.similarity)?p.similarity[0]:null;return{available:!!dna?.available,score:n(p.score),bestScore:n(best?.score),phase:s(p.phase),preStage:s(p.preSurgeDna?.stage),volumeStage:s(p.volumeMaDna?.stage),flowType:s(p.flowType?.key),controlRisk:!!p.controlRisk,shock:s(p.volumeShockMemory?.status),bestName:best?.name||best?.label||null}}
function bookSummary(book={},technical={},smc={}){const patterns=[...(book?.patterns||[]),...(book?.chartPatterns||[])],bearishPatterns=patterns.filter(x=>dir(x?.side)==='down'),bullishPatterns=patterns.filter(x=>dir(x?.side)==='up'),mss=(smc?.mss||[]).at?.(-1)||null;return{available:!!book?.available,rsi:n(book?.indicators?.rsi,n(technical?.rsi,NaN)),rvol:n(book?.volumeBehavior?.rvol,n(technical?.rvol,NaN)),marketPhase:s(book?.marketPhase?.phase),trendStage:s(book?.trendStage?.stage),bookBias:s(book?.confluence?.bias||book?.professional?.bias),professionalStage:s(book?.professional?.stage),bearishPatterns,bullishPatterns,bearishCount:bearishPatterns.length,bullishCount:bullishPatterns.length,mssDir:s(mss?.dir||mss?.direction),mssQuality:n(mss?.quality),mature:s(book?.trendStage?.stage).includes('성숙'),early:s(book?.trendStage?.stage).includes('초기'),bullPhase:s(book?.marketPhase?.phase).includes('상승'),bearPhase:s(book?.marketPhase?.phase).includes('하락')}}
function classify(input={}){const mtf=input.mtf||{},pre=input.preSurge||{},dna=dnaSummary(input.dna),book=bookSummary(input.book,input.technical,input.smc),priceChange24=n(input.priceChange24,0),mtfScore=n(mtf?.consensus?.score),higher=n(mtf?.higherScore),lower=n(mtf?.lowerScore),preScore=n(pre?.score),preState=s(pre?.state||'N/A'),preDir=s(pre?.direction),agreement=n(mtf?.consensus?.agreement),dnaSignal=Math.max(dna.score,dna.bestScore),reasons=[],risks=[];
 const dnaMissing=!dna.available,dnaWeak=dna.available&&dnaSignal<25,dnaMedium=dnaSignal>=35,dnaStrong=dnaSignal>=55;
 const preRaw=preState==='PRE-SURGE',preBull=preDir==='상승 확인',preQualified=preRaw&&preBull&&preScore>=55&&!dnaWeak;
 const prePenalty=preRaw?(dnaWeak?.55:dnaMissing?.85:1):1,effectivePreScore=preScore*prePenalty;
 const mss=dir(book.mssDir),bookDir=dir(book.bookBias),htfBull=higher>=10||book.bullPhase,htfBear=higher<=-10||book.bearPhase,ltfBear=lower<=-10||bookDir==='down'||mss==='down',ltfBull=lower>=10||bookDir==='up'||mss==='up';
 const overbought=Number.isFinite(book.rsi)&&book.rsi>=70,veryOverbought=Number.isFinite(book.rsi)&&book.rsi>=78,oversold=Number.isFinite(book.rsi)&&book.rsi<=30,volumeExpansion=book.rvol>=1.5||dna.volumeStage==='EXPANSION',volumeIgnition=book.rvol>=1.25||dna.volumeStage==='IGNITION'||dna.shock==='REIGNITION';
 const structureDamage=(mtfScore<=-30&&higher<=-15)||(higher<=-20&&lower<=-15)||(mss==='down'&&lower<=-20&&(bookDir==='down'||book.bearPhase));
 const rawRisk=preState==='RISK'||dna.controlRisk||preDir==='하락/롱주의';
 const pullbackConflict=htfBull&&(ltfBear||book.bearishCount>=2)&&(book.mature||overbought||priceChange24>=5||mtfScore>0);
 const overheated=priceChange24>=18||(priceChange24>=10&&veryOverbought)||(book.mature&&veryOverbought&&volumeExpansion)||(preState==='SURGE'&&priceChange24>=12);
 const progressed=priceChange24>=8||preState==='SURGE'||dna.phase==='PROGRESSED'||dna.volumeStage==='EXPANSION'||(book.mature&&mtfScore>=10&&book.rsi>=58);
 const ignitionEarly=!structureDamage&&!overheated&&!pullbackConflict&&!rawRisk&&!progressed&&mtfScore>=12&&preQualified&&(dnaStrong||volumeIgnition)&&(lower>=0||mss==='up');
 const ignitionWait=!structureDamage&&!overheated&&!pullbackConflict&&!rawRisk&&!progressed&&higher>=8&&((preQualified&&dnaMedium)||(dnaStrong&&effectivePreScore>=35));
 if(mtfScore>=20)reasons.push('멀티TF 상승 합의');else if(mtfScore<=-20)risks.push('멀티TF 하락 합의');else reasons.push('멀티TF 혼조');
 if(preRaw){if(preQualified)reasons.push('PRE-SURGE 통합 확인');else if(dnaWeak)risks.push('원시 PRE-SURGE이나 DNA 유사도 부족');else reasons.push('원시 PRE-SURGE · 추가 교차확인 필요')}else if(preState==='SURGE')reasons.push('SURGE 진행');else if(preState==='WATCH')reasons.push('파생 WATCH');
 if(dnaStrong)reasons.push('급등 DNA '+Math.round(dnaSignal)+'% 유사');else if(dnaMedium)reasons.push('급등 DNA 중간 유사');else if(dna.available)risks.push('급등 DNA 근거 약함');
 if(book.bullPhase)reasons.push('상위 시장 국면 상승');if(book.mature)reasons.push('성숙 추세');if(overbought)risks.push('RSI 과매수 '+Math.round(book.rsi));if(oversold)risks.push('RSI 과매도 '+Math.round(book.rsi));
 if(book.bearishCount>=2)risks.push('단기 하락 패턴 '+book.bearishCount+'개');else if(book.bearishCount===1)risks.push('단기 하락 패턴 확인');if(book.bullishCount)reasons.push('상승 패턴 '+book.bullishCount+'개');
 if(mss==='up')reasons.push('최근 MSS 상승');else if(mss==='down')risks.push('최근 MSS 하락');if(volumeExpansion)reasons.push('거래량 확장');if(rawRisk){if(preState==='RISK')risks.push('파생 위험 상태');if(dna.controlRisk)risks.push('대조군/과열 DNA 위험');if(preDir==='하락/롱주의')risks.push('OI/Taker 롱 주의')}
 const evidence=clamp(Math.abs(mtfScore)*.24+effectivePreScore*.24+dna.score*.14+dna.bestScore*.18+(book.available?12:0)+(volumeIgnition?8:0));
 let state='준비중',stageScore=evidence,next='상위TF 구조 + 거래량/OI 선행 신호를 더 확인',summary='근거가 아직 점화 단계에 충분하지 않음';
 if(structureDamage){state='구조훼손';stageScore=Math.max(70,evidence);next='상위TF 구조 복구 + MSS/BOS 재확인 전까지 롱 회피';summary='상·하위 구조 훼손이 겹친 롱 회피 구간'}
 else if(overheated){state='과열';stageScore=Math.max(75,evidence);next='추격보다 거래량 냉각·RSI 리셋·재압축 확인';summary='상승 진행 후 과열 신호가 겹친 구간'}
 else if(pullbackConflict||rawRisk){state='눌림위험';stageScore=Math.max(62,evidence);next='단기 하락 신호 해소 + 지지 방어 + 하위TF MSS 재상승 확인';summary='상위 상승 구조와 단기 하락/과열 신호가 충돌'}
 else if(progressed){state='진행중';stageScore=Math.max(66,evidence);next='추격보다 눌림·재압축 후 구조 유지 여부 확인';summary='점화 단계를 지나 상승 파동이 이미 진행된 상태'}
 else if(ignitionEarly){state='점화초기';stageScore=Math.max(72,evidence);next='15m→1H 구조 유지 + RVOL/OI/Taker 재가속 확인';summary='다중 근거가 실제 점화로 전환되는 초기 구간'}
 else if(ignitionWait){state='점화대기';stageScore=Math.max(56,evidence);next='15m MSS/거래량 점화 + OI/Taker 동행 확인';summary='구조와 선행 근거는 있으나 실제 점화 확인 전'}
 const sourceFlags=[mtf?.frames?.length>=4,pre?.available,dna.available,book.available,!!input.smc||!!input.technical],completeness=sourceFlags.filter(Boolean).length/sourceFlags.length;
 return{version:VERSION,state,summary,stageScore:Math.round(clamp(stageScore)),evidenceCompleteness:Math.round(completeness*100),reasons:[...new Set(reasons)].slice(0,7),risks:[...new Set(risks)].slice(0,6),next,metrics:{mtfScore,higher,lower,agreement,preScore,effectivePreScore:Math.round(effectivePreScore),preState,preDir,preQualified,dnaScore:dna.score,dnaBestScore:dna.bestScore,dnaSignal,dnaBestName:dna.bestName,priceChange24,rsi:book.rsi,rvol:book.rvol,marketPhase:book.marketPhase,trendStage:book.trendStage,bookBias:book.bookBias,mssDir:book.mssDir,bearishPatternCount:book.bearishCount,bullishPatternCount:book.bullishCount},disclaimer:'최종 상태는 승률/매수신호가 아니라 MTF·파생·DNA·책 구조·SMC 근거의 연구용 단계 분류입니다.'}}
return{VERSION,classify,dnaSummary,bookSummary};
});