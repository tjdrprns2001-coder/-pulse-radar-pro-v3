(function(){
  const V={
    home:{title:'시장 데스크',desc:'전체시장 · 1시간 브리핑 · AI 후보',path:'/workspace-home.html'},
    pulseai:{title:'Pulse AI',desc:'시장 변화 · 이벤트 · 뉴스 한글 브리핑',path:'/pulse-ai.html'},
    bookai:{title:'Book AI',desc:'책 규칙 · 근거 완성도 · 상태 전이 · Canonical Snapshot',path:'/book-ai-analyst.html'},
    researchai:{title:'연구 학습 AI',desc:'급등 샘플 · 책 규칙 · 6H/24H 실제 결과 자동 학습',path:'/research-ai.html'},
    scanner:{title:'확장 시장 탐색',desc:'현물 + 8개 선물거래소 · 기초자산 중복 제거',path:'/index.html'},
    autoscan:{title:'자동스캔 검색기',desc:'선물 우선 · v3/OI/taker/RVOL/ICT 자동 압축',path:'/coin-scan.html'},
    astra:{title:'Astra 자동스캔',desc:'Astra·Manus·Perplexity·Grok·Gemini·Claude · Binance USDT 무기한 전체',path:'/astra-scan.html'},
    traderscan:{title:'트레이더 스캔',desc:'롱 전용 · 추세 눌림·리테스트·스윕 · 진입 확인·손익비',path:'/trader-scan.html'},
    assistantscan:{title:'내 연구 스캔',desc:'v2 전체스캔 → 정밀검사 → 반증',path:'/assistant-scan.html'},
    radar:{title:'LIVE RADAR',desc:'현물·선물·DEX 확장 이상징후 감시',path:'/radar.html'},
    analysis:{title:'전문 차트 분석',desc:'추세선 · SMC/ICT · 유동성 · 매물대 · 이평 · 보조지표',path:'/unified-chart.html'},
    snapshotcenter:{title:'스냅샷 센터',desc:'8TF · 유동성 · 품질/서사 통합 · 필요한 모듈만 로드',path:'/snapshot-hub.html'},
    mtfsnapshot:{title:'8TF 스냅샷',desc:'스냅샷 센터 · 8TF 보드',path:'/snapshot-hub.html',mode:'board'},
    liquiditysnapshot:{title:'유동성 스냅샷',desc:'스냅샷 센터 · 유동성 지도',path:'/snapshot-hub.html',mode:'liquidity'},
    longtrend:{title:'장기추세선',desc:'28D → 14D → 1W → 3D → 1D → 4H · 가중 평균 최종 추세선',path:'/long-trend-dashboard.html'},
    report:{title:'종합 리포트',desc:'멀티TF · SMC/ICT · 수급 · 뉴스 · 반증',path:'/coin-report.html'},
    dante:{title:'주식단테 실전 랩',desc:'공개 기법 · 자동/수동 체크 · 차트 오버레이 · 멀티TF',path:'/dante-lab.html'},
    multi:{title:'레거시 MTF 차트',desc:'기존 다중 차트 연구 화면',path:'/multi-chart.html'},
    intel:{title:'코인 정보·일정·뉴스',desc:'공식 일정 · 언락 · 뉴스 · 선물시장 압력',path:'/coin-intel.html'},
    ict:{title:'ICT 전문 트레이너',desc:'유동성 · ERL/IRL · PD Array · CISD · IPDA · MMXM · 8TF',path:'/ict-trainer.html'},
    simpletrading:{title:'클래식 패턴 실전 랩',desc:'Simple Trading Book · 캔들 · 전략 1~7 · 차트 패턴',path:'/simple-trading-lab.html'},
    forexbook:{title:'Forex Book 실전 랩',desc:'p.1~406 · 패턴 · 상관관계 · 치트시트 · 리스크',path:'/forex-book-lab.html'},
    bookconfluence:{title:'책 합성 실전 랩',desc:'기술적 차트 분석 · 코린이 입문서 · Confluent Zone · 시간/가격론',path:'/book-confluence-lab.html'},
    structure:{title:'시장 구조',desc:'스윙 · BOS · CHoCH · 구조 연구',path:'/structure-lab.html'},
    liquidity:{title:'유동성',desc:'FVG · Sweep · Liquidity 연구',path:'/liquidity-lab-v2.html'},
    surge:{title:'급등 패턴',desc:'PRE-SURGE · 급등 전후 패턴 연구',path:'/surge-pattern-lab.html'},
    snapshot:{title:'MTF 스냅샷',desc:'다중 시간봉 구조 스냅샷',path:'/snapshot-analysis.html'},
    chartsnapshot:{title:'차트 스냅샷',desc:'스냅샷 센터 · 품질/서사',path:'/snapshot-hub.html',mode:'quality'},
    performance:{title:'성과 검증',desc:'신호 성과 · Calibration · 품질 검증',path:'/signal-performance.html'},
    preignitionoos:{title:'점화전 OOS 검증',desc:'60·70·80 점수대 · 6H/24H 실제 성과 · 탈락군 대조',path:'/preignition-oos.html'},
    backtest:{title:'Dante 연구검증',desc:'256 · 밥그릇 · 이평때리기 · 워크포워드 · Paper Trading',path:'/research-backtest.html'},
    historical:{title:'과거 검증',desc:'Historical validation',path:'/historical-validation.html'},
    backfill:{title:'과거 데이터 백필',desc:'과거 OHLCV · BACKTESTED 표본 생성',path:'/historical-backfill.html'},
    risk:{title:'리스크 계산기',desc:'포지션 리스크 계산',path:'/risk-calculator.html'},
    diagnostics:{title:'진단 센터',desc:'API · 데이터 · 분석 모듈 상태',path:'/diagnostics.html'}
  };
  const ROOT={
    home:'home',pulseai:'ai',bookai:'ai',researchai:'ai',
    scanner:'scan',autoscan:'scan',astra:'scan',traderscan:'scan',assistantscan:'scan',radar:'scan',
    report:'analysis',analysis:'analysis',snapshotcenter:'analysis',mtfsnapshot:'analysis',liquiditysnapshot:'analysis',longtrend:'analysis',multi:'analysis',ict:'analysis',simpletrading:'analysis',forexbook:'analysis',bookconfluence:'analysis',structure:'analysis',liquidity:'analysis',surge:'analysis',snapshot:'analysis',dante:'dante',
    intel:'info',
    performance:'more',preignitionoos:'scan',backtest:'more',historical:'more',backfill:'more',risk:'more',diagnostics:'more',chartsnapshot:'analysis'
  };
  const $=id=>document.getElementById(id),frame=$('frame'),loading=$('loading'),side=$('side'),shade=$('shade'),presets=window.PulsePresets,dataState=window.PulseDataState;
  let current='home',universeCounts={core:null,extended:null};

  function cleanSymbol(v){v=String(v||'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!v)return'BTCUSDT';if(!v.endsWith('USDT')&&v.length<=12)v+='USDT';return v}
  function readRecent(){try{const a=JSON.parse(localStorage.getItem('pr_recent')||'[]');return Array.isArray(a)&&a[0]?a[0]:'BTCUSDT'}catch{return'BTCUSDT'}}
  function symbol(){return cleanSymbol($('symbol').value)}
  function activePreset(){return presets?.getPreset($('preset')?.value||'clean')||{id:'clean'}}
  function srcFor(key){const o=V[key]||V.home,s=symbol(),p=activePreset().id,u=new URL(o.path,location.origin);u.searchParams.set('symbol',s);u.searchParams.set('preset',p);u.searchParams.set('shell','1');u.searchParams.set('build','20260926-trader-astra1');if(o.mode)u.searchParams.set('mode',o.mode);if(key==='snapshotcenter'){const sq=new URLSearchParams(location.search);for(const k of ['mode','tf','eventId','stageTransition','v2Type','scanUpdatedAt']){const v=sq.get(k);if(v)u.searchParams.set(k,v)}}return u.pathname+u.search}
  function emit(name,detail){window.dispatchEvent(new CustomEvent(name,{detail}))}
  function openMenu(){side.scrollTop=0;side.classList.add('open');shade.classList.add('open')}
  function closeMenu(){side.classList.remove('open');shade.classList.remove('open')}
  function setTopState(state){const el=$('dataState');if(!el||!dataState)return;const m=dataState.formatDataState(state);el.dataset.pulseDataState=m.id;el.dataset.severity=m.severity;el.textContent=m.label}

  function ensureChildStyle(d){
    if(!d)return;
    d.documentElement.dataset.shell='1';
    if(!d.getElementById('pulseChildNormalize')){
      const link=d.createElement('link');link.id='pulseChildNormalize';link.rel='stylesheet';link.href='/ui/pulse-child-normalize.css?v=20260921-v5';d.head.appendChild(link);
    }
    let st=d.getElementById('pulseShellInjected');
    if(!st){st=d.createElement('style');st.id='pulseShellInjected';st.textContent='header.top>nav,header.top>.links,header .nav,header .links{display:none!important}.pulse-shell-hidden{display:none!important}';d.head.appendChild(st)}
  }
  function applyPresetToChild(){try{const d=frame.contentDocument;if(!d)return;const p=activePreset();ensureChildStyle(d);d.documentElement.dataset.pulsePreset=p.id;d.defaultView?.dispatchEvent(new CustomEvent('pulse:preset-applied',{detail:{preset:p.id}}))}catch(e){console.warn('preset injection failed',e)}}
  function attachChildDataState(){try{const d=frame.contentDocument;if(!d||!dataState)return;ensureChildStyle(d);const existing=d.getElementById('dataState')||d.getElementById('pulseChildDataState');if(existing){const obs=()=>{const id=existing.dataset.pulseDataState||(/오류|error|실패/i.test(existing.textContent||'')?'api-degraded':'live');setTopState(id)};obs();new MutationObserver(obs).observe(existing,{childList:true,subtree:true,characterData:true,attributes:true});return}const status=d.getElementById('status');if(status){const update=()=>setTopState(/오류|error|실패/i.test(status.textContent||'')?'api-degraded':'live');update();new MutationObserver(update).observe(status,{childList:true,subtree:true,characterData:true})}}catch(e){console.warn('data-state injection failed',e)}}
  function injectShellMode(){try{const d=frame.contentDocument;if(!d)return;ensureChildStyle(d);d.querySelectorAll('a[href="/"],a[href="/scanner-shell-v13.html"],a[href="/pulse-unified.html"]').forEach(a=>{a.onclick=e=>{e.preventDefault();parent.postMessage({type:'pulse-nav',view:'home'},'*')}});applyPresetToChild();attachChildDataState()}catch(e){console.warn('shell injection failed',e)}}

  function scopeText(key){
    if(key==='radar')return'DEX 별도';
    if(['autoscan','astra','traderscan','assistantscan','preignitionoos','report','analysis','snapshotcenter','mtfsnapshot','liquiditysnapshot','chartsnapshot','longtrend','multi','ict','simpletrading','forexbook','bookconfluence','structure','liquidity','surge','snapshot','dante'].includes(key))return universeCounts.core!=null?'코어 '+universeCounts.core.toLocaleString():'코어 유니버스';
    if(key==='scanner')return universeCounts.extended!=null?'확장 '+universeCounts.extended.toLocaleString():'확장 유니버스';
    if(key==='intel'||key==='pulseai'||key==='bookai'||key==='researchai'||key==='home')return universeCounts.core!=null&&universeCounts.extended!=null?`코어 ${universeCounts.core.toLocaleString()} · 확장 ${universeCounts.extended.toLocaleString()}`:'코어 · 확장';
    return'연구 도구';
  }
  function updateUniverseChip(key=current){const el=$('universeChip');if(el)el.textContent=scopeText(key)}
  async function loadUniverseCounts(){try{const r=await fetch('/api/market?catalog=1',{cache:'no-store'}),d=await r.json();if(r.ok&&d?.ok){universeCounts={core:Number(d.coreFuturesCount)||0,extended:Number(d.total)||0};updateUniverseChip()}}catch{}}
  function markActive(key){
    document.querySelectorAll('.navBtn[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===key));
    const root=ROOT[key]||'home';
    document.querySelectorAll('.mBtn[data-root]').forEach(b=>b.classList.toggle('active',b.dataset.root===root));
  }
  function setView(key,push=true){
    if(!V[key])key='home';current=key;const o=V[key];
    $('pageTitle').textContent=o.title;$('pageDesc').textContent=o.desc;markActive(key);updateUniverseChip(key);
    loading.classList.remove('hide');frame.src=srcFor(key);
    if(push){const u=new URL(location.href);u.searchParams.set('view',key);u.searchParams.set('symbol',symbol());u.searchParams.set('preset',activePreset().id);history.replaceState(null,'',u)}
    closeMenu();emit('pulse:viewchange',{view:key});
  }
  function applySymbol(){const s=symbol();$('symbol').value=s;setView(current,true);emit('pulse:symbolchange',{symbol:s})}
  function applyPreset(){const p=presets.savePreset($('preset').value);$('preset').value=p.id;const u=new URL(location.href);u.searchParams.set('preset',p.id);history.replaceState(null,'',u);if(['analysis','snapshotcenter','mtfsnapshot','liquiditysnapshot','chartsnapshot','longtrend','multi','report','ict','dante','bookai'].includes(current))setView(current,false);else applyPresetToChild();emit('pulse:presetchange',{preset:p.id})}
  function syncChildSymbol(raw){const s=cleanSymbol(raw),prev=symbol();$('symbol').value=s;const u=new URL(location.href);u.searchParams.set('symbol',s);if(u.href!==location.href)history.replaceState(null,'',u);if(s!==prev)emit('pulse:symbolchange',{symbol:s,source:'child'});return s}

  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view,true)));
  $('menuBtn').onclick=openMenu;shade.onclick=closeMenu;$('go').onclick=applySymbol;$('symbol').addEventListener('keydown',e=>{if(e.key==='Enter')applySymbol()});$('preset').addEventListener('change',applyPreset);
  $('openTab').onclick=()=>window.open(srcFor(current),'_blank');
  frame.addEventListener('load',()=>{loading.classList.add('hide');injectShellMode()});
  window.addEventListener('message',e=>{if(e.data?.type==='pulse-symbol-sync')return syncChildSymbol(e.data.symbol);if(e.data?.type==='pulse-nav'&&V[e.data.view]){if(e.data.symbol)$('symbol').value=cleanSymbol(e.data.symbol);if(e.data.view==='snapshotcenter'){const u=new URL(location.href);for(const k of ['mode','tf','eventId','stageTransition','v2Type','scanUpdatedAt']){const v=e.data[k];if(v!=null&&v!=='')u.searchParams.set(k,String(v));else if(k==='eventId')u.searchParams.delete(k)}history.replaceState(null,'',u)}setView(e.data.view,true)}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()});

  loadUniverseCounts();const q=new URLSearchParams(location.search);$('symbol').value=cleanSymbol(q.get('symbol')||readRecent());const loaded=presets.loadPreset(),requested=presets.getPreset(q.get('preset')||loaded.id);$('preset').value=requested.id;setTopState('live');setView(q.get('view')||'home',false);
})();