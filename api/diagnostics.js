function mean(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
function pearson(xs,ys){if(xs.length<2||xs.length!==ys.length)return null;const mx=mean(xs),my=mean(ys);let num=0,dx=0,dy=0;for(let i=0;i<xs.length;i++){const a=xs[i]-mx,b=ys[i]-my;num+=a*b;dx+=a*a;dy+=b*b}return dx&&dy?num/Math.sqrt(dx*dy):null}
function sampleAcross(rows,n){const x=[...rows].filter(r=>r.pass).sort((a,b)=>a.preScore-b.preScore);if(!x.length)return[];if(x.length<=n)return x;const out=[];for(let i=0;i<n;i++)out.push(x[Math.round(i*(x.length-1)/(n-1))]);return[...new Map(out.map(r=>[r.symbol,r])).values()]}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=120');
  try{
    const sampleSize=Math.max(5,Math.min(20,Number(req.query.sample||12)));
    const proto=(req.headers['x-forwarded-proto']||'https').split(',')[0];
    const host=req.headers['x-forwarded-host']||req.headers.host;
    if(!host)throw new Error('Host unavailable');
    const origin=`${proto}://${host}`;
    const mr=await fetch(`${origin}/api/market?minVolume=500000`,{headers:{'User-Agent':'PulseRadar-Pro/3.6-diagnostics'}});
    const market=await mr.json();
    if(!mr.ok||!market.ok)throw new Error(market.error||`Market HTTP ${mr.status}`);
    const sample=sampleAcross(market.results||[],sampleSize);
    const details=await Promise.all(sample.map(async r=>{
      try{
        const dr=await fetch(`${origin}/api/detail?symbol=${encodeURIComponent(r.symbol)}`,{headers:{'User-Agent':'PulseRadar-Pro/3.6-diagnostics'}});
        const d=await dr.json();
        if(!dr.ok||!d.ok)throw new Error(d.error||`HTTP ${dr.status}`);
        return{symbol:r.symbol,lite:r.preScore,full:Number(d.preSurge?.score),surgeLite:r.surgeScore,surgeFull:Number(d.surge?.score),ok:true};
      }catch(e){return{symbol:r.symbol,lite:r.preScore,ok:false,error:e.message}}
    }));
    const pairs=details.filter(x=>x.ok&&Number.isFinite(x.full));
    const lite=pairs.map(x=>x.lite),full=pairs.map(x=>x.full),abs=pairs.map(x=>Math.abs(x.lite-x.full));
    const hi80=pairs.filter(x=>x.lite>=80),hi90=pairs.filter(x=>x.lite>=90);
    const compare={n:pairs.length,correlation:pearson(lite,full),mae:mean(abs),meanLite:mean(lite),meanFull:mean(full),lite80ToFull60:{n:hi80.length,rate:hi80.length?hi80.filter(x=>x.full>=60).length/hi80.length*100:null},lite90ToFull70:{n:hi90.length,rate:hi90.length?hi90.filter(x=>x.full>=70).length/hi90.length*100:null}};
    res.status(200).json({ok:true,version:'3.6',updatedAt:new Date().toISOString(),lite:market.liteDiagnostics||null,compare,sample:details});
  }catch(e){res.status(502).json({ok:false,error:e?.message||'Diagnostics failed'})}
}
