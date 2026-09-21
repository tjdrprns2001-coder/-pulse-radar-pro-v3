const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('unified-chart.html','utf8');
const js=fs.readFileSync('ui/chart/unified-chart-v5.js','utf8');
const core=fs.readFileSync('ui/chart/chart-core.js','utf8');
const shell=fs.readFileSync('ui/pulse-shell.js','utf8');

test('indicator series hide last-value badges to prevent y-axis collisions',()=>{
  const matches=core.match(/lastValueVisible:false/g)||[];
  assert.ok(matches.length>=6,'expected all indicator series to disable lastValueVisible');
});

test('mobile starts with indicator panes collapsed until explicitly selected',()=>{
  for(const pane of ['rsi','macd','stoch','kdj','obv']){
    assert.match(html,new RegExp('type="checkbox" data-pane="'+pane+'"'));
    assert.doesNotMatch(html,new RegExp('type="checkbox" data-pane="'+pane+'" checked'));
  }
  assert.match(js,/setPaneVisibility\(name,false\)/);
});

test('professional summary exposes SMC detected state without covering the chart',()=>{
  assert.match(html,/id="sumFvg"/);
  assert.match(html,/id="sumOb"/);
  assert.match(html,/id="sumMss"/);
  assert.match(js,/fvgCount/);
  assert.match(js,/obCount/);
  assert.doesNotMatch(html,/analysisDock/);
});

test('child chart emits symbol sync and shell consumes it',()=>{
  assert.match(js,/pulse-symbol-sync/);
  assert.match(shell,/pulse-symbol-sync/);
});

test('mobile analysis title remains concise in V5',()=>{
  assert.match(shell,/analysis:\{title:'전문 차트 분석'/);
});
