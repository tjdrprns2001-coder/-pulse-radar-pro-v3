'use strict';

const {defaultResearchAIv2}=require('./research-ai-v2.js');

const VERSION='RESEARCH_SCANNER_ADAPTER_v2';

function n(v,d=null){if(v===null||v===undefined||v==='')return d;const x=Number(v);return Number.isFinite(x)?x:d}
function tfStats(tf={}){
  const out={};
  for(const [key,row] of Object.entries(tf||{})){
    if(!row||typeof row!=='object')continue;
    out[key]={
      available:row.available===true,
      bars:n(row.bars??row.confirmedBars),
      lastClosedAt:n(row.closeTime),
      close:n(row.close),
      rsi:n(row.rsi14??row.rsi),
      macd:n(row.macdHist??row.macd),
      macdImproving:row.macdUp===true,
      obvUp:typeof row.obvUp==='boolean'?row.obvUp:null,
      rvol:n(row.rvol),
      trend:row.stack===true&&row.above20!==false?'UP':row.above20===false&&row.above60===false?'DOWN':'MIXED',
      compression:n(row.compression)
    };
  }
  return out;
}
function normalizeScannerItem(item={},context={}){
  const market=context.marketState||context.market||{};
  const isAstra=String(context.source||'').startsWith('astra')||item.method!=null;
  if(!isAstra)return{...item,regime:item.regime??market.regime??null};
  return{
    ...item,
    asOf:n(item.asOf,n(context.asOf,n(item.updatedAt,Date.now()))),
    price:n(item.price,n(item.lastPrice)),
    change24h:n(item.change24h,n(item.priceChange24h)),
    flow:{
      ...(item.flow||{}),
      oi4hPct:n(item.flow?.oi4hPct,n(item.oi4hPct)),
      takerRatio:n(item.flow?.takerRatio,n(item.taker15m,n(item.taker5m))),
      funding8hPct:n(item.flow?.funding8hPct,n(item.fundingRatePct))
    },
    stats:Object.keys(item.stats||{}).length?item.stats:tfStats(item.tf),
    regime:item.regime??market.regime??null,
    setup:item.setup||{
      type:item.verdict?.key||null,
      label:item.verdict?.label||null,
      valid:['IGNITION_CONFIRMED','A_FIRE','GROK_FIRE','GEMINI_ALPHA','CLAUDE_A_B','CLAUDE_A_TO_AB'].includes(String(item.verdict?.key||''))
    },
    score:n(item.score,n(item.verdict?.score,n(item.verdict?.priority))),
    researchOnly:true
  };
}
async function ingestScannerItems(items=[],{source='scanner',marketState=null,asOf=null}={}){
  const ai=defaultResearchAIv2();
  await ai.hydrateRemote(false);
  const normalized=(Array.isArray(items)?items:[]).map(item=>normalizeScannerItem(item,{source,marketState,asOf}));
  const learned=ai.observe(normalized,{source});
  const decorated=normalized.map(item=>({...item,researchAI:learned.predictions?.[item.symbol]||null}));
  return{
    version:VERSION,items:decorated,
    learning:{shadowOnly:true,...learned.status,added:learned.added,resolved:learned.resolved,source}
  };
}

module.exports={VERSION,tfStats,normalizeScannerItem,ingestScannerItems};
