const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const legacy=fs.readFileSync('liquidity-lab.html','utf8');
const bridge=fs.readFileSync('liquidity-lab-v2.html','utf8');
const shell=fs.readFileSync('ui/pulse-shell.js','utf8');

test('legacy liquidity lab contains every render target id',()=>{
  for(const id of ['flow','source','target','buy','sell','score','tfgrid','story','priority','pools']){
    assert.match(legacy,new RegExp(`id=["']${id}["']`),id);
  }
});

test('liquidity bridge normalizes hash-prefixed getElementById calls before execution',()=>{
  assert.ok(bridge.includes("fetch('/liquidity-lab.html'"));
  assert.ok(bridge.includes("replaceAll(\"$('#\",\"$('\")"));
  assert.ok(bridge.indexOf('replaceAll')<bridge.indexOf('document.write'));
});

test('unified shell routes liquidity through normalized bridge',()=>{
  assert.match(shell,/liquidity:\{[^}]*path:'\/liquidity-lab-v2\.html'/);
});
