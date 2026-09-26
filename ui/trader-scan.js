(() => {
  'use strict';
  const $=id=>document.getElementById(id),labels={CONFIRMED:'진입 확인',ARMED:'진입 대기',WATCH:'관찰',EXCLUDED:'제외',DATA_GAP:'데이터 부족'};
  const regimeLabels={SUPPORTIVE:'상승 환경 · 구조 확인 허용',MIXED:'혼조 환경 · 관찰 우선',RISK_OFF:'하락 위험 · 신규 롱 제외',UNKNOWN:'시장 데이터 부족 · 판단 보류'};
  const rank={CONFIRMED:0,ARMED:1,WATCH:2,DATA_GAP:3,EXCLUDED:4};
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(v,d=2)=>v==null||!Number.isFinite(Number(v))?'N/A':Number(v).toLocaleString('ko-KR',{maximumFractionDigits:d});
  const price=v=>fmt(v,v>1?4:8);
  const time=v=>v?new Date(v).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'미확인';
  let items=[],summary=null,filter='ALL',running=false,controller=null,timer=null,lastFinished=0;
  const scanStale=()=>!running&&((lastFinished&&Date.now()-lastFinished>120000)||(!lastFinished&&summary?.asOf&&Date.now()-summary.asOf>120000));
  function setProgress(total,completed,failed){
    const processed=completed+failed,pct=total?Math.min(100,Math.round(processed/total*100)):0;
    if($('scanTotal'))$('scanTotal').textContent=total;
    if($('scanCompleted'))$('scanCompleted').textContent=completed;
    if($('scanFailed'))$('scanFailed').textContent=failed;
    if($('scanPct'))$('scanPct').textContent=pct+'%';
  }
  function spark(values){
    const a=(values||[]).filter(Number.isFinite);if(a.length<2)return '';
    const lo=Math.min(...a),range=Math.max(...a)-lo||1;
    return `<svg class="spark" viewBox="0 0 400 54" preserveAspectRatio="none" role="img" aria-label="최근 48개 1시간 확정 종가"><polyline points="${a.map((v,i)=>`${i*400/(a.length-1)},${49-(v-lo)/range*44}`).join(' ')}"/></svg>`;
  }
  function card(x){
    const f=x.flow||{},s=x.stats||{},p=x.plan||{},warnings=[...(x.blockers||[]),...(x.missing||[]),...(x.waiting||[])];
    const stale=scanStale();
    const state=stale&&x.state==='CONFIRMED'?'DATA_GAP':x.state;
    const reasons=stale?['이전 스캔 결과입니다. 새 스캔으로 진입 상태를 재확인하세요.',...warnings]:warnings;
    const line=reasons.length?reasons.slice(0,2):(x.reasons||[]).slice(0,2);
    const checks=[...(x.reasons||[]).map(t=>'통과 · '+t),...reasons.map(t=>'확인 필요 · '+t)];
    return `<article class="card" data-state="${escape(state)}" data-symbol="${escape(x.symbol)}"><div class="cardTop"><div><div class="symbol">${escape(x.symbol.replace(/USDT$/,''))}<span class="setup"> / USDT</span></div><div class="setup">${escape(x.setup?.label||'분석 미완료')}</div></div><span class="tag ${escape(state)}">${escape(labels[state]||state)}</span></div>
      <div class="priceLine"><b class="price">${price(x.price)}</b><span class="${x.change24h>=0?'up':'down'}">${x.change24h>0?'+':''}${fmt(x.change24h)}%</span><span class="setup">24H</span></div>${spark(x.chart)}
      <div class="metrics"><div><small>4H OI</small><b>${fmt(f.oi4hPct)}${f.oi4hPct==null?'':'%'}</b></div><div><small>매수/매도 체결</small><b>${fmt(f.takerRatio)}</b></div><div><small>15m RVOL</small><b>${fmt(s['15m']?.rvol)}×</b></div><div><small>예상 순손익비</small><b>${fmt(p.netRR)}${p.netRR==null?'':'R'}</b></div></div>
      <div class="why ${x.blockers?.length?'risk':''}">${line.map(escape).join('<br>')}</div>
      <div class="plan"><div><small>호가 기준 가상 진입</small><b>${price(p.entry)}</b></div><div><small>무효화 기준</small><b>${price(p.stop)}</b></div><div><small>가까운 4H 저항</small><b>${price(p.target)}</b></div></div>
      <details><summary>조건별 근거 · 6TF · 보조지표 보기</summary><div class="tf">${Object.entries(s).map(([tf,v])=>`<span>${escape(tf.toUpperCase())} · ${!v.available?'부족':({UP:'상승',DOWN:'하락',MIXED:'혼조'})[v.trend]||'미확인'}</span>`).join('')}</div><ul>${checks.map(t=>`<li>${escape(t)}</li>`).join('')}</ul><p>1H RSI ${fmt(s['1h']?.rsi)} · MACD선 ${fmt(s['1h']?.macd,5)} (${s['1h']?.macdImproving?'개선':'미개선'}) · OBV ${s['1h']?.obvUp?'유입 우세':'미확인/유출'}</p><p>1H SMA 5 / 10 / 20 / 60 / 120: ${[5,10,20,60,120].map(n=>price(s['1h']?.sma?.[n])).join(' / ')}</p><p>8H 환산 펀딩 ${fmt(f.funding8hPct,4)}% · ${escape(p.note||'호가·목표 미확인')}</p></details>
      <div class="cardBottom"><span>조건 충족 ${fmt(x.score,0)}/100 · ${time(x.asOf)}${stale?' · 이전 결과':''}</span><a href="/coin-report.html?symbol=${encodeURIComponent(x.symbol)}" target="_blank" rel="noopener">종합 리포트 ↗</a></div></article>`;
  }
  function render(){
    const expanded=new Set([...document.querySelectorAll('.card details[open]')].map(el=>el.closest('.card').dataset.symbol));
    const query=$('query').value.trim().toUpperCase(),counts=Object.fromEntries(Object.keys(labels).map(k=>[k,0]));
    const stale=scanStale(),display=items.map(x=>stale&&x.state==='CONFIRMED'?{...x,state:'DATA_GAP'}:x);
    display.forEach(x=>counts[x.state]=(counts[x.state]||0)+1);
    for(const k of Object.keys(labels))$('count-'+k).textContent=counts[k];
    const selected=display.filter(x=>(filter==='ALL'||x.state===filter)&&x.symbol.includes(query)).sort((a,b)=>rank[a.state]-rank[b.state]||b.score-a.score);
    $('resultCount').textContent=selected.length;
    $('results').innerHTML=selected.length?selected.map(card).join(''):`<div class="empty"><span>◎</span><h3>${running?'구조와 수급을 확인하고 있어요.':'이 분류에 해당하는 후보가 없습니다.'}</h3><p>${running?'검사가 끝나는 종목부터 차례로 표시됩니다.':'조건을 충족하지 않으면 후보를 억지로 만들지 않습니다.'}</p></div>`;
    document.querySelectorAll('.card').forEach(el=>{if(expanded.has(el.dataset.symbol))el.querySelector('details').open=true});
  }
  async function request(mode,params={}){
    const timeout=AbortSignal.timeout(90000),signal=AbortSignal.any([controller.signal,timeout]);
    const response=await fetch('/api/coin-scan?'+new URLSearchParams({mode,...params}),{cache:'no-store',signal});
    const data=await response.json();if(!response.ok||data.status!=='ok')throw new Error(data.error||`HTTP ${response.status}`);return data;
  }
  function arm(){clearTimeout(timer);const minutes=Number($('interval').value);if(minutes&&document.visibilityState==='visible'&&!running)timer=setTimeout(scan,minutes*60000)}
  function save(){try{sessionStorage.setItem('trader_scan_v1',JSON.stringify({items,summary,lastFinished,savedAt:Date.now()}))}catch{}}
  function showSummary(){
    if(!summary)return;
    $('regime').textContent=regimeLabels[summary.regime?.state]||regimeLabels.UNKNOWN;
    $('asOf').textContent='스캔 시작 시점 '+time(summary.asOf);
    $('marketNote').textContent=summary.regime?.state==='RISK_OFF'?'신규 롱은 제외하고, 구조와 제외 사유를 기록합니다.':'BTC·ETH가 모두 상승 정렬된 환경에서만 진입 확인으로 분류합니다.';
    $('coverage').textContent=`Binance USDT 무기한 거래가능 ${summary.universeCount}개 · 1W/1D/4H/1H/15m/5m 6TF 전수검사 · 기본 필터 통과 ${summary.eligibleCount}개`;
    setProgress(summary.universeCount,0,0);
  }
  async function scan(){
    if(running)return;clearTimeout(timer);running=true;controller=new AbortController();items=[];summary=null;lastFinished=0;render();setProgress(0,0,0);
    $('regime').textContent='시장 상태 확인 중';$('asOf').textContent='조회 중';$('marketNote').textContent='BTC·ETH 선물 확정봉을 다시 확인합니다.';
    $('start').disabled=true;$('stop').disabled=false;$('bar').style.width='2%';$('status').textContent='Binance USDT 무기한 거래가능 종목 전체 목록 확인 중…';
    let completed=0,failed=0,total=0;
    try{
      summary=await request('trader-summary');showSummary();
      const symbols=summary.candidates.map(x=>x.symbol),batches=[];total=symbols.length;
      for(let i=0;i<symbols.length;i+=4)batches.push(symbols.slice(i,i+4));
      setProgress(total,0,0);$('bar').style.width=total?'5%':'100%';
      let next=0;
      async function worker(){
        while(next<batches.length){
          if(controller.signal.aborted)return;
          const batch=batches[next++],returned=new Set(),failedSymbols=new Set();
          try{
            const data=await request('trader-batch',{symbols:batch.join(',')});
            for(const item of data.items||[]){items.push(item);if(item?.symbol)returned.add(item.symbol)}
            for(const err of data.errors||[])if(err?.symbol)failedSymbols.add(err.symbol);
            for(const symbol of batch){
              if(returned.has(symbol))continue;
              failedSymbols.add(symbol);
              items.push({symbol,state:'DATA_GAP',score:0,asOf:Date.now(),reasons:[],waiting:[],blockers:[],missing:['정밀 데이터 응답 누락']});
            }
          }catch(e){
            if(controller.signal.aborted)return;
            for(const symbol of batch){
              failedSymbols.add(symbol);
              items.push({symbol,state:'DATA_GAP',score:0,asOf:Date.now(),reasons:[],waiting:[],blockers:[],missing:['정밀 데이터 조회 실패: '+e.message]});
            }
          }
          failed+=failedSymbols.size;completed+=batch.length-failedSymbols.size;
          const processed=completed+failed,pct=total?Math.round(processed/total*100):100;
          $('status').textContent=`6TF 전수검사 ${processed}/${total} · 완료 ${completed} · 실패 ${failed}`;
          $('coverage').textContent=`Binance USDT 무기한 거래가능 ${total}개 · 6TF 전수검사 진행 ${processed}/${total} · 완료 ${completed} · 실패 ${failed}`;
          $('bar').style.width=(5+95*pct/100)+'%';setProgress(total,completed,failed);render();save();
        }
      }
      await Promise.all([worker(),worker()]);
      if(controller.signal.aborted)throw new DOMException('Stopped','AbortError');
      lastFinished=Date.now();setProgress(total,completed,failed);$('bar').style.width='100%';
      $('status').textContent=`완료 · 전체 ${total}개 · 완료 ${completed}개 · 실패 ${failed}개`;
      $('coverage').textContent=`Binance USDT 무기한 거래가능 ${total}개를 1W/1D/4H/1H/15m/5m로 전수검사 · 완료 ${completed} · 실패 ${failed} · 조건 미달 종목도 사유 보존`;
      save();
    }catch(e){$('status').textContent=controller.signal.aborted?`스캔 중지 · 완료 ${completed} · 실패 ${failed} · 나머지 미검사`:'스캔 실패 · '+e.message}
    finally{running=false;$('start').disabled=false;$('stop').disabled=true;render();arm()}
  }
  $('start').addEventListener('click',scan);
  $('stop').addEventListener('click',()=>controller?.abort());
  $('interval').addEventListener('change',arm);
  $('query').addEventListener('input',render);
  document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('selected',x.dataset.filter===filter));render()}));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){clearTimeout(timer);return}render();const minutes=Number($('interval').value);if(minutes&&lastFinished&&Date.now()-lastFinished>=minutes*60000)scan();else arm()});
  window.addEventListener('pagehide',()=>{controller?.abort();clearTimeout(timer)});
  // Expire visible entry confirmations even when auto-refresh is off.
  setInterval(()=>{if(document.visibilityState==='visible'&&!running&&items.length)render()},30000);
  try{const cached=JSON.parse(sessionStorage.getItem('trader_scan_v1')||'null');if(cached&&Date.now()-cached.savedAt<3600000&&Array.isArray(cached.items)){items=cached.items;summary=cached.summary;lastFinished=Number(cached.lastFinished)||0;showSummary();const failed=items.filter(x=>x.missing?.some?.(m=>String(m).includes('조회 실패')||String(m).includes('응답 누락'))).length;setProgress(summary?.universeCount||items.length,Math.max(0,items.length-failed),failed);render();$('status').textContent='이전 전수검사 결과를 복원했습니다. 새 스캔으로 현재 상태를 확인하세요.'}}catch{}
})();
