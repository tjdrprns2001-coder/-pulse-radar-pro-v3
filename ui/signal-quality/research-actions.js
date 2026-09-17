(()=>{'use strict';
const Links=window.PulseResearchLinks; if(!Links)return;
const q=new URLSearchParams(location.search);
function clean(v){v=String(v||'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(v&&!v.endsWith('USDT')&&v.length<=12)v+='USDT';return v||'BTCUSDT'}
function symbol(){return clean(document.getElementById('symbol')?.value||document.getElementById('selectedTitle')?.textContent||q.get('symbol')||'BTCUSDT')}
function tf(){return document.querySelector('[data-tf].active')?.dataset.tf||q.get('tf')||'4h'}
function context(){return q.get('context')||(/surge/i.test(location.pathname)?'SURGE':'research')}
function source(){return q.get('source')||(/surge/i.test(location.pathname)?'surge':'scanner')}
function ensure(){if(document.getElementById('pulseResearchActions'))return;const style=document.createElement('style');style.textContent='.pulseResearchActions{position:sticky;bottom:8px;z-index:50;display:flex;gap:6px;flex-wrap:wrap;padding:8px;margin:10px;background:#081522e8;border:1px solid #29415c;border-radius:12px;backdrop-filter:blur(12px)}.pulseResearchActions a{color:#dfeeff;text-decoration:none;background:#10243a;border:1px solid #315174;border-radius:9px;padding:7px 9px;font:700 10px system-ui}.pulseResearchActions a.primary{background:#1557b8;border-color:#2c79e8}@media(max-width:650px){.pulseResearchActions{position:static;left:auto;right:auto;bottom:auto;margin:10px 10px 18px;backdrop-filter:none}.pulseResearchActions a{flex:1;text-align:center;min-width:76px}}';document.head.appendChild(style);const box=document.createElement('div');box.id='pulseResearchActions';box.className='pulseResearchActions';document.body.appendChild(box);render()}
function render(){const box=document.getElementById('pulseResearchActions');if(!box)return;const b=Links.bundle({symbol:symbol(),tf:tf(),source:source(),context:context()});box.innerHTML=`<a class="primary" href="${b.analysis}">상세 분석</a><a href="${b.snapshot}">품질·스냅샷</a><a href="${b.ict}">ICT/SMC</a><a href="${b.performance}">성과</a>`}
ensure();document.addEventListener('click',e=>{if(e.target.closest('[data-row],[data-symbol],tr,button'))setTimeout(render,50)},true);document.getElementById('symbol')?.addEventListener('input',render);window.addEventListener('popstate',render);
})();
