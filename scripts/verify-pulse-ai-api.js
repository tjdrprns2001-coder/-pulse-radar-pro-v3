'use strict';
const assert=require('assert');
const {createBriefingService}=require('../lib/pulse-ai/briefing-service.js');
const handler=require('../api/pulse-ai.js');

const scan={status:'ok',updatedAt:1,scanCount:2,partial:false,dataHealth:{live:2,delayed:0,blocked:0,errors:0},marketBreadth:{count:2,up:1,down:1,flat:0,median:.2,majors:{BTC:.1,ETH:-.1,SOL:.3}},candidateSymbols:['AAAUSDT'],items:[
 {symbol:'AAAUSDT',category:'급등 전조 관찰',sector:'AI',candidateScore:60,preIgnitionScore:45,dataState:'live',futuresListed:true,priceChange24h:2,quoteVolume24h:20e6,reasons:['r'],scanClass:{key:'PATTERN-SETUP',label:'패턴 셋업'}},
 {symbol:'BBBUSDT',category:'이미 급등함',sector:'AI',candidateScore:90,preIgnitionScore:80,dataState:'live',futuresListed:true,priceChange24h:25,quoteVolume24h:40e6,reasons:['r2']}
]};
const researchStatus={version:'RESEARCH_AI_v2',shadowOnly:true,observations:5,pending:5,labels:0,positive:0,negative:0,model:{state:'SHADOW',active:false,minimumLabels:20}};

function resBox(){
  let code=0,body=null,headers={};
  return{
    get code(){return code},get body(){return body},get headers(){return headers},
    setHeader(k,v){headers[k]=v},status(n){code=n;return this},json(v){body=v;return v}
  };
}
(async()=>{
  let scanCalls=0,aiCalls=0;
  const scanService={async run(){scanCalls++;return JSON.parse(JSON.stringify(scan))}};
  const gateway={available:false,provider:'gemini',model:'gemini-test',async brief(){aiCalls++;throw new Error('must not call')},async chat(){throw new Error('must not call')}};
  const researchAI={hydrateRemote:async()=>true,status:()=>researchStatus};
  const service=createBriefingService({scanService,gateway,researchAI,now:()=>10000,cacheMs:30000});

  const b1=await service.getBrief({selectedSymbol:'AAAUSDT'});
  assert.equal(b1.status,'ok');assert.equal(b1.aiAvailable,false);assert.equal(aiCalls,0);assert.equal(b1.selectedFocus.symbol,'AAAUSDT');
  const b2=await service.getBrief({selectedSymbol:'AAAUSDT'});assert.equal(b2.status,'ok');assert.equal(scanCalls,1,'brief cache should suppress duplicate scanner work inside cache window');

  let res=resBox();
  await handler({method:'GET',query:{mode:'brief',symbol:'AAAUSDT'}},res,{service});
  assert.equal(res.code,200);assert.equal(res.body.status,'ok');assert.equal(res.body.selectedFocus.symbol,'AAAUSDT');

  res=resBox();await handler({method:'GET',query:{mode:'health'}},res,{service});
  assert.equal(res.code,200);assert.equal(res.body.status,'ok');assert.equal(res.body.researchAI.model.state,'SHADOW');

  res=resBox();await handler({method:'POST',query:{mode:'chat'},body:{question:'AAA 지금 어때?',selectedSymbol:'AAAUSDT'}},res,{service});
  assert.equal(res.code,200);assert.equal(res.body.answerMode,'deterministic');assert(res.body.answer.includes('AAAUSDT'));

  res=resBox();await handler({method:'POST',query:{mode:'chat'},body:{question:''}},res,{service});assert.equal(res.code,400);
  res=resBox();await handler({method:'POST',query:{mode:'chat'},body:{question:'x'.repeat(1001)}},res,{service});assert.equal(res.code,400);
  res=resBox();await handler({method:'DELETE',query:{mode:'brief'}},res,{service});assert.equal(res.code,405);

  console.log('pulse ai api PASS');
})().catch(e=>{console.error(e);process.exit(1)});
