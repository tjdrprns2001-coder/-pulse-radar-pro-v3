import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {Store} from '../lib/scanner/store.mjs';
function create(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../drizzle/0000_dusty_thunderbird.sql',import.meta.url),'utf8'));const db={prepare(q){return {async all(){return {results:sql.prepare(q).all()}},bind(...a){const stmt=sql.prepare(q);return {async run(){return {meta:{changes:Number(stmt.run(...a).changes)}}},async first(){return stmt.get(...a)},async all(){return {results:stmt.all(...a)}}}}}},async batch(a){return Promise.all(a.map(x=>x.run()))}};return new Store(db);}
test('persistent job lease excludes concurrent writers',async()=>{const s=create(),j={id:'one',kind:'scan',status:'running'};await s.save(j);assert.equal(await s.acquire('one'),true);assert.equal(await s.acquire('one'),false);await s.release('one');assert.equal(await s.acquire('one'),true);assert.equal((await s.job('one')).id,'one');});
test('atomic request budget rejects overspend',async()=>{const s=create();assert.equal(await s.reserve('x',10,60000,8),true);assert.equal(await s.reserve('x',10,60000,3),false);assert.equal(await s.reserve('x',10,60000,2),true);});
test('samples deduplicate and persist across reads',async()=>{const s=create(),sample={id:'A:1',symbol:'A',cutoff:1,features:{a:1}};await s.sample(sample);await s.sample(sample);assert.equal((await s.samples()).length,1);});
test('cache expiry and creation gate prevent repeat work',async()=>{const s=create();await s.put('a',{x:1},-1);assert.equal(await s.get('a'),null);assert.equal(await s.gate('new',60000),true);assert.equal(await s.gate('new',60000),false);});
