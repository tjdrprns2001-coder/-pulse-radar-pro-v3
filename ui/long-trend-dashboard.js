(function(){
'use strict';
if(window.__pulseLongTrendDashboard)return;window.__pulseLongTrendDashboard=true;

const TF=['28d','14d','1w','3d','1d','4h'];
const LABEL={'28d':'28D','14d':'14D','1w':'1W','3d':'3D','1d':'1D','4h':'4H'};
const LIMIT={'28d':260,'14d':320,'1w':420,'3d':500,'1d':620,'4h':760};
const TF_WEIGHT={'28d':1.45,'14d':1.35,'1w':1.25,'3d':1.10,'1d':1.0,'4h':.82};
const C={green:'#35d69a',red:'#ff6577',blue:'#4f8cff',amber:'#ffc45f',muted:'#6f879e',violet:'#9b7cf5'};
const $=id=>document.getElementById(id);
const finite=v=>Number.isFinite(Number(v));
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
const sec=t=>{const n=Number(t);return Math.trunc(n>1e12?n/1000:n)};
const pct=(v,d=2)=>finite(v)?((Number(v)>=0?'+':'')+Number(v).toFixed(d)+'%'):'-';
const fmt=(v,d=4)=>{if(!finite(v))return'-';const n=Number(v),a=Math.abs(n);const max=a>=1000?2:a>=1?4:8;return n.toLocaleString('ko-KR',{maximumFractionDigits:Math.min(d,max)})};
const stateKo=s=>({active:'유효',retest:'재시험',candidate:'후보','role-flip':'역할전환',broken:'이탈'}[s]||s||'-');
const sideKo=s=>s==='support'?'지지':s==='resistance'?'저항':'-';
const dirClass=d=>d==='상승'?'up':d==='하락'?'down':'flat';
let runSeq=0,rowsByTf={},analysisByTf={},chartByTf={},summaryCore=null,lastComposite=null;

function cleanSymbol(v){v=String(v||'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!v)return'BTCUSDT';if(!v.endsWith('USDT')&&v.length<=12)v+='USDT';return v}
function setState(label,state){$('dataState').textContent=label;$('dataState').dataset.state=state}
function latest(rows){return Array.isArray(rows)&&rows.length?rows[rows.length-1]:null}
function lineAt(L,i){return Math.exp(Number(L.interceptLog)+Number(L.logSlopePerBar)*i)}
function leadLine(a){return[a?.support,a?.resistance].filter(Boolean).sort((x,y)=>Math.abs(Number(x.currentDistancePct)||0)-Math.abs(Number(y.currentDistancePct)||0))[0]||null}
function metric(label,value){return '<div><small>'+label+'</small><b>'+value+'</b></div>'}

function resetCard(tf,label='불러오는 중…'){
  const b=$('badge-'+tf),s=$('stats-'+tf),o=$('ohlc-'+tf);
  b.textContent='대기';b.dataset.dir='na';s.innerHTML='<span>'+label+'</span>';o.textContent='-';
  if(chartByTf[tf]){try{chartByTf[tf].dispose()}catch{}delete chartByTf[tf]}
  const host=$('chart-'+tf);if(host)host.innerHTML='';
}
function volumeData(rows){
  return (rows||[]).filter(x=>finite(x.time)&&finite(x.volume)).map(x=>({time:sec(x.time),value:Number(x.volume),color:Number(x.close)>=Number(x.open)?'rgba(53,214,154,.40)':'rgba(255,101,119,.40)'}));
}
function trendData(line,rows){
  if(!line||!Array.isArray(rows)||!rows.length)return[];
  const touches=(line.touchBars||[]).filter(Number.isInteger),start=Math.max(0,touches.length?Math.min(...touches):Math.max(0,rows.length-80)),end=rows.length-1,out=[];
  for(let i=start;i<=end;i++){const t=sec(rows[i]?.time);const v=lineAt(line,i);if(finite(t)&&finite(v)&&v>0)out.push({time:t,value:v})}
  return out;
}
function drawTfChart(tf,raw,a){
  const host=$('chart-'+tf);host.innerHTML='';
  if(!window.LightweightCharts||!window.PulseChartCore||!window.PulseChartData)throw new Error('차트 모듈 미로딩');
  const core=PulseChartCore.createUnifiedChart({container:host,library:LightweightCharts,preset:{id:'longtrend',panes:['rsi']}});
  chartByTf[tf]=core;
  const rows=raw.candles||[],norm=PulseChartData.normalizeCandles(rows);
  core.setData({candles:norm.candles,volume:volumeData(rows),indicators:{rsi:PulseChartData.rsiSeries(rows,14)}});
  const add=(line,color,dashed=false)=>{
    if(!line)return;
    const opts={color,lineWidth:line.state==='candidate'?1:2,crosshairMarkerVisible:false,lastValueVisible:false,priceLineVisible:false};
    if(dashed&&LightweightCharts.LineStyle)opts.lineStyle=LightweightCharts.LineStyle.Dashed;
    const series=core.addLineSeries(opts,0);series.setData(trendData(line,rows));
  };
  add(a.support,a.support?.effectiveSide==='resistance'?C.amber:C.green);
  add(a.resistance,a.resistance?.effectiveSide==='support'?C.amber:C.red);
  const ss=a.secondary?.support?.[0],rr=a.secondary?.resistance?.[0];
  add(ss,'rgba(53,214,154,.48)',true);add(rr,'rgba(255,101,119,.48)',true);
  try{core.chart.timeScale().fitContent()}catch{}
}
function renderTf(tf,raw,a){
  const row=PulseLongTermTrendlineEngine.matrixRow(a,Number(latest(raw.candles)?.close));
  const badge=$('badge-'+tf),last=latest(raw.candles||[]);
  if(last)$('ohlc-'+tf).textContent='시 '+fmt(last.open)+'  고 '+fmt(last.high)+'  저 '+fmt(last.low)+'  종 '+fmt(last.close)+' · '+(raw.dataSource||raw.market||'market');
  if(!row?.available){
    badge.textContent=a.reason||row?.status||'선 없음';badge.dataset.dir='na';
    $('stats-'+tf).innerHTML=metric('데이터',String(a.bars||0)+' / '+String(a.requiredBars||40)+'봉')+metric('Canonical Swing',String(a.confirmedSwings||raw.canonicalSwings?.length||0)+'개')+metric('상태','비활성');
    drawTfChart(tf,raw,a);
    return;
  }
  const lead=leadLine(a),dir=row.direction||lead?.direction||'혼조';
  badge.textContent=dir;badge.dataset.dir=dirClass(dir);
  $('stats-'+tf).innerHTML=metric('일일 기울기',pct(row.dailySlopePct,3))+metric('현재가 거리',pct(row.distancePct,2))+metric('선 품질',String(row.quality||0)+'/100');
  drawTfChart(tf,raw,a);
}
function renderTfError(tf,e){
  const badge=$('badge-'+tf);badge.textContent='오류';badge.dataset.dir='down';
  $('ohlc-'+tf).textContent=e?.message||'데이터 로드 실패';
  $('stats-'+tf).innerHTML=metric('상태','로드 실패')+metric('재시도','6TF 분석')+metric('TF',LABEL[tf]);
}

async function fetchTf(symbol,tf){
  const r=await fetch('/api/structure?symbol='+encodeURIComponent(symbol)+'&interval='+encodeURIComponent(tf)+'&limit='+LIMIT[tf],{cache:'no-store'});
  let raw;try{raw=await r.json()}catch{throw new Error(LABEL[tf]+' 응답 파싱 실패')}
  if(!r.ok||!raw?.ok)throw new Error(raw?.error||LABEL[tf]+' HTTP '+r.status);
  const a=PulseLongTermTrendlineEngine.analyzeTrendlines(raw.candles||[],{timeframe:tf,canonicalSwings:raw.canonicalSwings||[]});
  return{raw,a};
}

function matrix(){
  const box=$('matrix');box.innerHTML='';
  for(const tf of TF){
    const a=analysisByTf[tf],raw=rowsByTf[tf];
    if(!a||!raw){const d=document.createElement('div');d.className='matrixRow';d.innerHTML='<b>'+LABEL[tf]+'</b><span>-</span><span>-</span><span>-</span><span>-</span><span>로드 실패</span><span>-</span>';box.append(d);continue}
    const r=PulseLongTermTrendlineEngine.matrixRow(a,Number(latest(raw.candles)?.close)),lead=leadLine(a),d=document.createElement('div');d.className='matrixRow';
    if(!r?.available){d.innerHTML='<b>'+LABEL[tf]+'</b><span>-</span><span>-</span><span>-</span><span>-</span><span>'+String(a.reason||'선 없음')+'</span><span>'+String(a.bars||0)+'/'+String(a.requiredBars||40)+'</span>';box.append(d);continue}
    const dc=dirClass(r.direction);
    d.innerHTML='<b>'+LABEL[tf]+'</b><span class="'+dc+'">'+r.direction+'</span><span>'+sideKo(r.lineSide)+'</span><span>'+pct(r.distancePct,2)+'</span><span>'+pct(r.dailySlopePct,3)+'</span><span>'+stateKo(r.state)+'</span><span><b>'+r.quality+'</b><div class="qualityBar"><i style="width:'+clamp(r.quality)+'%"></i></div></span>';
    box.append(d);
  }
}

function composite(){
  const usable=[],refRaw=rowsByTf['1d']||rowsByTf['3d']||rowsByTf['1w'];
  const refRows=refRaw?.candles||[],refLast=latest(refRows);
  if(!refLast)return null;
  const refTime=sec(refLast.time),price=Number(refLast.close);
  for(const tf of TF){
    const a=analysisByTf[tf],raw=rowsByTf[tf],L=leadLine(a);
    if(!a?.available||!raw||!L||!finite(L.dailyLogSlope)||!finite(L.projectedPrice)||Number(L.projectedPrice)<=0)continue;
    const lr=latest(raw.candles||[]);if(!lr)continue;
    const lastTime=sec(lr.time),deltaDays=(refTime-lastTime)/86400;
    const levelAtRef=Number(L.projectedPrice)*Math.exp(Number(L.dailyLogSlope)*deltaDays);
    const quality=clamp(L.score,0,100),stateWeight=L.state==='role-flip'?.72:L.state==='retest'?1.06:L.state==='candidate'?.75:1;
    const w=TF_WEIGHT[tf]*Math.max(.25,quality/100)*stateWeight;
    usable.push({tf,line:L,weight:w,quality,levelAtRef,slope:Number(L.dailyLogSlope),direction:L.direction});
  }
  if(!usable.length)return null;
  const sw=usable.reduce((s,x)=>s+x.weight,0),slope=usable.reduce((s,x)=>s+x.weight*x.slope,0)/sw,level=Math.exp(usable.reduce((s,x)=>s+x.weight*Math.log(x.levelAtRef),0)/sw);
  const slopePct=(Math.exp(slope)-1)*100,direction=slopePct>.02?'상승':slopePct<-.02?'하락':'중립',sign=direction==='상승'?1:direction==='하락'?-1:0;
  const alignWeight=sign?usable.filter(x=>Math.sign(x.slope)===sign).reduce((s,x)=>s+x.weight,0):usable.filter(x=>Math.abs((Math.exp(x.slope)-1)*100)<=.02).reduce((s,x)=>s+x.weight,0);
  const alignment=clamp(alignWeight/sw*100),quality=usable.reduce((s,x)=>s+x.weight*x.quality,0)/sw,strength=clamp(quality*.65+alignment*.35),distancePct=(price/level-1)*100;
  const integrity=usable.reduce((s,x)=>s+x.weight*(Number(x.line.lineIntegrityScore)||0),0)/sw;
  const htf=usable.filter(x=>['28d','14d','1w'].includes(x.tf)),htfSlope=htf.length?htf.reduce((s,x)=>s+x.weight*x.slope,0)/htf.reduce((s,x)=>s+x.weight,0):slope,htfPct=(Math.exp(htfSlope)-1)*100,htfState=htfPct>.02?'상승 우세':htfPct<-.02?'하락 우세':'중립';
  return{usable,refRows,refTime,price,slope,slopePct,level,direction,alignment,strength,distancePct,integrity,htfState};
}

function drawSummary(c){
  const host=$('summaryChart');host.innerHTML='';if(summaryCore){try{summaryCore.dispose()}catch{}summaryCore=null}
  if(!c)return;
  summaryCore=PulseChartCore.createUnifiedChart({container:host,library:LightweightCharts,preset:{id:'summary',panes:[]}});
  const rows=c.refRows,norm=PulseChartData.normalizeCandles(rows);summaryCore.setData({candles:norm.candles,volume:volumeData(rows)});
  const avg=summaryCore.addLineSeries({color:C.blue,lineWidth:3,lastValueVisible:true,priceLineVisible:false,crosshairMarkerVisible:false},0);
  const data=[];for(const r of rows){const t=sec(r.time),days=(t-c.refTime)/86400,v=c.level*Math.exp(c.slope*days);if(finite(v)&&v>0)data.push({time:t,value:v})}avg.setData(data);
  const px=summaryCore.addLineSeries({color:C.green,lineWidth:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false,lineStyle:LightweightCharts.LineStyle?.Dashed??2},0);
  if(rows.length>1)px.setData([{time:sec(rows[0].time),value:c.price},{time:sec(rows[rows.length-1].time),value:c.price}]);
  try{summaryCore.chart.timeScale().fitContent()}catch{}
}
function renderSummary(){
  const c=composite();lastComposite=c;
  if(!c){
    $('direction').textContent='데이터 부족';$('directionMeta').textContent='유효한 장기선이 없습니다.';$('directionBox').dataset.direction='neutral';
    $('strength').textContent='-';$('alignment').textContent='-';$('avgSlope').textContent='-';$('avgDistance').textContent='-';$('htfState').textContent='-';$('integrity').textContent='-';$('sourceCount').textContent='유효 TF 0/6';$('summaryText').textContent='최소 1개 이상의 유효 장기 회귀선이 필요합니다.';drawSummary(null);return;
  }
  const dd=c.direction==='상승'?'up':c.direction==='하락'?'down':'neutral';$('directionBox').dataset.direction=dd;$('direction').textContent=c.direction;$('directionMeta').textContent='가중 평균선 · 유효 TF '+c.usable.length+'/6';
  $('strength').textContent=Math.round(c.strength)+'/100';$('alignment').textContent=Math.round(c.alignment)+'/100';$('avgSlope').textContent=pct(c.slopePct,3);$('avgDistance').textContent=pct(c.distancePct,2);$('htfState').textContent=c.htfState;$('integrity').textContent=Math.round(c.integrity)+'/100';$('sourceCount').textContent='유효 TF '+c.usable.length+'/6';
  const where=c.distancePct>=0?'평균 추세선 위':'평균 추세선 아래',align=c.alignment>=75?'높은 정렬':c.alignment>=55?'부분 정렬':'혼조 정렬',strength=c.strength>=75?'강한':c.strength>=55?'중간':'약한';
  $('summaryText').textContent='현재 가격은 가중 평균 장기선 '+where+'에 있으며, '+align+' 상태입니다. 합성 기울기는 '+pct(c.slopePct,3)+'/일, 추세 품질은 '+strength+' 편입니다. 상위프레임은 '+c.htfState+'이며 역할전환·재시험 표시는 별도 TF 카드에서 확인합니다.';
  drawSummary(c);
}
async function run(){
  const seq=++runSeq,symbol=cleanSymbol($('symbol').value);$('symbol').value=symbol;try{parent.postMessage({type:'pulse-symbol-sync',symbol},'*')}catch{}
  setState('6TF 분석 중','loading');$('run').disabled=true;rowsByTf={};analysisByTf={};TF.forEach(tf=>resetCard(tf));
  let cursor=0,errors=0;
  async function worker(){
    while(true){const i=cursor++;if(i>=TF.length)return;const tf=TF[i];try{const x=await fetchTf(symbol,tf);if(seq!==runSeq)return;rowsByTf[tf]=x.raw;analysisByTf[tf]=x.a;renderTf(tf,x.raw,x.a)}catch(e){errors++;if(seq===runSeq)renderTfError(tf,e)}}
  }
  await Promise.all([worker(),worker()]);
  if(seq!==runSeq)return;
  matrix();renderSummary();$('updatedAt').textContent='업데이트 '+new Date().toLocaleString('ko-KR');setState(errors?'부분 완료 '+(TF.length-errors)+'/'+TF.length:'실시간 구조 완료',errors?'error':'ok');$('run').disabled=false;
}
function saveSummary(){
  try{
    const c=summaryCore?.chart?.takeScreenshot?.();if(!c)throw new Error('현재 브라우저에서 차트 캡처를 지원하지 않습니다.');
    c.toBlob(blob=>{if(!blob)return;const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=cleanSymbol($('symbol').value)+'_long-trend-summary.png';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1200)},'image/png');
  }catch(e){setState(e.message,'error')}
}
function init(){
  if(!window.PulseLongTermTrendlineEngine||!window.PulseChartData||!window.PulseChartCore){setState('차트 엔진 로드 실패','error');return}
  const q=new URLSearchParams(location.search);$('symbol').value=cleanSymbol(q.get('symbol')||'BTCUSDT');$('run').onclick=run;$('saveSummary').onclick=saveSummary;$('symbol').addEventListener('keydown',e=>{if(e.key==='Enter')run()});run();
}
window.addEventListener('load',init,{once:true});
})();