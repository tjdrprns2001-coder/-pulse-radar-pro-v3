'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {matchControls,aggregateReportRows}=require('./preignition-oos-store.js');

test('matchControls excludes signals and ranks comparable markets',()=>{
  const market={
    AAA:{price:10,volume:1000,change:5,source:'futures'},
    BBB:{price:20,volume:1100,change:5.2,source:'futures'},
    CCC:{price:30,volume:900,change:5.1,source:'spot'},
    DDD:{price:40,volume:10000,change:20,source:'futures'}
  };
  const rows=matchControls('AAA',market,new Set(['AAA','CCC']),3);
  assert.equal(rows.length,2);
  assert.equal(rows[0].symbol,'BBB');
  assert.equal(rows[0].source,'futures');
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


test('aggregateReportRows counts type/echo/volume once per episode',()=>{
  const report=aggregateReportRows([
    {id:1,episode_id:'AAA:1',stage:'PRE',candidate_type:'A',echo:false,volume_state:'QUIET',return_pct:1,control_mean_pct:null,controls_matched:false},
    {id:2,episode_id:'AAA:1',stage:'ARMED',candidate_type:'A+B',echo:true,volume_state:'VOLUME-ECHO',return_pct:2,control_mean_pct:null,controls_matched:false}
  ],1);
  assert.equal(report.find(x=>x.group==='stage:PRE').events,1);
  assert.equal(report.find(x=>x.group==='stage:ARMED').events,1);
  assert.equal(report.find(x=>x.group==='type:A').events,1);
  assert.equal(report.some(x=>x.group==='type:A+B'),false);
  assert.equal(report.find(x=>x.group==='volume:QUIET').events,1);
});
