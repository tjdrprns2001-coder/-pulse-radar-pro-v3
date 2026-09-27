'use strict';
const VERSION='REGIME_DETECTOR_v1';
const CONFIG=Object.freeze({
  riskOnBtc24h:0.5,riskOffBtc24h:-0.5,
  breadthRiskOn:0.55,breadthRiskOff:0.45,
  btcStrong24h:1.0,dominanceStrong:0.30,
  altRotationSpread:2.0,shockBtc24h:5.0,
  shockVolZ:2.0,compressionVolZ:-0.8,
  minCoreFeatures:2
});
function n(v){if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null}
function pick(obj,paths=[]){for(const p of paths){let x=obj;for(const k of p.split('.'))x=x?.[k];const v=n(x);if(v!=null)return v}return null}
function features(item={}){
  const up=pick(item,['marketBreadth.up','breadth.up']),down=pick(item,['marketBreadth.down','breadth.down']);
  const breadth=pick(item,['marketContext.altBreadthUpRatio','altBreadthUpRatio'])??(up!=null&&down!=null&&up+down>0?up/(up+down):null);
  return{
    btc24h:pick(item,['marketContext.btc.change24hPct','marketContext.btc.priceChange24h','btcChange24hPct']),
    btc72h:pick(item,['marketContext.btc.change72hPct','btcChange72hPct']),
    altMedian24h:pick(item,['marketContext.alts.median24hPct','marketBreadth.median','altMedian24hPct']),
    breadthUpRatio:breadth,
    btcDominance24h:pick(item,['marketContext.btcDominance.change24hPct','btcDominanceChange24hPct']),
    volatilityZ:pick(item,['marketContext.volatility.zscore','volatilityZ'])
  };
}
function detect(item={},config=CONFIG){
  const f=features(item),avail=Object.values(f).filter(v=>v!=null).length,core=[f.btc24h,f.breadthUpRatio,f.altMedian24h].filter(v=>v!=null).length;
  if(core<config.minCoreFeatures)return{version:VERSION,regime:'UNKNOWN',confidence:0,features:f,status:'INSUFFICIENT_DATA'};
  let regime='MIXED',evidence=[];
  if((f.btc24h!=null&&Math.abs(f.btc24h)>=config.shockBtc24h)||(f.volatilityZ!=null&&f.volatilityZ>=config.shockVolZ)){regime='SHOCK';evidence.push('충격 변동성')}
  else if(f.volatilityZ!=null&&f.volatilityZ<=config.compressionVolZ){regime='COMPRESSION';evidence.push('저변동 압축')}
  else if(f.btc24h!=null&&f.altMedian24h!=null&&f.breadthUpRatio!=null&&f.altMedian24h-f.btc24h>=config.altRotationSpread&&f.breadthUpRatio>=config.breadthRiskOn&&(f.btcDominance24h==null||f.btcDominance24h<0)){regime='ALT_ROTATION';evidence.push('알트 상대강도','상승 breadth')}
  else if(f.btc24h!=null&&f.btcDominance24h!=null&&f.altMedian24h!=null&&f.btc24h>=config.btcStrong24h&&f.btcDominance24h>=config.dominanceStrong&&f.btc24h>f.altMedian24h){regime='BTC_STRONG';evidence.push('BTC 상대강도','도미넌스 상승')}
  else if(f.btc24h!=null&&f.breadthUpRatio!=null&&f.btc24h>=config.riskOnBtc24h&&f.breadthUpRatio>=config.breadthRiskOn){regime='RISK_ON';evidence.push('BTC 상승','시장 breadth 양호')}
  else if(f.btc24h!=null&&f.breadthUpRatio!=null&&f.btc24h<=config.riskOffBtc24h&&f.breadthUpRatio<=config.breadthRiskOff){regime='RISK_OFF';evidence.push('BTC 하락','시장 breadth 약세')}
  const confidence=Math.max(0,Math.min(1,(avail/6)*.6+(evidence.length?Math.min(.4,evidence.length*.2):.1)));
  return{version:VERSION,regime,confidence:Number(confidence.toFixed(3)),features:f,evidence,status:'OK',configVersion:VERSION};
}
module.exports={VERSION,CONFIG,features,detect};
