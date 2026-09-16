(()=>{
  const fieldFor=w=>({"5m":"activity5mUsd","1h":"activity1hUsd","4h":"activity4hUsd","24h":"activity24hUsd"})[w]||'activity1hUsd';
  const finite=v=>v==null||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
  const fmt=n=>{n=finite(n);if(n==null||n===0)return'-';const s=n<0?'-':'',a=Math.abs(n);if(a>=1e9)return s+'$'+(a/1e9).toFixed(2)+'B';if(a>=1e6)return s+'$'+(a/1e6).toFixed(2)+'M';if(a>=1e3)return s+'$'+(a/1e3).toFixed(1)+'K';return s+'$'+a.toFixed(0)};
  function topThemes(rows,windowKey='1h',limit=8){const f=fieldFor(windowKey);return (rows||[]).map(r=>({...r,value:finite(r[f])})).filter(r=>r.value!=null).sort((a,b)=>(b.rotationScore||0)-(a.rotationScore||0)||Math.abs(b.value)-Math.abs(a.value)).slice(0,limit)}
  function contributionLabel(r){const d=finite(r.dexActivityShare),c=finite(r.cexActivityShare);if(d==null&&c==null)return'-';if((d||0)>(c||0)*1.25)return'DEX 집중';if((c||0)>(d||0)*1.25)return'CEX 집중';return'DEX/CEX 혼합'}
  function boot(){
    const $=id=>document.getElementById(id),box=$('marketFlowBars'),meta=$('marketFlowMeta'),health=$('marketFlowHealth'),panel=$('marketFlow');if(!box||!meta||!panel)return;
    let data={themeFlows:[],providerHealth:{},coverage:{},confidence:0,stale:true},win='1h';
    function render(){const rows=topThemes(data.themeFlows,win,10),max=Math.max(1,...rows.map(r=>Math.abs(r.value||0)));meta.textContent=rows.length?`${win} 기준 · ${data.coverage?.venues||0}개 CEX venue · ${data.coverage?.dexMarkets||0} DEX · 신뢰도 ${data.confidence||0}%`:`${win} 데이터 대기 중`;
      box.innerHTML=rows.length?rows.map(r=>{const w=Math.max(3,Math.abs(r.value||0)/max*100),net=r.dexNetBuyUsdEstimate==null?'-':fmt(r.dexNetBuyUsdEstimate);return `<button class="marketFlowRow" data-market-theme="${String(r.theme).replace(/"/g,'&quot;')}"><span class="marketFlowName"><b>${r.theme}</b><small>${contributionLabel(r)}</small></span><span class="marketFlowTrack"><i style="width:${w}%"></i></span><span class="marketFlowValues"><b>${fmt(r.value)}</b><small>DEX 순매수 추정 ${net}</small></span></button>`}).join(''):'<div class="marketFlowEmpty">MARKET FLOW DEGRADED · 사용 가능한 공개 소스가 들어오면 자동 표시됩니다.</div>';
      document.querySelectorAll('[data-market-flow-window]').forEach(b=>b.classList.toggle('active',b.dataset.marketFlowWindow===win));
    }
    async function load(){try{const r=await fetch('/api/market-flow',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);data=await r.json();const live=Object.values(data.providerHealth||{}).filter(x=>x==='live').length;health.textContent=live?`MARKET FLOW LIVE ${live}`:'MARKET FLOW DEGRADED';health.classList.toggle('live',live>0);render()}catch{health.textContent='MARKET FLOW DEGRADED';data={themeFlows:[],providerHealth:{},coverage:{},confidence:0,stale:true};render()}}
    document.querySelectorAll('[data-market-flow-window]').forEach(b=>b.onclick=()=>{win=b.dataset.marketFlowWindow;render()});
    const marketBtn=$('marketFlowMode'),activity=$('activityMode'),capital=$('capitalMode');if(marketBtn){marketBtn.onclick=()=>{marketBtn.classList.add('active');activity?.classList.remove('active');capital?.classList.remove('active');panel.scrollIntoView({behavior:'smooth',block:'start'})};activity?.addEventListener('click',()=>marketBtn.classList.remove('active'));capital?.addEventListener('click',()=>marketBtn.classList.remove('active'))}
    load();setInterval(load,30000);
  }
  const api={fieldFor,topThemes,contributionLabel};if(typeof module!=='undefined'&&module.exports)module.exports=api;if(typeof window!=='undefined'){window.PulseRadarMarketFlow=api;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot()}
})();
