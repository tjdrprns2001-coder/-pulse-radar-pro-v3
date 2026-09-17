'use strict';
const Core=require('../coin-scan/scanner-core.js');
const Deep=require('../coin-scan/deep-scan.js');
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function close(row){return finite(Array.isArray(row)?row[4]:row?.close)}
function quoteVolume(row){return finite(Array.isArray(row)?row[7]:row?.quoteVolume)}
function historicalTicker(frames={}){
  const m15=Array.isArray(frames['15m'])?frames['15m']:[];const d1=Array.isArray(frames['1d'])?frames['1d']:[];
  const last=m15.length?close(m15[m15.length-1]):d1.length?close(d1[d1.length-1]):null;
  let change24=null;if(m15.length>=97){const prev=close(m15[m15.length-97]);if(prev&&last!=null)change24=((last/prev)-1)*100}else if(d1.length>=2){const prev=close(d1[d1.length-2]);if(prev&&last!=null)change24=((last/prev)-1)*100}
  const qv=m15.slice(-96).reduce((sum,row)=>sum+(quoteVolume(row)||0),0)||null;
  return{lastPrice:last,entryPrice:last,priceChange24h:change24,quoteVolume24h:qv};
}
async function classifyHistorical({symbol,frames,simulatedTs}){
  const ticker=historicalTicker(frames);if(ticker.lastPrice==null||ticker.lastPrice<=0)return{symbol,dataState:'failed',lastPrice:null,updatedAt:simulatedTs,scanClass:{key:'STALE',label:'⚪ 판단 보류'}};
  const deep=Deep.analyzeDeep({symbol,frames,dataState:'live'});const fast=Core.fastScore({...ticker,...deep});const merged={...ticker,...fast,...deep,dataState:'live',metaEvidence:null,reasons:deep?.reasons||fast.fastReasons||[]};
  const legacy=Core.classify(merged),scanClass=Core.classifyV2(merged);const tradeSignal=Core.buildTradeSignal({...merged,scanClass,category:legacy.category,dataState:'live'});
  return{symbol,dataState:'live',scanClass,scanClassKey:scanClass.key,scanClassLabel:scanClass.label,lastPrice:ticker.lastPrice,entryPrice:ticker.lastPrice,updatedAt:simulatedTs,capturedAt:simulatedTs,candidateScore:fast.candidateScore,tradeSignal,priceChange24h:ticker.priceChange24h,quoteVolume24h:ticker.quoteVolume24h,priceChange1h:deep?.priceChange1h??null,priceChange15m:deep?.priceChange15m??null,volumeAcceleration:deep?.volumeAcceleration??null,volumeAcceleration4h:deep?.volumeAcceleration4h??null,volumeAcceleration1h:deep?.volumeAcceleration1h??null,volumeAcceleration15m:deep?.volumeAcceleration15m??null,takerRatio:deep?.takerRatio??null,momentumSignals:deep?.momentumSignals||null,structure:deep?.structure||'neutral',breakout:Boolean(deep?.breakout),reasons:scanClass.reasons};
}
module.exports={historicalTicker,classifyHistorical};
