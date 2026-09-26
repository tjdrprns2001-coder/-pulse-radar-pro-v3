const fs=require('fs');
const path=require('path');
const {buildMasterSampleDatasetV2}=require('../lib/coin-scan/master-sample-dataset-v2.js');

const out=path.join(__dirname,'..','data','samples','MASTER_SAMPLE_DATASET_v2.json');
const ds=buildMasterSampleDatasetV2();
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify(ds,null,2)+'\n');
console.log('wrote',out);
console.log(JSON.stringify(ds.summary,null,2));
