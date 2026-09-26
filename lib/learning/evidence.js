'use strict';

const Book=require('../coin-scan/book-strategy-registry.js');
const Similarity=require('./similarity.js');

const VERSION='RESEARCH_EVIDENCE_v2';
const FEATURE_NAMES=Object.freeze([
  'scannerScore','change24h','liquidityLog','oi4h','taker','funding',
  'setupValid','setupType','trend1d','trend4h','rsi1h','rvol1h',
  'compression1h','obv1h','rsi15m','rvol15m','regime','netRR'
]);

function n(v,d=null){const x=Number(v);return Number.isFinite(x)?x:d}
function clamp(v,a=-1,b=1){const x=n(v);return x==null?null:Math.max(a,Math.min(b,x))}
function typeCode(v){return({SWEEP_RECLAIM:1,BREAKOUT_RETEST:.8,TREND_PULLBACK:.65,COMPRESSION:.35,NONE:0})[String(v||'').toUpperCase()]??null}
function scannerScore(item={}){return n(item.score,n(item.preIgnitionScore,n(item.candidateScore,n(item.tradeSignal?.confidence,null))))}
function direction(v){
  const raw=v&&typeof v==='object'?(v.trend??v.direction??v.bias):v,s=String(raw??'').toUpperCase();
  if(['UP','BULL','BULLISH','상승'].includes(s))return 1;
  if(['DOWN','BEAR','BEARISH','하락'].includes(s))return -1;
  return raw==null?null:0;
}
function regimeCode(v){
  if(v==null)return null;
  const s=String(v).toUpperCase();
  return s==='SUPPORTIVE'?1:s==='RISK_OFF'?-1:0;
}
function normalizeItem(item={}){
  const s1=item.stats?.['1h']||{},s15=item.stats?.['15m']||{};
  const qv=n(item.quoteVolume24h,n(item.futuresQuoteVolume24h,n(item.spotQuoteVolume24h,null)));
  const logVol=qv>0?Math.log10(Math.max(1,qv/1e6))/4:null;
  const oi=n(item.flow?.oi4hPct,n(item.oi4hChangePct,null));
  const taker=n(item.flow?.takerRatio,n(item.trueTakerRatio,n(item.takerRatio,null)));
  const funding=n(item.flow?.funding8hPct,n(item.fundingRate,null));
  const regularSetup=Boolean(item.bottomReady||item.pullback||item.breakout||item.samplePattern);
  const setupType=item.setup?.type||(item.breakout?'BREAKOUT_RETEST':item.pullback?'TREND_PULLBACK':item.bottomReady?'SWEEP_RECLAIM':null);
  const rvol1=n(s1.rvol,n(item.v3Rvol?.main1h?.value,n(item.volumeAcceleration1h,n(item.volumeAcceleration,null))));
  const rvol15=n(s15.rvol,n(item.v3Rvol?.ignition15m?.value,n(item.volumeAcceleration15m,null)));
  const structDir=direction(item.structure);
  const dTrend=item.stats?.['1d']?.trend??item.tfState?.['1d']??(structDir===1?'UP':structDir===-1?'DOWN':null);
  const h4Trend=item.stats?.['4h']?.trend??item.tfState?.['4h']??(structDir===1?'UP':structDir===-1?'DOWN':null);
  const obv=s1.obvUp===true?1:s1.obvUp===false?-1:null;
  return[
    clamp(scannerScore(item)/100,0,1),
    clamp(n(item.change24h,n(item.priceChange24h,null))/8),
    clamp(logVol,0,1),
    clamp(oi==null?null:oi/10),
    clamp(taker==null?null:(taker-1)/.8),
    clamp(funding==null?null:funding/.05),
    item.setup?.valid===true||regularSetup?1:item.setup?.valid===false?0:null,
    typeCode(setupType),
    direction(dTrend),direction(h4Trend),
    n(s1.rsi)==null?null:clamp((n(s1.rsi)-50)/30),
    rvol1==null?null:clamp(Math.log2(Math.max(.25,rvol1))/4),
    n(s1.compression)==null?null:clamp(1-n(s1.compression)/8,-1,1),
    obv,
    n(s15.rsi)==null?null:clamp((n(s15.rsi)-50)/30),
    rvol15==null?null:clamp(Math.log2(Math.max(.25,rvol15))/4),
    regimeCode(item.regime),
    n(item.plan?.netRR)==null?null:clamp(n(item.plan.netRR)/3,0,1)
  ];
}
function modelVector(features=[]){return features.map(x=>n(x,0))}
function seedFeature(sample={}){
  const t4=sample.tf4h||{},t1=sample.tf1h||{},t15=sample.tf15m||{};
  const out=new Array(FEATURE_NAMES.length).fill(null);
  out[1]=n(sample.pre6h_change_pct)==null?null:clamp(n(sample.pre6h_change_pct)/8);
  out[3]=n(sample.oi_pre_4h_pct)==null?null:clamp(n(sample.oi_pre_4h_pct)/10);
  out[4]=n(sample.taker_pre_1h)==null?null:clamp((n(sample.taker_pre_1h)-1)/.8);
  out[6]=/up/i.test(String(t1.bos||''))?1:null;
  out[7]=/up/i.test(String(t1.bos||''))?.8:null;
  out[9]=String(t4.ma_align||'')==='bull'?1:String(t4.ma_align||'')==='bear'?-1:null;
  out[10]=n(t1.rsi)==null?null:clamp((n(t1.rsi)-50)/30);
  out[11]=n(t1.rvol)==null?null:clamp(Math.log2(Math.max(.25,n(t1.rvol)))/4);
  out[14]=n(t15.rsi)==null?null:clamp((n(t15.rsi)-50)/30);
  out[15]=n(t15.rvol)==null?null:clamp(Math.log2(Math.max(.25,n(t15.rvol)))/4);
  return out;
}
function loadSeedSamples(){
  try{return require('../../PRE_SURGE_V3_REVERSE_TRACE_2026-09-26.json').samples||[]}catch{return[]}
}
function bookEvidence(item={}){
  if(n(item.bookScore)!=null){
    const raw=item.bookEvidence||{},reasons=[...(raw.book?.reasons||[]),...(raw.smartMoney?.reasons||[])].slice(0,8);
    return{score:Math.round(Math.max(0,Math.min(100,n(item.bookScore,0)))),matched:reasons.map((why,i)=>({id:'SCANNER_BOOK_'+(i+1),label:'기존 책 합성 엔진',why})),registryVersion:Book.VERSION,source:'scanner-book-evidence'};
  }
  const matched=[],add=(id,why)=>{const row=Book.get(id);if(row)matched.push({id,label:row.label,why})};
  const d=item.stats?.['1d']||{},h4=item.stats?.['4h']||{},h1=item.stats?.['1h']||{},m15=item.stats?.['15m']||{};
  if(d.trend==='UP'&&h4.trend==='UP')add('MARKET_STRUCTURE','1D·4H 상승 구조');
  if(n(h1.rvol)>=1.5||n(m15.rvol)>=1.5)add('VOLUME_PRICE','하위봉 RVOL 증가');
  if(item.setup?.type==='SWEEP_RECLAIM')add('LIQUIDITY_SWEEP','저점 스윕 후 회복');
  if(item.setup?.type==='BREAKOUT_RETEST')add('TRENDLINE_RETEST','돌파 후 리테스트');
  if(item.setup?.type==='TREND_PULLBACK')add('TREND_FOLLOWING','추세 눌림·회복');
  if(h1.obvUp)add('OBV','1H OBV 우위');
  if(n(h1.rsi)!=null)add('RSI','1H RSI 확인');
  if(n(h1.macd)!=null)add('MACD','1H MACD 확인');
  const rankIds=new Set(Book.activeForRanking().map(x=>x.id)),rankHits=matched.filter(x=>rankIds.has(x.id)).length;
  return{score:Math.min(100,Math.round(rankHits/Math.max(1,Math.min(5,Book.activeForRanking().length))*100)),matched:matched.slice(0,8),registryVersion:Book.VERSION,source:'rule-fallback'};
}
function sampleSimilarity(item={}){
  if(n(item.sampleScore)!=null)return{score:Math.round(Math.max(0,Math.min(100,n(item.sampleScore)))),top:item.samplePattern?[{symbol:String(item.sampleArchetype||item.samplePattern?.archetype||'LIVE_PATTERN'),similarity:Math.max(0,Math.min(1,n(item.sampleScore)/100))}]:[],source:'scanner-sample-engine'};
  const x=normalizeItem(item),rows=[];
  for(const sample of loadSeedSamples()){
    const cmp=Similarity.compareVectors(x,seedFeature(sample),{minOverlap:3});
    if(cmp.similarity!=null)rows.push({symbol:sample.symbol,similarity:cmp.similarity,overlap:cmp.overlap});
  }
  rows.sort((a,b)=>b.similarity-a.similarity);
  const top=rows.slice(0,5),score=top.length?Math.round(top.reduce((sum,r)=>sum+r.similarity,0)/top.length*100):null;
  return{score,top,source:'reverse-trace-seeds'};
}

module.exports={VERSION,FEATURE_NAMES,n,clamp,scannerScore,direction,normalizeItem,modelVector,seedFeature,loadSeedSamples,bookEvidence,sampleSimilarity};
