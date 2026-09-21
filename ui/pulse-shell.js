(function(){
  const V={
    home:{title:'통합 홈',desc:'스캔 · 분석 · 뉴스 · 검증을 한 곳에서',path:'/workspace-home.html'},
    pulseai:{title:'Pulse AI',desc:'시장 변화 · 이벤트 · 뉴스 한글 브리핑',path:'/pulse-ai.html'},
    scanner:{title:'확장 시장 탐색',desc:'현물 + 8개 선물거래소 · 기초자산 중복 제거',path:'/index.html'},
    autoscan:{title:'자동 전체스캔',desc:'코어 유니버스 전체 · 상태별 자동 분류',path:'/coin-scan.html'},
    assistantscan:{title:'내 연구 스캔',desc:'v2 전체스캔 → 정밀검사 → 반증',path:'/assistant-scan.html'},
    radar:{title:'LIVE RADAR',desc:'현물·선물·DEX 확장 이상징후 감시',path:'/radar.html'},
    report:{title:'종합 분석',desc:'멀티TF · SMC/ICT · 수급 · 뉴스 · 반증',path:'/coin-report.html'},
    analysis:{title:'통합 차트',desc:'구조 · SMC · ICT · 유동성 · 단테',path:'/unified-chart.html'},
    multi:{title:'MTF 다중 차트',desc:'같은 종목을 여러 시간봉으로 비교',path:'/multi-chart.html'},
    intel:{title:'코인 정보·일정·뉴스',desc:'공식 일정 · 언락 · 뉴스 · 선물시장 압력',path:'/coin-intel.html'},
    ict:{title:'ICT · IPDA',desc:'유동성 · MSS/CISD · PD Array',path:'/ict-narrative-lab.html'},
    structure:{title:'시장 구조',desc:'스윙 · BOS · CHoCH · 구조 연구',path:'/structure-lab.html'},
    liquidity:{title:'유동성',desc:'FVG · Sweep · Liquidity 연구',path:'/liquidity-lab-v2.html'},
    surge:{title:'급등 패턴',desc:'PRE-SURGE · 급등 전후 패턴 연구',path:'/surge-pattern-lab.html'},
    snapshot:{title:'MTF 스냅샷',desc:'다중 시간봉 구조 스냅샷',path:'/snapshot-analysis.html'},
    performance:{title:'성과 검증',desc:'신호 성과 · Calibration · 품질 검증',path:'/signal-performance.html'},
    backtest:{title:'백테스트',desc:'과거 구간 전략 검증',path:'/backtest.html'},
    historical:{title:'과거 검증',desc:'Historical validation',path:'/historical-validation.html'},
    risk:{title:'리스크 계산기',desc:'포지션 리스크 계산',path:'/risk-calculator.html'},
    diagnostics:{title:'진단 센터',desc:'API · 데이터 · 분석 모듈 상태',path:'/diagnostics.html'}
  };
  const ROOT={
    home:'home',pulseai:'ai',
    scanner:'scan',autoscan:'scan',assistantscan:'scan',radar:'scan',
    report:'analysis',analysis:'analysis',multi:'analysis',ict:'analysis',structure:'analysis',liquidity:'analysis',surge:'analysis',snapshot:'analysis',
    intel:'info',
    performance:'more',backtest:'more',historical:'more',risk:'more',diagnostics:'more'
  };
  const $=id=>document.getElementById(id),frame=$('frame'),loading=$('loading'),side=$('side'),shade=$('shade'),presets=window.PulsePresets,dataState=window.PulseDataState;
  let current='home';

  function cleanSymbol(v){v=String(v||'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!v)return'BTCUSDT';if(!v.endsWith('USDT')&&v.length<=12)v+='USDT';return v}
  function readRecent(){try{const a=JSON.parse(localStorage.getItem('pr_recent')||'[]');return Array.isArray(a)&&a[0]?a[0]:'BTCUSDT'}catch{return'BTCUSDT'}}
  function symbol(){return cleanSymbol($('symbol').value)}
  function activePreset(){return presets?.getPreset($('preset')?.value||'clean')||{id:'clean'}}
  function srcFor(key){const o=V[key]||V.home,s=symbol(),p=activePreset().id,join=o.path.includes('?')?'&':'?';return o.path+join+'symbol='+encodeURIComponent(s)+'&preset='+encodeURIComponent(p)+'&shell=1'}
  function emit(name,detail){window.dispatchEvent(new CustomEvent(name,{detail}))}
  function openMenu(){side.classList.add('open');shade.classList.add('open')}
  function closeMenu(){side.classList.remove('open');shade.classList.remove('open')}
  function setTopState(state){const el=$('dataState');if(!el||!dataState)return;const m=dataState.formatDataState(state);el.dataset.pulseDataState=m.id;el.dataset.severity=m.severity;el.textContent=m.label}

  function ensureChildStyle(d){
    if(!d)return;
    d.documentElement.dataset.shell='1';
    if(!d.getElementById('pulseChildNormalize')){
      const link=d.createElement('link');link.id='pulseChildNormalize';link.rel='stylesheet';link.href='/ui/pulse-child-normalize.css?v=20260921-v4';d.head.appendChild(link);
    }
    let st=d.getElementById('pulseShellInjected');
    if(!st){st=d.createElement('style');st.id='pulseShellInjected';st.textContent='header.top>nav,header.top>.links,header .nav,header .links{display:none!important}.pulse-shell-hidden{display:none!important}';d.head.appendChild(st)}
  }
  function applyPresetToChild(){try{const d=frame.contentDocument;if(!d)return;const p=activePreset();ensureChildStyle(d);d.documentElement.dataset.pulsePreset=p.id;d.defaultView?.dispatchEvent(new CustomEvent('pulse:preset-applied',{detail:{preset:p.id}}))}catch(e){console.warn('preset injection failed',e)}}
  function attachChildDataState(){try{const d=frame.contentDocument;if(!d||!dataState)return;ensureChildStyle(d);const existing=d.getElementById('dataState')||d.getElementById('pulseChildDataState');if(existing){const obs=()=>{const id=existing.dataset.pulseDataState||(/오류|error|실패/i.test(existing.textContent||'')?'api-degraded':'live');setTopState(id)};obs();new MutationObserver(obs).observe(existing,{childList:true,subtree:true,characterData:true,attributes:true});return}const status=d.getElementById('status');if(status){const update=()=>setTopState(/오류|error|실패/i.test(status.textContent||'')?'api-degraded':'live');update();new MutationObserver(update).observe(status,{childList:true,subtree:true,characterData:true})}}catch(e){console.warn('data-state injection failed',e)}}
  function injectShellMode(){try{const d=frame.contentDocument;if(!d)return;ensureChildStyle(d);d.querySelectorAll('a[href="/"],a[href="/scanner-shell-v13.html"],a[href="/pulse-unified.html"]').forEach(a=>{a.onclick=e=>{e.preventDefault();parent.postMessage({type:'pulse-nav',view:'home'},'*')}});applyPresetToChild();attachChildDataState()}catch(e){console.warn('shell injection failed',e)}}

  function markActive(key){
    document.querySelectorAll('.navBtn[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===key));
    const root=ROOT[key]||'home';
    document.querySelectorAll('.mBtn[data-root]').forEach(b=>b.classList.toggle('active',b.dataset.root===root));
  }
  function setView(key,push=true){
    if(!V[key])key='home';current=key;const o=V[key];
    $('pageTitle').textContent=o.title;$('pageDesc').textContent=o.desc;markActive(key);
    loading.classList.remove('hide');frame.src=srcFor(key);
    if(push){const u=new URL(location.href);u.searchParams.set('view',key);u.searchParams.set('symbol',symbol());u.searchParams.set('preset',activePreset().id);history.replaceState(null,'',u)}
    closeMenu();emit('pulse:viewchange',{view:key});
  }
  function applySymbol(){const s=symbol();$('symbol').value=s;setView(current,true);emit('pulse:symbolchange',{symbol:s})}
  function applyPreset(){const p=presets.savePreset($('preset').value);$('preset').value=p.id;const u=new URL(location.href);u.searchParams.set('preset',p.id);history.replaceState(null,'',u);if(['analysis','multi','report'].includes(current))setView(current,false);else applyPresetToChild();emit('pulse:presetchange',{preset:p.id})}
  function syncChildSymbol(raw){const s=cleanSymbol(raw);$('symbol').value=s;const u=new URL(location.href);u.searchParams.set('symbol',s);history.replaceState(null,'',u);emit('pulse:symbolchange',{symbol:s,source:'child'});return s}

  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view,true)));
  $('menuBtn').onclick=openMenu;shade.onclick=closeMenu;$('go').onclick=applySymbol;$('symbol').addEventListener('keydown',e=>{if(e.key==='Enter')applySymbol()});$('preset').addEventListener('change',applyPreset);
  $('openTab').onclick=()=>window.open(srcFor(current),'_blank');
  frame.addEventListener('load',()=>{loading.classList.add('hide');injectShellMode()});
  window.addEventListener('message',e=>{if(e.data?.type==='pulse-symbol-sync')return syncChildSymbol(e.data.symbol);if(e.data?.type==='pulse-nav'&&V[e.data.view]){if(e.data.symbol)$('symbol').value=cleanSymbol(e.data.symbol);setView(e.data.view,true)}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()});

  const q=new URLSearchParams(location.search);$('symbol').value=cleanSymbol(q.get('symbol')||readRecent());const loaded=presets.loadPreset(),requested=presets.getPreset(q.get('preset')||loaded.id);$('preset').value=requested.id;setTopState('live');setView(q.get('view')||'home',false);
})();