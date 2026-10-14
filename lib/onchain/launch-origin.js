'use strict';
// Earliest OBSERVABLE DEX pool history, not a claim about ICO/private/off-chain first prices.
// GeckoTerminal pool discovery / OHLCV + DexScreener liquidity snapshots, no wallet identity attribution.
const NETS={ethereum:'eth',base:'base',bsc:'bsc',solana:'solana',arbitrum:'arbitrum',polygon_pos:'polygon_pos'};
const CHAINS={ethereum:'ethereum',base:'base',bsc:'bsc',solana:'solana',arbitrum:'arbitrum',polygon_pos:'polygon'};
const ADR=/^[a-zA-Z0-9]{24,60}$/;
const cache=new Map();
function validNetwork(x){const key=String(x||'').toLowerCase();return NETS[key]?key:null}
function iso(x){if(!x)return null;const d=new Date(x);return Number.isFinite(d.getTime())?d.toISOString():null}
function fixed(x){const n=Number(x);return Number.isFinite(n)?n:null}
async function getJson(url,fetchImpl,timeout=8500){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);
 try{const r=await fetchImpl(url,{signal:ctrl.signal,headers:{accept:'application/json','user-agent':'PulseRadar-Origin-Research/1.0'}});
 if(!r.ok)throw new Error('upstream HTTP '+r.status);
 const body=await r.json();if(!body||typeof body!=='object')throw Error('invalid JSON');return body}
 finally{clearTimeout(timer)}
}
function poolRows(payload,network){
 const arr=Array.isArray(payload?.data)?payload.data:[];
 return arr.map(p=>{const a=p.attributes||{},id=String(p.id||''),address=a.address||id.split('_').slice(1).join('_');
 return{network,poolAddress:address,createdAt:iso(a.pool_created_at),reserveUsd:fixed(a.reserve_in_usd),volume24hUsd:fixed(a.volume_usd?.h24),baseToken:a.name||null,provider:'GeckoTerminal'} }).filter(x=>ADR.test(x.poolAddress));
}
function histories(body){const raw=body?.data?.attributes?.ohlcv_list;if(!Array.isArray(raw))return[];
 return raw.filter(r=>Array.isArray(r)&&r.length>=6).map(r=>({time:iso(Number(r[0])*1000),open:fixed(r[1]),high:fixed(r[2]),low:fixed(r[3]),close:fixed(r[4]),volumeBase:fixed(r[5])})).filter(x=>x.time&&x.open!=null&&x.open>0&&x.high!=null&&x.low!=null&&x.close!=null&&x.close>0).sort((a,b)=>a.time.localeCompare(b.time))}
