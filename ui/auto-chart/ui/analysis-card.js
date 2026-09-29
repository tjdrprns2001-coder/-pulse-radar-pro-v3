(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartAnalysisCard=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const $=id=>document.getElementById(id),finite=v=>Number.isFinite(Number(v));
function price(v){if(!finite(v))return'N/A';const n=Number(v);if(Math.abs(n)>=100)return n.toLocaleString('en-US',{maximumFractionDigits:2});if(Math.abs(n)>=1)return n.toFixed(4);return n.toPrecision(5)}
function localTime(ms){if(!finite(ms))return'-';return new Date(Number(ms)).toLocaleString('ko-KR',{hour12:false,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
function setText(id,v){const e=$(id);if(e)e.textContent=v??'-'}
function render(analysis,{aux=null}={}){
  if(!analysis?.available)return;
  setText('cardStructure',analysis.structure.label+(analysis.structure.evidence?.length?' · '+analysis.structure.evidence.join('/'):''));
  setText('cardStage',analysis.setup.label);
  const s=analysis.keyLevels.support,r=analysis.keyLevels.resistance;setText('cardSupport',s?price(s.low)+'–'+price(s.high)+' · '+String(s.timeframe).toUpperCase():'N/A');setText('cardResistance',r?price(r.low)+'–'+price(r.high)+' · '+String(r.timeframe).toUpperCase():'N/A');
  const inv=analysis.setup.invalidation;setText('cardInvalidation',inv?.price!=null?price(inv.price)+' · '+(inv.type==='range-low'?'박스 하단 이탈':'돌파 실패 기준'):'N/A');
  const c=analysis.setup.confirmation;setText('cardWaiting',c?.type==='close-above'?String(c.timeframe).toUpperCase()+' 종가 '+price(c.price)+' 위 확정':c?.type==='retest-hold'?'돌파 구간 '+price(c.low)+'–'+price(c.high)+' 재시험 지지':c?.type==='close-reclaim'?String(c.timeframe).toUpperCase()+' 종가 '+price(c.price)+' 재회복':analysis.setup.state==='RETEST_CONFIRMED'?'조건 충족 · 구조 유지 관찰':analysis.setup.state==='INVALIDATED'?'기존 시나리오 종료':'관찰 조건 미충족');
  setText('cardKnownAt','현재 상태 알려진 시각 · '+localTime(analysis.setup.knownAt));
  setText('updatedAt','데이터 '+localTime(analysis.dataStatus.updatedAt));
  const history=$('historyState');if(history){history.textContent='과거봉 정상';history.dataset.state='ok'}
  const gaps=analysis.dataStatus.gaps||[],items=[];if(gaps.length)items.push('누락 구간 '+gaps.length+'개');if(!analysis.range)items.push('유효 박스 없음');if(!s)items.push('확정 지지 N/A');if(!r)items.push('확정 저항 N/A');
  if(aux){if(aux.live?.available!==true)items.push('실시간 연결 지연');if(aux.derivatives?.available!==true&&analysis.market.marketType==='futures')items.push('OI/Taker N/A')}
  const box=$('dataNotes');if(box){box.innerHTML='';for(const t of(items.length?items:['핵심 데이터 정상'])){const span=document.createElement('span');span.textContent=t;box.append(span)}}
}
function loading(selection){setText('pageTitle',selection.symbol+' · '+String(selection.timeframe).toUpperCase());const e=$('historyState');if(e){e.textContent='과거봉 불러오는 중';e.dataset.state='loading'}}
function error(message,{keep=false}={}){const e=$('historyState');if(e){e.textContent=keep?'갱신 실패 · 이전 차트 유지':'데이터 오류';e.dataset.state='error'}setText('dataError',message||'데이터 오류')}
function live(aux){const e=$('liveState');if(!e)return;e.textContent=aux?.live?.available?'실시간 보조 정상':'실시간 지연 · 과거 차트 유지';e.dataset.state=aux?.live?.available?'ok':'warn'}
return{render,loading,error,live,price,localTime};
});