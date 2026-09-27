import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalScannerSource} from './scanner-runtime.mjs';

test('local scanner source starts disabled for deterministic tests',async()=>{
  const source=createLocalScannerSource({env:{},autoStart:false,now:()=>123});
  assert.equal(await source(),null);
  const health=source.health();
  assert.equal(health.mode,'local-render');
  assert.equal(health.state,'INIT');
  assert.equal(health.hasSnapshot,false);
  assert.equal(health.hasCompleted,false);
  assert.equal(health.startedAt,123);
});
