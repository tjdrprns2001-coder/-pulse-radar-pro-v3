(function(){
'use strict';
const $=id=>document.getElementById(id),RANGE_KEY='pulse.preignition.oos.range.v1';
const state={range:'3d',loading:false,timer:null,stats:null,rows:[]};
const BUCKET_LABEL={REJECTED:'탈락/대조군',LT60:'60 미만',S60_69:'60~69',S70_79:'70~79',S80_PLUS:'80+'};
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function num(v,d=1){const n=Number(v);return Number.isFinite(n)?n.toFixed(d):'—'}
function pct(v,d=1){const n=Number(v);return Number.isFinite(n)?(n*100).toFixed(d)+'%':'—'}
function ret(v){const n=Number(v);if(!Number.isFinite(n))return'<span class="ret pending">대기</span>';const cls=n>0?'pos':n<0?'neg':'pending';return'<span class="ret '+cls+'">'+(n>0?'+':'')+n.toFixed(2)+'%</span>'}
function rangeSince(){const now=Date.now(),m={['24h']:86400000,['3d']:3*86400000,['7d']:7*86400000};return m[state.range]?now-m[state.range]:null}
function qs(action){const u=new URL('/api/coin-scan',location.origin);u.searchParams.set('mode','preignition-history');u.searchParams.set('action',action);const since=rangeSince();if(since)u.searchParams.set('since',String(since));if(action==='list')u.searchParams.set('limit','160');return u.pathname+u.search}
async function get(action){const r=await fetch(qs(action),{cache:'no-store'}),d=await r.json().catch(()=>null);if(!r.ok||!d||d.status!=='ok')throw new Error(d?.error||'OOS API '+r.status);return d}
function totalEvaluated(stats,key){return Object.values(stats?.byBucket||{}).reduce((sum,b)=>sum+(Number(b?.horizons?.[key]?.evaluatedCount)||0),0)}
function maturityText(stats){const n=Math.min(totalEvaluated(stats,'h6'),totalEvaluated(stats,'h24'));return n>=60?'통계 사용 가능':n>=20?'참고용':'표본 부족'}
function hitClass(v){const n=Number(v);return !Number.isFinite(n)?'low':n>=.5?'good':n>=.25?'mid':'low'}
function renderThresholds(stats){
 const box=$('thresholdGrid');box.innerHTML=[60,70,80].map(cut=>{const t=stats?.thresholds?.[String(cut)]||{},sample=Number(t.sampleCount)||0;
   const horizon=k=>{const h=t.horizons?.[k]||{},hit=Number(h.hitRatio),w=Number.isFinite(hit)?Math.max(0,Math.min(100,hit*100)):0;return '<div class="horizon"><div class="horizonHead"><b>'+k.toUpperCase()+'</b><span class="hit '+hitClass(hit)+'">'+pct(hit)+' 적중</span></div><div class="bar"><i style="width:'+w+'%"></i></div><div class="statLine"><div>평가<b>'+esc(h.evaluatedCount??0)+'</b></div><div>평균<b>'+num(h.meanReturnPct)+'%</b></div><div>중앙<b>'+num(h.medianReturnPct)+'%</b></div></div></div>'};
   return '<article class="threshold"><div class="thresholdTop"><b>'+cut+'+</b><span>표본 '+sample+'개</span></div>'+horizon('h6')+horizon('h24')+'</article>'
 }).join('')
}
function renderBuckets(stats){
 const groups=stats?.byBucket||{},total=Object.values(groups).reduce((s,x)=>s+(Number(x?.sampleCount)||0),0)||1;
 $('bucketGrid').innerHTML=['REJECTED','LT60','S60_69','S70_79','S80_PLUS'].map(k=>{const n=Number(groups[k]?.sampleCount)||0,w=Math.round(n/total*100);return '<div class="bucket" data-key="'+k+'"><b>'+esc(BUCKET_LABEL[k]||k)+'</b><div class="bucketTrack"><i style="width:'+w+'%"></i></div><span>'+n+' · '+w+'%</span></div>'}).join('')
}
function outcome(row,k){return row?.outcome?.horizons?.[k]?.status==='evaluated'?row.outcome.horizons[k].returnPct:null}
function renderRows(rows){
 $('recentCount').textContent=rows.length+'개 표시';$('empty').hidden=rows.length>0;$('recentBody').innerHTML=rows.map(x=>{const score=Number(x.score),scoreCls=score>=80?'hot':score>=60?'mid':'',bucketCls=x.bucket==='REJECTED'?' rejected':'';
  return '<tr><td>'+esc(new Date(Number(x.capturedAt)).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}))+'</td><td><b>'+esc(x.symbol)+'</b></td><td><span class="bucketPill'+bucketCls+'">'+esc(BUCKET_LABEL[x.bucket]||x.bucket)+'</span></td><td><span class="scorePill '+scoreCls+'">'+(Number.isFinite(score)?Math.round(score):'—')+'</span></td><td>'+num(x.priceChange24h)+'%</td><td>'+num(x.oi4hChangePct)+'%</td><td>'+num(x.takerRatio,2)+'</td><td>'+ret(outcome(x,'h6'))+'</td><td>'+ret(outcome(x,'h24'))+'</td></tr>'
 }).join('')
}
function render(stats,rows){
 state.stats=stats;state.rows=rows;const samples=Number(stats?.sampleCount)||0,ev6=totalEvaluated(stats,'h6'),ev24=totalEvaluated(stats,'h24');
 $('sampleCount').textContent=samples.toLocaleString();$('sampleNote').textContent=samples?'점수 구간 전체':'표본 대기';$('eval6').textContent=ev6.toLocaleString();$('eval24').textContent=ev24.toLocaleString();$('maturity').textContent=maturityText(stats);$('updatedAt').textContent=stats?.updatedAt?'업데이트 '+new Date(Number(stats.updatedAt)).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):'업데이트 대기';
 renderThresholds(stats);renderBuckets(stats);renderRows(rows)
}
async function refresh({evaluate=false}={}){
 if(state.loading)return;state.loading=true;document.body.classList.add('loading');$('refresh').disabled=true;$('evaluate').disabled=true;$('status').textContent=evaluate?'만기 평가 중…':'OOS 데이터 갱신 중…';
 try{if(evaluate)await get('evaluate');const [s,l]=await Promise.all([get('stats'),get('list')]);render(s.stats||{},l.items||[]);$('status').textContent=(s.stats?.sampleCount||0)?'정상 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})+' 갱신':'수집 대기 · Production 배포 후 표본 시작'}
 catch(e){$('status').textContent='불러오기 실패 · '+String(e?.message||e)}
 finally{state.loading=false;document.body.classList.remove('loading');$('refresh').disabled=false;$('evaluate').disabled=false}
}
function setRange(v){state.range=v;try{localStorage.setItem(RANGE_KEY,v)}catch{}document.querySelectorAll('#rangeTabs button').forEach(b=>b.classList.toggle('active',b.dataset.range===v));refresh()}
$('refresh').onclick=()=>refresh();$('evaluate').onclick=()=>refresh({evaluate:true});document.querySelectorAll('#rangeTabs button').forEach(b=>b.onclick=()=>setRange(b.dataset.range));
try{const saved=localStorage.getItem(RANGE_KEY);if(['24h','3d','7d','all'].includes(saved))state.range=saved}catch{}
document.querySelectorAll('#rangeTabs button').forEach(b=>b.classList.toggle('active',b.dataset.range===state.range));
refresh();state.timer=setInterval(()=>{if(!document.hidden)refresh()},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();