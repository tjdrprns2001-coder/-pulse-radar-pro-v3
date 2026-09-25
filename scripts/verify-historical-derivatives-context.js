'use strict';
const assert=require('assert');
const {createCryptoResearchDataEngine}=require('../lib/research-backtest-v2/crypto-data-engine.js');

const H=3600000,Q=900000,START=Date.UTC(2026,0,1);
const oi=[];for(let i=0;i<40;i++)oi.push({symbol:'AAAUSDT',sumOpenInterest:String(1000+i*10),sumOpenInterestValue:String(100000+i*1000),timestamp:START+i*H});
const taker1=[];for(let i=0;i<40;i++)taker1.push({buySellRatio:String(1+i*.001),buyVol:String(100+i),sellVol:'100',timestamp:START+i*H});
const taker15=[];for(let i=0;i<160;i++)taker15.push({buySellRatio:'1.05',buyVol:'105',sellVol:'100',timestamp:START+i*Q});
const funding=[];for(let i=0;i<8;i++)funding.push({symbol:'AAAUSDT',fundingRate:'0.0001',fundingTime:START+i*8*H});
const spot=[];for(let i=0;i<160;i++){const ot=START+i*Q,ct=ot+Q-1,p=100+i*.01;spot.push([ot,String(p),String(p+1),String(p-1),String(p+.2),'100',ct,String((p+.2)*100)])}

function select(rows,u,timeField){
  const st=Number(u.searchParams.get('startTime')||-Infinity),et=Number(u.searchParams.get('endTime')||Infinity),limit=Number(u.searchParams.get('limit')||500);
  return rows.filter(x=>{const t=Number(x?.[timeField]);return t>=st&&t<=et}).slice(-limit);
}
const fetchImpl=async url=>{
  const u=new URL(url),p=u.pathname;
  let data=[];
  if(p.endsWith('/openInterestHist'))data=select(oi,u,'timestamp');
  else if(p.endsWith('/takerlongshortRatio'))data=u.searchParams.get('period')==='1h'?select(taker1,u,'timestamp'):select(taker15,u,'timestamp');
  else if(p.endsWith('/fundingRate'))data=select(funding,u,'fundingTime');
  else if(p.endsWith('/klines')){
    const et=Number(u.searchParams.get('endTime')||Infinity),limit=Number(u.searchParams.get('limit')||1500);
    data=spot.filter(x=>x[6]<=et).slice(-limit);
  }else if(p.endsWith('/exchangeInfo'))data={symbols:[]};
  return{ok:true,status:200,json:async()=>data};
};

(async()=>{
  const engine=createCryptoResearchDataEngine({fetchImpl,marketType:'perpetual'});
  const start=START+24*H,end=START+30*H;
  const out=await engine.buildHistoricalContextTimeline('AAAUSDT',{startTime:start,endTime:end,stepMs:Q,warmupHours:24});
  assert(out.timeline.length>10);
  assert(out.coverage.oiRows>20);
  assert(out.coverage.taker15mRows>50);
  assert.equal(out.coverage.executionHistorical,false);

  const first=out.timeline[0],last=out.timeline.at(-1);
  assert.equal(first.availableAt,start);
  assert(last.availableAt<=end);
  assert(first.derivativesProfile.oi4hPct!=null);
  assert(first.derivativesProfile.taker15m.length<=20);
  assert(first.derivativesProfile.taker1h.length<=12);
  assert.equal(first.derivativesProfile.fundingRate,0.01);
  assert(first.spot15m.every(r=>r[6]<=first.availableAt));
  assert.equal(first.historicalCoverage.execution,false);

  for(const row of out.timeline){
    assert(row.derivativesProfile.taker15m.every(x=>x.timestamp<=row.availableAt));
    assert(row.derivativesProfile.taker1h.every(x=>x.timestamp<=row.availableAt));
    assert(row.spot15m.every(x=>x[6]<=row.availableAt));
  }

  const oiRange=await engine.getHistoricalOiRange('AAAUSDT',{period:'1h',startTime:START+5*H,endTime:START+25*H,pageSize:5});
  assert(oiRange.pages>=4);
  assert(oiRange.rows.every(x=>x.timestamp>=START+5*H&&x.timestamp<=START+25*H));

  console.log('historical derivatives context verification passed');
})().catch(e=>{console.error(e);process.exit(1)});
