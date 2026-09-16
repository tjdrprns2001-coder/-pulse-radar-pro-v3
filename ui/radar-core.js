(function(g){
  const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:0));
  const abs=n=>Math.abs(Number(n)||0);
  function scoreMarket(r={},baseline={}){
    const change1m=Number(r.change1m??r.priceChange1m??0),change5m=Number(r.change5m??r.priceChange5m??0);
    const volume=Number(r.quoteVolumeUsd??r.volumeUsd??0),baseVol=Math.max(1,Number(baseline.quoteVolumeUsd??baseline.volumeUsd??volume/2||1));
    const liq=Number(r.liquidityUsd??0),liqPrev=Math.max(1,Number(baseline.liquidityUsd??liq||1));
    const tx=Number(r.txCount??r.trades??0),baseTx=Math.max(1,Number(baseline.txCount??baseline.trades??tx/2||1));
    const buys=Number(r.buys??0),sells=Number(r.sells??0),ageMin=r.pairCreatedAt?Math.max(0,(Date.now()-new Date(r.pairCreatedAt).getTime())/60000):1e9;
    const momentumScore=clamp(abs(change1m)*7+abs(change5m)*2.5);
    const volumeRatio=volume/baseVol,volumeScore=clamp((volumeRatio-1)*28);
    const liqDelta=(liq-liqPrev)/liqPrev,liquidityScore=clamp(Math.max(0,liqDelta)*180+(liq>25000?15:0));
    const participationScore=clamp((tx/baseTx-1)*28+(buys+sells>0?Math.min(35,(buys+sells)/10):0));
    const freshnessScore=clamp(ageMin<5?100:ageMin<30?75:ageMin<180?45:10);
    const fdv=Number(r.fdvUsd??0),thin=liq>0?fdv/liq:0;
    const riskScore=clamp((liq>0&&liq<15000?45:0)+(thin>100?35:thin>40?20:0)+(liqDelta<-.25?45:0));
    const imbalance=(buys+sells)>0?(buys-sells)/(buys+sells):0;
    const confidenceScore=clamp((r.sourceConfidence??70)+(liq>50000?10:0)+(volume>50000?10:0)-(riskScore*.35));
    const radarScore=clamp(momentumScore*.24+volumeScore*.24+liquidityScore*.14+participationScore*.14+freshnessScore*.08+confidenceScore*.16-riskScore*.2);
    let label='WATCH',signal='WATCH';
    if(riskScore>=65){label='RISK';signal='LIQUIDITY_RISK'}
    else if(radarScore>=72&&volumeScore>=55&&momentumScore>=45){label='SURGE';signal='SURGE'}
    else if(radarScore>=48&&volumeScore>=35&&participationScore>=25){label='PRE-SURGE';signal='PRE_SURGE'}
    else if(volumeScore>=55)signal='VOLUME_SPIKE';
    else if(change1m>=5||change5m>=10)signal='PRICE_SPIKE';
    else if(liqDelta>=.2)signal='LIQUIDITY_INFLOW';
    else if(liqDelta<=-.2)signal='LIQUIDITY_OUTFLOW';
    else if(imbalance>=.35)signal='BUY_PRESSURE';
    else if(imbalance<=-.35)signal='SELL_PRESSURE';
    else if(ageMin<30)signal='NEW_PAIR';
    return {...r,momentumScore,volumeScore,liquidityScore,participationScore,freshnessScore,riskScore,confidenceScore,radarScore,label,signal,volumeRatio,liquidityDelta:liqDelta,buySellImbalance:imbalance};
  }
  function rankMarkets(records=[],baselines={}){return records.map(r=>scoreMarket(r,baselines[r.id||r.symbol]||{})).filter(r=>!(r.marketType==='dex'&&r.liquidityUsd!=null&&r.liquidityUsd<3000&&r.signal!=='NEW_PAIR')).sort((a,b)=>b.radarScore-a.radarScore)}
  const api={scoreMarket,rankMarkets,labels:['WATCH','PRE_SURGE','SURGE','LIQUIDITY_RISK']};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;g.PulseRadarCore=api;
})(typeof window!=='undefined'?window:globalThis);
