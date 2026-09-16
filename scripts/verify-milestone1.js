const { spawnSync } = require('node:child_process');

const result = spawnSync(process.execPath, [
  '--test',
  'tests/pulse-shell-contract.test.js',
  'tests/pulse-presets.test.js',
  'tests/pulse-data-state.test.js'
], { stdio: 'inherit' });

process.exit(result.status ?? 1);
