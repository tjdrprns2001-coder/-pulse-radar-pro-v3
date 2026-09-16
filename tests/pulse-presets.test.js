const test = require('node:test');
const assert = require('node:assert/strict');
const { PRESETS, getPreset, prioritizeOverlays } = require('../ui/pulse-presets');

test('initial presets expose agreed rendering budgets', () => {
  assert.equal(PRESETS.clean.maxZones, 3);
  assert.equal(PRESETS.structure.maxZones, 5);
  assert.equal(PRESETS.smc.maxZones, 8);
  assert.equal(PRESETS.full.maxZones, 15);
});

test('unknown preset falls back to clean', () => {
  assert.equal(getPreset('does-not-exist').id, 'clean');
});

test('overlay prioritization prefers recent then HTF then quality within budget', () => {
  const items = [
    { id: 'old-ltf', timeframeMinutes: 15, quality: 90, state: 'active', recency: 1, distancePct: 0.2 },
    { id: 'htf', timeframeMinutes: 240, quality: 80, state: 'active', recency: 5, distancePct: 0.5 },
    { id: 'mitigated', timeframeMinutes: 240, quality: 99, state: 'mitigated', recency: 6, distancePct: 0.1 },
    { id: 'recent', timeframeMinutes: 60, quality: 88, state: 'active', recency: 10, distancePct: 0.4 }
  ];
  const result = prioritizeOverlays(items, 'clean');
  assert.equal(result.length, 3);
  assert.deepEqual(result.map(x => x.id), ['recent', 'mitigated', 'htf']);
});

test('prioritizeOverlays does not mutate input', () => {
  const items = [{ id:'a', timeframeMinutes:60, quality:50, state:'active', recency:1, distancePct:1 }];
  const copy = JSON.parse(JSON.stringify(items));
  prioritizeOverlays(items, 'clean');
  assert.deepEqual(items, copy);
});
