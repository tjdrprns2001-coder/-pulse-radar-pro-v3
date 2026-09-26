'use strict';
const assert=require('assert');const fs=require('fs');
const page=fs.readFileSync('pulse-ai.html','utf8'),js=fs.readFileSync('ui/pulse-ai.js','utf8'),css=fs.readFileSync('ui/pulse-ai.css','utf8'),shell=fs.readFileSync('pulse-unified.html','utf8');

assert(page.includes('PULSE AI v2 · MARKET COPILOT'));
for(const id of ['refresh','dataBadge','providerBadge','marketRegime','breadth','candidateCount','researchState','focusCard','candidates','sectors','researchPanel','eventSummary','eventCatalysts','technicalEvents','extended','warnings','sources','quickPrompts','chatHistory','question','ask','deep']){
  assert(page.includes(`id="${id}"`),`missing Pulse AI v2 UI id: ${id}`);
}
assert(js.includes('/api/pulse-ai?'),'brief/chat must use Pulse AI API');
assert(js.includes("mode:'brief'"));assert(js.includes('mode=chat'));
assert(js.includes('selectedSymbol:selectedSymbol()'),'chat must forward shell-selected symbol');
assert(js.includes("setInterval(()=>{if(!document.hidden)load(false)},60000)"),'polling must be visibility-aware and 60s');
assert(js.includes("document.addEventListener('visibilitychange'"),'hidden tab should not keep expensive polling active');
assert(js.includes("parent.postMessage({type:'pulse-nav',view:'report'"),'candidate/focus must open report through shell');
assert(js.includes('textContent'),'dynamic text must use textContent');
assert(!js.includes('.innerHTML='),'Pulse AI v2 should not inject untrusted HTML');
assert(page.includes('심층 분석'));assert(page.includes('Research AI'));assert(page.includes('아직 덜 간 우선 관찰'));
assert(!page.match(/order|leverage|withdraw|wallet signing/i),'Pulse AI UI must not expose trading execution controls');
assert(css.includes('@media(max-width:520px)'),'mobile layout required');
assert(shell.includes('data-view="pulseai"'));assert(/\/ui\/pulse-shell\.js\?v=[A-Za-z0-9._-]+/.test(shell),'shell JS must be cache-busted');
console.log('pulse ai ui PASS');
