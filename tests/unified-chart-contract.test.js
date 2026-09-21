const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const html=fs.readFileSync('unified-chart.html','utf8'),js=fs.readFileSync('ui/chart/unified-chart-v5.js','utf8'),shell=fs.readFileSync('ui/pulse-shell.js','utf8');

test('V5 chart pins Lightweight Charts 5.2.1',()=>assert.match(html,/lightweight-charts@5\.2\.1/));
test('V5 chart loads professional analysis modules',()=>{
  for(const p of ['chart-core.js','smc-engine.js','ict-context-engine.js','liquidity-engine.js','moving-average-plugin.js','volume-profile-plugin.js','dante-plugin.js','analysis-engine.js','unified-chart-v5.js'])assert.match(html,new RegExp(p.replaceAll('.','\\.')));
});
test('V5 chart supports the official 8 research timeframes',()=>{
  for(const tf of ['5m','15m','1h','4h','12h','1d','3d','1w'])assert.match(html,new RegExp('<option(?: selected)?>'+tf+'</option>'));
});
test('V5 chart exposes independent overlays',()=>{
  for(const x of ['structure','smc','ict','liquidity','volume-profile','moving-average','dante'])assert.match(html,new RegExp('data-overlay="'+x+'"'));
});
test('V5 chart orchestrates SMC ICT liquidity and technical summary',()=>{
  assert.match(js,/fetchStructure/);assert.match(js,/analyzeSmcV2/);assert.match(js,/buildIctContext/);assert.match(js,/analyzeLiquidity/);assert.match(js,/PulseTraderAnalysis/);
  assert.match(js,/PulseVolumeProfilePlugin/);assert.match(js,/PulseMovingAveragePlugin/);assert.match(js,/PulseIctPlugin/);
});
test('V5 chart obtains optional HTF without replacing selected timeframe',()=>{
  assert.match(js,/function htfFor/);assert.match(js,/Promise\.allSettled/);assert.match(js,/htfTf/);
});
test('V5 chart exposes RSI MACD Stoch KDJ and OBV panes',()=>{
  for(const p of ['rsi','macd','stoch','kdj','obv'])assert.match(html,new RegExp('data-pane="'+p+'"'));
  assert.match(js,/kdjSeries/);assert.match(js,/obvSeries/);
});
test('V5 chart links to MTF snapshot report and Dante lab',()=>{assert.match(html,/mtf-snapshot-pro\.html/);assert.match(html,/coin-report\.html/);assert.match(html,/dante-lab\.html/)});
test('workspace has no chart-covering analysis dock',()=>assert.doesNotMatch(html,/analysisDock/));
test('canonical analysis route uses V5 unified chart',()=>assert.match(shell,/analysis:\{[^}]*path:'\/unified-chart\.html'/s));
