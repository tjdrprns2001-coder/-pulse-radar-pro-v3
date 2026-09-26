const assert=require('assert');
const {createMemoryStore,createBlobStore}=require('../lib/signal-performance/store.js');

(async()=>{
  const s=createMemoryStore();
  const snap={id:'ONEUSDT:PRE-SURGE:0',symbol:'ONEUSDT',entryPrice:1};
  assert.equal(await s.putSnapshot(snap),true);
  assert.equal(await s.putSnapshot({...snap,entryPrice:99}),false);
  assert.equal((await s.getSnapshot(snap.id)).entryPrice,1,'snapshot must stay immutable');
  await s.putOutcome(snap.id,{id:snap.id,horizons:{m15:{status:'pending'}}});
  await s.putOutcome(snap.id,{id:snap.id,horizons:{m15:{status:'evaluated',returnPct:3}}});
  assert.equal((await s.getOutcome(snap.id)).horizons.m15.returnPct,3,'outcome may update');
  assert.equal((await s.listSnapshots()).length,1);
  assert.equal((await s.listOutcomes()).length,1);
  assert.equal(await s.putTransitionSnapshot('EV1',{eventId:'EV1',symbol:'BTCUSDT'}),true);
  assert.equal(await s.putTransitionSnapshot('EV1',{eventId:'EV1',symbol:'ETHUSDT'}),false,'transition snapshot must be immutable');
  assert.equal((await s.getTransitionSnapshot('EV1')).symbol,'BTCUSDT');
  assert.equal((await s.listTransitionSnapshots()).length,1);
  assert.equal(await s.putPreIgnitionSnapshot('PI1',{id:'PI1',symbol:'XLMUSDT',score:65}),true);
  assert.equal(await s.putPreIgnitionSnapshot('PI1',{id:'PI1',symbol:'BADUSDT',score:99}),false,'pre-ignition snapshot must be immutable');
  assert.equal((await s.getPreIgnitionSnapshot('PI1')).symbol,'XLMUSDT');
  await s.putPreIgnitionOutcome('PI1',{id:'PI1',horizons:{h6:{status:'evaluated',returnPct:8}}});
  assert.equal((await s.listPreIgnitionSnapshots()).length,1);
  assert.equal((await s.listPreIgnitionOutcomes())[0].horizons.h6.returnPct,8);
  assert.equal(await s.putSamplingV3Snapshot('SV1',{id:'SV1',symbol:'GALAUSDT',score:55}),true);
  assert.equal(await s.putSamplingV3Snapshot('SV1',{id:'SV1',symbol:'BADUSDT',score:99}),false,'sampling snapshot must be immutable');
  assert.equal((await s.getSamplingV3Snapshot('SV1')).symbol,'GALAUSDT');
  await s.putSamplingV3Outcome('SV1',{id:'SV1',horizons:{h24:{status:'evaluated',label:'SURGE'}}});
  assert.equal((await s.listSamplingV3Snapshots()).length,1);
  assert.equal((await s.listSamplingV3Outcomes())[0].horizons.h24.label,'SURGE');
  await s.putSamplingV3Stats('latest',{snapshotCount:1,promotionReady:false});
  assert.equal((await s.getSamplingV3Stats('latest')).snapshotCount,1);

  const map=new Map();
  const fakeStore={
    async get(k){return map.has(k)?map.get(k):null},
    async setJSON(k,v){map.set(k,JSON.parse(JSON.stringify(v)))},
    async list(){return{blobs:[...map.keys()].map(key=>({key}))}}
  };
  const b=createBlobStore({getStore:()=>fakeStore});
  assert.equal(await b.putSnapshot({id:'A',x:1}),true);
  assert.equal(await b.putSnapshot({id:'A',x:2}),false);
  assert.equal((await b.getSnapshot('A')).x,1);
  await b.putOutcome('A',{id:'A',ok:true});
  assert.equal((await b.getOutcome('A')).ok,true);
  assert.equal((await b.listSnapshots()).length,1);
  assert.equal(await b.putTransitionSnapshot('EV2',{eventId:'EV2',symbol:'ETHUSDT'}),true);
  assert.equal(await b.putTransitionSnapshot('EV2',{eventId:'EV2',symbol:'BTCUSDT'}),false);
  assert.equal((await b.getTransitionSnapshot('EV2')).symbol,'ETHUSDT');
  assert.equal((await b.listTransitionSnapshots()).length,1);
  assert.equal(await b.putPreIgnitionSnapshot('PI2',{id:'PI2',symbol:'ETHUSDT',score:75}),true);
  assert.equal(await b.putPreIgnitionSnapshot('PI2',{id:'PI2',symbol:'BADUSDT',score:90}),false);
  assert.equal((await b.getPreIgnitionSnapshot('PI2')).score,75);
  await b.putPreIgnitionOutcome('PI2',{id:'PI2',horizons:{h24:{status:'evaluated',returnPct:12}}});
  assert.equal((await b.listPreIgnitionSnapshots()).length,1);
  assert.equal((await b.listPreIgnitionOutcomes())[0].horizons.h24.returnPct,12);
  assert.equal(await b.putSamplingV3Snapshot('SV2',{id:'SV2',symbol:'WLDUSDT',score:61}),true);
  assert.equal(await b.putSamplingV3Snapshot('SV2',{id:'SV2',symbol:'BADUSDT',score:100}),false);
  assert.equal((await b.getSamplingV3Snapshot('SV2')).symbol,'WLDUSDT');
  await b.putSamplingV3Outcome('SV2',{id:'SV2',horizons:{h6:{status:'evaluated',label:'FAILED_BOS'}}});
  assert.equal((await b.listSamplingV3Snapshots()).length,1);
  assert.equal((await b.listSamplingV3Outcomes())[0].horizons.h6.label,'FAILED_BOS');
  await b.putSamplingV3Stats('latest',{snapshotCount:1});
  assert.equal((await b.getSamplingV3Stats('latest')).snapshotCount,1);
  console.log('signal performance store PASS');
})().catch(e=>{console.error(e);process.exit(1)});
