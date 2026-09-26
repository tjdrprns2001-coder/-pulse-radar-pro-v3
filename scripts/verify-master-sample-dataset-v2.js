const assert=require('assert');
const Master=require('../lib/coin-scan/master-samples.js');
const Dataset=require('../lib/coin-scan/master-sample-dataset-v2.js');

const ds=Dataset.buildMasterSampleDatasetV2();
assert.equal(ds.version,'MASTER_SAMPLE_DATASET_v2');
assert(ds.summary.events>=100,'dataset should include historical runtime and raw archive events');
assert(ds.summary.symbols>=50,'dataset should span a broad symbol set');
assert(ds.summary.sourceFiles>=5,'dataset should preserve multiple source files');
assert(ds.summary.labels.SURGE>0,'success/surge cohort required');
assert(ds.summary.labels.CONTROL>0,'control cohort required');
assert(ds.summary.labels.PRE_OUTCOME>=8,'pre-outcome survivorship-control cohort required');

const gala=ds.events.find(x=>x.symbol==='GALAUSDT'&&x.label==='PRE_OUTCOME');
assert(gala,'GALA pre-outcome event must be normalized');
assert(gala.features.oi.h4Pct>=3.7);
assert(gala.features.volume.probeRvol>=4.8);

const rare=ds.events.filter(x=>x.symbol==='RAREUSDT');
assert(rare.length>=1,'RARE reverse-trace evidence required');
assert(rare.some(x=>x.sources.some(s=>s.includes('SURGE-REVERSE-TRACE-2026-09-26.json')||s.includes('SURGE-REVERSE-TRACE-2026-09-27.json'))),'deep reverse-trace provenance required');

const controls=ds.events.filter(x=>x.label==='CONTROL');
assert(controls.some(x=>x.symbol==='QNTUSDT'||x.symbol==='ACEUSDT'||x.symbol==='ZAMAUSDT'||x.symbol==='BCHUSDT'),'known control sample must survive normalization');

const ids=ds.events.map(x=>x.id);
assert.equal(ids.length,new Set(ids).size,'event ids must be deduplicated');
assert(ds.stats.byLabel.SURGE&&Number.isFinite(ds.stats.byLabel.SURGE.n));
assert(Object.prototype.hasOwnProperty.call(ds.stats.byLabel.SURGE.medians,'oi4hPct'));

console.log('MASTER_SAMPLE_DATASET_v2 PASS',JSON.stringify(ds.summary));
