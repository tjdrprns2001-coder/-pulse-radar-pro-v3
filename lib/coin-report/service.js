'use strict';
const {analyzeCoinReport,TF_ORDER}=require('./analyzer.js');
const Pro=require('./pro-analyzer.js');
function cleanSymbol(v){const s=String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(!/^[A-Z0-9]{2,20}USDT$/.test(s)){const e=new Error('invalid symbol');e.statusCode=400;throw e}return s}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function tickerOf(rows,symbol){return(Array.isArray(rows)?rows:[]).find(x=>String(x?.symbol||'').toUpperCase()===symbol)||null}
function tickerMarket(t){return{currentPrice:finite(t?.lastPrice),change24hPct:finite(t?.priceChangePercent),quoteVolume24h:finite(t?.quoteVolume),high24h:finite(t?.highPrice),low24h:finite(t?.lowPrice)}}
function createCoinReportService({provider,gateway=null,now=()=>Date.now()}={}){
 if(!provider)throw new Error('provider required');
 const spotKlines=(s,tf,n)=>typeof provider.getSpotKlines==='function'?provider.getSpotKlines(s,tf,n):provider.getKlines(s,tf,n);
 async function getReport(symbol){
  const s=cleanSymbol(symbol),frames={},errors=[],stamp=now();
  await Promise.all(TF_ORDER.map(async tf=>{try{frames[tf]=await spotKlines(s,tf,260)}catch(e){errors.push({interval:tf,error:String(e?.message||e)})}}));
  if(!Object.keys(frames).length){const e=new Error('market data unavailable');e.statusCode=502;throw e}
  let derivatives={oiChangePct:null,fundingPct:null};
  try{if(typeof provider.getCoinReportDerivatives==='function')derivatives=await provider.getCoinReportDerivatives(s);else if(provider.getDerivativesContext)derivatives=await provider.getDerivativesContext(s)}catch{}
  let market={},btc1h=[],eth1h=[];
  try{
   if(typeof provider.getSpotTickers==='function'){
    const tickers=await provider.getSpotTickers(),target=tickerOf(tickers,s),btc=tickerOf(tickers,'BTCUSDT'),eth=tickerOf(tickers,'ETHUSDT');
    market={...tickerMarket(target),btc24hPct:finite(btc?.priceChangePercent),eth24hPct:finite(eth?.priceChangePercent)};
   }
  }catch{}
  try{
   [btc1h,eth1h]=await Promise.all([
    s==='BTCUSDT'?Promise.resolve(frames['1h']||[]):spotKlines('BTCUSDT','1h',180).catch(()=>[]),
    s==='ETHUSDT'?Promise.resolve(frames['1h']||[]):spotKlines('ETHUSDT','1h',180).catch(()=>[])
   ]);
  }catch{}
  market.change7dPct=Pro.relativeReturn(frames['1h']||[],168,stamp);
  market.btc7dPct=Pro.relativeReturn(btc1h,168,stamp);
  market.eth7dPct=Pro.relativeReturn(eth1h,168,stamp);
  const report=analyzeCoinReport({symbol:s,frames,derivatives,errors});
  report.professional=Pro.analyzeProfessional({symbol:s,frames,derivatives,market,nowMs:stamp});
  report.updatedAt=stamp;
  return report
 }
 async function getNews(symbol,report=null){const s=cleanSymbol(symbol);if(!gateway?.available)return{status:'ok',available:false,summary:'실시간 뉴스 보강을 사용할 수 없습니다.',sources:[],items:[]};const base=report||await getReport(s);try{const out=await gateway.brief({context:{task:'Find only recent, factual web news about this crypto asset. Do not claim causation between news and price. Return news facts in highlights and cited sources.',symbol:s,marketState:{decisionState:base.decisionState,pattern:base.pattern,multiTimeframe:base.multiTimeframe}},useWeb:true,deep:false});return{status:'ok',available:true,summary:out.summary||'',sources:out.sources||[],items:(out.highlights||[]).slice(0,6),model:out.model||null,usedWeb:Boolean(out.usedWeb)}}catch(e){return{status:'ok',available:false,summary:'뉴스 보강을 불러오지 못했습니다.',sources:[],items:[],warning:String(e?.message||e)}}}
 return{getReport,getNews,cleanSymbol}
}
module.exports={cleanSymbol,createCoinReportService};
