const assert=require('assert');
const handler=require('../api/coin-scan.js');

(async()=>{
  const service={
    async listSelectorHistory(){return[{snapshot_id:'S1',symbol:'BTCUSDT',classification:'CANDIDATE',scores:{final_score:80}}]},
    async listSelectorTransitions(){return[{transitionId:'T1',symbol:'BTCUSDT',toStatus:'CANDIDATE'}]},
    async replaySelectorSnapshot(id){return id==='S1'?{snapshotId:'S1',invariant:{pass:true}}:null},
    async getSelectorStats(){return{version:'SELECTOR_STATS_v1',overall:{sampleCount:1},lockedOos:{configured:false}}},
    async exportSelectorCsv(){return'snapshot_id,symbol\nS1,BTCUSDT'}
  };
  async function call(query){
    let code=0,body=null,raw=null,headers={};
    const res={setHeader(k,v){headers[k]=v},status(n){code=n;return this},json(v){body=v;return v},send(v){raw=v;return v}};
    await handler({method:'GET',query},res,{service});
    return{code,body,raw,headers};
  }
  let r=await call({mode:'selector-history',action:'list'});assert.equal(r.code,200);assert.equal(r.body.items[0].snapshot_id,'S1');assert(String(r.headers['Cache-Control']).includes('no-store'));
  r=await call({mode:'selector-history',action:'transitions'});assert.equal(r.body.items[0].transitionId,'T1');
  r=await call({mode:'selector-history',action:'replay',id:'S1'});assert.equal(r.body.replay.invariant.pass,true);
  r=await call({mode:'selector-history',action:'stats'});assert.equal(r.body.stats.overall.sampleCount,1);
  r=await call({mode:'selector-history',action:'export',format:'csv'});assert.equal(r.raw,'snapshot_id,symbol\nS1,BTCUSDT');assert(String(r.headers['Content-Type']).includes('text/csv'));
  r=await call({mode:'selector-history',action:'replay',id:'MISSING'});assert.equal(r.code,404);
  console.log('selector history api PASS');
})().catch(e=>{console.error(e);process.exit(1)});
