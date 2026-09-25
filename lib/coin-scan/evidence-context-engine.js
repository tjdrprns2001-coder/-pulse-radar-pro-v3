'use strict';
const crypto=require('crypto');

const STATUS=Object.freeze({
  SUPPORTIVE:'SUPPORTIVE',NEUTRAL:'NEUTRAL',CONTRADICTORY:'CONTRADICTORY',
  RISK_INCREASING:'RISK_INCREASING',UNVERIFIED:'UNVERIFIED',STALE:'STALE',MISSING:'MISSING'
});
const NEWS_VERIFY=Object.freeze(['UNVERIFIED','SINGLE_SOURCE','CROSS_CONFIRMED','OFFICIAL_CONFIRMED','CORRECTED','RETRACTED','STALE']);
const FINALITY=Object.freeze(['MISSING','PENDING','CONFIRMED','FINAL','REORGED']);

function n(v){if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null}
function ts(v){const x=n(v);if(x!=null)return x;const d=new Date(v);return Number.isFinite(d.getTime())?d.getTime():null}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,Number(v)||0))}
function sha(value){return crypto.createHash('sha256').update(String(value??'')).digest('hex')}
function cleanText(v){return String(v||'').trim().replace(/\s+/g,' ')}
function normHeadline(v){return cleanText(v).toLowerCase().replace(/[^a-z0-9가-힣 ]/g,'')}
function uniq(a=[]){return [...new Set(a.filter(Boolean).map(String))]}
function sourceTier(source=''){
  const s=String(source).toLowerCase();
  if(/binance|coinbase|kraken|bybit|okx|project|foundation|governance|github/.test(s))return 2;
  if(/federal reserve|bls|bureau of labor statistics|ecb|boe|boj/.test(s))return 1;
  if(/coingecko|coinmarketcal|whale alert|whale-alert|defillama|cryptocompare/.test(s))return 4;
  if(/reuters|bloomberg|wsj|ft|coindesk|the block/.test(s))return 5;
  return 6;
}
function eventType(title=''){
  const t=String(title).toLowerCase();
  if(/hack|exploit|attack|vulnerab|breach/.test(t))return'SECURITY_INCIDENT';
  if(/deposit.*suspend|withdraw.*suspend|suspend.*deposit|suspend.*withdraw/.test(t))return'DEPOSIT_WITHDRAWAL_SUSPENSION';
  if(/delist/.test(t))return'EXCHANGE_DELISTING';
  if(/list(ing|ed)?/.test(t))return'EXCHANGE_LISTING';
  if(/unlock/.test(t))return'TOKEN_UNLOCK';
  if(/migration|merge/.test(t))return'TOKEN_MIGRATION';
  if(/upgrade|mainnet|testnet|fork/.test(t))return'PROTOCOL_UPGRADE';
  if(/governance|vote/.test(t))return'GOVERNANCE_VOTE';
  if(/partnership|product|launch|release/.test(t))return'PARTNERSHIP_OR_PRODUCT';
  if(/funding|treasury/.test(t))return'FUNDING_OR_TREASURY';
  if(/cpi|fomc|pce|nfp|payroll|gdp|ppi|jobless|ism|central bank|interest rate/.test(t))return'MACRO';
  return'RUMOR_OR_UNVERIFIED';
}
function impactClass(type){
  if(['SECURITY_INCIDENT','DEPOSIT_WITHDRAWAL_SUSPENSION','EXCHANGE_DELISTING'].includes(type))return'HIGH';
  if(['TOKEN_UNLOCK','TOKEN_MIGRATION','PROTOCOL_UPGRADE','GOVERNANCE_VOTE','MACRO'].includes(type))return'MEDIUM';
  return'LOW';
}
function pitAllowed({publishedAt=null,observedAt=null,blockTimestamp=null,featureAvailableAt=null},decisionTime){
  const t=ts(decisionTime);if(t==null)return false;
  for(const v of [publishedAt,observedAt,blockTimestamp,featureAvailableAt]){const x=ts(v);if(x!=null&&x>t)return false}
  return true;
}
function normalizeNews(items=[],decisionTime){
  const rows=[];
  for(const x of items||[]){
    const published=ts(x.published_at??x.publishedAt),observed=ts(x.retrieved_at??x.retrievedAt??x.observed_at??x.observedAt??published);
    if(!pitAllowed({publishedAt:published,observedAt:observed},decisionTime))continue;
    const title=cleanText(x.title??x.headline);if(!title)continue;
    const source=cleanText(x.source??x.publisher),tier=n(x.source_tier)??sourceTier(source),type=x.event_type||eventType(title);
    let verification=String(x.verification_status||'').toUpperCase();
    if(!NEWS_VERIFY.includes(verification))verification=tier<=2?'OFFICIAL_CONFIRMED':'SINGLE_SOURCE';
    if(verification==='RETRACTED')continue;
    const url=String(x.canonical_url??x.url??'');
    rows.push({
      event_id:String(x.event_id??x.id??sha([source,title,published].join('|')).slice(0,24)),
      source_name:source,source_tier:tier,publisher:source,canonical_url:url,headline:title,
      headline_hash:sha(normHeadline(title)),content_hash:String(x.content_hash??x.summary_hash??sha(title)),
      event_type:type,impact_class:x.impact_class||impactClass(type),
      published_at:published,retrieved_at:observed,verification_status:verification,
      asset_entities:Array.isArray(x.asset_entities)?x.asset_entities:[],source_ref:url||source
    });
  }
  return rows;
}
function clusterNews(rows=[]){
  const groups=new Map();
  for(const x of rows){
    const bucket=x.published_at==null?'na':Math.floor(x.published_at/(6*3600000));
    const key=[x.event_type,x.headline_hash.slice(0,16),bucket].join(':');
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(x);
  }
  return [...groups.entries()].map(([key,items])=>{
    const sorted=items.slice().sort((a,b)=>a.source_tier-b.source_tier||a.published_at-b.published_at);
    const primary=sorted[0],official=sorted.some(x=>x.source_tier<=2),sources=uniq(sorted.map(x=>x.source_name));
    const verification=official?'OFFICIAL_CONFIRMED':sources.length>=2?'CROSS_CONFIRMED':primary.verification_status;
    return{event_cluster_id:'news:'+sha(key).slice(0,24),primary_source:primary,supporting_sources:sorted.slice(1),source_count:sources.length,first_published_at:Math.min(...sorted.map(x=>x.published_at||Infinity)),last_retrieved_at:Math.max(...sorted.map(x=>x.retrieved_at||0)),verification_status:verification};
  });
}
function normalizeCalendar(items=[],decisionTime){
  const t=ts(decisionTime),out=[];
  for(const x of items||[]){
    const scheduled=ts(x.scheduled_at??x.scheduledAt??x.date),observed=ts(x.observed_at??x.observedAt??x.retrieved_at??x.retrievedAt??t);
    if(scheduled==null||observed==null||observed>t)continue;
    const actualAt=ts(x.actual_at??x.actualAt);
    const actual=actualAt!=null&&actualAt<=t?n(x.actual):null;
    out.push({
      event_id:String(x.event_id??x.id??sha([x.event_type??x.title,scheduled].join('|')).slice(0,24)),
      event_type:String(x.event_type??eventType(x.title??'')),jurisdiction:String(x.jurisdiction||'US'),
      source_name:String(x.source_name??x.source??'unknown'),source_tier:n(x.source_tier)??sourceTier(x.source_name??x.source),
      scheduled_at:scheduled,actual_at:actualAt!=null&&actualAt<=t?actualAt:null,release_status:String(x.release_status||'scheduled'),
      importance:String(x.importance||'high').toLowerCase(),consensus:n(x.consensus),prior:n(x.prior),actual,unit:x.unit??null,
      revision:actualAt!=null&&actualAt<=t?n(x.revision):null,observed_at:observed,original_timezone:x.original_timezone??null,source_ref:String(x.source_ref??x.url??'')
    });
  }
  return out;
}
function normalizeOnchain(items=[],decisionTime){
  const out=[];
  for(const x of items||[]){
    const blockTime=ts(x.block_timestamp??x.timestamp),observed=ts(x.observed_at??x.observedAt??blockTime);
    if(!pitAllowed({blockTimestamp:blockTime,observedAt:observed},decisionTime))continue;
    const finality=String(x.finality_status||'MISSING').toUpperCase();
    out.push({...x,block_timestamp:blockTime,observed_at:observed,finality_status:FINALITY.includes(finality)?finality:'MISSING'});
  }
  return out;
}
function onchainContext({items=[],unlockPct7d=null,walletLabelConfidence=0,flow={}}={}){
  const final=items.filter(x=>x.finality_status==='FINAL');
  const confirmed=items.filter(x=>x.finality_status==='CONFIRMED');
  const pending=items.filter(x=>!['FINAL'].includes(x.finality_status));
  let score=60,evidence=[],contradictions=[],penalty=0;
  const inflow=n(flow.exchange_inflow_zscore),stable=n(flow.stablecoin_netflow_zscore),unlock=n(unlockPct7d);
  if(inflow!=null&&inflow>=2){score-=15;penalty+=8;contradictions.push('exchange inflow elevated')}
  if(stable!=null&&stable>=1.5){score+=8;evidence.push('stablecoin netflow supportive')}
  if(unlock!=null&&unlock>=5){score-=20;penalty+=15;contradictions.push('large unlock within 7d')}
  if(pending.length){penalty+=10;contradictions.push('on-chain event not final')}
  if(confirmed.length)evidence.push(confirmed.length+' confirmed on-chain events (auxiliary only)');
  if(Number(walletLabelConfidence)<.5&&items.length){contradictions.push('wallet label confidence low')}
  if(final.length)evidence.push(final.length+' finalized on-chain events');
  return{score:clamp(score),flow_state:items.length?'AVAILABLE':'MISSING',exchange_inflow_zscore:inflow,stablecoin_netflow_zscore:stable,unlock_pct_circulating_7d:unlock,finality_status:pending.length?'UNFINALIZED':final.length?'FINAL':'MISSING',wallet_label_confidence:Number(walletLabelConfidence)||0,evidence,contradictions,risk_penalty:penalty,usable_event_ids:final.map(x=>x.event_id).filter(Boolean),auxiliary_event_ids:confirmed.map(x=>x.event_id).filter(Boolean)};
}
function catalystContext({news=[],calendar=[],decisionTime}={}){
  const t=ts(decisionTime),clusters=clusterNews(normalizeNews(news,t)),cal=normalizeCalendar(calendar,t);
  let newsRisk=60,calendarRisk=60,penalty=0,highImpact=false,evidence=[],contradictions=[],eventTypes=[],hardEventRisk=false;
  for(const c of clusters){
    const x=c.primary_source,type=x.event_type;eventTypes.push(type);
    const verified=['OFFICIAL_CONFIRMED','CROSS_CONFIRMED'].includes(c.verification_status);
    if(!verified){contradictions.push('unverified news excluded: '+x.headline);continue}
    if(['SECURITY_INCIDENT','DEPOSIT_WITHDRAWAL_SUSPENSION','EXCHANGE_DELISTING'].includes(type)){hardEventRisk=true;newsRisk=100;contradictions.push(type+': '+x.headline)}
    else if(type==='TOKEN_UNLOCK'){penalty+=10;contradictions.push('verified token unlock context')}
    else evidence.push('verified news: '+type);
  }
  for(const e of cal){
    const distance=e.scheduled_at-t;
    if(e.importance==='high'&&distance>=0&&distance<=3600000){highImpact=true;calendarRisk=90;penalty+=10;contradictions.push('high-impact macro event within 1h: '+e.event_type)}
    else if(e.importance==='high'&&distance>3600000&&distance<=24*3600000){calendarRisk=Math.max(calendarRisk,75);contradictions.push('high-impact macro event within 24h: '+e.event_type)}
    if(e.actual!=null&&e.consensus!=null)evidence.push('actual-confirmed macro release: '+e.event_type);
  }
  return{news_risk_score:newsRisk,calendar_risk_score:calendarRisk,high_impact_event:highImpact,event_types:uniq(eventTypes.concat(cal.map(x=>x.event_type))),verification_status:hardEventRisk?'OFFICIAL_CONFIRMED':clusters.some(x=>x.verification_status==='OFFICIAL_CONFIRMED')?'OFFICIAL_CONFIRMED':clusters.some(x=>x.verification_status==='CROSS_CONFIRMED')?'CROSS_CONFIRMED':clusters.length?'SINGLE_SOURCE':'MISSING',evidence,contradictions,risk_penalty:penalty,hard_event_risk:hardEventRisk,news_clusters:clusters,calendar_events:cal};
}
function buildEvidenceContext({intelligence={},decisionTime=Date.now(),onchainEvents=[],calendarEvents=[]}={}){
  const news=[...(intelligence?.news?.items||[]),...(intelligence?.events?.newsDerived||[])];
  const schedule=[...(calendarEvents||[]),...(intelligence?.macroCalendar?.items||[]),...(intelligence?.events?.items||[])];
  const wallets=(intelligence?.wallets?.items||intelligence?.walletMovements?.items||[]).map((x,i)=>({
    event_id:x.event_id||x.hash||('wallet:'+i),block_timestamp:x.timestamp,observed_at:x.observed_at??x.timestamp,
    finality_status:x.finality_status||'MISSING',event_type:'TOKEN_TRANSFER',amount_usd_at_event:x.amountUsd??null
  }));
  const chain=normalizeOnchain([...(onchainEvents||[]),...wallets],decisionTime);
  const walletConfidence=intelligence?.walletVerification?.verifiedAttributions>0?.7:0;
  const onchain=onchainContext({items:chain,unlockPct7d:n(intelligence?.unlockPctCirculating7d),walletLabelConfidence:walletConfidence,flow:intelligence?.onchainFlow||{}});
  const catalysts=catalystContext({news,calendar:schedule,decisionTime});
  const sourceEventIds=uniq([...onchain.usable_event_ids,...catalysts.news_clusters.map(x=>x.event_cluster_id),...catalysts.calendar_events.map(x=>x.event_id)]);
  const sourceVersions=uniq([
    intelligence?.news?.provider&&('news:'+intelligence.news.provider),
    intelligence?.macroCalendar?.provider&&('calendar:'+intelligence.macroCalendar.provider),
    intelligence?.wallets?.provider&&('onchain:'+intelligence.wallets.provider)
  ]);
  return{
    version:'EVIDENCE_CONTEXT_r0.3',decision_time:new Date(ts(decisionTime)||Date.now()).toISOString(),
    onchain,catalysts,source_event_ids:sourceEventIds,source_versions:sourceVersions,
    evidence_status:catalysts.hard_event_risk?'RISK_INCREASING':(sourceEventIds.length?'NEUTRAL':'MISSING')
  };
}
module.exports={STATUS,NEWS_VERIFY,FINALITY,sourceTier,eventType,impactClass,pitAllowed,normalizeNews,clusterNews,normalizeCalendar,normalizeOnchain,onchainContext,catalystContext,buildEvidenceContext};
