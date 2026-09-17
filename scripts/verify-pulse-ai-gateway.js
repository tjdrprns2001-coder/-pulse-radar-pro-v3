const assert=require('assert');
const {createOpenAIGateway,normalizeBrief}=require('../lib/pulse-ai/openai-gateway.js');

(async()=>{
  const unavailable=createOpenAIGateway({apiKey:''});
  assert.equal(unavailable.available,false);
  const n=normalizeBrief({summary:'x',highlights:[{symbol:'AAAUSDT'}],sources:[{title:'ok',url:'https://example.com/a'},{title:'bad',url:'javascript:alert(1)'}]},{model:'m',usedWeb:true});
  assert.equal(n.summary,'x');assert.equal(n.sources.length,1);assert.equal(n.sources[0].url,'https://example.com/a');

  let calls=0,auth='';
  const fetchImpl=async(url,opts)=>{calls++;auth=opts.headers.Authorization;assert(!String(opts.body).includes('secret-key'),'key must not appear in payload');if(calls===1)return{ok:false,status:429,text:async()=>'rate'};return{ok:true,status:200,json:async()=>({model:'gpt-5.6-luna',output_text:JSON.stringify({summary:'brief',highlights:[],watch:[],dataWarnings:[],sources:[]})})}};
  const g=createOpenAIGateway({apiKey:'secret-key',fetchImpl,sleep:async()=>{}});
  const out=await g.brief({context:{symbols:[]},useWeb:false,deep:false});
  assert.equal(out.summary,'brief');assert.equal(calls,2,'transient failure retries once');assert.equal(auth,'Bearer secret-key');
  console.log('pulse ai gateway PASS');
})().catch(e=>{console.error(e);process.exit(1)});
