const {spawnSync}=require('node:child_process');
const r=spawnSync(process.execPath,['--test','tests/collision-policy.test.js','tests/m3-2-contract.test.js'],{stdio:'inherit'});
process.exit(r.status??1);
