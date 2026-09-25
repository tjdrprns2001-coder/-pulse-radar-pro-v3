const assert=require('assert');
const {createAddressLabelRegistry}=require('../lib/coin-scan/address-label-registry.js');
const r=createAddressLabelRegistry();const T=1000;
r.add({chain_id:'1',address:'0xabc',label:'unknown',label_type:'unknown',confidence:0,valid_from:0,observed_at:100,source_ref:'x',version:1});
r.add({chain_id:'1',address:'0xabc',label:'exchange',label_type:'official',confidence:1,valid_from:900,observed_at:1200,source_ref:'official',version:2});
assert.equal(r.resolve('1','0xAbC',T).label,'unknown','future observed label must not leak backward');
assert.equal(r.resolve('1','0xabc',1300).label,'exchange');
console.log('address label PIT PASS');
