(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseMultiChartModes=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const defs={
    clean:{presetId:'clean',plugins:[],panes:[],visualProfile:'clean'},
    structure:{presetId:'structure',plugins:['structure'],panes:[],visualProfile:'structure'},
    smc:{presetId:'smc',plugins:['smc'],panes:[],visualProfile:'smc'},
    liquidity:{presetId:'smc',plugins:['liquidity'],panes:[],visualProfile:'liquidity'},
    ict:{presetId:'smc',plugins:['ict'],panes:[],visualProfile:'ict'},
    dante:{presetId:'dante',plugins:['dante'],panes:[],visualProfile:'dante'},
    full:{presetId:'full',plugins:['structure','liquidity','smc'],panes:[],visualProfile:'full'}
  };
  const rolePresets={
    2:[{timeframe:'1h',mode:'liquidity'},{timeframe:'4h',mode:'ict'}],
    4:[{timeframe:'15m',mode:'liquidity'},{timeframe:'1h',mode:'smc'},{timeframe:'4h',mode:'ict'},{timeframe:'1d',mode:'structure'}]
  };
  function listModes(){return Object.keys(defs)}
  function getModeDefinition(mode,viewport='desktop'){const base=defs[mode]||defs.clean;const out={...base,plugins:[...base.plugins],panes:[...base.panes]};if(viewport==='mobile'){out.panes=[];if(mode==='full')out.plugins=['structure','liquidity']}return out}
  function getRolePreset(count){return (rolePresets[Number(count)]||[]).map(x=>({...x}))}
  return{getModeDefinition,listModes,getRolePreset};
});