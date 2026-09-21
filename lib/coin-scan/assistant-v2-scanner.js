'use strict';

const PARAM_SET='assistant_v2_research_2026-09';
const OI_BUILD=1.0, OI_CLEAN=-1.0, TAKER_IMPROVE=1.2, TAKER_STRONG=1.5, HTF_DISCOUNT=35, MID_TERM_PREMIUM=80;

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function mark(v){const n=finite(v);if(n==null)return'N/A';if(n>OI_BUILD)return'+';if(n<=OI_CLEAN)return'-';return'0'}
function oiPath({h8_12,h4_8,h0_4}={}){return[mark(h8_12),mark(h4_8),mark(h0_4)]}
function isPureBuild(path){return Array.isArray(path)&&path.length===3&&path.every((x,i)=>x==='+'||(i===0&&x==='0'))&&path[1]==='+'&&path[2]==='+'}
function isCleanRebuild(path){
  if(!Array.isArray(path)||path.length!==3)return false;
  const [a,b,c]=path;
  return c==='+'&&((a==='-'&&['-','0','+'].includes(b))||(b==='-'));
}
function isCleanNow(path){return Array.isArray(path)&&path[2]==='-'}
function countImprove(arr){return(Array.isArray(arr)?arr:[]).slice(-3).filter(x=>finite(x)>TAKER_IMPROVE).length}
function strongFlow({taker1h=[],taker15m=[],price1hPct}={}){
  const p=finite(price1hPct), one=(Array.isArray(taker1h)?taker1h:[]).slice(-3).map(finite).filter(Number.isFinite);
  const fifteen=(Array.isArray(taker15m)?taker15m:[]).slice(-4).map(finite).filter(Number.isFinite);
  const oneStrong=one.some(x=>x>=TAKER_STRONG);
  const fifteenStrong=fifteen.length>=3&&fifteen.slice(-3).every(x=>x>TAKER_IMPROVE)&&fifteen.some(x=>x>=TAKER_STRONG);
  return Boolean((oneStrong||fifteenStrong)&&p!=null&&p>0);
}
function direction({oi4hPct,taker1h=[]}={}){
  const oi=finite(oi4hPct),n=countImprove(taker1h);
  return oi!=null&&oi>OI_BUILD&&n>=2?'long':'none';
}
function classify(input={}){
  const missing=[];
  for(const k of ['price24hPct','oi4hPct','fundingRate','range1wPct','range1dPct'])if(finite(input[k])==null)missing.push(k);
  if(!Array.isArray(input.taker1h)||!input.taker1h.map(finite).some(Number.isFinite))missing.push('trueTaker1h');
  const path=oiPath(input.oiBuckets||{});
  if(path.includes('N/A'))missing.push('oiPath');
  if(missing.length)return{type:'미완성(데이터 부족)',stage:'⚪ 관찰',direction:'none',path,missing,counterEvidence:['필수 데이터 N/A'],priority:'낮음',paramSet:PARAM_SET};

  const oi4=finite(input.oi4hPct),p24=finite(input.price24hPct),w=finite(input.range1wPct),d=finite(input.range1dPct),fund=finite(input.fundingRate);
  const t1=(input.taker1h||[]).map(finite).filter(Number.isFinite),latest=t1.at(-1),dir=direction({oi4hPct:oi4,taker1h:t1}),flow=strongFlow({taker1h:t1,taker15m:input.taker15m,price1hPct:input.price1hPct});
  const htfDiscount=w<=HTF_DISCOUNT,midPremium=d>=MID_TERM_PREMIUM;
  const counter=[];
  let type='미완성',stage='⚪ 관찰',priority='보통';

  if(isCleanRebuild(path)){type='C 후보 · 정리 후 재구축';stage='🟢 준비중';}
  else if(isCleanNow(path)){type='C 후보 · 미결제약정 정리';stage='🟡 관찰';}
  else if(isPureBuild(path)&&oi4>OI_BUILD&&htfDiscount){type='A · 연속 미결제약정 구축';stage='🟢 준비중';}
  else if(oi4>0&&oi4<=OI_BUILD&&htfDiscount){type='A-pre · 구축 초입';stage='⚪ 관찰';}
  else if(flow&&oi4<=OI_BUILD){type='B 후보 · 흐름 선행';stage='🟡 점화대기';}
  if(fund<0&&oi4>OI_BUILD&&htfDiscount&&Math.abs(p24)<10){type='NFB · 음펀딩 구축';stage='🟢 준비중';}
  if(midPremium){counter.push('1D 상단권이라 급등 전조 우선순위 낮음');priority='낮음'}
  if(latest!=null&&latest<0.8)counter.push('최근 1H true taker가 매도 우위');
  if(!isPureBuild(path)&&type.startsWith('A')){counter.push('OI 경로가 연속 구축이 아님');type='A-pre 또는 미완성';stage='⚪ 관찰'}
  if(type.startsWith('B')&&!flow){counter.push('강한 흐름 확인 부족');type='미완성';stage='⚪ 관찰'}
  if(dir==='none')counter.push('방향 확정 조건 미충족');
  if(Math.abs(p24)>=8)counter.push('24H 가격 변동이 이미 큼');
  if(!counter.length)counter.push('현재 라벨을 깨는 뚜렷한 반증 없음');

  return{type,stage,direction:dir,path,missing:[],counterEvidence:counter.slice(0,3),priority,paramSet:PARAM_SET,htfDiscount,midPremium,strongFlowConfirmed:flow,takerLatest:latest};
}

function bucketizeOi(rows=[]){
  const a=(Array.isArray(rows)?rows:[]).filter(x=>finite(x?.sumOpenInterest)!=null);
  function pct(fromBack,toBack){const i=a.length-1-fromBack,j=a.length-1-toBack;if(i<0||j<0)return null;const x=finite(a[i].sumOpenInterest),y=finite(a[j].sumOpenInterest);return x?((y/x)-1)*100:null}
  return{h8_12:pct(12,8),h4_8:pct(8,4),h0_4:pct(4,0),h12_24:pct(24,12)};
}

module.exports={PARAM_SET,OI_BUILD,OI_CLEAN,TAKER_IMPROVE,TAKER_STRONG,HTF_DISCOUNT,MID_TERM_PREMIUM,mark,oiPath,bucketizeOi,classify};
