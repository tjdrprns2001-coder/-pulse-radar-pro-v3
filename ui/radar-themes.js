(function(g){
  const THEME_ORDER=['AI','MEME','DeFi','RWA','L1','L2','Gaming','DePIN','Privacy','NFT','SocialFi','DEX','Lending','Liquid Staking','Restaking','Oracle','Storage','Stablecoin','Payments','Exchange Token','Perp DEX','Launchpad','BTC Ecosystem','Solana Ecosystem','Base Ecosystem','Ethereum Ecosystem','Other / Unclassified'];
  const REGISTRY={
    AI:['FET','TAO','WLD','ARKM','NMR','AI','AGIX','OLAS','VIRTUAL','GRASS'],
    MEME:['DOGE','SHIB','PEPE','BONK','WIF','FLOKI','BOME','MEME','BRETT','MOG','PENGU','POPCAT'],
    DeFi:['UNI','CRV','MKR','SNX','CAKE','SUSHI','BAL','PENDLE','ENA'],
    RWA:['ONDO','POLYX','CFG','MPL','PROPC','RIO','OM'],
    L1:['BTC','ETH','SOL','BNB','ADA','AVAX','SUI','APT','TON','TRX','NEAR','INJ','SEI','ATOM','DOT','ALGO','HBAR'],
    L2:['ARB','OP','STRK','ZK','MNT','METIS','ZRO','BOBA','BLAST'],
    Gaming:['IMX','GALA','AXS','SAND','MANA','ENJ','BEAM','PIXEL','RON','YGG','MAGIC','ILV'],
    DePIN:['RENDER','RNDR','HNT','IOTX','AKT','AIOZ','DIMO','MOBILE','GRASS'],
    Privacy:['XMR','ZEC','SCRT','ROSE','DASH','FIRO'],
    NFT:['BLUR','LOOKS','APE'],
    SocialFi:['DEGEN','FRIEND'],
    DEX:['UNI','JUP','RAY','CAKE','SUSHI','CRV','BAL','ORCA','AERO'],
    Lending:['AAVE','COMP','MORPHO','VENUS'],
    'Liquid Staking':['LDO','JTO','RPL','STETH','BNSOL','JITOSOL'],
    Restaking:['EIGEN','ETHFI','REZ','PENDLE'],
    Oracle:['LINK','PYTH','API3','BAND','TRB'],
    Storage:['FIL','AR','STORJ','SC'],
    Stablecoin:['USDT','USDC','DAI','FDUSD','USDE','FRAX'],
    Payments:['XRP','XLM','LTC','BCH','CELO'],
    'Exchange Token':['BNB','OKB','BGB','CRO','LEO','GT'],
    'Perp DEX':['DYDX','GMX','HYPE','DRIFT','AEVO'],
    Launchpad:['RAY','JUP','CAKE','PUMP'],
    'BTC Ecosystem':['BTC','ORDI','SATS','STX','RUNE'],
    'Solana Ecosystem':['SOL','JUP','JTO','RAY','ORCA','BONK','WIF','PYTH','DRIFT'],
    'Base Ecosystem':['AERO','DEGEN','BRETT','VIRTUAL'],
    'Ethereum Ecosystem':['ETH','UNI','AAVE','LDO','EIGEN','LINK','MKR']
  };
  const PRIMARY_PRIORITY=['Stablecoin','L1','L2','AI','MEME','DeFi','RWA','Gaming','DePIN','Privacy','NFT','SocialFi','Lending','Liquid Staking','Restaking','Oracle','Storage','Payments','Exchange Token','Perp DEX','DEX','Launchpad','BTC Ecosystem','Solana Ecosystem','Base Ecosystem','Ethereum Ecosystem'];
  const symbolThemes=new Map();
  for(const [theme,symbols] of Object.entries(REGISTRY))for(const s of symbols){const k=String(s).toUpperCase();if(!symbolThemes.has(k))symbolThemes.set(k,[]);symbolThemes.get(k).push(theme)}
  const ADDRESS_REGISTRY=new Map();
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:0));
  function baseSymbol(m={}){const direct=String(m.baseAsset||'').trim().toUpperCase();if(direct)return direct;const s=String(m.symbol||'').toUpperCase().replace(/\s+/g,'');if(s.includes('/'))return s.split('/')[0];return s.replace(/(USDT|USDC|FDUSD|BUSD|BTC|ETH|BNB)$/,'')}
  function ecosystemTheme(chain){const c=String(chain||'').toLowerCase();if(c==='solana')return'Solana Ecosystem';if(c==='base')return'Base Ecosystem';if(c==='ethereum'||c==='eth')return'Ethereum Ecosystem';return null}
  function pickPrimary(list=[]){for(const p of PRIMARY_PRIORITY)if(list.includes(p))return p;return list[0]||'Other / Unclassified'}
  function classifyMarket(m={}){
    const chainTheme=ecosystemTheme(m.chain),addr=String(m.tokenAddress||'').toLowerCase();
    let list=[],confidence=0,source='unclassified';
    if(addr&&ADDRESS_REGISTRY.has(addr)){const v=ADDRESS_REGISTRY.get(addr);list=Array.isArray(v)?v.slice():[v];confidence=100;source='address-registry'}
    else {const base=baseSymbol(m);if(symbolThemes.has(base)){list=symbolThemes.get(base).slice();confidence=92;source='symbol-registry'}}
    const primaryTheme=pickPrimary(list.filter(t=>!['Solana Ecosystem','Base Ecosystem','Ethereum Ecosystem'].includes(t)));
    const secondaryThemes=[];
    for(const t of list)if(t!==primaryTheme&&!secondaryThemes.includes(t))secondaryThemes.push(t);
    if(chainTheme&&chainTheme!==primaryTheme&&!secondaryThemes.includes(chainTheme))secondaryThemes.push(chainTheme);
    return {theme:primaryTheme,primaryTheme,secondaryThemes,confidence,source};
  }
  function mean(values){const a=values.filter(v=>Number.isFinite(v));return a.length?a.reduce((s,v)=>s+v,0)/a.length:null}
  function populationStats(summaries){const max=k=>Math.max(1,...summaries.map(x=>Math.max(0,Number(x[k]||0))));return {maxSignalDensity:max('signalDensity'),maxVolumeImpulse:max('volumeImpulse'),maxRadar:max('avgRadarScore'),maxBuy:max('buyPressure'),maxPrice:max('priceImpulse')}}
  function themeHeat(summary,pop){const p=pop||{maxSignalDensity:1,maxVolumeImpulse:1,maxRadar:100,maxBuy:1,maxPrice:1};const norm=(v,max)=>clamp((Number(v||0)/Math.max(1e-9,Number(max||1)))*100);return clamp(norm(summary.signalDensity,p.maxSignalDensity)*.30+norm(summary.volumeImpulse,p.maxVolumeImpulse)*.25+norm(summary.avgRadarScore,p.maxRadar)*.20+norm(summary.buyPressure,p.maxBuy)*.15+norm(summary.priceImpulse,p.maxPrice)*.10)}
  function annotationFor(s){if(s.riskCount>0&&s.riskCount>=Math.max(1,Math.ceil(s.activeSignalCount*.5)))return '위험 신호 다수';if(s.surgeCount>0)return '강한 움직임';if(s.preSurgeCount>0)return 'PRE-SURGE 증가';if((s.volumeImpulse||0)>=.35)return '거래량 집중';if((s.buyPressure||0)>=.2)return '매수세 강함';return s.activeSignalCount>0?'활성 신호 증가':'관찰 중'}
  function aggregateThemes(markets=[]){
    const groups=new Map(THEME_ORDER.map(t=>[t,[]]));
    for(const m of markets){const c=m.primaryTheme?{primaryTheme:m.primaryTheme}:classifyMarket(m);const t=groups.has(c.primaryTheme)?c.primaryTheme:'Other / Unclassified';groups.get(t).push({...m,theme:t,primaryTheme:t})}
    const summaries=[];
    for(const theme of THEME_ORDER){const rows=groups.get(theme)||[],active=rows.filter(r=>r.label&&r.label!=='WATCH');const summary={theme,marketCount:rows.length,activeSignalCount:active.length,surgeCount:rows.filter(r=>r.label==='SURGE').length,preSurgeCount:rows.filter(r=>r.label==='PRE-SURGE').length,riskCount:rows.filter(r=>r.label==='RISK').length,avgRadarScore:mean(rows.map(r=>num(r.radarScore))),avgChange1m:mean(rows.map(r=>num(r.change1m))),avgChange5m:mean(rows.map(r=>num(r.change5m))),volumeImpulse:mean(rows.map(r=>num(r.volumeImpulse1m??r.volumeRatio))),buyPressure:mean(rows.map(r=>{const x=num(r.buySellImbalance);return x==null?null:Math.max(0,x)})),liquidityUsd:rows.reduce((s,r)=>s+Math.max(0,Number(r.liquidityUsd||0)),0)};summary.signalDensity=summary.marketCount?summary.activeSignalCount/summary.marketCount:0;summary.priceImpulse=mean([summary.avgChange1m==null?null:Math.abs(summary.avgChange1m),summary.avgChange5m==null?null:Math.abs(summary.avgChange5m)])||0;summaries.push(summary)}
    const pop=populationStats(summaries);for(const s of summaries){s.themeHeat=themeHeat(s,pop);s.annotation=annotationFor(s)}summaries.sort((a,b)=>b.themeHeat-a.themeHeat||b.activeSignalCount-a.activeSignalCount||a.theme.localeCompare(b.theme));const total=summaries.reduce((x,s)=>x+Math.max(0,s.themeHeat),0),top=summaries[0]?.themeHeat||0;return {themes:summaries,dominantThemeShare:total?top/total:0,themeBreadth:summaries.filter(s=>s.activeSignalCount>0||s.themeHeat>=10).length}
  }
  const api={themes:THEME_ORDER,classifyMarket,aggregateThemes,themeHeat,registry:REGISTRY};if(typeof module!=='undefined'&&module.exports)module.exports=api;g.PulseRadarThemes=api;
})(typeof window!=='undefined'?window:globalThis);
