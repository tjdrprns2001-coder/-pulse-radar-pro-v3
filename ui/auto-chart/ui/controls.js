(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartControls=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const $=id=>document.getElementById(id);
function cleanSymbol(v){v=String(v||'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!v)return'BTCUSDT';if(!v.endsWith('USDT')&&v.length<=12)v+='USDT';return v}
function read(){return{exchange:$('exchange')?.value||'binance',market:$('market')?.value||'futures',symbol:cleanSymbol($('symbol')?.value),timeframe:$('timeframe')?.value||'4h'}}
function layers(){const out={};document.querySelectorAll('[data-layer]').forEach(x=>out[x.dataset.layer]=x.checked);return out}
function bind({onAnalyze,onLayerChange}={}){
  $('analyze')?.addEventListener('click',()=>onAnalyze?.(true));$('symbol')?.addEventListener('keydown',e=>{if(e.key==='Enter')onAnalyze?.(true)});
  for(const id of['exchange','market','timeframe'])$(id)?.addEventListener('change',()=>onAnalyze?.(true));
  document.querySelectorAll('[data-layer]').forEach(x=>x.addEventListener('change',()=>onLayerChange?.(layers())));
}
return{cleanSymbol,read,layers,bind};
});