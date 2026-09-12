function evenPick(arr,n){
  if(n<=0||!arr.length)return[];
  if(arr.length<=n)return [...arr];
  const out=[];
  for(let i=0;i<n;i++)out.push(arr[Math.round(i*(arr.length-1)/Math.max(1,n-1))]);
  return [...new Map(out.map(x=>[x.symbol,x])).values()];
}
function stratifiedSample(rows,n){
  const pass=[...rows].filter(r=>r.pass&&Number.isFinite(+r.preTopPct)).sort((a,b)=>(a.preTopPct-b.preTopPct)||a.symbol.localeCompare(b.symbol));
  const defs=[
    {key:'TOP_10',label:'상위 10%',test:r=>r.preTopPct<=10,weight:1/3},
    {key:'P10_30',label:'10~30%',test:r=>r.preTopPct>10&&r.preTopPct<=30,weight:1/4},
    {key:'P30_60',label:'30~60%',test:r=>r.preTopPct>30&&r.preTopPct<=60,weight:1/4},
    {key:'BOTTOM_40',label:'하위 40%',test:r=>r.preTopPct>60,weight:1/6}
  ];
  const selected=[];
  const used=new Set();
  defs.forEach((d,idx)=>{
    const group=pass.filter(d.test);
    const target=idx===defs.length-1?Math.max(0,n-selected.length):Math.round(n*d.weight);
    evenPick(group,target).forEach(r=>{if(!used.has(r.symbol)){selected.push({...r,stratum:d.key,stratumLabel:d.label});used.add(r.symbol)}});
  });
  if(selected.length<n){
    evenPick(pass.filter(r=>!used.has(r.symbol)),n-selected.length).forEach(r=>{
      let d=defs.find(x=>x.test(r))||defs[defs.length-1];
      selected.push({...r,stratum:d.key,stratumLabel:d.label});used.add(r.symbol);
    });
  }
  return selected.slice(0,n).sort((a,b)=>a.preRank-b.preRank);
}
function marketOrigin(req){
  const proto=(req.headers['x-forwarded-proto']||'https').split(',')[0];
  const host=req.headers['x-forwarded-host']||req.headers.host;
  if(!host)throw new Error('Host unavailable');
  return `${proto}://${host}`;
}
async function getMarket(origin){
  const mr=await fetch(`${origin}/api/market?minVolume=500000`,{headers:{'User-Agent':'PulseRadar-Pro/3.8-diagnostics'}});
  const market=await mr.json();
  if(!mr.ok||!market.ok)throw new Error(market.error||`Market HTTP ${mr.status}`);
  return market;
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    const origin=marketOrigin(req);
    const total=Math.max(20,Math.min(100,Number(req.query.total||60)));
    const planMode=String(req.query.plan||'')==='1';
    const symbolsRaw=String(req.query.symbols||'').trim();
    const market=await getMarket(origin);
    if(planMode||!symbolsRaw){
      const selected=stratifiedSample(market.results||[],total);
      const counts={};selected.forEach(x=>counts[x.stratumLabel]=(counts[x.stratumLabel]||0)+1);
      return res.status(200).json({
        ok:true,version:'3.8',updatedAt:new Date().toISOString(),lite:market.liteDiagnostics||null,
        meta:{requestedTotal:total,selectedTotal:selected.length,strata:counts},
        plan:selected.map(r=>({symbol:r.symbol,lite:r.preScore,rank:r.preRank,topPct:r.preTopPct,surgeLite:r.surgeScore,stratum:r.stratum,stratumLabel:r.stratumLabel}))
      });
    }
    const symbols=[...new Set(symbolsRaw.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean))].slice(0,12);
    const bySymbol=new Map((market.results||[]).map(r=>[r.symbol,r]));
    const details=await Promise.all(symbols.map(async symbol=>{
      const r=bySymbol.get(symbol);
      if(!r)return{symbol,ok:false,error:'Market row unavailable'};
      try{
        const dr=await fetch(`${origin}/api/detail?symbol=${encodeURIComponent(symbol)}`,{headers:{'User-Agent':'PulseRadar-Pro/3.8-diagnostics'}});
        const d=await dr.json();
        if(!dr.ok||!d.ok)throw new Error(d.error||`HTTP ${dr.status}`);
        return{symbol,lite:r.preScore,rank:r.preRank,topPct:r.preTopPct,full:Number(d.preSurge?.score),surgeLite:r.surgeScore,surgeFull:Number(d.surge?.score),ok:true};
      }catch(e){return{symbol,lite:r.preScore,rank:r.preRank,topPct:r.preTopPct,ok:false,error:e.message}}
    }));
    res.status(200).json({ok:true,version:'3.8',updatedAt:new Date().toISOString(),batch:details});
  }catch(e){res.status(502).json({ok:false,error:e?.message||'Diagnostics failed'})}
}
