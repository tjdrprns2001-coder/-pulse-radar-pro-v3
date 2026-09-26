'use strict';

const VERSION='PULSE_AI_ANALYST_v2';

function n(v,d=null){if(v===null||v===undefined||v==='')return d;const x=Number(v);return Number.isFinite(x)?x:d}
function pct(v,d=1){const x=n(v);return x==null?'—':`${x>=0?'+':''}${x.toFixed(d)}%`}
function cleanSymbol(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9\u0080-\uFFFF]/g,'')}
function liveItems(scan){return (Array.isArray(scan?.items)?scan.items:[]).filter(x=>x&&x.dataState==='live')}
function isExtended(row){return /이미 급등|과열|EXTENDED/i.test(String(row?.category||'')+' '+String(row?.prefilterReason||''))}
function rowScore(row,candidateSet){
  let s=0;
  const candidate=n(row?.candidateScore,0),pre=n(row?.preIgnitionScore,0),priority=n(row?.priority,0),ch=Math.abs(n(row?.priceChange24h,0));
  s+=candidate*.58+pre*.72+Math.min(20,priority*.15);
  if(candidateSet.has(cleanSymbol(row.symbol)))s+=18;
  if(row?.futuresListed)s+=8;
  if(/급등 전조/.test(String(row?.category||'')))s+=14;
  if(String(row?.scanClass?.key||'')==='PATTERN-SETUP')s+=14;
  if(String(row?.scanClass?.key||'')==='SECTOR-ROTATION')s+=8;
  if(row?.autoDeepEligible)s+=5;
  if(ch<=8)s+=7; else if(ch>12)s-=18;
  if(isExtended(row))s-=35;
  const q=n(row?.quoteVolume24h,0);if(q>0)s+=Math.min(10,Math.log10(Math.max(1,q))-5);
  return Number(s.toFixed(2));
}
function safeCandidate(row,rankScore=null){
  if(!row)return null;
  return{
    symbol:cleanSymbol(row.symbol),category:String(row.category||'관찰'),sector:String(row.sector||'기타'),
    marketScope:String(row.marketScope||''),futuresListed:Boolean(row.futuresListed),spotListed:Boolean(row.spotListed),
    price:n(row.lastPrice),change24h:n(row.priceChange24h),candidateScore:n(row.candidateScore),
    preIgnitionScore:n(row.preIgnitionScore),rankScore:n(rankScore),
    scanClass:{key:String(row.scanClass?.key||''),label:String(row.scanClass?.label||'')},
    reason:String((row.reasons||[])[0]||row.summary||''),reasons:(row.reasons||[]).slice(0,4).map(String),
    dataState:String(row.dataState||'unknown'),autoDeepEligible:Boolean(row.autoDeepEligible)
  };
}
function topCandidates(scan,limit=8){
  const items=liveItems(scan),set=new Set((scan?.candidateSymbols||[]).map(cleanSymbol));
  const clean=items.filter(x=>!isExtended(x));
  return clean.map(x=>({row:x,rank:rowScore(x,set)})).sort((a,b)=>b.rank-a.rank).slice(0,Math.max(1,limit)).map(x=>safeCandidate(x.row,x.rank));
}
function extendedLeaders(scan,limit=5){
  return liveItems(scan).filter(isExtended).sort((a,b)=>Math.abs(n(b.priceChange24h,0))-Math.abs(n(a.priceChange24h,0))).slice(0,limit).map(x=>safeCandidate(x));
}
function sectorRows(scan,limit=6){
  const set=new Set((scan?.candidateSymbols||[]).map(cleanSymbol)),groups=new Map();
  for(const row of liveItems(scan)){
    if(isExtended(row))continue;
    const sector=String(row.sector||'기타');
    if(!groups.has(sector))groups.set(sector,[]);
    groups.get(sector).push(row);
  }
  return [...groups.entries()].map(([sector,rows])=>{
    const candidateRows=rows.filter(x=>set.has(cleanSymbol(x.symbol))||/급등 전조/.test(String(x.category||'')));
    const changes=rows.map(x=>n(x.priceChange24h)).filter(x=>x!=null);
    const avg=changes.length?changes.reduce((s,x)=>s+x,0)/changes.length:null;
    const leaders=candidateRows.map(x=>({row:x,rank:rowScore(x,set)})).sort((a,b)=>b.rank-a.rank).slice(0,4).map(x=>cleanSymbol(x.row.symbol));
    return{sector,count:rows.length,candidates:candidateRows.length,avgChange24h:avg==null?null:Number(avg.toFixed(2)),leaders};
  }).filter(x=>x.candidates>0).sort((a,b)=>b.candidates-a.candidates||b.count-a.count).slice(0,limit);
}
function marketPulse(scan){
  const b=scan?.marketBreadth||{},up=n(b.up,0),down=n(b.down,0),flat=n(b.flat,0),total=n(b.count,up+down+flat),den=Math.max(1,up+down);
  const ratio=up/den,median=n(b.median),majors=b.majors||{};
  let regime='MIXED';
  if(ratio>=.62&&(median==null||median>=.4))regime='RISK_ON';
  else if(ratio<=.38&&(median==null||median<=-.4))regime='RISK_OFF';
  return{
    regime,breadthRatio:Number(ratio.toFixed(3)),up,down,flat,total,medianChange24h:median,
    gt5:n(b.gt5,0),gt10:n(b.gt10,0),lt5:n(b.lt5,0),
    majors:{BTC:n(majors.BTC),ETH:n(majors.ETH),SOL:n(majors.SOL)},
    universe:String(scan?.universe||''),coverage:scan?.marketCoverage||null
  };
}
function dataQuality(scan,now=Date.now()){
  const h=scan?.dataHealth||{},total=Math.max(1,n(scan?.scanCount,n(h.live,0)+n(h.delayed,0)+n(h.blocked,0)+n(h.errors,0))),live=n(h.live,0);
  const liveRatio=live/total,ageMs=n(scan?.updatedAt)!=null?Math.max(0,now-n(scan.updatedAt)):null;
  let state='LIVE';
  if(scan?.status!=='ok'||n(h.errors,0)>0||n(h.blocked,0)>0)state='DEGRADED';
  else if(Boolean(scan?.partial)||n(h.delayed,0)>0||liveRatio<.98)state='PARTIAL';
  else if(ageMs!=null&&ageMs>180000)state='STALE';
  return{state,live,total,liveRatio:Number(liveRatio.toFixed(4)),delayed:n(h.delayed,0),blocked:n(h.blocked,0),errors:n(h.errors,0),partial:Boolean(scan?.partial),ageMs,sourceWarning:scan?.sourceWarning||null};
}
function focusSymbol(scan,symbol){
  const s=cleanSymbol(symbol);if(!s)return null;
  const rows=Array.isArray(scan?.items)?scan.items:[];
  const row=rows.find(x=>cleanSymbol(x.symbol)===s)||rows.find(x=>cleanSymbol(x.baseAsset)===s.replace(/USDT$/,''));
  if(!row)return{symbol:s,found:false};
  return{...safeCandidate(row),found:true,structure:row.structure||null,momentum:row.momentum||null,summary:row.summary||null,
    tradeSignal:row.tradeSignal?{level:row.tradeSignal.level||null,confidence:n(row.tradeSignal.confidence),reasons:(row.tradeSignal.reasons||[]).slice(0,4),invalidations:(row.tradeSignal.invalidations||[]).slice(0,4)}:null};
}
function focusFromDetail(detail={},symbol=null){
  if(!detail||detail.ok===false)return null;
  const s=cleanSymbol(detail.symbol||symbol);if(!s)return null;
  if(detail.externalFuturesOnly){
    const m=detail.externalMarket||{},pre=detail.preSurge||{},reasons=Array.isArray(pre.reasons)?pre.reasons.slice(0,4):[];
    return{
      symbol:s,found:true,category:String(pre.stage||'외부 선물 관찰'),sector:'기타',marketScope:'futures-external',
      futuresListed:true,spotListed:false,price:n(m.price),change24h:n(m.change24),candidateScore:null,preIgnitionScore:n(pre.score),
      scanClass:{key:'EXTERNAL-FUTURES',label:String(detail.confidence?.label||'멀티거래소 선물 시세 관찰')},
      reason:String(reasons[0]||detail.riskGate?.warn?.[0]||'멀티거래소 선물 상세 확인'),reasons,
      dataState:'live',autoDeepEligible:false,summary:String(detail.confidence?.label||'멀티거래소 선물 시세 관찰'),
      derivatives:{openInterestUsd:n(m.openInterestUsd),fundingRate:n(m.fundingRate),exchangeCount:n(m.exchangeCount),sourceExchanges:(detail.sourceExchanges||[]).slice(0,8)}
    };
  }
  const pre=detail.preSurge||{},market=detail.market||'detail',price=n(detail.lastPrice,n(detail.price,n(detail.project?.priceUsd)));
  const change=n(detail.priceChange24h,n(detail.change24,n(detail.project?.change24)));
  const reasons=Array.isArray(pre.reasons)?pre.reasons.slice(0,4):[];
  return{
    symbol:s,found:true,category:String(pre.stage||detail.confidence?.label||'상세 분석'),sector:String(detail.sector||'기타'),
    marketScope:String(market),futuresListed:market==='futures'||Boolean(detail.derivatives?.available),spotListed:market==='spot',
    price,change24h:change,candidateScore:n(detail.candidateScore),preIgnitionScore:n(pre.score),
    scanClass:{key:'DETAIL',label:String(detail.confidence?.label||pre.stage||'상세 분석')},
    reason:String(reasons[0]||detail.summary?.headline||'상세 데이터 확인'),reasons,dataState:'live',autoDeepEligible:false,
    summary:String(detail.summary?.headline||pre.stage||detail.confidence?.label||'상세 데이터 확인'),
    derivatives:detail.derivatives?{openInterestUsd:n(detail.derivatives.openInterestUsdApprox),fundingRate:n(detail.derivatives.fundingRate),takerRatio:n(detail.derivatives.takerBuySellRatio)}:null
  };
}
function detailContext(detail={},symbol=null){
  const f=focusFromDetail(detail,symbol);if(!f)return null;
  return{symbol:f.symbol,found:f.found,category:f.category,marketScope:f.marketScope,price:f.price,change24h:f.change24h,
    preIgnitionScore:f.preIgnitionScore,reason:f.reason,reasons:f.reasons,scanClass:f.scanClass,derivatives:f.derivatives||null};
}
function researchSnapshot(status={}){
  const model=status?.model||{};
  return{
    version:String(status?.version||'RESEARCH_AI_v2'),shadowOnly:status?.shadowOnly!==false,
    observations:n(status?.observations,0),pending:n(status?.pending,0),labels:n(status?.labels,0),
    positive:n(status?.positive,0),negative:n(status?.negative,0),
    model:{type:model.type||null,state:model.state||'SHADOW',active:Boolean(model.active),minimumLabels:n(model.minimumLabels,20),trainedAt:n(model.trainedAt)},
    research:status?.research||null,persistence:status?.persistence||null
  };
}
function summaryText(scan,researchStatus=null){
  const m=marketPulse(scan),c=topCandidates(scan,5),s=sectorRows(scan,3),q=dataQuality(scan);
  const regime=m.regime==='RISK_ON'?'상승 확산':m.regime==='RISK_OFF'?'위험 축소':'혼조';
  const breadth=`상승 ${m.up} · 하락 ${m.down} · 중앙값 ${pct(m.medianChange24h)}`;
  const names=c.slice(0,3).map(x=>x.symbol).join(', ')||'뚜렷한 초기 후보 없음';
  const sectors=s.slice(0,2).map(x=>x.sector).join(', ')||'섹터 집중 없음';
  const r=researchStatus?researchSnapshot(researchStatus):null;
  const learn=r?` Research AI는 ${r.labels}/${r.model.minimumLabels} 라벨(${r.model.state})입니다.`:'';
  const quality=q.state==='LIVE'?'데이터 정상':`데이터 ${q.state}`;
  return `시장 상태는 ${regime}입니다. ${breadth}. 아직 과진행되지 않은 우선 관찰은 ${names}, 섹터 집중은 ${sectors}입니다. ${quality}.${learn}`;
}
function symbolAnswer(row){
  if(!row?.found)return row?.symbol?`${row.symbol}은 현재 요약 스캔에서 찾지 못했습니다.`:'종목을 지정해 주세요.';
  const bits=[`${row.symbol} · ${row.category}`,`24H ${pct(row.change24h)}`];
  if(row.candidateScore!=null)bits.push(`후보점수 ${row.candidateScore}`);
  if(row.preIgnitionScore!=null)bits.push(`점화전 ${row.preIgnitionScore}`);
  if(row.scanClass?.label)bits.push(row.scanClass.label);
  const reason=row.reason||row.summary||'추가 근거 대기';
  return `${bits.join(' · ')}. 핵심 근거: ${reason}${row.dataState!=='live'?` · 데이터 상태 ${row.dataState}`:''}`;
}
function deterministicAnswer({question='',selectedSymbol=null,scan,eventCatalysts=[],researchStatus=null}={}){
  const q=String(question||'').trim(),upper=q.toUpperCase();
  let symbol=cleanSymbol(selectedSymbol);
  const tickers=(scan?.items||[]).map(x=>cleanSymbol(x.symbol)).filter(Boolean).sort((a,b)=>b.length-a.length);
  const mentioned=tickers.find(t=>upper.includes(t)||upper.includes(t.replace(/USDT$/,'')));
  if(mentioned)symbol=mentioned;
  if(symbol&&(mentioned||/이거|종목|상태|어때|왜|근거|눌림|리테스트|진입|점화/.test(q)))return{intent:'symbol',symbol,answer:symbolAnswer(focusSymbol(scan,symbol))};
  if(/이벤트|뉴스|일정|언락|상장|공식/.test(q)){
    const rows=(eventCatalysts||[]).filter(x=>!symbol||cleanSymbol(x.symbol)===symbol.replace(/USDT$/,'')).slice(0,5);
    const answer=rows.length?rows.map(x=>`${x.symbol} ${x.eventTypeKo||x.eventType||'이벤트'} · ${x.timingKo||'일정 미정'} · ${x.sourceTierKo||x.sourceTier||''}`).join('\n'):'현재 캐시된 공식·신뢰 이벤트가 없습니다.';
    return{intent:'events',symbol:symbol||null,answer};
  }
  if(/덜\s*간|덜\s*오른|핵심\s*후보|점화\s*전|점화전|후보만/.test(q)){
    const rows=topCandidates(scan,6);
    const answer=rows.length?rows.map((x,i)=>`${i+1}. ${x.symbol} · ${x.category} · 24H ${pct(x.change24h)} · 후보 ${x.candidateScore??'—'} · 점화전 ${x.preIgnitionScore??'—'} · ${x.reason||'근거 대기'}`).join('\n'):'현재 과진행을 제외한 우선 후보가 없습니다.';
    return{intent:'candidates',symbol:null,answer};
  }
  if(/급등한|이미\s*오른|과열|과진행/.test(q)){
    const rows=extendedLeaders(scan,6);
    const answer=rows.length?rows.map((x,i)=>`${i+1}. ${x.symbol} · 24H ${pct(x.change24h)} · ${x.category}`).join('\n'):'현재 별도로 분리할 과진행 종목이 없습니다.';
    return{intent:'extended',symbol:null,answer};
  }
  if(/섹터|시즌|순환|테마/.test(q)){
    const rows=sectorRows(scan,5);return{intent:'sectors',symbol:null,answer:rows.length?rows.map(x=>`${x.sector}: 후보 ${x.candidates}개 · 평균 ${pct(x.avgChange24h)} · ${x.leaders.join(', ')}`).join('\n'):'현재 뚜렷한 섹터 집중이 없습니다.'};
  }
  if(/리서치|연구|학습|AI|모델/.test(q)&&researchStatus){
    const r=researchSnapshot(researchStatus);return{intent:'research',symbol:null,answer:`Research AI v2는 ${r.model.state} / SHADOW_ONLY입니다. 관측 ${r.observations}개, 결과 대기 ${r.pending}개, 확정 라벨 ${r.labels}개(${r.positive} 성공 · ${r.negative} 실패)이며 모델 활성 기준은 ${r.model.minimumLabels}개입니다.`};
  }
  return{intent:'market',symbol:symbol||null,answer:summaryText(scan,researchStatus)};
}
function snapshot(scan,researchStatus=null,selectedSymbol=null,now=Date.now()){
  return{
    version:VERSION,market:marketPulse(scan),dataQuality:dataQuality(scan,now),
    candidates:topCandidates(scan,8),extended:extendedLeaders(scan,5),sectors:sectorRows(scan,6),
    focus:focusSymbol(scan,selectedSymbol),researchAI:researchStatus?researchSnapshot(researchStatus):null
  };
}

module.exports={VERSION,n,pct,cleanSymbol,isExtended,topCandidates,extendedLeaders,sectorRows,marketPulse,dataQuality,focusSymbol,focusFromDetail,detailContext,researchSnapshot,summaryText,deterministicAnswer,snapshot};