function earlyMarketFootprint(ohlcv){
 // Observational volume/price signature only. Does not identify wallets or smart money.
 const first=ohlcv.slice(0,7);
 if(!first.length)return {status:'NO_HISTORY',observedDays:0,notes:['거래량 초기 이력 없음']};
 const total=first.reduce((n,x)=>n+(Number.isFinite(x.volumeBase)?x.volumeBase:0),0);
 const v0=Number.isFinite(first[0].volumeBase)?first[0].volumeBase:null;
 const remaining=first.slice(1).filter(x=>Number.isFinite(x.volumeBase));
 const baseline=remaining.length?remaining.reduce((n,x)=>n+x.volumeBase,0)/remaining.length:null;
 const firstDayMultiple=v0!=null&&baseline>0?v0/baseline:null;
 const open=first[0].open,last=first.at(-1).close;
 const changePct=open>0&&last>0?100*(last/open-1):null;
 const maxDrawdownPct=first.reduce((max,r)=>r.high>0&&r.low>0?Math.max(max,100*(r.high-r.low)/r.high):max,0);
 return {status:'OBSERVATIONAL_ONLY',observedDays:first.length,firstObservedDayVolumeBase:v0,followingDayAverageVolumeBase:baseline,firstDayVsFollowingVolumeMultiple:firstDayMultiple,firstSevenObservedDayVolumeBase:total,firstSevenObservedDayChangePct:changePct,largestObservedIntradayRangePct:maxDrawdownPct,notes:['첫 7개 관측 일봉의 거래량·가격 통계','거래량만으로 스마트머니·내부자 매집·봇 거래를 식별하지 않음','역사적 최초 7일을 보장하지 않음']};
}
function detect(pools,ohlcv){
 const first=ohlcv[0]||null,peak=ohlcv.reduce((x,y)=>!x||y.high>x.high?y:x,null),low=ohlcv.reduce((x,y)=>!x||y.low<x.low?y:x,null),latest=ohlcv.at(-1)||null;
 return{firstObservedCandle:first?.time||null,firstObservedOpen:first?.open??null,earliestObservedLow:low?.low??null,earliestLowTime:low?.time??null,highestObservedHigh:peak?.high??null,highTime:peak?.time??null,lastObservedClose:latest?.close??null,changeFromFirstOpenPct:first?.open>0&&latest?.close!=null?100*(latest.close/first.open-1):null,drawdownFromHistoricalHighPct:peak?.high>0&&latest?.close!=null?100*(latest.close/peak.high-1):null,observationCount:ohlcv.length,poolCreationTime:pools[0]?.createdAt||null};
}
async function analyze({network,token,fetchImpl=globalThis.fetch,now=Date.now()}){
 network=validNetwork(network);token=String(token||'').trim();
 if(!network||!ADR.test(token))return{ok:false,status:'INVALID_INPUT',error:'supported network and token address required'};
 const key=network+':'+token,prior=cache.get(key);
 if(prior&&now-prior.time<120000)return {...prior.value,cached:true};
 const base='https://api.geckoterminal.com/api/v2/networks/'+encodeURIComponent(NETS[network]);
 const warnings=['최초 관측 캔들 = 토큰 최초 발행가·ICO가·개인거래 최초가는 아님','지갑 매집·스마트머니 소유자는 이 API만으로 검증할 수 없음'];
 let pools=[],poolError=null,dexPairs=[],dexError=null;
 const parallel=await Promise.allSettled([
 getJson(base+'/tokens/'+encodeURIComponent(token)+'/pools?page=1',fetchImpl),
 getJson('https://api.dexscreener.com/token-pairs/v1/'+encodeURIComponent(CHAINS[network])+'/'+encodeURIComponent(token),fetchImpl)
 ]);
 if(parallel[0].status==='fulfilled')pools=poolRows(parallel[0].value,network);
 else poolError=String(parallel[0].reason?.message||parallel[0].reason);
 if(parallel[1].status==='fulfilled'){const x=parallel[1].value;dexPairs=Array.isArray(x)?x:[]}
 else dexError=String(parallel[1].reason?.message||parallel[1].reason);
 const poolMap=new Map();
 for(const p of pools)poolMap.set(p.poolAddress.toLowerCase(),p);
 for(const p of dexPairs){if(!p?.pairAddress||!ADR.test(String(p.pairAddress)))continue;
 const addr=p.pairAddress.toLowerCase(),old=poolMap.get(addr);
 if(old){old.dexLiquidityUsd=fixed(p.liquidity?.usd);old.dexCreatedAt=p.pairCreatedAt?iso(Number(p.pairCreatedAt)):null;old.pairUrl=typeof p.url==='string'&&p.url.startsWith('https://dexscreener.com/')?p.url:null}
 else poolMap.set(addr,{network,poolAddress:p.pairAddress,createdAt:p.pairCreatedAt?iso(Number(p.pairCreatedAt)):null,reserveUsd:null,dexLiquidityUsd:fixed(p.liquidity?.usd),volume24hUsd:fixed(p.volume?.h24),provider:'DexScreener',pairUrl:typeof p.url==='string'&&p.url.startsWith('https://dexscreener.com/')?p.url:null})}
 const allPools=[...poolMap.values()].sort((a,b)=>{const ta=a.createdAt?Date.parse(a.createdAt):Infinity,tb=b.createdAt?Date.parse(b.createdAt):Infinity;return ta-tb});
 // Prefer earliest pool with confirmed Gecko support; DexScreener-only pools have no reliable historic OHLCV.
 const eligible=allPools.filter(p=>p.provider==='GeckoTerminal').slice(0,4);
 let selected=null,history=[],historyErrors=[];
 for(const p of eligible){
  try{const body=await getJson(base+'/pools/'+encodeURIComponent(p.poolAddress)+'/ohlcv/day?aggregate=1&limit=1000&currency=usd',fetchImpl);
   const rows=histories(body);if(rows.length&&(history.length===0||rows[0].time<history[0].time)){history=rows;selected=p}
  }catch(e){historyErrors.push({poolAddress:p.poolAddress,error:String(e.message||e)})}
 }
 if(!selected&&allPools.length)selected=allPools[0];
 if(allPools.length>4)warnings.push('처음 발견한 유동성 풀 일부만 과거 봉을 검증함: 전체 최초 거래를 보장하지 않음');
 if(!history.length)warnings.push('과거 가격 봉을 확인하지 못했음. 최초 가격 및 상승 배율 계산 불가');
 if(poolError)warnings.push('GeckoTerminal 풀 조회 실패: '+poolError);
 if(dexError)warnings.push('DexScreener 유동성 조회 실패: '+dexError);
 const result={ok:true,status:history.length?'PARTIAL_VERIFIED_HISTORY':'POOLS_ONLY',network,token,source:{poolDiscovery:'GeckoTerminal / DexScreener',historicalOhlcv:history.length?'GeckoTerminal':'UNAVAILABLE',smartMoneyWallets:'NOT_VERIFIED',centralizedListingHistory:'NOT_VERIFIED'},selectedPool:selected,pools:allPools.slice(0,25),summary:detect(selected?[selected]:[],history),earlyMarketFootprint:earlyMarketFootprint(history),ohlcv:history.slice(0,500),warnings,failures:historyErrors,asOf:iso(now),verification:'DEX 최초 관측 데이터, 전체 최초 거래 증명 불가'};
 cache.set(key,{time:now,value:result});if(cache.size>150)cache.delete(cache.keys().next().value);
 return result;
}
module.exports={analyze,poolRows,histories,detect,earlyMarketFootprint,validNetwork};
