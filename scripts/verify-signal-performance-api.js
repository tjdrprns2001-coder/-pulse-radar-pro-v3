const assert=require('assert');
const handler=require('../api/signal-performance.js');
function run(query={},service={async evaluateDue(){return{evaluated:0,errors:[]}},async getPerformance(){return{generatedAt:1,classes:[],recent:[]}}}){let code=0,body=null,headers={};const req={method:'GET',query};const res={setHeader(k,v){headers[k]=v},status(n){code=n;return this},json(v){body=v;return v}};return Promise.resolve(handler(req,res,{service})).then(()=>({code,body,headers}))}
(async()=>{
  const ok=await run({class:'PRE-SURGE',horizon:'h1',symbol:'ONEUSDT',limit:'50'});assert.equal(ok.code,200);assert.equal(ok.body.status,'ok');assert(Array.isArray(ok.body.classes));assert(String(ok.headers['Cache-Control']).includes('no-store'));
  const bad=await run({horizon:'h2'});assert.equal(bad.code,400);assert.equal(bad.body.status,'error');
  const failed=await run({}, {async evaluateDue(){throw new Error('blob down')},async getPerformance(){throw new Error('nope')}});assert.equal(failed.code,503);assert.equal(failed.body.status,'error');
  let methodCode=0;const res={setHeader(){},status(n){methodCode=n;return this},json(v){return v}};await handler({method:'POST',query:{}},res,{service:{}});assert.equal(methodCode,405);
  console.log('signal performance api PASS');
})().catch(e=>{console.error(e);process.exit(1)});
