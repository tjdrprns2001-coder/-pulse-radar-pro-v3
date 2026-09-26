'use strict';

const TYPE_KO=Object.freeze({
  listing:'신규 상장',delisting:'상장폐지',futures_listing:'선물 상장',futures_delisting:'선물 상장폐지',
  token_unlock:'토큰 언락',token_swap:'토큰 스왑',migration:'토큰 마이그레이션',mainnet:'메인넷',
  upgrade:'네트워크 업그레이드',hardfork:'하드포크',governance:'거버넌스',airdrop:'에어드롭',
  snapshot:'스냅샷',partnership:'파트너십',product_launch:'제품·기능 출시',conference:'행사·컨퍼런스',
  regulatory:'규제 이슈',etf:'ETF 관련',lawsuit:'소송·법적 이슈',exchange_notice:'거래소 공지',
  official_news:'프로젝트 공식 뉴스',other:'기타 이벤트'
});
const TIER_KO=Object.freeze({A:'공식 확정',B:'신뢰 매체',C:'미확인·커뮤니티'});

function baseSymbol(v){
  return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/(USDT|USDC|FDUSD|BUSD|USD)$/,'');
}
function n(v){if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null}
function isoMs(v){if(!v)return null;const t=Date.parse(String(v));return Number.isFinite(t)?t:null}
function timingKo(ms,now){
  if(ms==null)return'일정 미정';
  const h=(ms-now)/3600000;
  if(h>=0&&h<1)return'1시간 이내';
  if(h>=1&&h<24)return`${Math.ceil(h)}시간 후`;
  if(h>=24)return`D-${Math.ceil(h/24)}`;
  const ago=Math.abs(h);
  if(ago<24)return`${Math.ceil(ago)}시간 전`;
  return`D+${Math.ceil(ago/24)}`;
}
function technicalState(row){
  if(row&&row.dataState&&row.dataState!=='live')return'데이터 확인 필요';
  const c=String(row?.category||'');
  if(c.includes('급등 전조'))return'기술 신호 동반';
  if(c.includes('급등')||c.includes('과열'))return'이미 진행·과열 확인';
  if(c.includes('매수세')||c.includes('거래량'))return'초기 반응 관찰';
  return'이벤트 관찰';
}
function enrichCatalysts(events=[],scan=null,now=Date.now()){
  const rows=new Map((scan?.items||[]).map(x=>[baseSymbol(x.symbol),x])),seen=new Set(),out=[];
  for(const [i,x] of (Array.isArray(events)?events:[]).entries()){
    const symbol=baseSymbol(x?.symbol),eventTime=isoMs(x?.eventTime),tier=['A','B','C'].includes(String(x?.sourceTier||'').toUpperCase())?String(x.sourceTier).toUpperCase():'C';
    const sourceUrl=x?.sourceUrl||null,key=[symbol,x?.eventType||'other',eventTime||'NA',sourceUrl||x?.sourceName||''].join('|');
    if(seen.has(key))continue;seen.add(key);
    const row=rows.get(symbol)||null,technicalStateKo=technicalState(row),hoursUntil=eventTime==null?null:(eventTime-now)/3600000;
    if(hoursUntil!=null&&hoursUntil<-24*30)continue;
    let catalystScore=tier==='A'?12:tier==='B'?6:0;
    if(Boolean(x?.confirmed)&&tier!=='C')catalystScore+=2;
    if(hoursUntil!=null&&hoursUntil>=0&&hoursUntil<=72)catalystScore+=4;
    if(technicalStateKo==='기술 신호 동반')catalystScore+=6;
    if(technicalStateKo==='데이터 확인 필요')catalystScore=Math.max(0,catalystScore-5);
    catalystScore=Math.min(20,catalystScore);
    out.push({
      id:String(x?.id||`${symbol||'EVENT'}-${eventTime||'NA'}-${i}`),symbol,eventType:String(x?.eventType||'other'),
      eventTypeKo:TYPE_KO[x?.eventType]||TYPE_KO.other,titleKo:String(x?.titleKo||'이벤트 확인'),
      summaryKo:String(x?.summaryKo||''),eventTime:eventTime==null?null:new Date(eventTime).toISOString(),
      timingKo:timingKo(eventTime,now),hoursUntil:hoursUntil==null?null:Number(hoursUntil.toFixed(2)),
      sourceTier:tier,sourceTierKo:TIER_KO[tier],sourceName:String(x?.sourceName||'출처 미상'),sourceUrl,
      confirmed:Boolean(x?.confirmed&&tier!=='C'),technicalStateKo,catalystScore,scanCategory:row?.category||null,dataState:row?.dataState||null
    });
  }
  return out.sort((a,b)=>b.catalystScore-a.catalystScore||((a.hoursUntil??1e9)-(b.hoursUntil??1e9))).slice(0,20);
}
function summarizeCatalysts(events=[],searched=true){
  const a=Array.isArray(events)?events:[];
  if(!a.length)return searched?'현재 확인된 공식·신뢰 이벤트 촉매가 없습니다.':'외부 이벤트 검색을 사용할 수 없어 기술 데이터만 표시합니다.';
  const trusted=a.filter(x=>x.sourceTier==='A'||x.sourceTier==='B');
  const soon=trusted.filter(x=>x.hoursUntil!=null&&x.hoursUntil>=0&&x.hoursUntil<=72);
  const tech=trusted.filter(x=>x.technicalStateKo==='기술 신호 동반');
  const top=trusted.slice(0,3).map(x=>`${x.symbol} ${x.eventTypeKo}(${x.timingKo})`);
  return `공식·신뢰 이벤트 ${trusted.length}건을 확인했습니다. 72시간 내 예정 ${soon.length}건, 기술 신호 동반 ${tech.length}건입니다.${top.length?` 주요: ${top.join(', ')}.`:''}`;
}
module.exports={TYPE_KO,TIER_KO,baseSymbol,timingKo,technicalState,enrichCatalysts,summarizeCatalysts};
