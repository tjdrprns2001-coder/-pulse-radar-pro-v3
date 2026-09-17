(function(){
  const V={
    scanner:{title:'시장 스캐너',desc:'현물·선물 전체 종목 탐색',path:'/index.html'},
    pulseai:{title:'Pulse AI',desc:'전체 코인 자동 감시 · 변화 감지 · AI 브리핑',path:'/pulse-ai.html'},
    report:{title:'종합 분석',desc:'1W→15m · SMC/ICT · 패턴 · 수급 · 최종 스냅샷',path:'/coin-report.html'},
    autoscan:{title:'자동 코인 분류',desc:'바이낸스 현물 USDT 전체 자동 스캔 · 상태별 분류',path:'/coin-scan.html'},
    radar:{title:'LIVE RADAR',desc:'전체 코인 · 멀티체인 DEX 실시간 이상징후',path:'/radar.html'},
    analysis:{title:'분석',desc:'구조 · SMC · 단테 · MTF · 모멘텀',path:'/unified-chart.html'},
    smc:{title:'SMC',desc:'Smart Money Concepts · 구조 · 유동성 · 수급',path:'/unified-chart.html',preset:'smc'},
    multi:{title:'다중 차트',desc:'같은 종목 · 독립 TF · SMC/ICT 비교',path:'/multi-chart.html'},
    intel:{title:'코인 정보',desc:'종목 정보 · 일정 · 데이터',path:'/coin-intel.html'},
    ict:{title:'ICT · IPDA 서사',desc:'유동성 · MSS/CISD · PD Array · 프렉탈',path:'/ict-narrative-lab.html'},
    liquidity:{title:'유동성 랩',desc:'Liquidity · FVG · Sweep 연구',path:'/liquidity-lab-v2.html'},
    structure:{title:'시장 구조 랩',desc:'스윙 · BOS · CHoCH · 구조 연구',path:'/structure-lab.html'},
    surge:{title:'급등 패턴',desc:'PRE-SURGE · 급등 전후 패턴',path:'/surge-pattern-lab.html'},
    snapshot:{title:'MTF 스냅샷',desc:'다중 타임프레임 구조 스냅샷',path:'/snapshot-analysis.html'},
    reaction:{title:'반응 분석',desc:'레벨 반응 · 변위 · 추세 반응',path:'/reaction-lab.html'},
    backtest:{title:'백테스트',desc:'과거 구간 전략 검증',path:'/backtest.html'},
    historical:{title:'과거 검증',desc:'Historical structure validation',path:'/historical-validation.html'},
    independent:{title:'독립 검증',desc:'독립 데이터셋 검증',path:'/independent-validation.html'},
    temporal:{title:'시간축 검증',desc:'Temporal stability validation',path:'/temporal-validation.html'},
    patterns:{title:'패턴 검증',desc:'차트 패턴 품질 · Calibration',path:'/v311-validation.html'},
    trendline:{title:'추세선 연구',desc:'Trendline study & visual validation',path:'/trendline-study.html'},
    diagnostics:{title:'진단 센터',desc:'API · 데이터 · 분석 모듈 상태',path:'/diagnostics.html'},
    featurediag:{title:'기능 진단',desc:'세부 기능별 상태 점검',path:'/feature-diagnostics.html'}
  };
  const $=id=>document.getElementById(id),frame=$('frame'),loading=$('loading'),side=$('side'),shade=$('shade'),presets=window.PulsePresets,dataState=window.PulseDataState;let current='scanner';
  function cleanSymbol(v){v=String(v||'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!v)return'BTCUSDT';if(!v.endsWith('USDT')&&v.length<=12)v+='USDT';return v}
  function readRecent(){try{const a=JSON.parse(localStorage.getItem('pr_recent')||'[]');return Array.isArray(a)&&a[0]?a[0]:'BTCUSDT'}catch{return'BTCUSDT'}}
  function symbol(){return cleanSymbol($('symbol').value)}
  function activePreset(){return presets?.getPreset($('preset')?.value||'clean')||{id:'clean'}}
  function srcFor(key){const o=V[key]||V.scanner,s=symbol(),p=o.preset||activePreset().id,join=o.path.includes('?')?'&':'?';return o.path+join+'symbol='+encodeURIComponent(s)+'&preset='+encodeURIComponent(p)+'&shell=1'}
  function emit(name,detail){window.dispatchEvent(new CustomEvent(name,{detail}))}
  function openMenu(){side.classList.add('open');shade.classList.add('open')}function closeMenu(){side.classList.remove('open');shade.classList.remove('open')}
  function setTopState(state){const el=$('dataState');if(!el||!dataState)return;const m=dataState.formatDataState(state);el.dataset.pulseDataState=m.id;el.dataset.severity=m.severity;el.textContent=m.label}
  function ensureChildStyle(d){let st=d.getElementById('pulseShellInjected');if(!st){st=d.createElement('style');st.id='pulseShellInjected';st.textContent='header.top>nav,header.top>.links,header .nav,header .links{display:none!important} body{min-height:100vh!important}.pulse-shell-hidden{display:none!important}';d.head.appendChild(st)}}
  function applyPresetToChild(){try{const d=frame.contentDocument;if(!d)return;const p=activePreset();ensureChildStyle(d);d.documentElement.dataset.pulsePreset=p.id;d.defaultView?.dispatchEvent(new CustomEvent('pulse:preset-applied',{detail:{preset:p.id}}))}catch(e){console.warn('preset injection failed',e)}}
  function attachChildDataState(){try{const d=frame.contentDocument;if(!d||!dataState)return;ensureChildStyle(d);const existing=d.getElementById('dataState')||d.getElementById('pulseChildDataState');if(existing){const obs=()=>{const id=existing.dataset.pulseDataState||(/오류|error/i.test(existing.textContent||'')?'api-degraded':'live');setTopState(id)};obs();new MutationObserver(obs).observe(existing,{childList:true,subtree:true,characterData:true,attributes:true});return}let badge=d.createElement('span');badge.id='pulseChildDataState';badge.setAttribute('data-pulse-data-state','live');badge.style.cssText='display:inline-flex;border:1px solid #29445d;border-radius:999px;padding:4px 7px;font:700 9px system-ui;color:#9fb4c9;margin-left:6px';badge.textContent='실시간';(d.querySelector('.chartHead,.toolbar,.top')||d.body).appendChild(badge);const status=d.getElementById('status'),update=()=>{const t=status?.textContent||'';const id=/오류|error/i.test(t)?'api-degraded':'live';badge.dataset.pulseDataState=id;setTopState(id)};update();if(status)new MutationObserver(update).observe(status,{childList:true,subtree:true,characterData:true})}catch(e){console.warn('data-state injection failed',e)}}
  function injectShellMode(){try{const d=frame.contentDocument;if(!d)return;ensureChildStyle(d);d.querySelectorAll('a[href="/"],a[href="/scanner-shell-v13.html"]').forEach(a=>{a.onclick=e=>{e.preventDefault();parent.postMessage({type:'pulse-nav',view:'scanner'},'*')}});applyPresetToChild();attachChildDataState()}catch(e){console.warn('shell injection failed',e)}}
  function setView(key,push=true){if(!V[key])key='scanner';current=key;const o=V[key];if(o.preset&&$('preset'))$('preset').value=o.preset;$('pageTitle').textContent=o.title;$('pageDesc').textContent=o.desc;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===key));loading.classList.remove('hide');frame.src=srcFor(key);if(push){const u=new URL(location.href);u.searchParams.set('view',key);u.searchParams.set('symbol',symbol());u.searchParams.set('preset',o.preset||activePreset().id);history.replaceState(null,'',u)}closeMenu();emit('pulse:viewchange',{view:key})}
  function applySymbol(){const s=symbol();$('symbol').value=s;setView(current,true);emit('pulse:symbolchange',{symbol:s})}
  function applyPreset(){const p=presets.savePreset($('preset').value);$('preset').value=p.id;const u=new URL(location.href);u.searchParams.set('preset',p.id);history.replaceState(null,'',u);if(current==='analysis'||current==='smc')setView('analysis',false);else applyPresetToChild();emit('pulse:presetchange',{preset:p.id})}
  function syncChildSymbol(raw){const s=cleanSymbol(raw);$('symbol').value=s;const u=new URL(location.href);u.searchParams.set('symbol',s);history.replaceState(null,'',u);emit('pulse:symbolchange',{symbol:s,source:'child'});return s}
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view,true)));$('menuBtn').onclick=openMenu;$('moreBtn').onclick=openMenu;shade.onclick=closeMenu;$('go').onclick=applySymbol;$('symbol').addEventListener('keydown',e=>{if(e.key==='Enter')applySymbol()});$('preset').addEventListener('change',applyPreset);$('openTab').onclick=()=>window.open(srcFor(current),'_blank');frame.addEventListener('load',()=>{loading.classList.add('hide');injectShellMode()});window.addEventListener('message',e=>{if(e.data?.type==='pulse-symbol-sync')return syncChildSymbol(e.data.symbol);if(e.data?.type==='pulse-nav'&&V[e.data.view]){if(e.data.symbol)$('symbol').value=cleanSymbol(e.data.symbol);setView(e.data.view,true)}});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()});
  const q=new URLSearchParams(location.search);$('symbol').value=cleanSymbol(q.get('symbol')||readRecent());const loaded=presets.loadPreset(),requested=presets.getPreset(q.get('preset')||loaded.id);$('preset').value=requested.id;setTopState('live');setView(q.get('view')||'scanner',false);
})();