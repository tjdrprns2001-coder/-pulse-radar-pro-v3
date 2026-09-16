(function(g){
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  function tokenKey(chain,address){return `${String(chain||'').toLowerCase()}:${String(address||'').toLowerCase()}`}
  function indexTokenFlows(rows=[]){const m=new Map();for(const r of rows){if(!r?.chain||!r?.tokenAddress)continue;m.set(tokenKey(r.chain,r.tokenAddress),r)}return m}
  function fieldFor(window){return window==='4h'?'netFlow4hUsd':window==='24h'?'netFlow24hUsd':'netFlow1hUsd'}
  function themeFlowBars(rows=[],window='1h'){const key=fieldFor(window),a=rows.map(r=>({...r,value:num(r[key]),direction:num(r[key])>=0?'positive':'negative'}));a.sort((x,y)=>Math.abs(y.value)-Math.abs(x.value));return a}
  function topSides(rows=[],window='1h',limit=5){const bars=themeFlowBars(rows,window);return {positive:bars.filter(x=>x.value>0).sort((a,b)=>b.value-a.value).slice(0,limit),negative:bars.filter(x=>x.value<0).sort((a,b)=>a.value-b.value).slice(0,limit)} }
  function flowAnnotation(r={}){if(num(r.walletVolatility)>=70)return'온체인 변동성 높음';if(num(r.largeWalletNetFlowUsd)>=100000)return'대형 지갑 순유입 증가';if(num(r.activeWalletDelta)>=5)return'활성 지갑 증가';if(num(r.exchangeNetFlowUsd)<-100000)return'거래소 유입 증가';if(num(r.exchangeNetFlowUsd)>100000)return'거래소 유출 증가';return'공개 온체인 흐름 관찰'}
  const api={tokenKey,indexTokenFlows,themeFlowBars,topSides,flowAnnotation,fieldFor};if(typeof module!=='undefined'&&module.exports)module.exports=api;g.PulseRadarOnchain=api;
})(typeof window!=='undefined'?window:globalThis);
