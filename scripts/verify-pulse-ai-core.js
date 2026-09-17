const assert=require('assert');
const {detectEvents}=require('../lib/pulse-ai/event-detector.js');
const {buildContext}=require('../lib/pulse-ai/context-builder.js');

const base={status:'ok',updatedAt:1000,scanCount:3,items:[
 {symbol:'AAAUSDT',category:'급등 전조 관찰',sector:'AI',candidateScore:55,dataState:'live',reasons:['r1'],tfState:{'1h':'up'}},
 {symbol:'BBBUSDT',category:'매수세 유입',sector:'AI',candidateScore:40,dataState:'live',reasons:['r2'],tfState:{}},
 {symbol:'CCCUSDT',category:'거래량 이상징후',sector:'DeFi',candidateScore:45,dataState:'live',reasons:['r3'],tfState:{}}
]};

let d=detectEvents(base,JSON.parse(JSON.stringify(base)));
assert.equal(d.material,false,'unchanged scans must be suppressed');
const prev=JSON.parse(JSON.stringify(base));prev.items[0].category='매수세 유입';prev.items[0].candidateScore=25;
d=detectEvents(base,prev);
assert.equal(d.material,true);assert(d.events.some(e=>e.symbol==='AAAUSDT'&&e.type==='presurge_transition'));
const clustered=JSON.parse(JSON.stringify(base));clustered.items[1].category='급등 전조 관찰';
d=detectEvents(clustered,prev);assert(d.sectorClusters.some(x=>x.sector==='AI'));
const bad=JSON.parse(JSON.stringify(base));bad.items[0].dataState='failed';
d=detectEvents(bad,base);assert(d.events.some(e=>e.type==='data_warning'));
const withMissing=JSON.parse(JSON.stringify(base));withMissing.items[0].fundingPct=null;
const ctx=buildContext(withMissing,detectEvents(withMissing,prev),{maxSymbols:2});
assert(ctx.symbols.length<=2,'context must be bounded');
const a=ctx.symbols.find(x=>x.symbol==='AAAUSDT');if(a)assert.equal(a.fundingPct,null,'missing values must remain null');
assert(!JSON.stringify(ctx).includes('OPENAI_API_KEY'));
console.log('pulse ai core PASS');
