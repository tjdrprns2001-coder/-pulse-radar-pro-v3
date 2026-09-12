function mean(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
function pearson(xs,ys){if(xs.length<2||xs.length!==ys.length)return null;const mx=mean(xs),my=mean(ys);let num=0,dx=0,dy=0;for(let i=0;i<xs.length;i++){const a=xs[i]-mx,b=ys[i]-my;num+=a*b;dx+=a*a;dy+=b*b}return dx&&dy?num/Math.sqrt(dx*dy):null}
function sampleAcross(rows,n){const x=[...rows].filter(r=>r.pass).sort((a,b)=>a.preScore-b.preScore||a.symbol.localeCompare(b.symbol));if(!x.length)return[];if(x.length<=n)return x;const out=[];for(let i=0;i<n;i++)out.push(x[Math.round(i*(x.length-1)/(n-1))]);return[...new Map(out.map(r=>[r.symbol,r])).values()]}
function summarize(pairs){const lite=pairs.map(x=>x.lite),full=pairs.map(x=>x.full),abs=pairs.map(x=>Math.abs(x.lite-x.full));const hi80=pairs.filter(x=>x.lite>=80),hi90=pairs.filter(x=>x.lite>=90);return{n:pairs.length,correlation:pearson(lite,full),mae:mean(abs),meanLite:mean(lite),meanFull:mean(full),lite80ToFull60:{n:hi80.length,rate:hi80.length?hi80.filter(x=>x.full>=60).length/hi80.length*100:null},lite90ToFull70:{n:hi90.length,rate:hi90.length?hi90.filter(x=>x.full>=70).length/hi90.length*100:null}}}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=30, stale-while-revalidate=60');
  try{
    const total=Math.max(10,Math.min(100,Number(req.query.total||60)));
    const batchSize=Math.max(5,Math.min(12,Number(req.query.batchSize||10)));
    const offset=Math.max(0,Math.min(total-1,Number(req.query.offset||0)));
    const proto=(req.headers['x-forwarded-proto']||'https').split(',')[0];
    const host=req.headers['x-forwarded-host']||req.headers.host;
    if(!host)throw new Error('Host unavailable');
    const origin=`${proto}://${host}`;
    const mr=await fetch(`${origin}/api/market?minVolume=500000`,{headers:{'User-Agent':'PulseRadar-Pro/3.7-diagnostics'}});
    const market=await mr.json();
    if(!mr.ok||!market.ok)throw new Error(market.error||`Market HTTP ${mr.status}`);
    const selected=sampleAcross(market.results||[],total);
    const batch=selected.slice(offset,Math.min(selected.length,offset+batchSize));
    const details=await Promise.all(batch.map(async r=>{
      try{
        const dr=await fetch(`${origin}/api/detail?symbol=${encodeURIComponent(r.symbol)}`,{headers:{'User-Agent':'PulseRadar-Pro/3.7-diagnostics'}});
        const d=await dr.json();
        if(!dr.ok||!d.ok)throw new Error(d.error||`HTTP ${dr.status}`);
        return{symbol:r.symbol,lite:r.preScore,rank:r.preRank,topPct:r.preTopPct,full:Number(d.preSurge?.score),surgeLite:r.surgeScore,surgeFull:Number(d.surge?.score),ok:true};
      }catch(e){return{symbol:r.symbol,lite:r.preScore,rank:r.preRank,topPct:r.preTopPct,ok:false,error:e.message}}
    }));
    const pairs=details.filter(x=>x.ok&&Number.isFinite(x.full));
    res.status(200).json({ok:true,version:'3.7',updatedAt:new Date().toISOString(),lite:market.liteDiagnostics||null,meta:{requestedTotal:total,selectedTotal:selected.length,offset,batchSize,nextOffset:offset+batch.length<selected.length?offset+batch.length:null},batch:details,compareBatch:summarize(pairs)});
  }catch(e){res.status(502).json({ok:false,error:e?.message||'Diagnostics failed'})}
}
