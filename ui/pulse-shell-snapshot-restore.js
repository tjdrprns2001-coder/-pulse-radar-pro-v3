(()=>{
  const VIEW='chartsnapshot';
  const $=id=>document.getElementById(id);
  function cleanSymbol(v){v=String(v||'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!v)return'BTCUSDT';if(!v.endsWith('USDT')&&v.length<=12)v+='USDT';return v}
  function symbol(){return cleanSymbol($('symbol')?.value)}
  function src(){return `/snapshot-analysis-restored.html?symbol=${encodeURIComponent(symbol())}&shell=1`}
  function setActive(){document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===VIEW))}
  function closeMenu(){$('side')?.classList.remove('open');$('shade')?.classList.remove('open')}
  function openRestored(){
    const frame=$('frame'),loading=$('loading');if(!frame)return;
    setActive();
    if($('pageTitle'))$('pageTitle').textContent='차트 스냅샷';
    if($('pageDesc'))$('pageDesc').textContent='복원된 MTF 스냅샷 · 1W 포함';
    loading?.classList.remove('hide');
    frame.src=src();
    const u=new URL(location.href);u.searchParams.set('view',VIEW);u.searchParams.set('symbol',symbol());history.replaceState(null,'',u);
    closeMenu();
  }
  function install(){
    const groups=[...document.querySelectorAll('.group')],group=groups.find(g=>/Patterns\s*&\s*MTF/i.test(g.querySelector('.groupTitle')?.textContent||''));
    if(group&&!document.querySelector(`[data-view="${VIEW}"]`)){
      const b=document.createElement('button');b.className='navBtn';b.dataset.view=VIEW;b.innerHTML='<span class="icon">▤</span>차트 스냅샷<span class="badge">RESTORED</span>';
      const old=group.querySelector('[data-view="snapshot"]');old?.insertAdjacentElement('afterend',b) || group.appendChild(b);
      b.addEventListener('click',openRestored);
    }
    const q=new URLSearchParams(location.search);if(q.get('view')===VIEW)setTimeout(openRestored,0);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
