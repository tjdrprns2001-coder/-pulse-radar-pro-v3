(()=>{
  const $=id=>document.getElementById(id);
  const core=window.PulseRadarCore,stream=window.PulseRadarStream,history=window.PulseRadarHistory,themes=window.PulseRadarThemes,alerts=window.PulseRadarAlerts;
  const state={map:new Map(),baselines:new Map(),tab:'live',chains:new Set(),health:{},lastRender:0,page:1,selectedTheme:null,themeSummary:null};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>{n=Number(n);if(!Number.isFinite(n)||n===0)return'-';if(Math.abs(n)>=1e9)return'$'+(n/1e9).toFixed(2)+'B';if(Math.abs(n)>=1e6)return'$'+(n/1e6).toFixed(2)+'M';if(Math.abs(n)>=1e3)return'$'+(n/1e3).toFixed(1)+'K';return'$'+n.toLocaleString(undefined,{maximumSignificantDigits:6})};
  const pct=n=>{n=Number(n);if(!Number.isFinite(n))return'<span class="muted">-</span>';return `<span class="${n>=0?'pos':'neg'}">${n>=0?'+':''}${n.toFixed(2)}%</span>`};
  const rawPct=n=>{n=Number(n);return Number.isFinite(n)?`${n>=0?'+':''}${n.toFixed(2)}%`:'-'};
  function identity(r){return r.id||`${r.source}:${r.marketType}:${r.chain||''}:${r.pairAddress||r.symbol}`}
  function merge(r){
    const id=identity(r),old=state.map.get(id);
    if(old&&!state.baselines.has(id))state.baselines.set(id,{quoteVolumeUsd:old.quoteVolumeUsd,liquidityUsd:old.liquidityUsd,txCount:old.txCount,change1m:old.change1m,change5m:old.change5m});
    const next={...old,...r,id};
    state.map.set(id,next);
    history?.record(next,r.eventTime??r.receivedTime??Date.now());
    if(r.chain)state.chains.add(r.chain);
  }
  function enrich(){
    return [...state.map.values()].map(r=>{
      const id=identity(r),m=history?.metricsFor(id,r,r.eventTime??r.receivedTime??Date.now())||{};
      const next={...r};
      for(const k of ['change1m','change5m','volumeDelta1m','volumeDelta5m','txDelta1m','txDelta5m'])if(m[k]!=null&&Number.isFinite(Number(m[k])))next[k]=Number(m[k]);
      const cls=themes?.classifyMarket(next)||{theme:'Other / Unclassified',confidence:0,source:'unclassified'};
      return {...next,theme:cls.theme,themeConfidence:cls.confidence,themeSource:cls.source};
    });
  }
  function score(){return core.rankMarkets(enrich(),Object.fromEntries(state.baselines))}
  function filtered(scored){
    let a=scored.slice();
    const q=$('q').value.trim().toLowerCase(),chain=$('chain').value,market=$('market').value,sig=$('signal').value,minL=Number($('liq').value||0);
    a=a.filter(r=>(!q||`${r.symbol} ${r.tokenAddress||''} ${r.pairAddress||''}`.toLowerCase().includes(q))&&(chain==='all'||r.chain===chain)&&(market==='all'||r.marketType===market)&&(sig==='all'||r.label===sig)&&(!minL||Number(r.liquidityUsd||0)>=minL)&&(!state.selectedTheme||r.theme===state.selectedTheme));
    if(state.tab==='movers')a.sort((x,y)=>Math.abs(y.change5m??y.change1m??y.priceChange24h??0)-Math.abs(x.change5m??x.change1m??x.priceChange24h??0));
    if(state.tab==='new')a=a.filter(r=>r.signal==='NEW_PAIR'||(r.pairCreatedAt&&Date.now()-new Date(r.pairCreatedAt)<21600000));
    if(state.tab==='volume')a=a.filter(r=>r.signal==='VOLUME_SPIKE'||r.volumeScore>=45||r.volumeImpulse1m>=1);
    if(state.tab==='liquidity')a=a.filter(r=>/LIQUIDITY/.test(r.signal)||r.riskScore>=50);
    return a;
  }
  function pageData(a){const size=Math.max(1,Number($('pageSize').value||25)),pages=Math.max(1,Math.ceil(a.length/size));state.page=Math.min(Math.max(1,state.page),pages);const start=(state.page-1)*size;return{rows:a.slice(start,start+size),pages,size}}
  function beginnerState(r){if(r.label==='RISK'||Number(r.riskScore||0)>=50)return{key:'danger',icon:'⚠️',title:'위험'};if(r.label==='SURGE')return{key:'surge',icon:'🔴',title:'강한 움직임'};if(r.label==='PRE-SURGE')return{key:'ready',icon:'🟡',title:'준비 중'};return{key:'watch',icon:'👀',title:'관찰'}}
  function whyReasons(r){
    const out=[],s=String(r.signal||'');const add=x=>{if(x&&!out.includes(x)&&out.length<3)out.push(x)};
    if(s==='NEW_PAIR'||(r.pairCreatedAt&&Date.now()-new Date(r.pairCreatedAt)<1800000))add('신규 페어');
    if(s==='VOLUME_SPIKE'||Number(r.volumeScore||0)>=45||Number(r.volumeImpulse1m||0)>=.5||r.reasons?.some(x=>String(x).includes('1분 거래량')))add('거래량 증가');
    if(s==='BUY_PRESSURE'||Number(r.buySellImbalance||0)>=.3)add('매수세 증가');
    if(s==='LIQUIDITY_RISK'||Number(r.riskScore||0)>=50)add('유동성 위험');
    if(s==='PRICE_SPIKE'||Math.abs(Number(r.change5m??r.change1m??0))>=5)add('가격 급변');
    if(s==='LIQUIDITY_INFLOW')add('유동성 유입');if(s==='LIQUIDITY_OUTFLOW')add('유동성 감소');
    if(!out.length&&r.reasons?.length)add(String(r.reasons[0]).replace(/[<>]/g,''));
    if(!out.length)add('이상징후 관찰');return out;
  }
  function beginnerBlock(r){
    const st=beginnerState(r),reasons=whyReasons(r);
    return `<div class="beginnerState ${st.key}"><b>${st.icon} ${st.title}</b></div><div class="whyList">${reasons.map(x=>`<span>• ${esc(x)}</span>`).join('')}</div><details class="detailPanel"><summary class="detailToggle">자세히</summary><div class="detailBody"><span>테마 ${esc(r.theme||'Other / Unclassified')}</span><span>원신호 ${esc(r.label||'WATCH')} / ${esc(r.signal||'WATCH')}</span><span>레이더 점수 ${Math.round(Number(r.radarScore)||0)}</span><span>1분 변화 ${esc(rawPct(r.change1m))}</span><span>5분 변화 ${esc(rawPct(r.change5m))}</span><span>거래량 ${esc(fmt(r.quoteVolumeUsd))}</span>${r.marketType==='dex'?`<span>유동성 ${esc(fmt(r.liquidityUsd))}</span>`:''}</div></details>`;
  }
  function shortChangeBlock(r){return `<div class="shortChange"><span>1m ${pct(r.change1m)}</span><span>5m ${pct(r.change5m)}</span></div>`}
  function renderThemes(all){
    if(!themes||!$('themeBars'))return;
    const agg=themes.aggregateThemes(all);state.themeSummary=agg;
    const top=agg.themes.find(x=>x.marketCount>0)||agg.themes[0];
    $('themeMeta').textContent=top?`현재 상위 집중 ${top.theme} ${Math.round(top.themeHeat)} · 활성 테마 ${agg.themeBreadth} · 상위 점유 ${Math.round(agg.dominantThemeShare*100)}%`:'테마 데이터 없음';
    $('themeBars').innerHTML=agg.themes.map(t=>{const selected=state.selectedTheme===t.theme;return `<button class="themeBar${selected?' selected':''}" data-theme="${esc(t.theme)}" aria-pressed="${selected?'true':'false'}"><div class="themeBarTop"><b>${esc(t.theme)}</b><strong>${Math.round(t.themeHeat)}</strong></div><div class="themeTrack"><span class="themeBarFill" style="width:${Math.max(0,Math.min(100,t.themeHeat))}%"></span></div><div class="themeBarMeta"><span>집중도 ${Math.round(t.themeHeat)}</span><span>활성 신호 ${t.activeSignalCount}</span><span>${esc(t.annotation)}</span></div></button>`}).join('');
    $('themeBars').querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>{const t=b.dataset.theme;state.selectedTheme=state.selectedTheme===t?null:t;state.page=1;render(true)});
    $('themeReset').classList.toggle('active',!state.selectedTheme);
  }
  function renderAlerts(){
    const box=$('recentAlerts');if(!box||!alerts)return;const list=alerts.recent().slice(0,3);
    box.innerHTML=list.map(a=>`<div class="alertToast ${String(a.to).toLowerCase().replace(/[^a-z]+/g,'-')}"><b>${esc(a.market)} · ${esc(a.to)}</b><span>${esc((a.reasons||[]).join(' · ')||a.signal)}</span></div>`).join('');
  }
  function observeAlerts(all){if(!alerts)return;for(const r of all)alerts.observe(r);renderAlerts()}
  function render(force=false){
    if(!force&&Date.now()-state.lastRender<500)return;state.lastRender=Date.now();
    const all=score(),a=filtered(all),p=pageData(a);
    observeAlerts(all);renderThemes(all);
    $('mMarkets').textContent=state.map.size.toLocaleString();$('mSignals').textContent=all.filter(x=>x.label!=='WATCH').length.toLocaleString();$('mNew').textContent=all.filter(x=>x.signal==='NEW_PAIR').length.toLocaleString();$('mChains').textContent=state.chains.size;
    $('pageInfo').textContent=`${state.page} / ${p.pages}`;$('resultInfo').textContent=`${a.length.toLocaleString()} markets${state.selectedTheme?` · ${state.selectedTheme}`:''}`;$('prevPage').disabled=state.page<=1;$('nextPage').disabled=state.page>=p.pages;
    $('rows').innerHTML=p.rows.length?p.rows.map(r=>{const canOpen=r.marketType!=='dex'&&/USDT$/.test(r.symbol||'');const target=canOpen?`/unified-chart.html?symbol=${encodeURIComponent(r.symbol)}&preset=full`:(r.url||'#');return `<div class="row"><div class="sym" data-chain="${esc(r.chain||r.marketType)}">${esc(r.symbol||'?')}<div class="muted">${esc(r.venue||r.source)} · ${esc(r.chain||r.marketType)} · ${esc(r.theme||'Other')}</div></div><div>${esc(fmt(r.priceUsd??r.price))}</div><div>${shortChangeBlock(r)}</div><div>${esc(fmt(r.quoteVolumeUsd))}</div><div>${r.marketType==='dex'?esc(fmt(r.liquidityUsd)):'-'}</div><div class="score">${Math.round(r.radarScore)}</div><div class="signalCell">${beginnerBlock(r)}</div><div><button class="open" data-open="${encodeURIComponent(target)}">열기 ↗</button></div></div>`}).join(''):'<div class="empty">현재 필터에 맞는 시장이 없습니다.</div>';
    $('rows').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{const u=decodeURIComponent(b.dataset.open);if(u&&u!=='#')window.open(u,'_blank')});
    $('health').textContent=Object.entries(state.health).map(([k,v])=>`${k}: ${v}`).join(' · ');
  }
  function resetAndRender(){state.page=1;render(true);window.scrollTo({top:0,behavior:'smooth'})}
  function syncChains(){const s=$('chain'),v=s.value;for(const c of [...state.chains].sort())if(![...s.options].some(o=>o.value===c)){const o=document.createElement('option');o.value=c;o.textContent=c;s.appendChild(o)}s.value=[...s.options].some(o=>o.value===v)?v:'all'}
  async function load(){
    const api=$('apiState');try{const r=await fetch('/api/radar?mode=snapshot',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();for(const x of [...(d.cex||[]),...(d.dex||[])])merge(x);state.health={...state.health,...(d.health||{})};syncChains();api.textContent=d.stale?'API STALE':'API LIVE';api.classList.toggle('live',!d.stale);$('updatedAt').textContent=new Date(d.updatedAt).toLocaleTimeString();render(true)}catch(e){api.textContent='API DEGRADED';state.health.api='degraded';render(true)}
  }
  function startStream(){stream.connect({onState:s=>{const e=$('streamState');e.textContent='STREAM '+String(s.state).toUpperCase();e.classList.toggle('live',s.state==='live');if(s.channels){state.health.wsSpot=s.channels.spot;state.health.wsFutures=s.channels.futures}},onTick:r=>{merge(r);render(false)}})}
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));state.tab=b.dataset.tab;resetAndRender()});
  ['q','chain','market','signal','liq'].forEach(id=>$(id).addEventListener(id==='q'?'input':'change',resetAndRender));
  $('themeReset').onclick=()=>{state.selectedTheme=null;resetAndRender()};
  $('pageSize').addEventListener('change',resetAndRender);$('prevPage').onclick=()=>{if(state.page>1){state.page--;render(true);document.querySelector('.tableWrap')?.scrollIntoView({behavior:'smooth',block:'start'})}};$('nextPage').onclick=()=>{state.page++;render(true);document.querySelector('.tableWrap')?.scrollIntoView({behavior:'smooth',block:'start'})};
  load();setInterval(load,15000);startStream();
})();
