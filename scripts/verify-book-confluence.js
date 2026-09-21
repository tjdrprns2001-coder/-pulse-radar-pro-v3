const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const E=require(path.join(root,'ui/book-confluence/book-confluence-engine.js'));
assert.equal(E.VERSION,'1.0.0');
assert.deepEqual(E.STATES,['관찰','형성중','확인대기','확인','무효화']);
for(const fn of ['movingAverageStructure','volumeStructure','pivots','ichimokuPriceTargets','ichimokuTiming','fibonacciProjection','trendlineBreakout','marketRegime','clusterLevels','confluenceZones','scenarioEngine','analyze'])assert.equal(typeof E[fn],'function','missing '+fn);
const t=E.ichimokuPriceTargets({A:100,B:120,C:110});assert.deepEqual({V:t.V,N:t.N,E:t.E,NT:t.NT},{V:130,N:130,E:140,NT:120});
const groups=E.clusterLevels([{price:100,label:'A'},{price:100.2,label:'B'},{price:104,label:'C'}],{close:100,atrValue:1});assert(groups[0].count>=2,'confluence clustering failed');
const candles=[];for(let i=0;i<150;i++){const b=100+i*.08+(i>120?(i-120)*.03:0);candles.push({time:i+1,open:b-.08,high:b+.4,low:b-.35,close:b,volume:100+(i%9)*8})}
const a=E.analyze({candles,forexBook:{indicators:{last:candles.at(-1).close,supportResistance:{support:108,resistance:114},fibonacci:{levels:{'38.2':110,'61.8':108.5}},bollinger:{upper:114,mid:111,lower:108},ichimoku:{conversion:112,base:111,cloudTop:110.5,cloudBottom:109.5},pivot:{pivot:111}},confluence:{bias:'상승',score:70}},classic:{best:{side:'상승',status:'CONFIRMED'}}});assert(a.available&&a.scenario&&Number.isFinite(a.scenario.score));assert(!Object.prototype.hasOwnProperty.call(a.scenario,'winRate'));assert(a.scenario.disclaimer.includes('승률'));
const html=read('book-confluence-lab.html'),plugin=read('ui/chart/plugins/book-confluence-plugin.js'),chart=read('unified-chart.html'),chartJs=read('ui/chart/unified-chart-v5.js'),shell=read('ui/pulse-shell.js'),shellHtml=read('pulse-unified.html');
for(const term of ['책 합성 실전 랩','Confluent Zone','시간·가격론','시나리오·반증'])assert(html.includes(term),'missing lab UI '+term);
assert(plugin.includes("id:'book-confluence'"),'book confluence plugin id missing');
assert(chart.includes('data-overlay="book-confluence"')&&chart.includes('book-confluence-engine.js')&&chart.includes('book-confluence-plugin.js'),'unified chart book wiring missing');
assert(chartJs.includes('BC.analyze')&&chartJs.includes('bookConfluence'),'unified chart book engine integration missing');
assert(shell.includes("bookconfluence:{title:'책 합성 실전 랩'")&&shellHtml.includes('data-view="bookconfluence"'),'workspace navigation missing');
for(const f of ['ui/book-confluence/book-confluence-engine.js','ui/book-confluence/book-confluence-lab.js','ui/chart/plugins/book-confluence-plugin.js','ui/chart/unified-chart-v5.js','ui/pulse-shell.js'])new vm.Script(read(f),{filename:f});
console.log('Book Confluence integration PASS');