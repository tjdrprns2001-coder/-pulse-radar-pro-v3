(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseTfAnalysisEngine=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const SUPPORTED=new Set(['15m','1h','4h','1d']);
const TARGET_PRIORITY={EQL:100,EQH:100,PDL:90,PDH:90,PWL:80,PWH:80,SWING_LOW:70,SWING_HIGH:70,'swing-low':70,'swing-high':70,HTF_LIQUIDITY:60};
function finite(v){return Number.isFinite(Number(v));}
function normBias(v){v=String(v||'').toLowerCase();if(['bearish','down','하락','short'].includes(v))return'bearish';if(['bullish','up','상승','long'].includes(v))return'bullish';return'neutral';}
function future(x,asOf){if(!Number.isInteger(asOf))return false;for(const k of ['barIndex','index','confirmedAt','lastIndex'])if(finite(x?.[k])&&Number(x[k])>asOf)return true;return false;}
function active(x){return x&&x.active!==false&&!['consumed','expired','invalid','invalidated'].includes(String(x.state||'').toLowerCase());}
function src(x){return x?.sourceId||x?.id||null;}
function dedupeIds(a){return Array.from(new Set(a.filter(Boolean).map(String)));}
function buildTfScenario(input={}){
  const tf=SUPPORTED.has(String(input.tf))?String(input.tf):'4h';
  const current=finite(input.currentPrice)?Number(input.currentPrice):finite(input.candles?.at?.(-1)?.close)?Number(input.candles.at(-1).close):null;
  const bias=normBias(input.structure?.bias);
  const asOf=Number.isInteger(input.asOfIndex)?input.asOfIndex:null;
  const sourceIds=[...(input.structure?.sourceIds||[])];
  const zones=(input.smc?.zones||[]).filter(z=>active(z)&&!future(z,asOf)&&finite(z.low)&&finite(z.high));
  const side=bias==='bearish'?'bearish':bias==='bullish'?'bullish':null;
  const zoneCandidates=zones.filter(z=>{
    if(!side||String(z.side||'').toLowerCase()!==side)return false;
    if(!finite(current))return true;
    const mid=(Number(z.low)+Number(z.high))/2;
    return side==='bearish'?mid>=current:mid<=current;
  }).sort((a,b)=>(Number(b.confluenceScore)||0)-(Number(a.confluenceScore)||0)||(finite(current)?Math.abs(((Number(a.low)+Number(a.high))/2)-current)-Math.abs(((Number(b.low)+Number(b.high))/2)-current):0));
  const z=zoneCandidates[0]||null;
  const interestZone=z?{low:Number(z.low),high:Number(z.high),side,type:String(z.type||'zone'),sourceId:src(z)}:null;
  if(interestZone?.sourceId)sourceIds.push(interestZone.sourceId);

  const invs=[...(input.ictContext?.invalidationCandidates||[]),...(input.structure?.invalidationCandidates||[])].filter(x=>x&&x.confirmed!==false&&!future(x,asOf)&&finite(x.price));
  const inv=invs.find(x=>!side||String(x.side||'').toLowerCase()===side)||null;
  const invalidation=inv?{price:Number(inv.price),side:side||String(inv.side||''),kind:String(inv.kind||'structure'),sourceId:src(inv),validation:'close'}:null;
  if(invalidation?.sourceId)sourceIds.push(invalidation.sourceId);

  let levels=(input.liquidity?.levels||[]).filter(l=>active(l)&&!future(l,asOf)&&finite(l.price));
  if(finite(current)&&bias==='bearish')levels=levels.filter(l=>Number(l.price)<current&&(String(l.side||'sell').toLowerCase()==='sell'||/LOW|EQL|PDL|PWL/i.test(String(l.type||''))));
  else if(finite(current)&&bias==='bullish')levels=levels.filter(l=>Number(l.price)>current&&(String(l.side||'buy').toLowerCase()==='buy'||/HIGH|EQH|PDH|PWH/i.test(String(l.type||''))));
  else levels=[];
  levels.sort((a,b)=>(TARGET_PRIORITY[String(b.type||'').toUpperCase()]||TARGET_PRIORITY[String(b.type||'')]||0)-(TARGET_PRIORITY[String(a.type||'').toUpperCase()]||TARGET_PRIORITY[String(a.type||'')]||0)||(finite(current)?Math.abs(Number(a.price)-current)-Math.abs(Number(b.price)-current):0));
  const chosen=[];
  for(const l of levels){const p=Number(l.price);if(chosen.some(x=>Math.abs(Number(x.price)-p)/Math.max(Math.abs(p),1e-12)<=0.0015))continue;chosen.push({price:p,type:String(l.type||'liquidity'),side:String(l.side||''),sourceId:src(l)});if(chosen.length===3)break;}
  chosen.sort((a,b)=>finite(current)?Math.abs(a.price-current)-Math.abs(b.price-current):0);
  for(const t of chosen)if(t.sourceId)sourceIds.push(t.sourceId);

  const htfBias=normBias(input.htfContext?.bias);
  const htfConflict=Boolean(htfBias!=='neutral'&&bias!=='neutral'&&htfBias!==bias);
  const confirmations=[...(input.structure?.confirmations||[]),...(input.ictContext?.confirmations||[])].filter(Boolean).map(String);
  const warnings=[...(input.structure?.warnings||[]),...(input.ictContext?.warnings||[])].filter(Boolean).map(String);
  if(htfConflict)warnings.push('HTF_CONFLICT');
  const evidenceCount=(bias!=='neutral'?1:0)+(interestZone?1:0)+(invalidation?1:0)+(chosen.length?1:0);
  const confidence=bias==='neutral'?'low':evidenceCount>=3?'high':evidenceCount>=2?'medium':'low';
  return{symbol:String(input.symbol||''),tf,status:(input.candles||[]).length?'confirmed':'partial',bias,confidence,interestZone,invalidation,targets:chosen,confirmations,warnings,htfConflict,sourceIds:dedupeIds(sourceIds)};
}
return{buildTfScenario,normalizeBias:normBias,SUPPORTED_TIMEFRAMES:Array.from(SUPPORTED)};
});
