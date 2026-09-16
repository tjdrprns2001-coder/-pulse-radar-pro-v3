(function(g){
  const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:0));
  const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const abs=n=>Math.abs(num(n));
  function scoreMarket(r={},baseline={}){
    const change1m=num(r.change1m??r.priceChange1m),change5m=num(r.change5m??r.priceChange5m),change1h=num(r.priceChange1h);
    const volume=num(r.quoteVolumeUsd??r.volumeUsd),baseVol=Math.max(1,num(baseline.quoteVolumeUsd??baseline.volumeUsd,Math.max(volume/2,1)));
    const liq=num(r.liquidityUsd),liqPrev=Math.max(1,num(baseline.liquidityUsd,Math.max(liq,1)));
    const tx=num(r.txCount??r.trades),baseTx=Math.max(1,num(baseline.txCount??baseline.trades,Math.max(tx/2,1)));
    const buys=num(r.buys),sells=num(r.sells),totalSide=buys+sells;
    const ageMin=r.pairCreatedAt?Math.max(0,(Date.now()-new Date(r.pairCreatedAt).getTime())/60000):1e9;
    const fdv=num(r.fdvUsd),thin=liq>0?fdv/liq:0;
    const volumeRatio=volume/baseVol,txRatio=tx/baseTx,liqDelta=(liq-liqPrev)/liqPrev;
    const imbalance=totalSide>0?(buys-sells)/totalSide:0;
    const priceAcceleration=Math.max(0,abs(change1m)-abs(num(baseline.change1m))*1.15)+Math.max(0,abs(change5m)-abs(num(baseline.change5m))*1.05);

    const activityFloor=r.marketType==='dex'?(liq>=12000&&volume>=4000&&tx>=18):volume>=25000;
    const strongActivity=r.marketType==='dex'?(liq>=50000&&volume>=20000&&tx>=45):volume>=100000;
    const momentumScore=clamp(abs(change1m)*6.5+abs(change5m)*2.2+Math.min(22,priceAcceleration*2));
    const volumeScore=clamp((volumeRatio-1)*24+Math.log10(Math.max(10,volume))*5-12);
    const liquidityScore=clamp(Math.max(0,liqDelta)*160+(liq>25000?12:0)+(liq>100000?12:0));
    const participationScore=clamp((txRatio-1)*24+(totalSide>0?Math.min(32,totalSide/9):0)+(Math.abs(imbalance)>.3?8:0));
    const freshnessScore=clamp(ageMin<5?100:ageMin<30?78:ageMin<180?48:ageMin<1440?24:8);
    const thinPenalty=(liq>0&&liq<5000?60:liq>0&&liq<12000?35:0)+(thin>250?45:thin>100?32:thin>40?18:0);
    const outflowPenalty=liqDelta<-.4?60:liqDelta<-.25?42:liqDelta<-.12?20:0;
    const flashPumpPenalty=r.marketType==='dex'&&abs(change5m)>40&&!strongActivity?38:0;
    const riskScore=clamp(thinPenalty+outflowPenalty+flashPumpPenalty);
    const confidenceScore=clamp(num(r.sourceConfidence,70)+(liq>50000?8:0)+(volume>50000?8:0)+(tx>100?6:0)-(riskScore*.42));
    const radarScore=clamp(momentumScore*.23+volumeScore*.24+liquidityScore*.11+participationScore*.17+freshnessScore*.07+confidenceScore*.18-riskScore*.24);

    const reasons=[];
    if(volumeRatio>=2)reasons.push(`거래량 ${volumeRatio.toFixed(1)}x`);
    if(txRatio>=1.8)reasons.push(`거래활동 ${txRatio.toFixed(1)}x`);
    if(change1m>=3||change5m>=7)reasons.push(`가격가속 ${change1m.toFixed(1)}%/1m ${change5m.toFixed(1)}%/5m`);
    if(imbalance>=.3)reasons.push(`매수우위 ${Math.round(imbalance*100)}%`);
    if(imbalance<=-.3)reasons.push(`매도우위 ${Math.round(Math.abs(imbalance)*100)}%`);
    if(liqDelta>=.12)reasons.push(`유동성 +${Math.round(liqDelta*100)}%`);
    if(liqDelta<=-.12)reasons.push(`유동성 ${Math.round(liqDelta*100)}%`);
    if(ageMin<180)reasons.push(`신규풀 ${Math.round(ageMin)}분`);
    if(riskScore>=45)reasons.push(`리스크 ${Math.round(riskScore)}`);

    let label='WATCH',signal='WATCH';
    const surgeReady=activityFloor&&riskScore<60&&radarScore>=68&&volumeScore>=48&&momentumScore>=38&&participationScore>=28;
    const preReady=activityFloor&&riskScore<55&&radarScore>=44&&volumeScore>=30&&participationScore>=22&&abs(change5m)<35;
    if(riskScore>=62){label='RISK';signal='LIQUIDITY_RISK'}
    else if(surgeReady){label='SURGE';signal='SURGE'}
    else if(preReady){label='PRE-SURGE';signal='PRE_SURGE'}
    else if(volumeScore>=55&&activityFloor)signal='VOLUME_SPIKE';
    else if((change1m>=5||change5m>=10)&&activityFloor)signal='PRICE_SPIKE';
    else if(liqDelta>=.2)signal='LIQUIDITY_INFLOW';
    else if(liqDelta<=-.2)signal='LIQUIDITY_OUTFLOW';
    else if(imbalance>=.35&&activityFloor)signal='BUY_PRESSURE';
    else if(imbalance<=-.35&&activityFloor)signal='SELL_PRESSURE';
    else if(ageMin<30)signal='NEW_PAIR';
    return {...r,momentumScore,volumeScore,liquidityScore,participationScore,freshnessScore,riskScore,confidenceScore,radarScore,label,signal,volumeRatio,txRatio,liquidityDelta:liqDelta,buySellImbalance:imbalance,activityFloor,reasons};
  }
  function rankMarkets(records=[],baselines={}){
    return records.map(r=>scoreMarket(r,baselines[r.id||r.symbol]||{}))
      .filter(r=>!(r.marketType==='dex'&&r.liquidityUsd!=null&&r.liquidityUsd<3000&&r.signal!=='NEW_PAIR'&&r.label!=='RISK'))
      .sort((a,b)=>b.radarScore-a.radarScore);
  }
  const api={scoreMarket,rankMarkets,labels:['WATCH','PRE_SURGE','SURGE','LIQUIDITY_RISK']};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;g.PulseRadarCore=api;
})(typeof window!=='undefined'?window:globalThis);
