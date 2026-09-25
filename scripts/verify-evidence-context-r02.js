const assert=require('assert');
const E=require('../lib/coin-scan/evidence-context-engine.js');

const T=Date.parse('2026-09-25T02:00:00Z');

const news=[
 {id:'n1',title:'Protocol exploit confirmed',source:'Project Foundation',publishedAt:T-60000,retrievedAt:T-30000,verification_status:'OFFICIAL_CONFIRMED'},
 {id:'n2',title:'Protocol exploit confirmed',source:'Reuters',publishedAt:T-59000,retrievedAt:T-20000,verification_status:'SINGLE_SOURCE'},
 {id:'future',title:'Future delisting notice',source:'Binance',publishedAt:T+60000,retrievedAt:T+60000}
];
const normalized=E.normalizeNews(news,T);
assert.equal(normalized.length,2,'future news must not leak');
const clusters=E.clusterNews(normalized);
assert.equal(clusters.length,1,'duplicate headlines should cluster');
assert.equal(clusters[0].verification_status,'OFFICIAL_CONFIRMED');

const retracted=E.normalizeNews([{title:'Bad rumor',source:'unknown',publishedAt:T-1000,retrievedAt:T-500,verification_status:'RETRACTED'}],T);
assert.equal(retracted.length,0,'retracted news must be excluded');

const onchain=E.normalizeOnchain([
 {event_id:'a',block_timestamp:T-5000,observed_at:T-4000,finality_status:'FINAL'},
 {event_id:'b',block_timestamp:T-3000,observed_at:T-2000,finality_status:'PENDING'},
 {event_id:'future',block_timestamp:T+1000,observed_at:T+1000,finality_status:'FINAL'}
],T);
assert.equal(onchain.length,2);
const confirmedOnly=E.onchainContext({items:[{event_id:'c',finality_status:'CONFIRMED'}],unlockPct7d:0,walletLabelConfidence:1});
assert.equal(confirmedOnly.usable_event_ids.length,0,'CONFIRMED must be auxiliary only');
assert.equal(confirmedOnly.auxiliary_event_ids.length,1);
const oc=E.onchainContext({items:onchain,unlockPct7d:6,walletLabelConfidence:.3});
assert.equal(oc.finality_status,'UNFINALIZED');
assert(oc.risk_penalty>=25,'unlock + unfinalized penalties expected');

const cal=E.normalizeCalendar([
 {event_id:'cpi',event_type:'CPI',scheduled_at:T+30*60000,observed_at:T-86400000,importance:'high',actual_at:T+31*60000,actual:3.1,consensus:3.0},
 {event_id:'old',event_type:'PPI',scheduled_at:T-3600000,observed_at:T-86400000,importance:'high',actual_at:T-3500000,actual:2.1,consensus:2.0}
],T);
assert.equal(cal.length,2);
assert.equal(cal[0].actual,null,'future actual must be hidden before release');
assert.equal(cal[1].actual,2.1);

const cat=E.catalystContext({news,calendar:cal,decisionTime:T});
assert.equal(cat.hard_event_risk,true);
assert.equal(cat.high_impact_event,true);

const ctx=E.buildEvidenceContext({intelligence:{news:{items:news},macroCalendar:{provider:'official-fixture',items:cal}},decisionTime:T});
assert.equal(ctx.version,'EVIDENCE_CONTEXT_r0.3');
assert(ctx.source_event_ids.length>0);
console.log('evidence context r0.3 PASS');
