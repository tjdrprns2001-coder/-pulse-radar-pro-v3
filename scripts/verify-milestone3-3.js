const {spawnSync}=require('node:child_process');
const files=[
  'tests/annotation-layout.test.js',
  'tests/annotation-regression-fixtures.test.js',
  'tests/structure-plugin-renderer-collision.test.js',
  'tests/session-profile.test.js',
  'tests/liquidity-engine.test.js',
  'tests/liquidity-plugin-contract.test.js',
  'tests/liquidity-lab-dom-contract.test.js',
  'tests/ict-context-engine.test.js',
  'tests/ict-presentation.test.js',
  'tests/multi-chart-mode-registry.test.js',
  'tests/multi-chart-card.test.js',
  'tests/multi-chart-ui-contract.test.js',
  'tests/tf-analysis-engine.test.js',
  'tests/snapshot-builder.test.js',
  'tests/narrative-renderer.test.js',
  'tests/flow-summary-engine.test.js',
  'tests/snapshot-analysis-ui-contract.test.js'
];
for(const file of files){
  const result=spawnSync(process.execPath,['--test',file],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
}
