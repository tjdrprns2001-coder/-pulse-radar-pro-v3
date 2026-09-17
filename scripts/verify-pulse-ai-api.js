const assert=require('assert');
const {createBriefingService}=require('../lib/pulse-ai/briefing-service.js');
const handler=require('../api/pulse-ai.js');
const scan={status:'ok',updatedAt:1,scanCount:2,items:[{symbol:'AAAUSDT',category:'급등 전조 관찰',sector:'AI',candidateScore:60,dataState:'live',reasons:['r']},{symbol:'BBBUSDT',category:'매수세 유입',sector:'AI',candidateScore:30,dataState:'live',reasons:['r2']}]};
(async()=>{
 let scanCalls=0,aiCalls=0;
 const scanService={async run(){scanCalls++;return JSON.parse(JSON.stringify(scan))}};
 const gateway={available:false,async brief(){aiCalls++;throw new Error('must not call')},async chat(){throw new Error('no ai')}};
 const service=createBriefingService({scanService,gateway,now:()=>10000});
 const b1=await service.getBrief();assert.equal(b1.status,'ok');assert.equal(b1.aiAvailable,false);assert.equal(aiCalls,0);assert(b1.summary);
 const b2=await service.getBrief();assert.equal(b2.status,'ok');assert(scanCalls>=1);
 let code=0,body=null;const req={method:'GET',query:{mode:'brief'}};const res={setHeader(){},status(n){code=n;return this},json(v){body=v;return v}};
 await handler(req,res,{service});assert.equal(code,200);assert.equal(body.status,'ok');
 const badReq={method:'POST',query:{mode:'chat'},body:{question:''}};await handler(badReq,res,{service});assert.equal(code,400);
 console.log('pulse ai api PASS');
})().catch(e=>{console.error(e);process.exit(1)});
