(function(g){
  const THEME_ORDER=['AI','MEME','DeFi','RWA','L1','L2','Gaming','DePIN','Privacy','Other / Unclassified'];
  const REGISTRY={
    AI:['FET','TAO','WLD','ARKM','NMR','AI','AGIX'],
    MEME:['DOGE','SHIB','PEPE','BONK','WIF','FLOKI','BOME','MEME','BRETT','MOG'],
    DeFi:['UNI','AAVE','CRV','MKR','COMP','SNX','LDO','JTO','RAY','CAKE','SUSHI','DYDX','GMX'],
    RWA:['ONDO','POLYX','CFG','MPL','PROPC','RIO'],
    L1:['BTC','ETH','SOL','BNB','ADA','AVAX','SUI','APT','TON','TRX','NEAR','INJ','SEI','ATOM','DOT','ALGO','HBAR'],
    L2:['ARB','OP','STRK','ZK','MNT','METIS','ZRO','BOBA'],
    Gaming:['IMX','GALA','AXS','SAND','MANA','ENJ','BEAM','PIXEL','RON','YGG','MAGIC'],
    DePIN:['RENDER','RNDR','HNT','IOTX','FIL','AR','AKT','AIOZ','DIMO','MOBILE'],
    Privacy:['XMR','ZEC','SCRT','ROSE','DASH','FIRO']
  };
  const SYMBOL_TO_THEME=new Map();
  for(const [theme,symbols] of Object.entries(REGISTRY))for(const s of symbols)SYMBOL_TO_THEME.set(s,theme);
  const ADDRESS_REGISTRY=new Map();
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:0));
  function baseSymbol(m={}){
    const direct=String(m.baseAsset||'').trim().toUpperCase();if(direct)return direct;
    const s=String(m.symbol||'').toUpperCase().replace(/\s+/g,'');
    if(s.includes('/'))return s.split('/')[0];
    return s.replace(/(USDT|USDC|FDUSD|BUSD|BTC|ETH|BNB)$/,'');
  }
  function classifyMarket(m={}){
    const addr=String(m.tokenAddress||'').toLowerCase();
    if(addr&&ADDRESS_REGISTRY.has(addr))return {theme:ADDRESS_REGISTRY.get(addr),confidence:100,source:'address-registry'};
    const base=baseSymbol(m),theme=SYMBOL_TO_THEME.get(base);
    if(theme)return {theme,confidence:92,source:'symbol-registry'};
    return {theme:'Other / Unclassified',confidence:0,source:'unclassified'};
  }
  function mean(values){const a=values.filter(v=>Number.isFinite(v));return a.length?a.reduce((s,v)=>s+v,0)/a.length:null}
  function populationStats(summaries){
    const max=k=>Math.max(1,...summaries.map(x=>Math.max(0,Number(x[k]||0))));
    return {maxSignalDensity:max('signalDensity'),maxVolumeImpulse:max('volumeImpulse'),maxRadar:max('avgRadarScore'),maxBuy:max('buyPressure'),maxPrice:max('priceImpulse')};
  }
  function themeHeat(summary,pop){
    const p=pop||{maxSignalDensity:1,maxVolumeImpulse:1,maxRadar:100,maxBuy:1,maxPrice:1};
    const norm=(v,max)=>clamp((Number(v||0)/Math.max(1e-9,Number(max||1)))*100);
    return clamp(
      norm(summary.signalDensity,p.maxSignalDensity)*.30+
      norm(summary.volumeImpulse,p.maxVolumeImpulse)*.25+
      norm(summary.avgRadarScore,p.maxRadar)*.20+
      norm(summary.buyPressure,p.maxBuy)*.15+
      norm(summary.priceImpulse,p.maxPrice)*.10
    );
  }
  function annotationFor(s){
    if(s.riskCount>0&&s.riskCount>=Math.max(1,Math.ceil(s.activeSignalCount*.5)))return '위험 신호 다수';
    if(s.surgeCount>0)return '강한 움직임';
    if(s.preSurgeCount>0)return 'PRE-SURGE 증가';
    if((s.volumeImpulse||0)>=.35)return '거래량 집중';
    if((s.buyPressure||0)>=.2)return '매수세 강함';
    return s.activeSignalCount>0?'활성 신호 증가':'관찰 중';
  }
  function aggregateThemes(markets=[]){
    const groups=new Map(THEME_ORDER.map(t=>[t,[]]));
    for(const m of markets){const c=m.theme?{theme:m.theme}:classifyMarket(m);const t=groups.has(c.theme)?c.theme:'Other / Unclassified';groups.get(t).push({...m,theme:t})}
    const summaries=[];
    for(const theme of THEME_ORDER){
      const rows=groups.get(theme)||[];
      const active=rows.filter(r=>r.label&&r.label!=='WATCH');
      const summary={
        theme,marketCount:rows.length,activeSignalCount:active.length,
        surgeCount:rows.filter(r=>r.label==='SURGE').length,
        preSurgeCount:rows.filter(r=>r.label==='PRE-SURGE').length,
        riskCount:rows.filter(r=>r.label==='RISK').length,
        avgRadarScore:mean(rows.map(r=>num(r.radarScore))),
        avgChange1m:mean(rows.map(r=>num(r.change1m))),
        avgChange5m:mean(rows.map(r=>num(r.change5m))),
        volumeImpulse:mean(rows.map(r=>num(r.volumeImpulse1m??r.volumeRatio))),
        buyPressure:mean(rows.map(r=>{const x=num(r.buySellImbalance);return x==null?null:Math.max(0,x)})),
        liquidityUsd:rows.reduce((s,r)=>s+Math.max(0,Number(r.liquidityUsd||0)),0)
      };
      summary.signalDensity=summary.marketCount?summary.activeSignalCount/summary.marketCount:0;
      summary.priceImpulse=mean([summary.avgChange1m==null?null:Math.abs(summary.avgChange1m),summary.avgChange5m==null?null:Math.abs(summary.avgChange5m)])||0;
      summaries.push(summary);
    }
    const pop=populationStats(summaries);
    for(const s of summaries){s.themeHeat=themeHeat(s,pop);s.annotation=annotationFor(s)}
    summaries.sort((a,b)=>b.themeHeat-a.themeHeat||b.activeSignalCount-a.activeSignalCount||a.theme.localeCompare(b.theme));
    const total=summaries.reduce((x,s)=>x+Math.max(0,s.themeHeat),0),top=summaries[0]?.themeHeat||0;
    return {themes:summaries,dominantThemeShare:total?top/total:0,themeBreadth:summaries.filter(s=>s.activeSignalCount>0||s.themeHeat>=10).length};
  }
  const api={themes:THEME_ORDER,classifyMarket,aggregateThemes,themeHeat,registry:REGISTRY};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;g.PulseRadarThemes=api;
})(typeof window!=='undefined'?window:globalThis);
