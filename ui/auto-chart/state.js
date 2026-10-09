(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartState=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
function createState(initial={}){
  let requestSeq=0;
  const state={
    exchange:'binance',market:'futures',symbol:'BTCUSDT',timeframe:'4h',scale:'linear',
    layers:{volume:true,ma:false,ema:true,sr:true,box:true,bowl:true,longma:true,structure:true,liquidity:true,reference:true,dealing:true,zones:true,fib:false,vpvr:true,ichimoku:false},
    historical:null,analysis:null,lastGood:null,aux:null,updatedAt:null,error:null,
    ...initial
  };
  const setupMemory=new Map();
  return{
    get:()=>state,
    patch(values){Object.assign(state,values||{});return state},
    beginRequest(){requestSeq+=1;return requestSeq},
    isCurrent(id){return id===requestSeq},
    requestId:()=>requestSeq,
    setupKey(){return[state.exchange,state.market,state.symbol,state.timeframe].join(':')},
    getSetupMemory(){return setupMemory.get(this.setupKey())||null},
    setSetupMemory(value){setupMemory.set(this.setupKey(),value);return value},
    resetSetupMemory(){setupMemory.delete(this.setupKey())}
  };
}
return{createState};
});