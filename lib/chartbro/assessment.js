(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ChartBroAssessment=api;})(globalThis,function(){'use strict';
const VERSION='explainable-research-v1',finite=Number.isFinite;
/** Condition strength is an independent long research preset, never a win probability. */
function assess(a){
 const bullish=[],contradictions=[],unknown=[],at=a.decision_at,f=a.features||{},q=a.data_quality||{};
 const fact=(list,code,text,value=null,refs=[])=>list.push({id:code+':'+at,code,text,value,reference_ids:refs,known_at:at,venue:a.instrument?.venue||null,timeframe:a.timeframe||null});
 const setups=(a.setups||[]).filter(s=>s.known_at<=at&&s.side==='long');
 const setup=[...setups].reverse().find(s=>!['INVALIDATED','EXPIRED'].includes(s.state))||setups.at(-1);
 const fresh=!a.stale&&q.price==='fresh'&&finite(a.last_closed_bar_at)&&a.last_closed_bar_at<=at;
 const structureReady=['UP','DOWN','RANGE'].includes(a.structure);
 const gaps=(q.gaps||[]).length>0;
 if(!fresh)fact(contradictions,'STALE_PRICE','가격이 지연되었거나 기준 시각의 확정봉이 없습니다.');
 if(gaps)fact(unknown,'CANDLE_GAPS','누락 봉이 있어 구조 연속성을 확인할 수 없습니다.',q.gaps.length);
 if(a.structure==='UP')fact(bullish,'STRUCTURE_UP','이 시간봉의 확정 구조가 상승입니다.');
 else if(a.structure==='DOWN')fact(contradictions,'STRUCTURE_DOWN','이 시간봉의 하락 구조는 롱 가설의 반대 근거입니다.');
 else if(!structureReady)fact(unknown,'STRUCTURE_MISSING','확정 스윙이 부족해 구조를 판정할 수 없습니다.');
 if(finite(f.rvol)){if(f.rvol>=1.5)fact(bullish,'RVOL_EXPANSION','이전 봉 평균 대비 거래량이 늘었습니다.',f.rvol);else fact(contradictions,'RVOL_WEAK','현재 확정봉 거래량은 연구 기준 1.5배 미만입니다.',f.rvol);}
 else fact(unknown,'RVOL_MISSING','RVOL 계산에 필요한 봉이 부족합니다.');
 if(finite(f.compression_pct)){if(f.compression_pct<=5)fact(bullish,'EMA_COMPRESSION','이평 간격이 연구 기준 5% 이내입니다. 압축 자체는 진입 확인이 아닙니다.',f.compression_pct);else fact(contradictions,'EMA_SPREAD','이평 간격이 연구 기준 5%를 넘습니다.',f.compression_pct);}
 else fact(unknown,'COMPRESSION_MISSING','이평 압축 계산이 준비되지 않았습니다.');
 const trigger=setup?.state==='TRIGGER_CONFIRMED'&&setup.trigger_at===a.last_closed_bar_at;
 if(trigger)fact(bullish,'CLOSED_TRIGGER','롱 셋업의 실행 조건이 마지막 확정봉에서 확인됐습니다.',setup.trigger_at,[setup.id]);
 if(setup?.state==='INVALIDATED')fact(contradictions,'SETUP_INVALIDATED','롱 셋업이 구조 조건으로 무효화됐습니다.',setup.invalidation_level,[setup.id]);
 if(!trigger)fact(unknown,'EXECUTION_WAIT','현재 봉의 롱 실행 확인은 없습니다.');
 const flow=a.flow||{},oi=flow.oi,taker=flow.taker?.at(-1),funding=flow.funding;
 const oiGood=fresh&&oi?.quality==='fresh'&&finite(oi.contracts_change_pct)&&finite(oi.window_end)&&oi.window_end<=at&&at-oi.window_end<=3600000;
 const takerGood=fresh&&taker?.coverage!=='partial'&&taker?.eligible_for_confirmation!==false&&finite(taker?.ratio)&&finite(taker?.observed_at)&&taker.observed_at<=at&&at-taker.observed_at<=1800000;
 const fundingGood=fresh&&finite(funding?.rate)&&finite(funding?.observed_at)&&funding.observed_at<=at&&at-funding.observed_at<=12*3600000;
 if(oiGood)fact(oi.contracts_change_pct>0?bullish:contradictions,oi.contracts_change_pct>0?'OI_INCREASE':'OI_DECREASE','OI 계약 수량 변화입니다. 방향을 단독으로 확정하지 않습니다.',oi.contracts_change_pct);
 else fact(unknown,'OI_MISSING','기준 시각의 OI 변화 이력이 미확보·지연 상태입니다.');
 if(takerGood)fact(taker.ratio>=1.15?bullish:contradictions,taker.ratio>=1.15?'TAKER_BUY':'TAKER_WEAK','확보한 시간창의 테이커 매수/매도 비율입니다.',taker.ratio);
 else fact(unknown,'TAKER_MISSING','완전한 시간창의 테이커 흐름을 확인하지 못했습니다.');
 if(!fundingGood)fact(unknown,'FUNDING_MISSING','기준 시각의 정산 펀딩을 확인하지 못했습니다.');
 else if(funding.rate>=.001)fact(contradictions,'FUNDING_HEAT','정산 펀딩이 연구 경고 기준 0.1% 이상입니다.',funding.rate);
 const nearest=(a.targets||[]).filter(t=>t.side==='above'&&finite(t.price)).at(0);
 if(nearest?.obstacles?.length)fact(contradictions,'TARGET_OBSTACLES','가까운 위쪽 목표까지 반대 구간이 있습니다.',nearest.obstacles.length,nearest.obstacles);
 fact(unknown,'ONCHAIN_NOT_CONNECTED','온체인·지갑 라벨은 이 분석에 연결되지 않았습니다.');
 const breakdown={structure:{label:'확정 구조',value:structureReady?(a.structure==='UP'?25:a.structure==='RANGE'?10:0):null,max:25},volume:{label:'RVOL',value:finite(f.rvol)?(f.rvol>=1.5?25:0):null,max:25},compression:{label:'이평 압축',value:finite(f.compression_pct)?(f.compression_pct<=5?25:0):null,max:25},execution:{label:'현재 봉 롱 확인',value:trigger?25:0,max:25}};
 const ready=Object.values(breakdown).every(x=>x.value!==null),score=ready?Object.values(breakdown).reduce((n,x)=>n+x.value,0):null;
 const grade=!fresh||gaps?'D':!ready||!oiGood||!takerGood||!fundingGood?'C':q.tick_size==='verified'?'A':'B';
 const stage=!fresh||gaps||!structureReady?'INSUFFICIENT_DATA':setup?.state||'OBSERVE';
 return {version:VERSION,side:'long',scope:'single_timeframe_price_and_derivatives',score,score_label:'롱 조건 강도 · 독립 연구',score_is_probability:false,breakdown,confidence:{grade,scope:'가격·파생 데이터 품질',price:fresh?'fresh':'stale',derivatives_complete:oiGood&&takerGood&&fundingGood},stage,eligible_for_confirmation:fresh&&!gaps&&structureReady&&trigger,bullish,contradictions,unknown,as_of:at};
}
return {VERSION,assess};
});
