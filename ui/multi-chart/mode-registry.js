(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseMultiChartModes=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const defs={
    clean:{presetId:'clean',plugins:[],panes:[],visualProfile:'clean'},
    structure:{presetId:'structure',plugins:['structure'],panes:[],visualProfile:'structure'},
    smc:{presetId:'smc',plugins:['smc'],panes:[],visualProfile:'smc'},
    ict:{presetId:'smc',plugins:['ict'],panes:[],visualProfile:'ict'},
    dante:{presetId:'dante',plugins:['dante'],panes:[],visualProfile:'dante'},
    full:{presetId:'full',plugins:['structure','smc','dante'],panes:[],visualProfile:'full'}
  };
  function listModes(){return Object.keys(defs)}
  function getModeDefinition(mode,viewport='desktop'){const base=defs[mode]||defs.clean;const out={...base,plugins:[...base.plugins],panes:[...base.panes]};if(viewport==='mobile'){out.panes=[];if(mode==='full')out.plugins=['structure','smc']}return out}
  return{getModeDefinition,listModes};
});