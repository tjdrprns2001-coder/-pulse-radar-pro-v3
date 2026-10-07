'use strict';
const {analyzeCoinReport,TF_ORDER}=require('./analyzer.js');
const Pro=require('./pro-analyzer.js');
function cleanSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!/^[A-Z0-9]{2,20}USDT$/.test(s)){const e=new Error('invalid symbol');e.statusCode=400;throw e}return s}
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function tickerOf(rows,symbol){return(Array.isArray(rows)?rows:[]).find(x=>String(x?.symbol||'').toUpperCase()===symbol)||null}
function tickerMarket(t){return{currentPrice:finite(t?.lastPrice),change24hPct:finite(t?.priceChangePercent),quoteVolume24h:finite(t?.quoteVolume),high24h:finite(t?.highPrice),low24h:finite(t?.lowPrice)}}
function lastClosed(rows,stamp){const a=Pro.closedRows(rows,stamp);return a.length?a[a.length-1]:null}
function derived24h(rows,stamp){const a=Pro.closedRows(rows,stamp).slice(-24);if(!a.length)return{};const first=a[0],last=a[a.length-1],q=a.reduce((s,x)=>s+(finite(x.q)||0),0),high=Math.max(...a.map(x=>x.h)),low=Math.min(...a.map(x=>x.l));return{currentPrice:last.c,change24hPct:first?.c?((last.c/first.c)-1)*100:null,quoteVolume24h:q||null,high24h:high,low24h:low}}
function createCoinReportService({provider,gateway=null,now=()=>Date.now()}={}){
 if(!provider)throw new Error('provider required');

 async function getFrame(symbol,tf,n){
  const attempts=[];
  if(typeof provider.getSpotKlines==='function')attempts.push(['BINANCE_SPOT',()=>provider.getSpotKlines(symbol,tf,n)]);
  if(typeof provider.getFuturesKlines==='function')attempts.push(['FUTURES_FALLBACK',()=>provider.getFuturesKlines(symbol,tf,n)]);
  if(typeof provider.getKlines==='function')attempts.push(['LEGACY_MARKET',()=>provider.getKlines(symbol,tf,n)]);
  const errors=[];
  for(const [label,fn] of attempts){
   try{
    const rows=await fn();
    if(Array.isArray(rows)&&rows.length)return{rows,source:String(rows._source||label),errors};
    errors.push(label+': empty');
   }catch(e){errors.push(label+': '+String(e?.message||e))}
  }
  const err=new Error(errors.join(' | ')||'no market data provider');
  err.attemptErrors=errors;
  throw err
 }

 async function getTickerSet(){
  const attempts=[];
  if(typeof provider.getSpotTickers==='function')attempts.push(['BINANCE_SPOT',()=>provider.getSpotTickers()]);
  if(typeof provider.getFuturesTickers==='function')attempts.push(['FUTURES_FALLBACK',()=>provider.getFuturesTickers()]);
  for(const [source,fn] of attempts){
   try{const rows=await fn();if(Array.isArray(rows)&&rows.length)return{rows,source}}catch{}
  }
  return{rows:[],source:null}
 }

 async function getReport(symbol){
  const s=cleanSymbol(symbol),frames={},errors=[],frameSources={},stamp=now();
  await Promise.all(TF_ORDER.map(async tf=>{
   try{const got=await getFrame(s,tf,260);frames[tf]=got.rows;frameSources[tf]=got.source}
   catch(e){errors.push({interval:tf,error:String(e?.message||e)})}
  }));
  if(!Object.keys(frames).length){const e=new Error('market data unavailable after spot/futures/exchange fallbacks');e.statusCode=502;throw e}

  let derivatives={oiChangePct:null,fundingPct:null};
  try{if(typeof provider.getCoinReportDerivatives==='function')derivatives=await provider.getCoinReportDerivatives(s);else if(provider.getDerivativesContext)derivatives=await provider.getDerivativesContext(s)}catch{}

  let market={},btc1h=[],eth1h=[],tickerSource=null;
  try{
   const set=await getTickerSet(),target=tickerOf(set.rows,s),btc=tickerOf(set.rows,'BTCUSDT'),eth=tickerOf(set.rows,'ETHUSDT');
   tickerSource=set.source;
   market={...tickerMarket(target),btc24hPct:finite(btc?.priceChangePercent),eth24hPct:finite(eth?.priceChangePercent)};
  }catch{}

  const derived=derived24h(frames['1h']||[],stamp);
  for(const [k,v] of Object.entries(derived))if(market[k]==null&&v!=null)market[k]=v;

  try{
   [btc1h,eth1h]=await Promise.all([
    s==='BTCUSDT'?Promise.resolve(frames['1h']||[]):getFrame('BTCUSDT','1h',180).then(x=>x.rows).catch(()=>[]),
    s==='ETHUSDT'?Promise.resolve(frames['1h']||[]):getFrame('ETHUSDT','1h',180).then(x=>x.rows).catch(()=>[])
   ]);
  }catch{}

  if(market.btc24hPct==null)market.btc24hPct=Pro.relativeReturn(btc1h,24,stamp);
  if(market.eth24hPct==null)market.eth24hPct=Pro.relativeReturn(eth1h,24,stamp);
  market.change7dPct=Pro.relativeReturn(frames['1h']||[],168,stamp);
  market.btc7dPct=Pro.relativeReturn(btc1h,168,stamp);
  market.eth7dPct=Pro.relativeReturn(eth1h,168,stamp);

  const report=analyzeCoinReport({symbol:s,frames,derivatives,errors});
  const fallbackWarnings=Object.entries(frameSources).filter(([,source])=>source&&source!=='BINANCE_SPOT').map(([tf,source])=>`${tf} 현물 데이터 대체 소스: ${source}`);
  const derivativesWarnings=[];
  if(derivatives?.derivativesSupported===false)derivativesWarnings.push('파생상품 지원 안 됨');
  else if(derivatives?.derivativesSupported===true&&derivatives?.dataAvailable===false)derivativesWarnings.push('파생상품은 지원되지만 현재 OI·Funding 실제 데이터 없음');
  if(derivatives?.status==='query_error')derivativesWarnings.push('파생상품 공급자 조회 오류');
  report.dataWarnings=[...new Set([...(report.dataWarnings||[]),...fallbackWarnings,...derivativesWarnings])].slice(0,12);
  report.dataSources={frames:frameSources,ticker:tickerSource||'derived-from-klines'};
  report.derivativesCapability=derivatives?.capability||{derivativesSupported:derivatives?.derivativesSupported??null,dataAvailable:derivatives?.dataAvailable??null,status:derivatives?.status||'unknown',supportedVenues:derivatives?.supportedVenues||[],dataVenues:derivatives?.dataVenues||[],estimated:false};
  report.professional=Pro.analyzeProfessional({symbol:s,frames,derivatives,market,nowMs:stamp});
  report.professional.dataSources=report.dataSources;
  report.professional.risk.dataWarnings=[...new Set([...(report.professional.risk.dataWarnings||[]),...fallbackWarnings,...derivativesWarnings])].slice(0,12);
  report.updatedAt=stamp;
  return report
 }

 async function getNews(symbol,report=null){const s=cleanSymbol(symbol);if(!gateway?.available)return{status:'ok',available:false,summary:'실시간 뉴스 보강을 사용할 수 없습니다.',sources:[],items:[]};const base=report||await getReport(s);try{const out=await gateway.brief({context:{task:'Find only recent, factual web news about this crypto asset. Do not claim causation between news and price. Return news facts in highlights and cited sources.',symbol:s,marketState:{decisionState:base.decisionState,pattern:base.pattern,multiTimeframe:base.multiTimeframe}},useWeb:true,deep:false});return{status:'ok',available:true,summary:out.summary||'',sources:out.sources||[],items:(out.highlights||[]).slice(0,6),model:out.model||null,usedWeb:Boolean(out.usedWeb)}}catch(e){return{status:'ok',available:false,summary:'뉴스 보강을 불러오지 못했습니다.',sources:[],items:[],warning:String(e?.message||e)}}}
 return{getReport,getNews,cleanSymbol,getFrame}
}
module.exports={cleanSymbol,createCoinReportService};
