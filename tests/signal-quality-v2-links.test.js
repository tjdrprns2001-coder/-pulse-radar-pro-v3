const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function read(p){return fs.readFileSync(path.join(__dirname,'..',p),'utf8')}

test('research link helper preserves symbol tf source and context',()=>{
  const links=require('../lib/signal-quality/research-links');
  const u=links.build('/snapshot-analysis-restored.html',{symbol:'UNIUSDT',tf:'4h',source:'surge',context:'PRE'});
  assert.match(u,/symbol=UNIUSDT/);
  assert.match(u,/tf=4h/);
  assert.match(u,/source=surge/);
  assert.match(u,/context=PRE/);
});

test('scanner and surge one-click workflow exposes analysis snapshot ict and performance destinations',()=>{
  const links=read('lib/signal-quality/research-links.js');
  const helper=read('ui/signal-quality/research-actions.js');
  assert.match(links,/snapshot-analysis-restored\.html/);
  assert.match(links,/performance-dashboard\.html/);
  assert.match(links,/ict-narrative-lab\.html/);
  assert.match(links,/technique-lab\.html/);
  assert.match(helper,/Links\.bundle/);
  assert.match(helper,/symbol/);
});
