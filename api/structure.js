const spot=require('../lib/spot-structure.js');
const futures=require('../lib/futures-data.js');
function capture(){let code=200,body=null;return{res:{setHeader(){},status(c){code=c;return this},json(v){body=v;return this}},get:()=>({code,body})}}
async function runSpot(req){const c=capture();try{await spot(req,c.res)}catch(e){return{code:500,body:{ok:false,error:e?.message||String(e)}}}return c.get()}
module.exports=async function handler(req,res){res.setHeader('Cache-Control','s-maxage=15, stale-while-revalidate=30');try{const s=await runSpot(req);if(s.code<400&&s.body?.ok)return res.status(200).json({...s.body,market:'spot'});const symbol=String(req.query.symbol||'BTCUSDT').toUpperCase(),interval=String(req.query.interval||'1h'),limit=Number(req.query.limit)||500;const f=await futures.structure(symbol,interval,limit);return res.status(200).json(f)}catch(e){return res.status(502).json({ok:false,error:e?.message||'Structure fetch failed'})}}
