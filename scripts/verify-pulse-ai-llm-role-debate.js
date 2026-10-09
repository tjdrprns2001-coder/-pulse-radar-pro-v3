'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {buildContext}=require('../lib/pulse-ai/context-builder.js');
const {buildReviewBoard}=require('../lib/pulse-ai/multi-perspective-board.js');
const {createRoleDebateService,approveAnswer}=require('../lib/pulse-ai/llm-role-debate.js');
const {createPulseAIGateway}=require('../lib/pulse-ai/openai-gateway.js');
const {createBriefingService}=require('../lib/pulse-ai/briefing-service.js');
const handler=require('../api/pulse-ai.js');
const TS=Date.UTC(2026,9,10,7),scan={
 status:'ok',updatedAt:TS-5000,partial:false,scanCount:2,
 dataHealth:{live:2,delayed:0,blocked:0,errors:0},
 marketCoverage:{futures:2,both:0,spot:0,total:2},
 marketBreadth:{count:2,up:2,down:0,flat:0,median:1,majors:{BTC:1,ETH:1,SOL:1}},
 candidateSymbols:['AAAUSDT'],
 items:[{symbol:'AAAUSDT',category:'급등 전조 관찰',sector:'AI',priority:80,
  candidateScore:62,preIgnitionScore:50,priceChange24h:2,volumeAcceleration:2,
  oiChangePct:1.6,takerRatio:1.35,fundingPct:.01,dataState:'live',
  futuresListed:true,spotListed:true,reasons:['test untrusted scanner string']},
 {symbol:'HOTUSDT',category:'이미 급등함',sector:'Meme',priority:100,
  priceChange24h:35,volumeAcceleration:5,oiChangePct:5,takerRatio:3,
  fundingPct:.1,dataState:'live',futuresListed:true}]
};
const context=buildContext(scan,{events:[],sectorClusters:[]},{selectedSymbol:'AAAUSDT',maxSymbols:2});
const original=JSON.stringify(context);
const board=buildReviewBoard(context,{selectedSymbol:'AAAUSDT',now:TS});
assert.equal(board.reviews[0].readiness,'RESEARCH_WATCH');
let requests=[];
const mockFetch=async(url,options)=>{
 const body=JSON.parse(options.body),prompt=JSON.parse(body.contents[0].parts[0].text);
 requests.push({url,method:options.method,apiKey:options.headers['x-goog-api-key'],
   role:prompt.role,previous:prompt.previous,body});
 assert.equal(options.headers['x-goog-api-key'],'secret-test-key');
 assert.equal(body.tools,undefined,'LLM role reviews must never use web grounding');
 assert.equal(body.generationConfig.responseMimeType,'application/json');
 assert(!JSON.stringify(prompt).includes('test untrusted scanner string'),
  'raw untrusted scanner prose must not be shipped to role model');
 assert.equal(typeof prompt.asOf,'number');
 const result={role:prompt.role,symbol:prompt.symbol,
  stance:prompt.role==='bull'?'SUPPORT':'CAUTION',
  summary:prompt.role==='bull'?'관측된 수급과 거래량이 강하지만 확정적인 상승 신호는 아닙니다.':
   prompt.role==='bear'?'변동성과 추격 위험에 대한 반론이 있으며 급등을 보장하지 않습니다.':
    '상승과 하락 근거가 엇갈려 추가 확인이 필요하며 매매를 승인하지 않습니다.',
  evidenceFields:['oiChangePct','takerRatio'],missingChecks:['장기 지지 검증']};
 return{ok:true,status:200,json:async()=>({modelVersion:'gemini-test-role',candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]})};
};
const gateway=createPulseAIGateway({apiKey:'secret-test-key',model:'test-model',fetchImpl:mockFetch});
const roleService=createRoleDebateService({gateway,now:()=>TS});
(async()=>{
 const first=await roleService.debate({context,selectedSymbol:'AAAUSDT'});
 assert.equal(first.status,'READY',JSON.stringify(first));
 assert.equal(first.modelCalls,3);
 assert.equal(first.disposition,'REVIEW_RISK');
 assert.equal(first.roles.length,3);
 assert.deepEqual(requests.map(r=>r.role),['bull','bear','risk']);
 assert.equal(requests[0].previous.length,0);
 assert.equal(requests[1].previous.length,1);
 assert.equal(requests[2].previous.length,2,'risk reviewer sees both debates');
 assert(requests[2].body.system_instruction.parts[0].text.includes('final risk reviewer'));
 assert.equal(first.independentLLMAgents,false);
 assert.equal(first.permission,'READ_ONLY_NO_ORDER_NO_RANK_PROMOTION');
 assert(!JSON.stringify(first).includes('secret-test-key'));
 assert.equal(first.sourceAsOf,scan.updatedAt);
 assert.equal(first.roles[0].evidenceFields[0],'oiChangePct');
 assert.equal(JSON.stringify(context),original,'never mutate scanner context');
 const cached=await roleService.debate({context,selectedSymbol:'AAAUSDT'});
 assert.equal(cached.status,'CACHED');assert.equal(cached.modelCalls,0);
 assert.equal(requests.length,3,'cache must cost zero extra calls');
 const newScan=JSON.parse(JSON.stringify(scan));newScan.updatedAt=scan.updatedAt+3000;
 const newer=buildContext(newScan,{events:[],sectorClusters:[]},{selectedSymbol:'AAAUSDT'});
 const blockedCooldown=await roleService.debate({context:newer,selectedSymbol:'AAAUSDT'});
 assert.equal(blockedCooldown.status,'COOLDOWN');assert.equal(requests.length,3);
 const degraded=JSON.parse(JSON.stringify(scan));degraded.updatedAt=TS-300001;
 const noStale=await roleService.debate({context:buildContext(degraded,{events:[]},{selectedSymbol:'AAAUSDT'}),selectedSymbol:'AAAUSDT'});
 assert.equal(noStale.status,'BLOCKED');assert.equal(requests.length,3);
 const gap=JSON.parse(JSON.stringify(scan));gap.items[0].oiChangePct=null;
 const noOi=await roleService.debate({context:buildContext(gap,{events:[]},{selectedSymbol:'AAAUSDT'}),selectedSymbol:'AAAUSDT'});
 assert.equal(noOi.status,'BLOCKED');assert.equal(requests.length,3);
 const hot=await roleService.debate({context:buildContext(scan,{events:[]},{selectedSymbol:'HOTUSDT'}),selectedSymbol:'HOTUSDT'});
 assert.equal(hot.status,'BLOCKED');assert.equal(requests.length,3);
 assert.equal(approveAnswer({role:'bull',symbol:'AAAUSDT',stance:'SUPPORT',
   summary:'없는 미래 지표를 근거로 상승 확정입니다.',evidenceFields:['futureProfitPct']},'bull','AAAUSDT',new Set(['oiChangePct'])),null);
 assert.equal(approveAnswer({role:'bull',symbol:'AAAUSDT',stance:'SUPPORT',
   summary:'무조건 200% 오릅니다. 보장',evidenceFields:['oiChangePct']},'bull','AAAUSDT',new Set(['oiChangePct'])),null);
 // Exhaustively simulate partial failure; never show two preliminary opinions as completed review.
 let partialCalls=0;
 const partial=createRoleDebateService({gateway:{available:true,model:'mock',
   async reviewRole({role}){partialCalls++;if(role==='risk')throw Error('429 rate limit');
    return{role,symbol:'AAAUSDT',stance:'NEUTRAL',summary:'근거는 일부 존재하지만 결론을 유보해야 합니다.',
    evidenceFields:['oiChangePct']};}},now:()=>TS});
 const incomplete=await partial.debate({context,selectedSymbol:'AAAUSDT'});
 assert.equal(incomplete.status,'FAILED');assert.equal(incomplete.roles,undefined);
 assert.equal(incomplete.modelCalls,0);
 assert.equal(partialCalls,3);
 const repeat=await partial.debate({context,selectedSymbol:'AAAUSDT'});
 assert.equal(repeat.status,'COOLDOWN','failure cannot return false success');
 assert.equal(partialCalls,3);
 // Concurrent requests for the same symbol cannot race and trigger duplicate API cost.
 let resolveGate;const gate=new Promise(resolve=>{resolveGate=resolve});let concurrentCalls=0;
 const concur=createRoleDebateService({gateway:{available:true,model:'mock',async reviewRole({role}){
  concurrentCalls++;if(role==='bull')await gate;
  return{role,symbol:'AAAUSDT',stance:'NEUTRAL',summary:'추가 관측 없이 투자 결론은 확정할 수 없습니다.',evidenceFields:['oiChangePct']};
 }},now:()=>TS});
 const pending=concur.debate({context,selectedSymbol:'AAAUSDT'});
 const second=await concur.debate({context,selectedSymbol:'AAAUSDT'});
 assert.equal(second.status,'IN_PROGRESS');
 resolveGate();assert.equal((await pending).status,'READY');assert.equal(concurrentCalls,3);
 const svc=createBriefingService({scanService:{run:async()=>JSON.parse(JSON.stringify(scan))},
  gateway,roleDebate:roleService,now:()=>TS,cacheMs:0});
 const brief=await svc.getBrief({selectedSymbol:'AAAUSDT'});
 assert.equal(brief.roleDebate.available,true);
 assert.equal(requests.length,3,'ordinary brief never triggers LLM roles');
 const plain=await svc.chat({question:'다각도 찬반 근거?',selectedSymbol:'AAAUSDT'});
 assert.equal(plain.answerMode,'role-review','default chat remains cheap deterministic');
 assert.equal(requests.length,3);
 const requested=await svc.chat({question:'AI 3역할 심의 실행',selectedSymbol:'AAAUSDT',llmRoles:true});
 assert.equal(requested.answerMode,'ai-role-debate');
 assert.equal(requested.llmDebate.status,'CACHED');
 assert(requested.answer.includes('위험 심의'));
 assert.equal(requests.length,3);
 function resBox(){let status=0,response=null;return{setHeader(){},
   status(s){status=s;return this},json(obj){response=obj;return obj},
   get body(){return response},get code(){return status}}}
 const res=resBox();
 await handler({method:'POST',query:{mode:'chat'},body:{question:'AI 심의',selectedSymbol:'AAAUSDT',llmRoles:true}},res,{service:svc});
 assert.equal(res.code,200);
 assert.equal(res.body.answerMode,'ai-role-debate');
 assert.equal(res.body.llmDebate.independentLLMAgents,false);
 const ui=fs.readFileSync(path.join(__dirname,'../ui/pulse-ai.js'),'utf8');
 assert(ui.includes('function runRoleDebate(')&&ui.includes('llmRoles:true')&&ui.includes('textContent'));
 assert(fs.readFileSync(path.join(__dirname,'../pulse-ai.html'),'utf8').includes('id="reviewPanel"'));
 console.log('Gemini 3 independent role requests, schema grounding, OI/heat/stale gates, cooldown, failed/duplicate fallback, API/UI opt-in PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
