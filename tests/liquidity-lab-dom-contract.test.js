const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('liquidity-lab.html','utf8');

test('liquidity lab getElementById helper is called with bare ids',()=>{
  assert.match(html,/const \$=id=>document\.getElementById\(id\)/);
  assert.doesNotMatch(html,/\$\('#(?:flow|source|target|buy|sell|score|tfgrid|story|priority|pools)'\)/);
});

test('liquidity lab contains every render target id',()=>{
  for(const id of ['flow','source','target','buy','sell','score','tfgrid','story','priority','pools']){
    assert.match(html,new RegExp(`id=["']${id}["']`),id);
  }
});
