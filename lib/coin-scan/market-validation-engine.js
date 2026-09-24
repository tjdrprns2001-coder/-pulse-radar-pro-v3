'use strict';
const crypto=require('crypto');
const VERSION='MARKET_VALIDATION_v1';
const SNAPSHOT_SCHEMA='MARKET_VALIDATION_SNAPSHOT_v1';
const STANCES=new Set(['supportive','neutral','contradictory','missing','stale']);
const STATUSES=new Set(['VALIDATED','CONFLICTED','STALE','INSUFFICIENT_DATA','INVALIDATED']);
const FRESH_MS={market:300000,scanner:600000,indicator:21600000,news:86400000,wallet:21600000};
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function ts(v){const n=finite(v);if(n!=null)return n;const d=Date.parse(String(v||''));return Number.isFinite(d)?d:null}
function cleanSymbol(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')}
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object'){const o={};for(const k of Object.keys(v).sort())if(v[k]!==undefined)o[k]=stable(v[k]);return o}return v}
function hash(v){return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex')}
function sourceNames(rows=[]){return[...new Set((rows||[]).map(x=>x&&x.name).filter(Boolean).map(String))]}
function ev(id,domain,st,reason,opt={}){return{id,domain,stance:STANCES.has(st)?st:'neutral',reason:String(reason||''),observedAt:ts(opt.observedAt),publishedAt:ts(opt.publishedAt),sources:[...new Set((opt.sources||[]).filter(Boolean).map(String))],value:opt.value??null,critical:Boolean(opt.critical),meta:opt.meta||null}}
function canonicalize({symbol,item={},intelligence={},decisionTimestamp,capturedAt=Date.now()}={}){
 const d=ts(decisionTimestamp)??ts(item.updatedAt)??capturedAt,cex=intelligence.cex||{},ind=intelligence.indicators||{},dex=intelligence.dex||{},news=intelligence.news||{},events=intelligence.events||{},wallets=intelligence.wallets||{},verify=intelligence.walletVerification||{},execution=intelligence.execution||{};
 return{
  engineVersion:VERSION,symbol:cleanSymbol(symbol||item.symbol),decisionTimestamp:d,capturedAt:ts(capturedAt)??Date.now(),
  signal:{updatedAt:ts(item.updatedAt),dataState:item.dataState||null,marketScope:item.marketScope||null,spotListed:Boolean(item.spotListed),futuresListed:Boolean(item.futuresListed),direction:item.direction||item.v2Flow?.direction||'none',tradeLevel:item.tradeSignal?.level||null,v3LongTier:item.v3LongTier||null,v3Invalidation:Boolean(item.v3Invalidation),lastPrice:finite(item.lastPrice),priceChange24h:finite(item.priceChange24h),oi4hChangePct:finite(item.oi4hChangePct),oi8hChangePct:finite(item.oi8hChangePct),trueTakerRatio:finite(item.trueTakerRatio),fundingRate:finite(item.fundingRate),spotFuturesBasisPct:finite(item.spotFuturesBasisPct)},
  market:{updatedAt:ts(intelligence.updatedAt)||ts(item.updatedAt),exchangeCount:finite(cex.exchangeCount),spotCount:finite(cex.spotCount),derivativesCount:finite(cex.derivativesCount),medianPrice:finite(cex.medianPrice),spotMedianPrice:finite(cex.spotMedianPrice),derivativesMedianPrice:finite(cex.derivativesMedianPrice),maxPriceDispersionPct:finite(cex.maxPriceDispersionPct),spotFuturesBasisPct:finite(cex.spotFuturesBasisPct),sources:(cex.sources||[]).map(x=>({name:x.name||null,marketType:x.marketType||null,price:finite(x.price),quoteVolume24h:finite(x.quoteVolume24h),priceChange24h:finite(x.priceChange24h),fundingRate:finite(x.fundingRate),openInterest:finite(x.openInterest)}))},
  indicators:{updatedAt:ts(intelligence.updatedAt),available:Boolean(ind.available),sourceCount:finite(ind.summary?.sourceCount),h1Bull:finite(ind.summary?.h1Bull),h4Bull:finite(ind.summary?.h4Bull),h1RsiMedian:finite(ind.timeframes?.['1h']?.rsiMedian),h4RsiMedian:finite(ind.timeframes?.['4h']?.rsiMedian)},
  dex:{updatedAt:ts(intelligence.updatedAt),available:Boolean(dex.available),pairCount:finite(dex.pairCount),liquidityUsd:finite(dex.liquidityUsd),volume24hUsd:finite(dex.volume24hUsd),contractStatus:dex.contractVerification?.status||verify.contractStatus||null,contractVerified:Boolean(dex.contractVerification?.verified||verify.tokenContractVerified)},
  news:{updatedAt:ts(intelligence.updatedAt),items:(news.items||[]).slice(0,20).map(x=>({id:x.id||null,title:String(x.title||'').slice(0,240),source:x.source||null,publishedAt:ts(x.publishedAt),url:x.url||null}))},
  events:{updatedAt:ts(intelligence.updatedAt),scheduled:(events.items||[]).slice(0,20).map(x=>({id:x.id||null,title:String(x.title||'').slice(0,240),scheduledAt:ts(x.date),source:x.source||null})),newsDerived:(events.newsDerived||[]).slice(0,20).map(x=>({title:String(x.title||'').slice(0,240),publishedAt:ts(x.publishedAt),source:x.source||null,url:x.url||null})),reason:events.reason||null},
  wallets:{updatedAt:ts(intelligence.updatedAt),items:(wallets.items||[]).slice(0,30).map(x=>({timestamp:ts(x.timestamp),amountUsd:finite(x.amountUsd),fromOwner:x.from?.owner||null,fromType:x.from?.ownerType||null,toOwner:x.to?.owner||null,toType:x.to?.ownerType||null,hash:x.hash||null})),provider:wallets.provider||null,reason:wallets.reason||null,verifiedAttributions:finite(verify.verifiedAttributions),verificationStatus:verify.status||null},
  execution:{updatedAt:ts(execution.updatedAt)||ts(intelligence.updatedAt),spot:normalizeExecution(execution.spot),futures:normalizeExecution(execution.futures)}
 };
}
function normalizeExecution(x={}){
 return{available:Boolean(x.available),observedAt:ts(x.observedAt),bid:finite(x.bid),ask:finite(x.ask),mid:finite(x.mid),spreadBps:finite(x.spreadBps),depthUsd:{bid10bps:finite(x.depthUsd?.bid10bps),ask10bps:finite(x.depthUsd?.ask10bps),bid25bps:finite(x.depthUsd?.bid25bps),ask25bps:finite(x.depthUsd?.ask25bps)},slippage:{buy:(x.slippage?.buy||[]).map(y=>y?{notional:finite(y.notional),avgPrice:finite(y.avgPrice),slippageBps:finite(y.slippageBps)}:null),sell:(x.slippage?.sell||[]).map(y=>y?{notional:finite(y.notional),avgPrice:finite(y.avgPrice),slippageBps:finite(y.slippageBps)}:null)},reason:x.reason||null,error:x.error||null};
}
function executionAssessment(c){
 const rows=[];for(const [market,x] of Object.entries(c.execution||{})){if(market==='updatedAt'||!x)continue;if(!x.available){rows.push({market,available:false,status:'missing'});continue}const spread=finite(x.spreadBps),depths=[x.depthUsd?.bid10bps,x.depthUsd?.ask10bps].map(finite).filter(v=>v!=null),depth10=depths.length?Math.min(...depths):null;const slips=[...(x.slippage?.buy||[]),...(x.slippage?.sell||[])].filter(Boolean).filter(y=>Number(y.notional)>=10000).map(y=>finite(y.slippageBps)).filter(v=>v!=null),slip50=Math.max(...slips,0);let status='supportive',reason='체결성 양호';if(spread==null||depth10==null){status='missing';reason='spread/depth 데이터 부족'}else if(spread>25||depth10<10000||slip50>40){status='contradictory';reason='스프레드/깊이/슬리피지 기준 미달'}else if(spread>10||depth10<50000||slip50>20){status='neutral';reason='체결비용 관찰 필요'}rows.push({market,available:true,status,spreadBps:spread,depth10Usd:depth10,maxSlippageBps:slip50,reason})}
 const active=rows.filter(x=>x.available),worst=active.find(x=>x.status==='contradictory')||active.find(x=>x.status==='neutral')||active.find(x=>x.status==='supportive')||rows[0]||null;return{rows,worst};
}
function ageState(observed,decision,ttl){const o=ts(observed);if(o==null)return'missing';if(o>decision)return'lookahead';if(decision-o>ttl)return'stale';return'fresh'}
function evidenceFromCanonical(c){
 const e=[],d=c.decisionTimestamp,s=c.signal,m=c.market,i=c.indicators,dx=c.dex,n=c.news,w=c.wallets;
 const sigAge=ageState(s.updatedAt,d,FRESH_MS.scanner),marketAge=ageState(m.updatedAt,d,FRESH_MS.market),indAge=ageState(i.updatedAt,d,FRESH_MS.indicator),newsAge=ageState(n.updatedAt,d,FRESH_MS.news),walletAge=ageState(w.updatedAt,d,FRESH_MS.wallet);
 const identified=c.symbol&&c.symbol.endsWith('USDT')&&(s.spotListed||s.futuresListed);
 e.push(ev('identity.binance','identity',identified?'supportive':'missing',identified?'Binance USDT 상장 심볼 식별 완료':'Binance 상장 식별 불충분',{observedAt:s.updatedAt,sources:['binance'],critical:true,value:{marketScope:s.marketScope}}));
 function freshness(id,label,state,observed,sources){e.push(ev(id,'freshness',state==='fresh'?'supportive':state==='stale'?'stale':state==='lookahead'?'contradictory':'missing',state==='fresh'?label+' 신선도 정상':state==='stale'?label+' 데이터 정책 허용 연령 초과':state==='lookahead'?label+' 관측시각이 decision timestamp 이후':label+' 관측시각 없음',{observedAt:observed,sources,critical:true}))}
 freshness('scanner.freshness','Scanner',sigAge,s.updatedAt,['scanner-v3']);freshness('market.freshness','시장 집계',marketAge,m.updatedAt,sourceNames(m.sources));
 const priceSources=sourceNames(m.sources.filter(x=>x.price!=null)),derivSources=sourceNames(m.sources.filter(x=>x.marketType!=='spot'&&x.price!=null));
 e.push(ev('cross.price','cross_source',priceSources.length>=2?'supportive':'missing',priceSources.length>=2?'가격 '+priceSources.length+'개 venue 교차확인':'가격 교차검증 source 부족',{observedAt:m.updatedAt,sources:priceSources,critical:true,value:{sourceCount:priceSources.length,maxDispersionPct:m.maxPriceDispersionPct}}));
 e.push(ev('cross.derivatives','cross_source',s.futuresListed?(derivSources.length>=2?'supportive':'missing'):'neutral',s.futuresListed?(derivSources.length>=2?'파생 '+derivSources.length+'개 venue 교차확인':'파생상품 교차검증 source 부족'):'Binance 선물 미상장: 파생 gate 비필수',{observedAt:m.updatedAt,sources:derivSources,critical:Boolean(s.futuresListed),value:{sourceCount:derivSources.length}}));
 const disp=m.maxPriceDispersionPct;
 e.push(ev('market.price_dispersion','market',disp==null?'missing':disp<=1?'supportive':disp<=3?'neutral':'contradictory',disp==null?'거래소 가격편차 계산 불가':disp<=1?'거래소 가격 일치 양호':disp<=3?'거래소 가격편차 관찰':'거래소 가격 충돌 가능성 큼',{observedAt:m.updatedAt,sources:priceSources,value:disp,critical:true}));
 const basis=m.spotFuturesBasisPct??s.spotFuturesBasisPct;
 e.push(ev('derivatives.basis','derivatives',basis==null?'missing':Math.abs(basis)<=1?'neutral':'contradictory',basis==null?'현물-선물 basis 없음':Math.abs(basis)<=1?'현물-선물 basis 정상 범위 후보':'현물-선물 basis 확대: crowding/괴리 위험',{observedAt:m.updatedAt,sources:[...new Set([...priceSources,...derivSources])],value:basis}));
 const oi=s.oi4hChangePct,funding=s.fundingRate,taker=s.trueTakerRatio,crowd=oi!=null&&oi>=5&&funding!=null&&funding>0.03;
 e.push(ev('derivatives.crowding','derivatives',oi==null&&funding==null&&taker==null?(s.futuresListed?'missing':'neutral'):crowd?'contradictory':'neutral',s.futuresListed?(oi==null&&funding==null&&taker==null?'OI/taker/funding 데이터 부족':crowd?'OI 증가 + 양(+) funding 과열 후보: 롱 crowding 위험':'파생데이터는 방향 확인이 아닌 crowding 보조 증거로 사용'):'선물 미상장',{observedAt:s.updatedAt,sources:['binance-futures','cross-exchange-oi'],value:{oi4hPct:oi,fundingRate:funding,takerRatio:taker},meta:{rule:'risk_filter_only',thresholds:{oi4hPct:5,fundingRate:0.03}}}));
 e.push(ev('indicators.cross','indicators',indAge==='lookahead'?'contradictory':indAge==='stale'?'stale':!i.available?'missing':(i.sourceCount||0)>=2?'supportive':'neutral',indAge==='lookahead'?'외부 보조지표가 decision timestamp 이후':indAge==='stale'?'외부 보조지표 오래됨':!i.available?'외부 보조지표 없음':(i.sourceCount||0)>=2?String(i.sourceCount)+'개 거래소 RSI/MACD/EMA/OBV 교차검증':'보조지표 단일 source',{observedAt:i.updatedAt,sources:['bybit','okx','gate'],value:{sourceCount:i.sourceCount,h1Bull:i.h1Bull,h4Bull:i.h4Bull,rsi1h:i.h1RsiMedian}}));
 e.push(ev('dex.contract','onchain',!dx.available?'missing':dx.contractVerified?'supportive':'neutral',!dx.available?'DEX/contract 데이터 없음':dx.contractVerified?'DEX 복수 페어 계약주소 교차확인':'DEX 계약주소 미확정',{observedAt:dx.updatedAt,sources:['dexscreener'],value:{pairCount:dx.pairCount,liquidityUsd:dx.liquidityUsd,contractStatus:dx.contractStatus}}));
 const newsLookahead=n.items.some(x=>x.publishedAt!=null&&x.publishedAt>d),freshNews=n.items.filter(x=>x.publishedAt!=null&&x.publishedAt<=d);
 e.push(ev('catalyst.news','catalyst',newsLookahead?'contradictory':newsAge==='stale'?'stale':freshNews.length?'neutral':'missing',newsLookahead?'decision timestamp 이후 뉴스가 발견되어 검증 근거에서 제외':freshNews.length?String(freshNews.length)+'건 공개시각 확인 뉴스 존재':'decision timestamp 이전 확인 가능한 뉴스 없음',{observedAt:n.updatedAt,publishedAt:freshNews[0]?.publishedAt,sources:sourceNames(freshNews.map(x=>({name:x.source}))),value:{eligible:freshNews.length,lookahead:n.items.length-freshNews.length}}));
 const walletLookahead=w.items.some(x=>x.timestamp!=null&&x.timestamp>d),eligibleWallet=w.items.filter(x=>x.timestamp!=null&&x.timestamp<=d);
 e.push(ev('onchain.wallet','onchain',walletLookahead?'contradictory':walletAge==='stale'?'stale':eligibleWallet.length?'neutral':'missing',walletLookahead?'decision timestamp 이후 지갑 이벤트 제외':eligibleWallet.length?String(eligibleWallet.length)+'건 watch-only 지갑 이동 관측':'확인 가능한 대형 지갑 이동 없음',{observedAt:w.updatedAt,sources:w.provider?[w.provider]:[],value:{eligible:eligibleWallet.length,verifiedAttributions:w.verifiedAttributions},meta:{labels:w.verificationStatus||'N/A',predictionUse:'event_candidate_only'}}));
 const execution=executionAssessment(c),exWorst=execution.worst;
 e.push(ev('execution.liquidity','execution',!exWorst?'missing':exWorst.status,exWorst?exWorst.reason:'체결 데이터 없음',{observedAt:c.execution?.updatedAt,sources:['binance-orderbook'],value:execution,critical:true,meta:{thresholds:{spreadWarnBps:10,spreadFailBps:25,depth10WarnUsd:50000,depth10FailUsd:10000,slippageWarnBps:20,slippageFailBps:40}}}));
 if(s.v3Invalidation||String(s.tradeLevel||'').includes('제외'))e.push(ev('signal.invalidation','signal','contradictory','기존 Scanner/Book AI 무효화 조건 존재',{observedAt:s.updatedAt,sources:['scanner-v3'],critical:true,value:{v3Invalidation:s.v3Invalidation,tradeLevel:s.tradeLevel}}));
 return e;
}
function buildGates(c,evidence){
 const by=id=>evidence.find(x=>x.id===id),critical=evidence.filter(x=>x.critical),lookahead=evidence.filter(x=>x.stance==='contradictory'&&x.reason.includes('decision timestamp 이후')),stale=critical.filter(x=>x.stance==='stale'),missing=critical.filter(x=>x.stance==='missing');
 const identity=by('identity.binance'),price=by('cross.price'),deriv=by('cross.derivatives'),disp=by('market.price_dispersion'),invalid=by('signal.invalidation');
 const gates=[
  {id:'identity',label:'식별성',pass:identity?.stance==='supportive',failure:identity?.stance==='supportive'?null:'IDENTITY_UNCLEAR'},
  {id:'temporality',label:'시간성',pass:lookahead.length===0,failure:lookahead.length?'LOOKAHEAD_RISK':null},
  {id:'freshness',label:'신선도',pass:stale.length===0,failure:stale.length?'STALE':null},
  {id:'cross_source',label:'교차검증',pass:price?.stance==='supportive'&&(!c.signal.futuresListed||deriv?.stance==='supportive'),failure:price?.stance!=='supportive'||(c.signal.futuresListed&&deriv?.stance!=='supportive')?'SINGLE_SOURCE':null},
  {id:'source_conflict',label:'소스 충돌',pass:disp?.stance!=='contradictory',failure:disp?.stance==='contradictory'?'CONFLICTED':null},
  {id:'execution',label:'체결성',pass:by('execution.liquidity')?.stance==='supportive'||by('execution.liquidity')?.stance==='neutral',failure:by('execution.liquidity')?.stance==='contradictory'?'ILLIQUID':by('execution.liquidity')?.stance==='missing'?'INSUFFICIENT_EXECUTION_DATA':null},
  {id:'market_state',label:'시장상태',pass:!invalid,failure:invalid?'CONTRADICTED':null},
  {id:'catalyst',label:'촉매',pass:!lookahead.some(x=>x.domain==='catalyst'),failure:lookahead.some(x=>x.domain==='catalyst')?'CATALYST_RISK':null},
  {id:'reproducibility',label:'재현성',pass:true,failure:null}
 ];
 return{gates,missingCritical:missing.map(x=>x.id),staleCritical:stale.map(x=>x.id),lookaheadEvidence:lookahead.map(x=>x.id)};
}
function deriveStatus(c,evidence,gp){
 const fail=new Set(gp.gates.map(x=>x.failure).filter(Boolean));let status='VALIDATED';
 if(fail.has('IDENTITY_UNCLEAR')||fail.has('LOOKAHEAD_RISK')||fail.has('CONTRADICTED'))status='INVALIDATED';
 else if(fail.has('STALE'))status='STALE';else if(fail.has('CONFLICTED')||fail.has('ILLIQUID'))status='CONFLICTED';else if(fail.has('SINGLE_SOURCE')||fail.has('INSUFFICIENT_EXECUTION_DATA')||gp.missingCritical.length)status='INSUFFICIENT_DATA';
 const counts={supportive:0,neutral:0,contradictory:0,missing:0,stale:0};for(const x of evidence)counts[x.stance]=(counts[x.stance]||0)+1;
 return{status:STATUSES.has(status)?status:'INSUFFICIENT_DATA',counts,reasonCodes:[...new Set(gp.gates.map(x=>x.failure).filter(x=>x&&x!=='NOT_EVALUATED'))]};
}
function evaluateCanonical(c){const evidence=evidenceFromCanonical(c),gp=buildGates(c,evidence),s=deriveStatus(c,evidence,gp);return{engineVersion:VERSION,symbol:c.symbol,decisionTimestamp:c.decisionTimestamp,validationStatus:s.status,evidence,gates:gp.gates,counts:s.counts,reasonCodes:s.reasonCodes,dataQuality:{missingCritical:gp.missingCritical,staleCritical:gp.staleCritical,lookaheadEvidence:gp.lookaheadEvidence}}}
function validate(input={}){const canonical=canonicalize(input),result=evaluateCanonical(canonical),canonicalHash=hash(canonical),snapshotId=[canonical.symbol,canonical.decisionTimestamp,canonicalHash.slice(0,12)].join('-'),snapshot={schemaVersion:SNAPSHOT_SCHEMA,engineVersion:VERSION,snapshotId,canonicalHash,createdAt:canonical.capturedAt,canonical,result};return{...result,snapshotId,canonicalHash,snapshot}}
function replay(snapshot){if(!snapshot?.canonical)throw new Error('validation snapshot canonical payload required');const canonicalHash=hash(snapshot.canonical),result=evaluateCanonical(snapshot.canonical),sameHash=canonicalHash===snapshot.canonicalHash,sameStatus=result.validationStatus===snapshot.result?.validationStatus,sameEvidenceHash=hash(result.evidence)===hash(snapshot.result?.evidence||[]);return{engineVersion:VERSION,snapshotId:snapshot.snapshotId||null,canonicalHash,sameHash,sameStatus,sameEvidenceHash,reproducible:Boolean(sameHash&&sameStatus&&sameEvidenceHash),result}}
module.exports={VERSION,SNAPSHOT_SCHEMA,STANCES,STATUSES,FRESH_MS,canonicalize,evidenceFromCanonical,buildGates,evaluateCanonical,validate,replay,hash};
