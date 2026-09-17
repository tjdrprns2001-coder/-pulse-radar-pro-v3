const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','multi-chart.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','ui','multi-chart','multi-chart.css'),'utf8');

function pos(src){return html.indexOf(src)}

test('loads milestone 3.3 engines and plugins before multi-chart card code',()=>{
  const ordered=[
    '/ui/chart/annotation-model.js',
    '/ui/chart/annotation-layout.js',
    '/ui/chart/session-profile.js',
    '/ui/chart/liquidity-engine.js',
    '/ui/chart/ict-context-engine.js',
    '/ui/chart/plugins/liquidity-plugin.js',
    '/ui/chart/plugins/ict-plugin.js',
    '/ui/multi-chart/chart-card.js',
    '/ui/multi-chart/multi-chart.js'
  ];
  for(const src of ordered)assert.ok(pos(src)>=0,`missing ${src}`);
  for(let i=1;i<ordered.length;i++)assert.ok(pos(ordered[i-1])<pos(ordered[i]),`${ordered[i-1]} must load before ${ordered[i]}`);
});

test('multi-chart exposes Liquidity in the visual legend',()=>{
  assert.match(html,/class="liquidity"[^>]*>Liquidity</);
});

test('390px mobile stacks cards and keeps chart height in approved range',()=>{
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/\.mcGrid,\.mcGrid\[data-layout="4"\]\{grid-template-columns:1fr\}/);
  assert.match(css,/\.mcChartHost\{height:360px\}/);
  assert.match(css,/\.mcCard\{[^}]*min-width:0/);
});

test('four-chart compact mobile can hide narrative while expanded chart remains readable',()=>{
  assert.match(css,/\.mcGrid\[data-layout="4"\] \.mcNarrative\{display:none\}/);
  assert.match(css,/\.mcExpanded \.mcCard\.isExpanded \.mcNarrative\{display:block\}/);
});
