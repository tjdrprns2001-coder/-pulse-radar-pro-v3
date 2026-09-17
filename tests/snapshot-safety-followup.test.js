const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {nextAlertState}=require('../lib/signal-quality/alert-state.js');

const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('calibration pending can never enter ARMED',()=>{
  assert.equal(nextAlertState('OBSERVE',{integrityState:'live',conditionsMet:3,conditionsTotal:3,calibrationReady:false}),'WATCH');
  assert.equal(nextAlertState('ARMED',{integrityState:'live',conditionsMet:3,conditionsTotal:3,calibrationReady:false}),'WATCH');
});

test('restored snapshot mirrors child symbol into shell header',()=>{
  const src=read('ui/pulse-shell-snapshot-restore.js');
  assert.match(src,/syncFromChild/);
  assert.match(src,/pulse-symbol-sync/);
  assert.match(src,/addEventListener\(['\"]input['\"]/);
});

test('mobile snapshot label guard is installed',()=>{
  const html=read('snapshot-analysis-restored.html');
  const guard=read('ui/snapshot/snapshot-mobile-label-guard.js');
  assert.match(html,/snapshot-mobile-label-guard\.js/);
  assert.match(guard,/snapshotChart/);
  assert.match(guard,/Target/);
  assert.match(guard,/BOS/);
});

test('narrative never labels raw pattern score as confidence',()=>{
  const src=read('lib/analysis/narrative-renderer.js');
  assert.match(src,/패턴 점수/);
  assert.match(src,/검증확률 미확정/);
  assert.doesNotMatch(src,/신뢰도 \$\{Number\(p\.confidence\)/);
});
