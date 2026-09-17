(()=>{
  const TF='1w';
  function api(){return window.PulseSnapshotPage||null}
  function symbol(){return document.getElementById('symbol')?.value||'BTCUSDT'}
  function activate(){
    const a=api();
    if(!a?.state||typeof a.runSnapshotAnalysis!=='function')return;
    a.state.tf=TF;
    document.querySelectorAll('[data-tf]').forEach(x=>x.classList.toggle('active',x.dataset.tf===TF));
    a.runSnapshotAnalysis({symbol:symbol()});
  }
  function install(){
    const b=document.querySelector('[data-tf="1w"]');
    if(!b)return;
    b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();activate()},true);
    const q=new URLSearchParams(location.search);
    if(q.get('tf')===TF)setTimeout(activate,0);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
