(function(){'use strict';
const Core=window.PulseRealtimePatternsCore,$=id=>document.getElementById(id);
if(!Core){$('error').textContent='패턴 엔진을 불러올 수 없습니다.';return;}
const HISTORY_KEY='pulse_realtime_pattern_events_v1',PREF_KEY='pulse_realtime_pattern_prefs_v1';
const state={generation:0,running:false,market:'futures',tf:'15m',symbols:[],datasets:new Map(),live:new Map(),errors:new Map(),events:[],seen:new Set(),sessionCount:0,selected:'BTCUSDT',ws:null,retry:0,reconnectTimer:null,watchdog:null,lastMessage:0,renderTimer:null,fetching:new Set()};
const clock=ts=>ts?new Date(ts).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'-';
const price=n=>!Number.isFinite(Number(n))?'-':Number(n).toLocaleString('en-US',{maximumFractionDigits:Number(n)>=100?2:Number(n)>=1?4:8});
const text=(el,s)=>{el.textContent=String(s);return el};
const node=(tag,className,content)=>{const e=document.createElement(tag);if(className)e.className=className;if(content!=null)text(e,content);return e};
const put=(parent,...children)=>{parent.append(...children);return parent};
const clean=v=>{let x=String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(x&&!x.endsWith('USDT'))x+='USDT';return /^[A-Z0-9]{2,20}USDT$/.test(x)?x:''};
function symbolsFrom(s){return [...new Set(String(s||'').split(/[\s,，;]+/).map(clean).filter(Boolean))].slice(0,8)}
function readPrefs(){try{return JSON.parse(localStorage.getItem(PREF_KEY)||'null')||{}}catch{return{}}}
function savePrefs(){try{localStorage.setItem(PREF_KEY,JSON.stringify({market:state.market,tf:state.tf,symbols:state.symbols}))}catch{}}
function hydrate(){
  try{const a=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');if(Array.isArray(a))state.events=a.filter(e=>e&&e.type&&e.symbol&&e.openTime).slice(0,200)}catch{}
  state.seen=new Set(state.events.map(Core.eventKey));
}
function persist(){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(state.events.slice(0,200)))}catch{}}
function setStatus(label,kind){text($('status'),label);$('status').dataset.state=kind||'idle'}
function error(message){text($('error'),message||'')}
function scheduleRender(){if(state.renderTimer)return;state.renderTimer=setTimeout(()=>{state.renderTimer=null;render()},350)}
function terminate(){if(state.ws){const ws=state.ws;state.ws=null;ws.onopen=ws.onmessage=ws.onerror=ws.onclose=null;try{ws.close()}catch{}}if(state.reconnectTimer){clearTimeout(state.reconnectTimer);state.reconnectTimer=null}if(state.watchdog){clearInterval(state.watchdog);state.watchdog=null}}
function stop(){state.generation++;state.running=false;terminate();setStatus('중지','idle');$('start').disabled=false;scheduleRender()}
async function fetchDataset(symbol,generation,{merge=false}={}){
  if(state.fetching.has(symbol))return;
  state.fetching.add(symbol);
  try{
    const url='/api/structure?symbol='+encodeURIComponent(symbol)+'&interval='+encodeURIComponent(state.tf)+'&market='+encodeURIComponent(state.market)+'&limit=320';
    const response=await fetch(url,{cache:'no-store'}),json=await response.json();
    if(!response.ok||!json?.ok)throw Error(json?.error||('HTTP '+response.status));
    const fresh=Core.normalizeRows(json.candles,state.tf);
    if(fresh.length<80)throw Error('확정봉 부족 ('+fresh.length+')');
    if(generation!==state.generation)return;
    const old=merge?state.datasets.get(symbol)||[]:[];
    const union=new Map([...old,...fresh].map(c=>[c.openTime,c]));
    state.datasets.set(symbol,[...union.values()].sort((a,b)=>a.openTime-b.openTime).slice(-500));
    state.errors.delete(symbol);
  }catch(e){if(generation===state.generation)state.errors.set(symbol,String(e.message||e))}
  finally{state.fetching.delete(symbol);if(generation===state.generation)scheduleRender()}
}
async function bootstrap(generation){
  let next=0;
  async function worker(){while(generation===state.generation&&next<state.symbols.length){const symbol=state.symbols[next++];await fetchDataset(symbol,generation)}}
  await Promise.all([worker(),worker(),worker()]);
}
function record(symbol,results,closeAt){
  for(const p of results){
    if(p.state!=='확정'||p.candleAt!==closeAt)continue;
    const key=Core.eventKey(p);if(state.seen.has(key))continue;
    state.seen.add(key);state.events.unshift({...p,market:state.market,receivedAt:Date.now()});
    state.sessionCount++;
  }
  if(state.events.length>200)state.events.length=200;
  persist();
}
function onData(message,generation){
  if(generation!==state.generation||!state.running)return;
  const obj=message?.data?.k?message.data:message,bar=obj?.k,symbol=String(obj?.s||bar?.s||'').toUpperCase();
  if(!bar||!state.symbols.includes(symbol))return;
  state.lastMessage=Date.now();
  const tick=Number(bar.c);
  if(Number.isFinite(tick)&&tick>0)state.live.set(symbol,tick);
  if(bar.x===true){
    const history=state.datasets.get(symbol);
    if(history?.length){
      const inserted=Core.applyClosedKline(history,bar,state.tf);
      if(inserted.accepted){
        if(inserted.gap)fetchDataset(symbol,generation,{merge:true});
        else record(symbol,Core.detect(history,{symbol,timeframe:state.tf}),inserted.candle.closeTime);
      }
    }else fetchDataset(symbol,generation);
  }
  scheduleRender();
}
function connect(generation){
  if(generation!==state.generation||!state.running)return;
  if(state.ws){const old=state.ws;old.onclose=old.onmessage=old.onerror=old.onopen=null;try{old.close()}catch{}}
  const base=state.market==='futures'?'wss://fstream.binance.com/stream?streams=':'wss://stream.binance.com:9443/stream?streams=';
  const streams=state.symbols.map(s=>s.toLowerCase()+'@kline_'+state.tf).join('/');
  let ws;
  try{ws=new WebSocket(base+streams)}catch(e){return retry(generation,e.message)}
  state.ws=ws;setStatus('연결 중','connecting');
  const connectTimeout=setTimeout(()=>{if(ws.readyState!==1)try{ws.close()}catch{}},12000);
  ws.onopen=()=>{
    if(generation!==state.generation)return;
    clearTimeout(connectTimeout);state.retry=0;state.lastMessage=Date.now();setStatus('실시간 연결','live');
    // Missed closes are restored silently, not presented as fresh WebSocket signals.
    for(const symbol of state.symbols)fetchDataset(symbol,generation,{merge:true});
  };
  ws.onmessage=e=>{
    if(generation!==state.generation)return;
    try{onData(JSON.parse(e.data),generation)}catch(err){error('수신 데이터 오류: '+err.message)}
  };
  ws.onerror=()=>{if(state.running)setStatus('연결 장애','error')};
  ws.onclose=()=>{
    clearTimeout(connectTimeout);
    if(state.ws!==ws||generation!==state.generation||!state.running)return;
    state.ws=null;retry(generation,'연결이 끊어졌습니다');
  };
}
function retry(generation,why){
  if(generation!==state.generation||!state.running)return;
  const delay=Math.min(30000,1000*Math.pow(2,Math.min(state.retry++,5)));
  setStatus('재연결 예정','connecting');error(why+' · 연결을 복구합니다.');
  clearTimeout(state.reconnectTimer);
  state.reconnectTimer=setTimeout(()=>connect(generation),delay);
}
async function start(){
  stop();const gen=state.generation;
  state.market=$('market').value;state.tf=$('tf').value;state.symbols=symbolsFrom($('symbols').value);
  if(!state.symbols.length){error('BTC, ETH처럼 감시 종목을 입력하세요.');return}
  state.running=true;state.retry=0;state.sessionCount=0;state.datasets.clear();state.live.clear();state.errors.clear();state.fetching.clear();
  if(!state.symbols.includes(state.selected))state.selected=state.symbols[0];
  $('start').disabled=true;error('');setStatus('과거 확정봉 수집','connecting');savePrefs();scheduleRender();
  await bootstrap(gen);
  if(!state.running||gen!==state.generation)return;
  if(![...state.datasets.values()].some(a=>a.length)){error('거래소 과거봉 응답을 확인할 수 없습니다. 연결 및 API 상태를 확인하세요.')}
  connect(gen);
  state.watchdog=setInterval(()=>{
    if(gen!==state.generation||!state.running)return;
    if(state.ws?.readyState===1&&Date.now()-state.lastMessage>60000){
      const old=state.ws;state.ws=null;old.onclose=null;try{old.close()}catch{}
      retry(gen,'수신이 60초 동안 없어 재접속합니다');
    }
  },15000);
}
function buildWatch(){
  const target=$('watchlist');target.replaceChildren();
  for(const symbol of state.symbols){
    const a=state.datasets.get(symbol)||[],latest=a.at(-1),patterns=Core.detect(a,{symbol,timeframe:state.tf});
    const current=state.live.get(symbol)||latest?.close,row=node('button','watchRow'+(state.selected===symbol?' active':'')+(state.errors.has(symbol)?' error':''));row.type='button';
    const title=node('div','heading');put(title,node('b','',symbol),node('span','dot'+(state.running&&state.ws?.readyState===1?' live':'')));
    put(row,title,node('div','price',price(current)),node('small','',state.errors.get(symbol)||(!latest?'확정봉 로딩 중':'확정 '+clock(latest.closeTime))),node('div','alert',patterns[0]?patterns[0].label+' · '+patterns[0].state:'감지 대기'));
    row.addEventListener('click',()=>{state.selected=symbol;render()});target.append(row);
  }
  if(!state.symbols.length)target.append(node('p','empty','감시 시작을 누르세요.'));
}
function buildCurrent(){
  const target=$('currentPatterns');target.replaceChildren();
  const arr=state.datasets.get(state.selected)||[],items=Core.detect(arr,{symbol:state.selected,timeframe:state.tf});
  for(const p of items.slice(0,6)){
    const row=node('article','patternRow');row.dataset.direction=p.direction;
    const heading=node('div','heading');put(heading,node('b','',p.label),node('span','chip '+(p.state==='확정'?'confirmed':'forming'),p.state));
    const desc=node('p','',p.reason),meta=node('small','',('기준선 '+price(p.level)+' · 충족 점수 '+p.score+'/100')+(p.rvol!=null?' · RVOL '+p.rvol:''));
    put(row,heading,desc,meta);target.append(row);
  }
  if(!items.length)target.append(node('p','empty','현재 조건에 해당하는 패턴이 없습니다. 신호를 억지로 만들지 않습니다.'));
  text($('activeCount'),items.filter(x=>x.state==='확정').length+'개');
}
function buildEvents(){
  const feed=$('eventFeed');feed.replaceChildren();
  for(const p of state.events.slice(0,65)){
    const row=node('article','eventRow');row.dataset.direction=p.direction;
    const head=node('div','heading');put(head,node('b','',p.symbol+' · '+p.label),node('span','chip confirmed','확정'));
    const description=node('p','',p.reason+' · '+price(p.price)),more=node('div','meta','봉 마감 '+clock(p.candleAt)+' · 수신 '+clock(p.receivedAt)+' · 점수 '+p.score+'/100');
    const link=node('a','',p.timeframe+' 차트에서 확인 →');link.href='/auto-chart-lab.html?market='+encodeURIComponent(p.market||'futures')+'&symbol='+encodeURIComponent(p.symbol)+'&tf='+encodeURIComponent(p.timeframe);
    put(row,head,description,more,link);feed.append(row);
  }
  if(!state.events.length)feed.append(node('p','empty','새 봉 마감이 발생하고 패턴이 확정되면 기록됩니다.'));
}
function draw(){
  const canvas=$('chart'),ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#07101b';ctx.fillRect(0,0,W,H);
  const all=state.datasets.get(state.selected)||[],a=all.slice(-100),len=a.length;
  text($('chartTitle'),state.selected+' · '+state.tf.toUpperCase());text($('chartSubtitle'),len?'마지막 확정봉 '+clock(a.at(-1).closeTime)+' · 실시간 가격 '+price(state.live.get(state.selected)||a.at(-1).close):'확정봉 로딩 중');
  if(!len){ctx.fillStyle='#8ca9bd';ctx.font='18px sans-serif';ctx.fillText('확정봉 로딩 중 / 연결 상태를 확인하세요.',50,70);return}
  const L=65,R=W-115,T=35,B=H-49,low=Math.min(...a.map(x=>x.low)),high=Math.max(...a.map(x=>x.high)),pad=(high-low)*.07||1,hi=high+pad,lo=low-pad;
  const y=p=>T+(hi-p)/(hi-lo)*(B-T),x=i=>L+(i+.5)*(R-L)/len,bw=Math.max(2,Math.min(9,(R-L)/len*.65));
  ctx.strokeStyle='#183046';ctx.fillStyle='#7b91a6';ctx.font='12px sans-serif';
  for(let i=0;i<=5;i++){const yy=T+(B-T)*i/5;ctx.beginPath();ctx.moveTo(L,yy);ctx.lineTo(R,yy);ctx.stroke();ctx.fillText(price(hi-(hi-lo)*i/5),R+6,yy+3)}
  a.forEach((k,i)=>{const xx=x(i),up=k.close>=k.open;ctx.strokeStyle=ctx.fillStyle=up?'#36d0a0':'#f76a7d';ctx.beginPath();ctx.moveTo(xx,y(k.high));ctx.lineTo(xx,y(k.low));ctx.stroke();ctx.fillRect(xx-bw/2,Math.min(y(k.open),y(k.close)),bw,Math.max(2,Math.abs(y(k.open)-y(k.close))))});
  const patterns=Core.detect(all,{symbol:state.selected,timeframe:state.tf});
  patterns.slice(0,3).forEach((p,j)=>{
    if(!Number.isFinite(p.level))return;
    const yy=y(p.level);if(yy<T||yy>B)return;
    ctx.save();ctx.setLineDash([7,5]);ctx.strokeStyle=p.direction==='long'?'#3adca7':'#ff8b94';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(L,yy);ctx.lineTo(R,yy);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=p.direction==='long'?'#92efc4':'#ffabb4';ctx.font='bold 13px sans-serif';ctx.fillText(p.label+' '+(p.state==='확정'?'✓':'…'),Math.max(L+3,R-230),yy-8-j*2);
    for(const line of[p.upperLine,p.lowerLine]){
      if(!line)continue;const offset=all.length-len,from=Math.max(offset,line.start),to=all.length-1,py=i=>line.slope*i+line.intercept;
      if(from>to)continue;ctx.strokeStyle='#f4ca76';ctx.beginPath();ctx.moveTo(x(from-offset),y(py(from)));ctx.lineTo(x(to-offset),y(py(to)));ctx.stroke();
    }
    ctx.restore();
  });
  const quote=state.live.get(state.selected);if(Number.isFinite(quote)){const yy=y(quote);if(yy>T&&yy<B){ctx.save();ctx.setLineDash([2,4]);ctx.strokeStyle='#84b5ff';ctx.beginPath();ctx.moveTo(L,yy);ctx.lineTo(R,yy);ctx.stroke();ctx.fillStyle='#cce1ff';ctx.fillText('현재 '+price(quote),L+8,Math.max(T+12,yy-7));ctx.restore()}}
  ctx.fillStyle='#7e9ab1';ctx.font='12px sans-serif';ctx.fillText('가격선 = 패턴 기준 · 미완성봉은 탐지 제외',L,H-13);
}
function render(){
  text($('count'),state.datasets.size+'/'+state.symbols.length+'종목');
  text($('eventCount'),state.sessionCount+'건');
  text($('lastTick'),clock(state.lastMessage));
  buildWatch();buildCurrent();buildEvents();draw();
}
function exportPng(){const a=node('a');a.download='pulse-pattern-'+state.selected+'-'+state.tf+'.png';a.href=$('chart').toDataURL('image/png');a.click()}
function exportCsv(){
  const items=[['수신시각','마감시각','시장','종목','시간봉','패턴','방향','단계','점수','종가','기준선','RVOL','근거'],...state.events.map(e=>[new Date(e.receivedAt).toISOString(),new Date(e.candleAt).toISOString(),e.market,e.symbol,e.timeframe,e.label,e.direction,e.state,e.score,e.price,e.level,e.rvol??'',e.reason])];
  const safe=v=>{let s=String(v??'');if(/^[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
  const csv='\uFEFF'+items.map(row=>row.map(safe).join(',')).join('\r\n'),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='pulse-realtime-patterns.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function init(){
  hydrate();const prefs=readPrefs(),qs=new URLSearchParams(location.search),symbol=qs.get('symbol');
  if(['spot','futures'].includes(prefs.market))$('market').value=prefs.market;
  if(Core.MS[prefs.tf])$('tf').value=prefs.tf;
  if(Array.isArray(prefs.symbols)&&prefs.symbols.length)$('symbols').value=prefs.symbols.join(', ');
  if(qs.get('market')&&['spot','futures'].includes(qs.get('market')))$('market').value=qs.get('market');
  if(qs.get('tf')&&Core.MS[qs.get('tf')])$('tf').value=qs.get('tf');
  if(symbol){$('symbols').value=clean(symbol)||'BTCUSDT';state.selected=clean(symbol)||'BTCUSDT'}
  $('start').addEventListener('click',start);$('stop').addEventListener('click',stop);
  $('symbols').addEventListener('keydown',e=>{if(e.key==='Enter')start()});
  $('exportPng').addEventListener('click',exportPng);$('exportCsv').addEventListener('click',exportCsv);
  window.addEventListener('online',()=>{if(state.running&&state.ws?.readyState!==1){clearTimeout(state.reconnectTimer);connect(state.generation)}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.running){for(const symbol of state.symbols)fetchDataset(symbol,state.generation,{merge:true});if(state.ws?.readyState!==1)connect(state.generation)}});
  window.addEventListener('pagehide',terminate);
  buildEvents();render();start();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();