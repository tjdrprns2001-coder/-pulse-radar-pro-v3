const assert=require('assert');
const {createOpenAIGateway,normalizeBrief}=require('../lib/pulse-ai/openai-gateway.js');

(async()=>{
  const unavailable=createOpenAIGateway({apiKey:''});
  assert.equal(unavailable.available,false);
  const n=normalizeBrief({summary:'x',highlights:[{symbol:'AAAUSDT'}],eventCatalysts:[{symbol:'AAA',eventType:'listing',titleKo:'신규 상장',summaryKo:'공식 공지',eventTime:'2026-09-22T00:00:00Z',sourceTier:'A',sourceName:'공식',sourceUrl:'https://example.com/event',confirmed:true},{symbol:'BAD',sourceUrl:'javascript:alert(1)'}],sources:[{title:'ok',url:'https://example.com/a'},{title:'bad',url:'javascript:alert(1)'}]},{model:'m',usedWeb:true});
  assert.equal(n.summary,'x');assert.equal(n.eventCatalysts.length,1);assert.equal(n.eventCatalysts[0].sourceTier,'A');assert.equal(n.sources.length,1);assert.equal(n.sources[0].url,'https://example.com/a');

  let calls=0,apiKeyHeader='',auth='',calledUrl='',body='';
  const fetchImpl=async(url,opts)=>{
    calls++;calledUrl=url;apiKeyHeader=opts.headers['x-goog-api-key'];auth=opts.headers.Authorization;body=opts.body;
    assert(!String(opts.body).includes('secret-key'),'key must not appear in payload');
    if(calls===1)return{ok:false,status:429,text:async()=>'rate'};
    return{ok:true,status:200,json:async()=>({modelVersion:'gemini-3.8-flash',candidates:[{content:{parts:[{text:JSON.stringify({summary:'brief',highlights:[],watch:[],dataWarnings:[],sources:[]})}]}}]})};
  };
  const g=createOpenAIGateway({apiKey:'secret-key',fetchImpl,sleep:async()=>{}});
  const out=await g.brief({context:{symbols:[]},useWeb:false,deep:false});
  assert.equal(out.summary,'brief');assert.equal(calls,2,'transient failure retries once');
  assert.equal(apiKeyHeader,'secret-key','Gemini key must use x-goog-api-key header');
  assert.equal(auth,undefined,'Authorization header must not be used for Gemini API key auth');
  assert.equal(calledUrl,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent','must use Gemini generateContent endpoint');
  const sent=JSON.parse(body);
  assert(Array.isArray(sent.contents),'Gemini payload must use contents');
  assert(String(sent.system_instruction?.parts?.[0]?.text||'').includes('Korean'),'system instruction must request Korean output');
  assert.equal(sent.messages,undefined,'OpenRouter messages shape must not be sent');
  assert.equal(sent.generationConfig?.responseMimeType,'application/json','Gemini should be asked for JSON output');

  let webBody='';
  const webFetch=async(url,opts)=>{webBody=opts.body;return{ok:true,status:200,json:async()=>({modelVersion:'gemini-3.8-flash',candidates:[{content:{parts:[{text:'```json\n{"summary":"최근 상장 소식이 확인됐습니다.","highlights":["공식 출처 확인"],"watch":[],"eventCatalysts":[{"symbol":"MARSCOIN","eventType":"listing","titleKo":"신규 상장","summaryKo":"공식 상장 공지","eventTime":"2026-09-22T00:00:00Z","sourceTier":"A","sourceName":"Official","sourceUrl":"https://example.com/news","confirmed":true}],"dataWarnings":[],"sources":[{"title":"Official","url":"https://example.com/news"}]}\n```'}]}}]})}};
  const webGateway=createOpenAIGateway({apiKey:'secret-key',fetchImpl:webFetch});
  const ko=await webGateway.brief({context:{task:'recent news',symbol:'MARSCOINUSDT'},useWeb:true,deep:false});
  assert.equal(ko.summary,'최근 상장 소식이 확인됐습니다.','fenced JSON must be parsed, not rendered raw');
  assert.equal(ko.highlights.length,1,'parsed highlights must remain structured');
  assert.equal(ko.sources.length,1,'parsed sources must remain structured');assert.equal(ko.eventCatalysts.length,1,'event catalysts must remain structured');
  const webSent=JSON.parse(webBody);
  assert(Array.isArray(webSent.tools)&&webSent.tools.some(x=>x.google_search),'web-enabled requests must use Gemini Google Search grounding');

  let fallbackCalls=0;
  const fallbackFetch=async(url,opts)=>{
    fallbackCalls++;
    const req=JSON.parse(opts.body);
    if(req.tools)return{ok:false,status:403,text:async()=>'grounding unavailable'};
    return{ok:true,status:200,json:async()=>({modelVersion:'gemini-3.8-flash',candidates:[{content:{parts:[{text:JSON.stringify({summary:'시장 데이터만으로 요약했습니다.',highlights:[],watch:[],dataWarnings:['실시간 웹 검색을 사용할 수 없습니다.'],sources:[]})}]}}]})};
  };
  const fallbackGateway=createOpenAIGateway({apiKey:'secret-key',fetchImpl:fallbackFetch,sleep:async()=>{}});
  const fallback=await fallbackGateway.brief({context:{task:'market summary'},useWeb:true,deep:false});
  assert.equal(fallback.summary,'시장 데이터만으로 요약했습니다.','grounding failure must fall back to non-web summary');
  assert.equal(fallback.usedWeb,false,'fallback must not claim web was used');
  assert.equal(fallbackCalls,2,'grounding failure should retry once without search tool');

  console.log('pulse ai gateway PASS');
})().catch(e=>{console.error(e);process.exit(1)});
