(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PulsePresets = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  const STORAGE_KEY = 'pulse_workspace_preset_v2';
  const PRESETS = Object.freeze({
    clean: Object.freeze({ id:'clean', label:'Clean', maxZones:3, plugins:['structure'], panes:[] }),
    structure: Object.freeze({ id:'structure', label:'Structure', maxZones:5, plugins:['structure'], panes:[] }),
    smc: Object.freeze({ id:'smc', label:'SMC/ICT', maxZones:8, plugins:['structure','smc','ict','liquidity'], panes:[] }),
    dante: Object.freeze({ id:'dante', label:'Dante', maxZones:5, plugins:['structure','moving-average','dante','volume-profile'], panes:[] }),
    full: Object.freeze({ id:'full', label:'Full', maxZones:15, plugins:['structure','smc','ict','liquidity','volume-profile','moving-average','dante','pattern'], panes:['rsi','macd','stoch','kdj','obv'] })
  });

  const STATE_RANK = Object.freeze({ active:0, approaching:1, touched:2, mitigated:3, violated:4, expired:5 });
  function getPreset(id){ return PRESETS[id] || PRESETS.clean; }
  function storageOrDefault(storage){ if(storage)return storage; try{return typeof localStorage!=='undefined'?localStorage:null}catch{return null} }
  function savePreset(id,storage){const preset=getPreset(id),target=storageOrDefault(storage);try{target&&target.setItem(STORAGE_KEY,preset.id)}catch{}return preset}
  function loadPreset(storage){const target=storageOrDefault(storage);let id='clean';try{id=target?.getItem(STORAGE_KEY)||'clean'}catch{}return getPreset(id)}
  function n(v,fallback){return Number.isFinite(Number(v))?Number(v):fallback}
  function prioritizeOverlays(items,presetId){const preset=getPreset(presetId);return(Array.isArray(items)?items.slice():[]).sort((a,b)=>{const byRecency=n(b.recency,-Infinity)-n(a.recency,-Infinity);if(byRecency)return byRecency;const byTf=n(b.timeframeMinutes,0)-n(a.timeframeMinutes,0);if(byTf)return byTf;const byQuality=n(b.quality,0)-n(a.quality,0);if(byQuality)return byQuality;const byState=(STATE_RANK[a.state]??99)-(STATE_RANK[b.state]??99);if(byState)return byState;return n(a.distancePct,Infinity)-n(b.distancePct,Infinity)}).slice(0,preset.maxZones)}
  return{STORAGE_KEY,PRESETS,getPreset,savePreset,loadPreset,prioritizeOverlays};
});