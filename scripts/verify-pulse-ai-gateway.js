'use strict';
const assert=require('assert');
const {createPulseAIGateway,createOpenAIGateway,normalizeBrief}=require('../lib/pulse-ai/openai-gateway.js');

(async()=>{
  const unavailable=createPulseAIGateway({apiKey:''});
  assert.equal(unavailable.available,false);
  assert.equal(createOpenAIGateway,createPulseAIGateway,'legacy factory alias must remain compatible');

  const n=normalizeBrief({
    summary:'x',
    highlights:[{symbol:'AAAUSDT',reason:'r',confidence:'높음'},'문자열 근거'],
    eventCatalysts:[
      {symbol:'AAA',eventType:'listing',titleKo:'신규 상장',summaryKo:'공식 공지',eventTime:'2026-09-22T00:00:00Z',sourceTier:'A',sourceName:'공식',sourceUrl:'https://example.com/event',confirmed:true},
      {symbol:'BAD',sourceUrl:'javascript:alert(1)'}
    ],
    sources:[
      {title:'ok',url:'https://example.com/a',publishedAt:'2026-09-20T00:00:00Z'},
      {title:'dup',url:'https://example.com/a'},
      {title:'bad',url:'javascript:alert(1)'}
    ]
  },{model:'m',usedWeb:true});
  assert.equal(n.summary,'x');assert.equal(n.provider,'gemini');
  assert.equal(n.highlights.length,2);assert.equal(n.highlights[0].confidence,'높음');
  assert.equal(n.eventCatalysts.length,1);assert.equal(n.sources.length,1);
  assert.equal(n.sources[0].publishedAt,'2026-09-20T00:00:00.000Z');

  let calls=0,apiKeyHeader='',auth='',calledUrl='',body='',signalSeen=false;
  const fetchImpl=async(url,opts)=>{
    calls++;calledUrl=url;apiKeyHeader=opts.headers['x-goog-api-key'];auth=opts.headers.Authorization;body=opts.body;signalSeen=Boolean(opts.signal);
    assert(!String(opts.body).includes('secret-key'),'key must never appear in request payload');
    if(calls===1)return{ok:false,status:429,text:async()=>'rate'};
    return{ok:true,status:200,json:async()=>({modelVersion:'gemini-3.8-flash',candidates:[{content:{parts:[{text:JSON.stringify({summary:'brief',highlights:[],watch:[],eventCatalysts:[],dataWarnings:[],sources:[]})}]}}]})};
  };
  const g=createPulseAIGateway({apiKey:'secret-key',fetchImpl,sleep:async()=>{},requestTimeoutMs:1234});
  const out=await g.brief({context:{symbols:[]},useWeb:false,deep:false});
  assert.equal(out.summary,'brief');assert.equal(calls,2,'transient failure retries once');
  assert.equal(apiKeyHeader,'secret-key');assert.equal(auth,undefined);assert.equal(signalSeen,true,'gateway requests must be bounded by timeout signal');
  assert.equal(calledUrl,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  const sent=JSON.parse(body);
  assert(Array.isArray(sent.contents));assert(String(sent.system_instruction?.parts?.[0]?.text||'').includes('untrusted DATA'),'prompt-injection guard must be explicit');
  assert.equal(sent.messages,undefined);assert.equal(sent.generationConfig?.responseMimeType,'application/json');

  let webBody='';
  const webFetch=async(url,opts)=>{webBody=opts.body;return{ok:true,status:200,json:async()=>({modelVersion:'gemini-3.8-flash',candidates:[{content:{parts:[{text:'\`\`\`json\n{"summary":"최근 상장 소식이 확인됐습니다.","highlights":["공식 출처 확인"],"watch":[],"eventCatalysts":[{"symbol":"MARSCOIN","eventType":"listing","titleKo":"신규 상장","summaryKo":"공식 상장 공지","eventTime":"2026-09-22T00:00:00Z","sourceTier":"A","sourceName":"Official","sourceUrl":"https://example.com/news","confirmed":true}],"dataWarnings":[],"sources":[{"title":"Official","url":"https://example.com/news"}]}\n\`\`\`'}]}}]})}};
  const webGateway=createPulseAIGateway({apiKey:'secret-key',fetchImpl:webFetch});
  const ko=await webGateway.brief({context:{task:'recent news',symbol:'MARSCOINUSDT'},useWeb:true,deep:false});
  assert.equal(ko.summary,'최근 상장 소식이 확인됐습니다.');assert.equal(ko.highlights.length,1);assert.equal(ko.sources.length,1);assert.equal(ko.eventCatalysts.length,1);
  const webSent=JSON.parse(webBody);assert(Array.isArray(webSent.tools)&&webSent.tools.some(x=>x.google_search));

  let fallbackCalls=0;
  const fallbackFetch=async(url,opts)=>{
    fallbackCalls++;const req=JSON.parse(opts.body);
    if(req.tools)return{ok:false,status:403,text:async()=>'grounding unavailable'};
    return{ok:true,status:200,json:async()=>({modelVersion:'gemini-3.8-flash',candidates:[{content:{parts:[{text:JSON.stringify({summary:'시장 데이터만으로 요약했습니다.',highlights:[],watch:[],dataWarnings:['실시간 웹 검색을 사용할 수 없습니다.'],sources:[]})}]}}]})};
  };
  const fallbackGateway=createPulseAIGateway({apiKey:'secret-key',fetchImpl:fallbackFetch,sleep:async()=>{}});
  const fallback=await fallbackGateway.brief({context:{task:'market summary'},useWeb:true,deep:false});
  assert.equal(fallback.summary,'시장 데이터만으로 요약했습니다.');assert.equal(fallback.usedWeb,false);assert.equal(fallbackCalls,2);

  console.log('pulse ai gateway PASS');
})().catch(e=>{console.error(e);process.exit(1)});
