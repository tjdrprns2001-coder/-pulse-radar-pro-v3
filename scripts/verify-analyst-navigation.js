'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const pages=['astra-scan.html','dna-scan.html','auto-chart-lab.html','research-ai.html','pulse-ai.html','coin-report.html','radar.html','launch-origin.html','dante-lab.html','historical-validation.html','ict-narrative-lab.html','surge-pattern-lab.html'];
const js=fs.readFileSync(path.join(root,'ui/analyst-nav.js'),'utf8');
const css=fs.readFileSync(path.join(root,'ui/analyst-nav.css'),'utf8');
new vm.Script(js,{filename:'analyst-nav.js'});
assert.ok(css.includes('#pr-analyst-nav'), 'nav styles must be scoped');
assert.ok(css.includes('safe-area-inset-bottom'), 'mobile safe area missing');
for(const p of pages) {
 const contents=fs.readFileSync(path.join(root,p),'utf8');
 assert.equal(contents.split('/ui/analyst-nav.js?v=20261015').length-1,1,p+' nav script exactly once');
 assert.ok(contents.includes('</body>'),p+' HTML body missing');
}
const workbench=fs.readFileSync(path.join(root,'workbench.html'),'utf8');
assert.ok(workbench.includes('급등 전 DNA 탐색'), 'portal still exposes DNA');
const targets=[...js.matchAll(/path: '(\/[^']+)'/g)].map(m=>m[1].split('?')[0]).filter(p=>p!=='/');
assert.ok(targets.length>=13,'expected all core modules');
for(const t of targets)assert.ok(fs.existsSync(path.join(root,t.slice(1))), 'missing module linked in navigator: '+t);

function fixture(pathname,query) {
 const lookup=()=>{}, events={};
 class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.events={};this.parentElement=null;this.textContent='';this.className='';this.hidden=false;this.value='';this.classList={contains:name=>this.className.split(/\s+/).includes(name)};}
  append(...kids){kids.forEach(k=>{k.parentElement=this;this.children.push(k)})}
  appendChild(k){this.append(k);return k}
  setAttribute(k,v){this.attrs[k]=v}
  getAttribute(k){return this.attrs[k]||null}
  addEventListener(name,fn){this.events[name]=fn}
  get previousElementSibling(){if(!this.parentElement)return null;const x=this.parentElement.children;return x[x.indexOf(this)-1]||null}
  contains(node){if(this===node)return true;return this.children.some(k=>k.contains(node))}
  focus(){document.activeElement=this}
 }
 const document={
  head:new Element('head'),body:new Element('body'),readyState:'complete',activeElement:null,
  createElement:tag=>new Element(tag),
  addEventListener:(k,fn)=>{events[k]=fn},
  getElementById(id){const walk=node=>node.id===id?node:node.children.map(walk).find(Boolean);return walk(document.body)}
 };
 const win={location:{pathname,search:query,origin:'https://example.test'}};
 vm.runInNewContext(js,{document,window:win,URL,URLSearchParams});
 const rootEl=document.getElementById('pr-analyst-nav');
 assert.ok(rootEl,'floating menu must be created');
 const panel=document.getElementById('pr-an-panel'),toggle=rootEl.children[1],search=panel.children[1],list=panel.children[2];
 assert.equal(panel.hidden,true,'initially collapsed');
 const anchors=list.children.filter(x=>x.tagName==='a');
 assert.equal(anchors.length,14,'modules and portal/home links');
 assert.equal(anchors.filter(x=>x.attrs['aria-current']==='page').length,1,'active route');
 toggle.events.click();assert.equal(panel.hidden,false,'button must open menu');
 assert.equal(toggle.attrs['aria-expanded'],'true');
 search.value='DNA';search.events.input();assert.equal(anchors.filter(x=>!x.hidden).length,1);
 assert.ok(anchors.find(x=>!x.hidden).textContent.includes('DNA'));
 events.keydown({key:'Escape'});assert.equal(panel.hidden,true,'Escape closes menu');
 assert.equal(document.activeElement,toggle,'focus restored to launcher');
 return {anchors};
}
let {anchors}=fixture('/dna-scan.html','?symbol=ETHUSDT');
assert.ok(anchors.some(x=>x.href==='/coin-report.html?symbol=ETHUSDT'), 'valid symbol forwarded');
assert.ok(anchors.some(x=>x.href==='/dante-lab.html?method=ma-cloud-cycle&symbol=ETHUSDT'), 'existing query kept');
anchors=fixture('/radar.html','?symbol=%3Cimg%3E').anchors;
assert.ok(anchors.every(x=>!x.href.includes('symbol=')),'invalid symbols are never forwarded');
console.log('PASS analyst navigation: 12 pages, 14 targets, keyboard, search, mobile style, safe symbol context');
