'use strict';
const {createBinanceProvider}=require('../lib/coin-scan/binance-provider.js');
const {createScanService}=require('../lib/coin-scan/scan-service.js');
const Assistant=require('../lib/coin-scan/assistant-v2-scanner.js');

let provider=null,service=null;
function getRuntime(){
  if(!provider){provider=createBinanceProvider({});service=createScanService({provider})}
  return{provider,service};
}
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function rangePosition(rows,lookback=60){
  const a=(Array.isArray(rows)?rows:[]).slice(0,-1).slice(-lookback);if(a.length<5)return null;
  const hs=a.map(x=>finite(x?.[2])).filter(Number.isFinite),ls=a.map(x=>finite(x?.[3])).filter(Number.isFinite),c=finite(a.at(-1)?.[4]);
  if(!hs.length||!ls.length||c==null)return null;const hi=Math.max(...hs),lo=Math.min(...ls);return hi>lo?((c-lo)/(hi-lo))*100:null;
}
async function detailFor(p,item){
  const s=item.symbol;
  const [oi,tk1,tk15,w,d]=await Promise.all([
    p.getV2OiProfile(s),p.getV2TakerSeries(s,'1h',8),p.getV2TakerSeries(s,'15m',12),p.getKlines(s,'1w',90),p.getKlines(s,'1d',90)
  ]);
  const buckets=Assistant.bucketizeOi(oi.rows);
  const input={
    symbol:s,price24hPct:finite(item.priceChange24h),price1hPct:finite(item.priceChange1h),
    oi4hPct:finite(oi.oi4hPct),oi8hPct:finite(oi.oi8hPct),oiBuckets:buckets,
    taker1h:tk1.map(x=>finite(x.ratio)).filter(Number.isFinite),taker15m:tk15.map(x=>finite(x.ratio)).filter(Number.isFinite),
    fundingRate:finite(item.fundingRate),range1wPct:rangePosition(w),range1dPct:rangePosition(d)
  };
  const verdict=Assistant.classify(input);
  return{...item,assistant:{...verdict,oiBuckets:buckets,range1wPct:input.range1wPct,range1dPct:input.range1dPct,taker1h:input.taker1h,taker15m:input.taker15m,source:'Binance USDT Futures',fundingPeriod:'N/A'}};
}
module.exports=async function handler(req,res,ctx={}){
  const {provider:p,service:s}=ctx.provider&&ctx.service?{provider:ctx.provider,service:ctx.service}:getRuntime();
  const q=req&&req.query||{},mode=String(q.mode||'summary').toLowerCase(),limit=Math.max(1,Math.min(100,Number(q.limit)||30));
  res.setHeader('Cache-Control','no-store');
  try{
    if(mode==='summary'){
      const base=await s.run({mode:'summary',limit:250});
      const symbols=(base.candidateSymbols||[]).slice(0,limit);
      return res.status(200).json({status:'ok',mode:'summary',scanner:'assistant-v2-research',paramSet:Assistant.PARAM_SET,updatedAt:Date.now(),scanCount:base.scanCount,marketBreadth:base.marketBreadth,candidateSymbols:symbols});
    }
    const symbols=String(q.symbols||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean).slice(0,20);
    const deep=await s.run({mode:'deep',symbols,limit:20});
    const items=[];for(const item of deep.items||[])items.push(await detailFor(p,item));
    items.sort((a,b)=>{const rank={'A · 연속 미결제약정 구축':0,'A-pre · 구축 초입':1,'C 후보 · 정리 후 재구축':2,'NFB · 음펀딩 구축':3,'B 후보 · 흐름 선행':4,'C 후보 · 미결제약정 정리':5,'미완성':9,'미완성(데이터 부족)':10};return(rank[a.assistant?.type]??8)-(rank[b.assistant?.type]??8)});
    return res.status(200).json({status:'ok',mode:'deep',scanner:'assistant-v2-research',paramSet:Assistant.PARAM_SET,updatedAt:Date.now(),items});
  }catch(e){return res.status(502).json({status:'error',error:String(e?.message||e),items:[]})}
};
