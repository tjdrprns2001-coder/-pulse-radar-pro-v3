const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveBarState, normalizeDataState, formatDataState } = require('../ui/pulse-data-state');

test('insufficient history wins over live status', () => {
  assert.equal(deriveBarState({ nowMs:1000, barCloseMs:900, fetchedAtMs:990, staleAfterMs:100, historyCount:100, requiredHistory:256 }), 'insufficient-history');
});

test('open bar is partial', () => {
  assert.equal(deriveBarState({ nowMs:1000, barCloseMs:1100, fetchedAtMs:990, staleAfterMs:100, historyCount:300, requiredHistory:256 }), 'partial');
});

test('old fetch is stale', () => {
  assert.equal(deriveBarState({ nowMs:1000, barCloseMs:900, fetchedAtMs:700, staleAfterMs:100, historyCount:300, requiredHistory:256 }), 'stale');
});

test('confirmed closed bar is confirmed', () => {
  assert.equal(deriveBarState({ nowMs:1000, barCloseMs:900, fetchedAtMs:990, staleAfterMs:100, historyCount:300, requiredHistory:256 }), 'confirmed');
});

test('unknown state normalizes to api-degraded', () => {
  assert.equal(normalizeDataState('mystery'), 'api-degraded');
});

test('format returns compact Korean label', () => {
  assert.equal(formatDataState('partial').label, '미완성');
});
