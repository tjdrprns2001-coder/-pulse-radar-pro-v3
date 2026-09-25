(()=>{'use strict';
const MODES={
  board:{title:'8TF 보드',desc:'1W → 3D → 1D → 12H → 4H → 1H → 15m → 5m · ICT/SMC · 이벤트 재생',path:'/mtf-snapshot-pro.html',tf:'4h'},
  liquidity:{title:'유동성 스냅샷',desc:'BSL/SSL · Sweep/Reclaim · PD Array · 추세선 리테스트 · 조건부 경로',path:'/liquidity-snapshot.html',tf:'1h'},
  quality:{title:'품질·서사 스냅샷',desc:'구조 · Flow · 시나리오 · 데이터 무결성 · Calibration · Regime',path:'/snapshot-analysis-restored.html',tf:'4h'}
};
const $=id=>document.getElementById(id),frame=$('snapshotFrame'),q=new URLSearchParams(location.search),STORE='pulse.snapshot-hub.mode.v1';
let mode=(q.get('mode')||localStorage.getItem(STORE)||'board').toLowerCase();if(!MODES[mode])mode='board';
function clean(v){v=String(v||'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!v)return'BTCUSDT';if(!v.endsWith('USDT')&&v.length<=12)v+='USDT';return v}
function symbol(){return clean($('hubSymbol').value)}
function inheritedTf(){const tf=String(q.get('tf')||'').toLowerCase();return /^(1w|3d|1d|12h|4h|1h|15m|5m)$/.test(tf)?tf:null}
function copyEventParams(u){for(const k of ['eventId','stageTransition','v2Type','scanUpdatedAt']){const v=q.get(k);if(v)u.searchParams.set(k,v)}}
function childUrl(active=mode,{bust=false}={}){const m=MODES[active],u=new URL(m.path,location.origin);u.searchParams.set('symbol',symbol());u.searchParams.set('tf',inheritedTf()||m.tf);u.searchParams.set('shell','1');u.searchParams.set('snapshotHub','1');const preset=q.get('preset');if(preset)u.searchParams.set('preset',preset);if(active==='board')copyEventParams(u);if(bust)u.searchParams.set('hubRefresh',String(Date.now()));return u.pathname+u.search}
function updateHistory(){const u=new URL(location.href);u.searchParams.set('mode',mode);u.searchParams.set('symbol',symbol());history.replaceState(null,'',u)}
function syncOuter(s){try{parent.postMessage({type:'pulse-symbol-sync',symbol:s},'*')}catch{}}
function renderTabs(){document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));const m=MODES[mode];$('modeTitle').textContent=m.title;$('modeDesc').textContent=m.desc}
function injectChild(){try{const d=frame.contentDocument;if(!d)return;d.documentElement.dataset.snapshotHub='1';let st=d.getElementById('snapshotHubInjected');if(!st){st=d.createElement('style');st.id='snapshotHubInjected';st.textContent='html[data-snapshot-hub="1"] .hero,html[data-snapshot-hub="1"] .top{display:none!important}html[data-snapshot-hub="1"] body{padding-top:0!important}html[data-snapshot-hub="1"] .snapApp,html[data-snapshot-hub="1"] .liqApp,html[data-snapshot-hub="1"] .app{max-width:none!important;padding-top:4px!important}';d.head.appendChild(st)}const input=d.getElementById('symbol');if(input&&!input.dataset.hubBound){input.dataset.hubBound='1';const relay=()=>{const s=clean(input.value);$('hubSymbol').value=s;updateHistory();syncOuter(s)};input.addEventListener('change',relay);input.addEventListener('keydown',e=>{if(e.key==='Enter')relay()})}d.querySelectorAll('[data-tf]').forEach(b=>{if(b.dataset.hubBound)return;b.dataset.hubBound='1';b.addEventListener('click',()=>{const tf=b.dataset.tf;if(tf){const u=new URL(location.href);u.searchParams.set('tf',tf);history.replaceState(null,'',u)}})})}catch(e){console.warn('snapshot hub child injection failed',e)}}
function load({bust=false}={}){$('frameLoading').classList.remove('hide');$('hubStatus').textContent='불러오는 중…';frame.src=childUrl(mode,{bust});renderTabs();updateHistory();localStorage.setItem(STORE,mode)}
function setMode(next){if(!MODES[next]||next===mode)return;mode=next;load()}
function relayChildMessage(e){const d=e.data||{};if(d.type==='pulse-symbol-sync'){const s=clean(d.symbol);$('hubSymbol').value=s;updateHistory();syncOuter(s);return}if(d.type==='pulse-nav'){try{parent.postMessage(d,'*')}catch{}}}
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
$('applySymbol').onclick=()=>{const s=symbol();$('hubSymbol').value=s;syncOuter(s);load({bust:true})};
$('hubSymbol').addEventListener('keydown',e=>{if(e.key==='Enter')$('applySymbol').click()});
$('reloadModule').onclick=()=>load({bust:true});
$('openDirect').onclick=()=>window.open(childUrl(mode),'_blank');
frame.addEventListener('load',()=>{$('frameLoading').classList.add('hide');$('hubStatus').textContent=MODES[mode].title+' 준비 완료';injectChild()});
window.addEventListener('message',relayChildMessage);
$('hubSymbol').value=clean(q.get('symbol')||'BTCUSDT');renderTabs();load();
})();