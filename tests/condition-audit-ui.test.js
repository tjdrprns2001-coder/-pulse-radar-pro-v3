'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Audit=require('../ui/condition-audit');
const source=fs.readFileSync(require.resolve('../ui/astra-scan.js'),'utf8');
function load(extra={}){
 const ctx={globalThis:{PulseConditionAudit:Audit},Date,esc:String,fmt:String,pct:String,timeFmt:String,...extra};vm.createContext(ctx);
 vm.runInContext(source.slice(source.indexOf('function conditionAuditBar('),source.indexOf('function chartbroResearchBar(')),ctx);return ctx;
}
test('scanner confirmations fail closed when timestamps or the module are missing',()=>{
 const row={symbol:'TEST',integratedSurge:{gate15m:{passed:true},gate5m:{passed:true}}};
 for(const ctx of [load(),load({globalThis:{}})]){const html=ctx.integratedSurgeBar(row);assert(html.includes('15m 대기 / 5m 대기'));assert(html.includes('데이터 미확인'))}
});
test('expiry refresh preserves open details and keyboard focus without replacing cards',()=>{
 let details={open:true},focused=false,writes=0;
 const band={dataset:{auditSymbol:'TEST',auditState:'ACTIVE'},contains:()=>true,querySelector:()=>details,
  set innerHTML(v){writes++;details={open:false,querySelector:()=>({focus:()=>focused=true})}}};
 const document={hidden:false,activeElement:{},querySelectorAll:()=>[band],createElement:()=>({firstElementChild:{dataset:{auditState:'EXPIRED'},innerHTML:'new expiry'}})};
 const ctx=load({document,state:{running:false,rows:[{symbol:'TEST',integratedSurge:{}}]}});
 ctx.refreshConditionAudits();assert.equal(details.open,true);assert.equal(focused,true);assert.equal(band.dataset.auditState,'EXPIRED');assert.equal(writes,1);
 ctx.refreshConditionAudits();assert.equal(writes,1,'unchanged validity must not redraw details');
});
