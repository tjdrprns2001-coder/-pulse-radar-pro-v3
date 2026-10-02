(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartAnalysisCard=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const $=id=>document.getElementById(id),missing=v=>v==null||(typeof v==='string'&&v.trim()===''),finite=v=>!missing(v)&&Number.isFinite(Number(v));
function price(v){if(!finite(v))return'N/A';const n=Number(v);if(Math.abs(n)>=100)return n.toLocaleString('en-US',{maximumFractionDigits:2});if(Math.abs(n)>=1)return n.toFixed(4);return n.toPrecision(5)}
function pct(v,d=2){return finite(v)?Number(v).toFixed(d)+'%':'N/A'}
function ratio(v){return finite(v)?Number(v).toFixed(2):'N/A'}
function localTime(ms){if(!finite(ms))return'-';return new Date(Number(ms)).toLocaleString('ko-KR',{hour12:false,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
function setText(id,v){const e=$(id);if(e)e.textContent=v??'-'}
function zoneSource(z){if(!z)return'';const xs=z.timeframes?.length?z.timeframes:[z.sourceTimeframe||z.timeframe];return xs.filter(Boolean).map(x=>String(x).toUpperCase()).join('+')}
function zoneText(z){if(!z)return'N/A';const status=z.statusLabel?(' · '+z.statusLabel):'';return price(z.low)+'–'+price(z.high)+' · '+zoneSource(z)+status}
function labelBias(v){return v==='BULL'?'상승':v==='BEAR'?'하락':v==='NEUTRAL'?'중립':'N/A'}
function latestKind(xs=[]){const x=xs.at(-1);return x?String(x.kind||'').replaceAll('_',' '):'없음'}
function ret(candles,n=20){if(!Array.isArray(candles)||candles.length<n+1)return null;const a=Number(candles.at(-1-n)?.close),b=Number(candles.at(-1)?.close);return a?((b/a)-1)*100:null}
function renderMatrix(analysis){
 const box=$('mtfMatrix');if(!box)return;box.innerHTML='';
 for(const r of analysis.multiTimeframe?.rows||[]){const d=document.createElement('div');d.className='tfCell';d.dataset.bias=String(r.bias||'UNKNOWN').toLowerCase();d.innerHTML='<b>'+String(r.timeframe).toUpperCase()+'</b><span>'+r.role+'</span><strong>'+labelBias(r.bias)+'</strong><em>'+String(r.setup||'N/A').replaceAll('_',' ')+'</em>';box.append(d)}
}
function render(analysis,{aux=null}={}){
  if(!analysis?.available)return;
  const a=analysis.advanced||{},mtf=analysis.multiTimeframe||{};
  setText('cardStructure',analysis.structure.label+(analysis.structure.evidence?.length?' · '+analysis.structure.evidence.join('/'):''));
  setText('cardStage',analysis.setup.label);
  const s=analysis.keyLevels.support,r=analysis.keyLevels.resistance;setText('cardSupport',zoneText(s));setText('cardResistance',zoneText(r));const hs=analysis.htfKeyLevels?.support,hr=analysis.htfKeyLevels?.resistance;setText('cardHtf',analysis.higherTimeframes?.length?('지지 '+zoneText(hs)+' / 저항 '+zoneText(hr)):'선택 TF 단독');
  const vol=analysis.volume||{};setText('cardVolume',vol.rvol20==null?'N/A':(Number(vol.rvol20).toFixed(2)+'x · 24h spike '+(vol.spikes24h?.length||0)+' / 72h '+(vol.spikes72h?.length||0)));
  setText('cardEnvironment','1W·1D '+labelBias(mtf.regime)+' · 상승 '+Number(mtf.environment?.bull||0)+' / 하락 '+Number(mtf.environment?.bear||0));
  setText('cardSetupTf','4H·1H 상승근거 '+Number(mtf.setup?.bull||0)+' / 하락근거 '+Number(mtf.setup?.bear||0));
  setText('cardExecutionTf','LONG '+String(mtf.execution?.longState||'N/A')+' '+Number(mtf.execution?.longScore||0).toFixed(1)+' · SHORT '+String(mtf.execution?.shortState||'N/A')+' '+Number(mtf.execution?.shortScore||0).toFixed(1));
  setText('cardCompression',String(a.compressionState||'N/A')+' · EMA14/28/57/92 폭 '+pct(a.compressionPct));
  setText('cardMomentum','RSI '+ratio(a.rsi?.value)+' · MACD '+(a.macd?.histNow==null?'N/A':Number(a.macd.histNow).toPrecision(3))+' · '+(a.macd?.improving===true?'개선':a.macd?.improving===false?'약화':'N/A')+' · OBV5 '+pct(a.obv?.slope5));
  setText('cardDivergence','RSI '+String(a.rsi?.divergence||'NONE')+' · MACD '+String(a.macd?.divergence||'NONE')+' · OBV '+String(a.obv?.divergence||'NONE'));
  setText('cardLiquidity','EQ '+String((a.liquidity||[]).length)+' · 최근 '+latestKind(a.sweeps||[])+' · Hammer '+String((a.hammers||[]).length));
  setText('cardZones','FVG '+String((a.fvg||[]).length)+' · OB '+String((a.orderBlocks||[]).length));
  setText('cardVpvr',a.vpvr?('VAH '+price(a.vpvr.vah)+' · POC '+price(a.vpvr.poc)+' · VAL '+price(a.vpvr.val)):'N/A');
  setText('cardFib',a.fib?('0.382 '+price(a.fib.levels?.['0.382'])+' · 0.5 '+price(a.fib.levels?.['0.5'])+' · 0.618 '+price(a.fib.levels?.['0.618'])+' · 0.786 '+price(a.fib.levels?.['0.786'])):'N/A');
  setText('cardIchimoku',a.ichimoku?.baseNow!=null?('전환 '+price(a.ichimoku.conversionNow)+' · 기준 '+price(a.ichimoku.baseNow)+' · 구름 '+price(a.ichimoku.spanANow)+'/'+price(a.ichimoku.spanBNow)):'N/A');
  const ve=a.volumeEcho;setText('cardVolumeEcho',ve?((ve.active?'ACTIVE':'OFF')+' · anchor '+Number(ve.anchor?.rvol||0).toFixed(2)+'x · 현재 '+(ve.currentRvol==null?'N/A':Number(ve.currentRvol).toFixed(2)+'x')+' · 유지 '+(ve.retained?'Y':'N')):'N/A');
  const sp=a.specialSetups||{},d=sp.daily92142,h=sp.fourHLongEmaSupport;setText('cardSpecial',d?('1D 92→142 '+(d.ready?'READY':'WAIT')+' · 142거리 '+pct(d.distanceTo142Pct)):h?('4H '+(h.nearest?.period||'')+'EMA '+(h.reclaimed?'RECLAIM':h.holding?'HOLD':'AWAY')+' · 거리 '+pct(h.distancePct)):'선택 TF 전용 조건 없음');
  const inv=analysis.setup.invalidation;setText('cardInvalidation',inv?.price!=null?price(inv.price)+' · '+(inv.type==='range-low'?'박스 하단 이탈':'돌파 실패 기준'):'N/A');
  const c=analysis.setup.confirmation;setText('cardWaiting',c?.type==='close-above'?String(c.timeframe).toUpperCase()+' 종가 '+price(c.price)+' 위 확정':c?.type==='retest-hold'?'돌파 구간 '+price(c.low)+'–'+price(c.high)+' 재시험 지지':c?.type==='close-reclaim'?String(c.timeframe).toUpperCase()+' 종가 '+price(c.price)+' 재회복':analysis.setup.state==='RETEST_CONFIRMED'?'조건 충족 · 구조 유지 관찰':analysis.setup.state==='INVALIDATED'?'기존 시나리오 종료':'관찰 조건 미충족');
  if(aux?.derivatives?.available){const d=aux.derivatives;setText('cardDerivatives','OI4H '+pct(d.oi?.change4hPct)+' · Funding '+pct(d.funding?.ratePct,4)+' · Taker4H '+ratio(d.taker?.ratio4h))}
  else setText('cardDerivatives',analysis.market.marketType==='futures'?'OI/Funding/Taker N/A':'현물');
  const spotRet=ret(aux?.spot?.candles||[],20),futRet=ret(analysis.candles||[],20);
  if(finite(spotRet)&&finite(futRet)){const lead=spotRet>futRet+.15?'현물 선행':futRet>spotRet+.15?'선물 선행':'동행';setText('cardSpotLead',lead+' · 현물 '+pct(spotRet)+' / 선물 '+pct(futRet))}
  else setText('cardSpotLead','N/A');
  renderMatrix(analysis);
  setText('cardKnownAt','현재 상태 알려진 시각 · '+localTime(analysis.setup.knownAt));
  setText('updatedAt','데이터 '+localTime(analysis.dataStatus.updatedAt));
  const history=$('historyState');if(history){history.textContent=analysis.market?.fallback?'과거봉 정상 · 대체 소스':'과거봉 정상';history.dataset.state='ok'}
  const gaps=analysis.dataStatus.gaps||[],items=[],m=analysis.market||{};if(m.structureRuntime==='vercel-edge')items.push('Binance edge 우회 · Vercel');if(m.fallback)items.push('대체 소스 · '+String(m.dataSource||m.sourceExchange||'N/A'));if(gaps.length)items.push('누락 구간 '+gaps.length+'개');if(analysis.displayLevels?.length)items.push('표시 구간 '+analysis.displayLevels.length+'개');if(!analysis.range)items.push('유효 박스 없음');if(!s)items.push('확정 지지 N/A');if(!r)items.push('확정 저항 N/A');if(analysis.timeframeStack)items.push('MTF '+Object.values(analysis.timeframeStack).filter(x=>x.available).length+'/6');
  if(aux){if(aux.live?.available!==true)items.push('실시간 연결 지연');if(aux.derivatives?.available!==true&&analysis.market.marketType==='futures')items.push('OI/Taker N/A')}
  const box=$('dataNotes');if(box){box.innerHTML='';for(const t of(items.length?items:['핵심 데이터 정상'])){const span=document.createElement('span');span.textContent=t;box.append(span)}}
}
function loading(selection){setText('pageTitle',selection.symbol+' · '+String(selection.timeframe).toUpperCase());const e=$('historyState');if(e){e.textContent='과거봉 불러오는 중';e.dataset.state='loading'}}
function error(message,{keep=false}={}){const e=$('historyState');if(e){e.textContent=keep?'갱신 실패 · 이전 차트 유지':'데이터 오류';e.dataset.state='error'}setText('dataError',message||'데이터 오류')}
function live(aux){const e=$('liveState');if(!e)return;e.textContent=aux?.live?.available?'실시간 보조 정상':'실시간 지연 · 과거 차트 유지';e.dataset.state=aux?.live?.available?'ok':'warn'}
return{render,loading,error,live,price,localTime};
});