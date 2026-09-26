'use strict';

const SimpleTrading=require('../../ui/simple-trading/simple-trading-engine.js');
const ForexBook=require('../../ui/forex-book/forex-book-engine.js');
const BookConfluence=require('../../ui/book-confluence/book-confluence-engine.js');
const Smc=require('../../ui/chart/smc-engine.js');
const Ict=require('../../ui/chart/ict-context-engine.js');

const TF_ORDER=Object.freeze(['1w','1d','4h','1h','15m']);
const TF_WEIGHT=Object.freeze({'1w':5,'1d':5,'4h':4,'1h':3,'15m':1});
const SOURCE='기술적 차트 분석 + 코린이 입문서 + Forex Book + Simple Trading Book + SMC/ICT';

function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,Number.isFinite(Number(v))?Number(v):0))}
function last(a){return Array.isArray(a)&&a.length?a[a.length-1]:null}
function normDir(v){const s=String(v||'').toLowerCase();if(/bull|long|up|상승/.test(s))return 1;if(/bear|short|down|하락/.test(s))return-1;return 0}
function dirLabel(n){return n>0?'상승':n<0?'하락':'중립'}
function toCandles(rows,{completed=true}={}){
  const src=(Array.isArray(rows)?rows:[]).filter(Array.isArray);
  const a=completed&&src.length>1?src.slice(0,-1):src;
  return a.map((k,index)=>({index,time:finite(k[0])??index,open:finite(k[1]),high:finite(k[2]),low:finite(k[3]),close:finite(k[4]),volume:finite(k[5])??0}))
    .filter(x=>[x.open,x.high,x.low,x.close].every(Number.isFinite));
}
function latestDirFromSmc(smc){
  const pool=[];
  for(const [kind,rows] of [['MSS',smc?.mss],['DISPLACEMENT',smc?.displacements],['SWEEP',smc?.sweeps]]){
    for(const x of Array.isArray(rows)?rows:[])pool.push({kind,index:Number(x.index)||0,dir:normDir(x.dir),raw:x});
  }
  pool.sort((a,b)=>a.index-b.index);
  return last(pool)||null;
}
function compactSmc(smc4,smc1){
  const mss=last(smc1?.mss||[]),sweep=last(smc1?.sweeps||[]),disp=last(smc1?.displacements||[]),htf=latestDirFromSmc(smc4);
  let net=0;const reasons=[];
  if(mss){const d=normDir(mss.dir);net+=d*28;reasons.push('1H MSS '+dirLabel(d))}
  if(sweep){const d=normDir(sweep.dir);net+=d*18;reasons.push('1H liquidity sweep '+dirLabel(d))}
  if(disp){const d=normDir(disp.dir);net+=d*18;reasons.push('1H displacement '+dirLabel(d))}
  if(htf?.dir){net+=htf.dir*22;reasons.push('4H smart-money '+dirLabel(htf.dir))}
  const activeBull=[...(smc1?.fvgs||[]),...(smc1?.orderBlocks||[])].filter(x=>x.state!=='violated'&&x.state!=='expired'&&normDir(x.dir)>0).length;
  const activeBear=[...(smc1?.fvgs||[]),...(smc1?.orderBlocks||[])].filter(x=>x.state!=='violated'&&x.state!=='expired'&&normDir(x.dir)<0).length;
  net+=Math.min(12,activeBull*3)-Math.min(12,activeBear*3);
  const bias=net>=12?'상승':net<=-12?'하락':'중립';
  const score=Math.round(clamp(50+Math.abs(net)*.55));
  return{available:Boolean(smc1),bias,score,net,mss:mss?{dir:mss.dir,index:mss.index,quality:mss.quality}:null,sweep:sweep?{dir:sweep.dir,index:sweep.index,side:sweep.side}:null,displacement:disp?{dir:disp.dir,index:disp.index,quality:disp.quality}:null,activeFvg:(smc1?.fvgs||[]).filter(x=>!['violated','expired'].includes(x.state)).length,activeOb:(smc1?.orderBlocks||[]).filter(x=>!['violated','expired'].includes(x.state)).length,reasons:reasons.slice(0,5)};
}
function compactIct(ict){
  const seq=last(ict?.sequences||[]),d=normDir(seq?.direction||seq?.bias||ict?.htf?.bias);
  const state=String(seq?.state||'none');
  let score=35;if(seq)score+=15;if(state==='forming')score+=10;if(state==='completed')score+=25;if(state==='invalidated')score-=20;
  const pd=(ict?.pdArrays||[]).filter(x=>!['violated','expired'].includes(String(x.state||''))).length;
  score+=Math.min(15,pd*3);
  return{available:Boolean(ict),bias:dirLabel(d),score:Math.round(clamp(score)),state,sequence:seq?{state:seq.state,direction:seq.direction||seq.bias||null,events:Array.isArray(seq.events)?seq.events.map(x=>x.type).slice(-6):[]}:null,pdArrayCount:pd,narrative:ict?.narrative?.text||null};
}
function analyzeBookTf(candles,{smc=null,ictContext=null}={}){
  if(!candles.length)return{available:false};
  const classic=SimpleTrading.analyze({candles});
  const forexBook=ForexBook.analyze({candles,smc,ictContext});
  const bookConfluence=BookConfluence.analyze({candles,forexBook,classic});
  const sc=bookConfluence?.scenario||{};
  return{available:Boolean(bookConfluence?.available),score:finite(sc.score),bias:sc.bias||'중립',state:sc.state||'관찰',regime:bookConfluence?.regime?.state||'UNKNOWN',ma:bookConfluence?.ma?.state||'N/A',volume:bookConfluence?.volume?.state||'N/A',zoneCount:Number(bookConfluence?.zones?.[0]?.count)||0,trendlineState:bookConfluence?.trendline?.best?.state||null,reasons:Array.isArray(sc.reasons)?sc.reasons.slice(0,4):[],risks:Array.isArray(sc.risks)?sc.risks.slice(0,3):[],nextChecks:Array.isArray(sc.nextChecks)?sc.nextChecks.slice(0,3):[],classic:classic?.best?{label:classic.best.label,side:classic.best.side,status:classic.best.status}:null,forex:forexBook?.confluence?{bias:forexBook.confluence.bias,score:forexBook.confluence.score}:null};
}
function aggregateBook(tf){
  let signed=0,weight=0,scoreSum=0,scoreWeight=0;const reasons=[],risks=[],htf=[];
  for(const key of TF_ORDER){
    const x=tf[key];if(!x?.available)continue;const w=TF_WEIGHT[key]||1,s=finite(x.score)??35,d=normDir(x.bias);
    signed+=d*w*(s/100);weight+=w;scoreSum+=s*w;scoreWeight+=w;
    if(['1w','1d','4h'].includes(key))htf.push(d);
    if(x.reasons?.[0])reasons.push(key.toUpperCase()+' '+x.reasons[0]);
    if(x.risks?.[0])risks.push(key.toUpperCase()+' '+x.risks[0]);
  }
  const strength=weight?Math.abs(signed)/weight:0,bias=signed>0.09?'상승':signed<-0.09?'하락':'중립';
  const htfBull=htf.filter(x=>x>0).length,htfBear=htf.filter(x=>x<0).length;
  const htfAligned=htfBull>=2&&htfBear===0?'상승':htfBear>=2&&htfBull===0?'하락':'혼조';
  let score=scoreWeight?scoreSum/scoreWeight:0;score+=Math.min(12,strength*30);if(htfAligned===bias&&bias!=='중립')score+=8;
  const one=tf['1h']||{},four=tf['4h']||{};
  return{available:scoreWeight>0,bias,score:Math.round(clamp(score)),state:one.state||four.state||'관찰',htfAligned,zoneCount:Number(one.zoneCount)||0,trendlineState:one.trendlineState||four.trendlineState||null,reasons:reasons.slice(0,6),risks:risks.slice(0,5),timeframes:Object.fromEntries(TF_ORDER.map(k=>[k,tf[k]?.available?{bias:tf[k].bias,score:tf[k].score,state:tf[k].state,regime:tf[k].regime,zoneCount:tf[k].zoneCount}:null]))};
}
function buildSmartMoney(smc,ict,book){
  let net=0;const reasons=[];
  if(smc?.bias==='상승'){net+=30;reasons.push('SMC 상승 근거')}else if(smc?.bias==='하락'){net-=30;reasons.push('SMC 하락 근거')}
  if(ict?.bias==='상승'){net+=24;reasons.push('ICT 상승 시퀀스')}else if(ict?.bias==='하락'){net-=24;reasons.push('ICT 하락 시퀀스')}
  if(ict?.state==='completed')net+=Math.sign(net||1)*8;
  if(book?.bias==='상승'&&book?.htfAligned==='상승'){net+=18;reasons.push('책 합성 HTF 상승 정렬')}else if(book?.bias==='하락'&&book?.htfAligned==='하락'){net-=18;reasons.push('책 합성 HTF 하락 정렬')}
  const bias=net>=18?'상승':net<=-18?'하락':'중립';
  const score=Math.round(clamp(45+Math.abs(net)*.65));
  return{bias,score,aligned:book?.bias!=='중립'&&bias===book.bias,reasons:reasons.slice(0,5)};
}
function analyze(frames={}){
  const candles={};for(const tf of TF_ORDER)candles[tf]=toCandles(frames?.[tf]);
  const c4=candles['4h'],c1=candles['1h'];
  let smc4=null,smc1=null,ict=null;
  try{if(c4.length)smc4=Smc.analyzeSmcV2({candles:c4})}catch{}
  try{if(c1.length){const htf=latestDirFromSmc(smc4);smc1=Smc.analyzeSmcV2({candles:c1,htf:{bias:dirLabel(htf?.dir||0)}})}}catch{}
  try{
    if(smc1&&c1.length){
      const htf=latestDirFromSmc(smc4);
      ict=Ict.buildIctContext({htf:{tf:'4h',bias:dirLabel(htf?.dir||0),swings:smc4?.internalStructure||[]},ltf:{tf:'1h',mss:smc1.mss||[],displacements:smc1.displacements||[],mitigations:[]},smc:smc1,liquidity:{levels:[],sweeps:[],voids:[]},currentIndex:c1.length-1});
    }
  }catch{}
  const smc=compactSmc(smc4,smc1),ictCompact=compactIct(ict),tf={};
  for(const key of TF_ORDER){
    try{tf[key]=analyzeBookTf(candles[key],key==='1h'?{smc:smc1,ictContext:ict}:{})}catch(e){tf[key]={available:false,error:String(e?.message||e)}}
  }
  const book=aggregateBook(tf),smartMoney=buildSmartMoney(smc,ictCompact,book);
  return{available:Boolean(book.available||smc.available||ictCompact.available),version:'1.0.0',source:SOURCE,tf,book,smc,ict:ictCompact,smartMoney,disclaimer:'책 합성·SMC/ICT 점수는 승률이 아니라 근거 완성도이며, 원문에 없는 수치 임계값은 자동화 근사입니다.'};
}

module.exports={TF_ORDER,TF_WEIGHT,SOURCE,toCandles,latestDirFromSmc,compactSmc,compactIct,analyzeBookTf,aggregateBook,buildSmartMoney,analyze};
