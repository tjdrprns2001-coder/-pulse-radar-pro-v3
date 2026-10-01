'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {matchControls,aggregateReportRows}=require('./preignition-oos-store.js');

test('matchControls excludes signals and ranks comparable markets',()=>{
  const market={
    AAA:{price:10,volume:1000,change:5},
    BBB:{price:20,volume:1100,change:5.2},
    CCC:{price:30,volume:900,change:5.1},
    DDD:{price:40,volume:10000,change:20}
  };
  const rows=matchControls('AAA',market,new Set(['AAA','CCC']),3);
  assert.equal(rows.length,2);
  assert.equal(rows[0].symbol,'BBB');
});

test('aggregateReportRows computes excess returns only for matched controls',()=>{
  const report=aggregateReportRows([
    {stage:'ARMED',candidate_type:'A+B',echo:true,volume_state:'VOLUME-ECHO',return_pct:10,control_mean_pct:3,controls_matched:true},
    {stage:'ARMED',candidate_type:'A+B',echo:true,volume_state:'VOLUME-ECHO',return_pct:-2,control_mean_pct:null,controls_matched:false}
  ],4);
  const row=report.find(x=>x.group==='stage:ARMED');
  assert.equal(row.events,2);
  assert.equal(row.observed,2);
  assert.equal(row.matched,1);
  assert.equal(row.mean_return_pct,4);
  assert.equal(row.mean_excess_return_pp,7);
});


test('aggregateReportRows excludes unobserved null returns',()=>{
  const report=aggregateReportRows([
    {stage:'ARMED',candidate_type:'A',echo:false,volume_state:'QUIET',return_pct:null,control_mean_pct:null,controls_matched:false},
    {stage:'ARMED',candidate_type:'A',echo:false,volume_state:'QUIET',return_pct:5,control_mean_pct:2,controls_matched:true}
  ],24);
  const row=report.find(x=>x.group==='stage:ARMED');
  assert.equal(row.events,2);
  assert.equal(row.observed,1);
  assert.equal(row.matched,1);
  assert.equal(row.mean_return_pct,5);
  assert.equal(row.mean_excess_return_pp,3);
});
