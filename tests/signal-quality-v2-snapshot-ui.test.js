const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../ui/snapshot/snapshot-quality-v2.js'),'utf8');
const shell=fs.readFileSync(path.join(__dirname,'../ui/pulse-shell-snapshot-restore.js'),'utf8');

test('snapshot v2 renders both 30 and 90 day drift windows',()=>{
  assert.match(src,/compareWindows\(/);
  assert.match(src,/windows:\[30,90\]/);
  assert.match(src,/fmtWindow\('30d'/);
  assert.match(src,/fmtWindow\('90d'/);
});

test('snapshot v2 uses hierarchical live calibration and labels backoff',()=>{
  assert.match(src,/resolveHierarchical/);
  assert.match(src,/LIVE_VALIDATED/);
  assert.match(src,/broader bucket 사용 중/);
  assert.match(src,/BACKTESTED는 별도 참고/);
});

test('snapshot shell injects policy gate, alert history, v2 quality and research workflow',()=>{
  assert.match(shell,/policy-gate\.js/);
  assert.match(shell,/alert-history\.js/);
  assert.match(shell,/snapshot-quality-v2\.js/);
  assert.match(shell,/research-actions\.js/);
});
