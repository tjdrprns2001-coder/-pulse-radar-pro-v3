const assert=require('assert');
const {createOpenAIGateway,normalizeBrief}=require('../lib/pulse-ai/openai-gateway.js');

(async()=>{
  const unavailable=createOpenAIGateway({apiKey:''});
  assert.equal(unavailable.available,false);
  const n=normalizeBrief({summary:'x',highlights:[{symbol:'AAAUSDT'}],sources:[{title:'ok',url:'https://example.com/a'},{title:'bad',url:'javascript:alert(1)'}]},{model:'m',usedWeb:true});
  assert.equal(n.summary,'x');assert.equal(n.sources.length,1);assert.equal(n.sources[0].url,'https://example.com/a');

  let calls=0,auth='',calledUrl='',body='';
  const fetchImpl=async(url,opts)=>{
    calls++;calledUrl=url;auth=opts.headers.Authorization;body=opts.body;
    assert(!String(opts.body).includes('secret-key'),'key must not appear in payload');
    if(calls===1)return{ok:false,status:429,text:async()=>'rate'};
    return{ok:true,status:200,json:async()=>({model:'openrouter/free',choices:[{message:{content:JSON.stringify({summary:'brief',highlights:[],watch:[],dataWarnings:[],sources:[]})}}]})};
  };
  const g=createOpenAIGateway({apiKey:'secret-key',fetchImpl,sleep:async()=>{}});
  const out=await g.brief({context:{symbols:[]},useWeb:false,deep:false});
  assert.equal(out.summary,'brief');assert.equal(calls,2,'transient failure retries once');assert.equal(auth,'Bearer secret-key');
  assert.equal(calledUrl,'https://openrouter.ai/api/v1/chat/completions','must use OpenRouter chat completions');
  const sent=JSON.parse(body);
  assert.equal(sent.model,'openrouter/free','free router must be default model');
  assert(Array.isArray(sent.messages),'OpenRouter payload must use messages');
  assert(String(sent.messages[0].content).includes('Korean'),'system prompt must request Korean output');
  assert.equal(sent.input,undefined,'OpenAI Responses input shape must not be sent');

  let webBody='';
  const webFetch=async(url,opts)=>{webBody=opts.body;return{ok:true,status:200,json:async()=>({model:'openrouter/free',choices:[{message:{content:'```json\n{"summary":"최근 상장 소식이 확인됐습니다.","highlights":["공식 출처 확인"],"watch":[],"dataWarnings":[],"sources":[{"title":"Official","url":"https://example.com/news"}]}\n```'}}]})}};
  const webGateway=createOpenAIGateway({apiKey:'secret-key',fetchImpl:webFetch});
  const ko=await webGateway.brief({context:{task:'recent news',symbol:'MARSCOINUSDT'},useWeb:true,deep:false});
  assert.equal(ko.summary,'최근 상장 소식이 확인됐습니다.','fenced JSON must be parsed, not rendered raw');
  assert.equal(ko.highlights.length,1,'parsed highlights must remain structured');
  assert.equal(ko.sources.length,1,'parsed sources must remain structured');
  const webSent=JSON.parse(webBody);
  assert(Array.isArray(webSent.plugins)&&webSent.plugins.some(x=>x.id==='web'),'web-enabled requests must use OpenRouter web plugin');

  let fallbackCalls=0;
  const fallbackFetch=async(url,opts)=>{
    fallbackCalls++;
    const req=JSON.parse(opts.body);
    if(req.plugins)return{ok:false,status:402,text:async()=>'web credits required'};
    return{ok:true,status:200,json:async()=>({model:'openrouter/free',choices:[{message:{content:JSON.stringify({summary:'시장 데이터만으로 요약했습니다.',highlights:[],watch:[],dataWarnings:['실시간 웹 검색을 사용할 수 없습니다.'],sources:[]})}}]})};
  };
  const fallbackGateway=createOpenAIGateway({apiKey:'secret-key',fetchImpl:fallbackFetch,sleep:async()=>{}});
  const fallback=await fallbackGateway.brief({context:{task:'market summary'},useWeb:true,deep:false});
  assert.equal(fallback.summary,'시장 데이터만으로 요약했습니다.','web-credit failure must fall back to non-web summary');
  assert.equal(fallback.usedWeb,false,'fallback must not claim web was used');
  assert.equal(fallbackCalls,2,'web failure should retry once without web plugin');

  console.log('pulse ai gateway PASS');
})().catch(e=>{console.error(e);process.exit(1)});
