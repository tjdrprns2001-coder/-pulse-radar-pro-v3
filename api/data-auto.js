const spotMarket=require('./market.js');
const spotStructure=require('./structure.js');
const spotDetail=require('./detail.js');
const futures=require('../lib/futures-data.js');
function capture(){let code=200,body=null,headers={};return{res:{setHeader:(k,v)=>headers[k]=v,status(c){code=c;return this},json(v){body=v;return this}},get:()=>({code,body,headers})}}
async function runHandler(fn,req){const c=capture();try{await fn(req,c.res)}catch(e){return{code:500,body:{ok:false,error:e?.message||String(e)}}}return c.get()}
module.exports=async function handler(req,res){res.setHeader('Cache-Control','s-maxage=15, stale-while-revalidate=30');const mode=String(req.query.mode||'market');try{
 if(mode==='market'){
  const min=Number(req.query.minVolume)||500000;
  const [s,f]=await Promise.all([runHandler(spotMarket,req),futures.market(min).catch(e=>({ok:false,error:e.message}))]);
  const sr=s.body?.ok?(s.body.results||[]).map(x=>({...x,market:'spot'})):[];
  const spotSymbols=new Set(sr.map(x=>x.symbol));
  const fr=f?.ok?(f.results||[]).filter(x=>!spotSymbols.has(x.symbol)):[];
  const rows=[...sr,...fr];
  rows.sort((a,b)=>Math.max(Number(b.surgeScore)||0,Number(b.preScore)||0)-Math.max(Number(a.surgeScore)||0,Number(a.preScore)||0)||Number(b.quoteVol24||0)-Number(a.quoteVol24||0));
  const eligible=rows.filter(x=>x.pass).length;
  return res.status(200).json({ok:true,version:'spot+futures-auto-v1',market:'spot+futures',updatedAt:new Date().toISOString(),total:rows.length,eligible,results:rows,spotCount:sr.length,futuresOnlyCount:fr.length,note:'현물 우선, 현물에 없는 USD-M 무기한 선물 종목 추가'});
 }
 if(mode==='structure'){
  const s=await runHandler(spotStructure,req);
  if(s.code<400&&s.body?.ok)return res.status(200).json({...s.body,market:'spot'});
  const symbol=String(req.query.symbol||'BTCUSDT').toUpperCase(),interval=String(req.query.interval||'1h'),limit=Number(req.query.limit)||500;
  const f=await futures.structure(symbol,interval,limit);
  return res.status(200).json(f);
 }
 if(mode==='detail'){
  const s=await runHandler(spotDetail,req);
  if(s.code<400&&s.body?.ok)return res.status(200).json({...s.body,market:'spot'});
  const f=await futures.detail(String(req.query.symbol||'BTCUSDT').toUpperCase());
  return res.status(200).json(f);
 }
 return res.status(400).json({ok:false,error:'지원하지 않는 mode'});
}catch(e){return res.status(502).json({ok:false,error:e?.message||'Data fetch failed'})}}
