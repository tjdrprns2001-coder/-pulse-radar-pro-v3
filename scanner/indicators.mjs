// All inputs are CLOSED bars, chronological. No future bars enter features.
export const TF = ['1w','3d','1d','12h','4h','3h','2h','1h','15m','5m'];
export const SMA_PERIODS=[5,10,20,60,120], EMA_PERIODS=[5,20,60,92,112,224,448];
export const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
export const last=a=>a.length?a[a.length-1]:null;
export const pct=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b!==0?(a/b-1)*100:null;
export function closedBars(raw,asOf=Date.now()){return raw.filter(r=>Number(r[6])<asOf).map(r=>({t:+r[0],o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:+r[5],end:+r[6],q:+r[7],buy:+r[9]})).filter(b=>Object.values(b).every(Number.isFinite)).sort((a,b)=>a.t-b.t);}
export function resample3h(bars,asOf=Date.now()){
 const groups=new Map();for(const b of bars){const t=Math.floor(b.t/10800000)*10800000;if(!groups.has(t))groups.set(t,[]);groups.get(t).push(b);}
 return [...groups].filter(([t,a])=>a.length===3&&a[0].t===t&&a[1].t===t+3600000&&a[2].t===t+7200000&&t+10800000<=asOf).map(([t,a])=>({t,o:a[0].o,h:Math.max(...a.map(b=>b.h)),l:Math.min(...a.map(b=>b.l)),c:a[2].c,v:a.reduce((s,b)=>s+b.v,0),q:a.reduce((s,b)=>s+b.q,0),buy:a.every(b=>Number.isFinite(b.buy))?a.reduce((s,b)=>s+b.buy,0):null,end:t+10800000-1,_source:a.every(b=>b._source===a[0]._source)?a[0]._source:null}));
}
export function sma(a,n){return a.length>=n?mean(a.slice(-n)):null;}
export function emaSeries(a,n){const out=a.map(()=>null);if(a.length<n)return out;let v=mean(a.slice(0,n));out[n-1]=v;for(let i=n;i<a.length;i++){v=a[i]*2/(n+1)+v*(1-2/(n+1));out[i]=v;}return out;}
export function rsiSeries(a,n=14){const out=a.map(()=>null);if(a.length<=n)return out;let g=0,l=0;for(let i=1;i<=n;i++){g+=Math.max(0,a[i]-a[i-1]);l+=Math.max(0,a[i-1]-a[i]);}g/=n;l/=n;const val=()=>l===0?(g===0?50:100):100-100/(1+g/l);out[n]=val();for(let i=n+1;i<a.length;i++){g=(g*(n-1)+Math.max(0,a[i]-a[i-1]))/n;l=(l*(n-1)+Math.max(0,a[i-1]-a[i]))/n;out[i]=val();}return out;}
export function atrSeries(b,n=14){const tr=b.map((v,i)=>i?Math.max(v.h-v.l,Math.abs(v.h-b[i-1].c),Math.abs(v.l-b[i-1].c)):v.h-v.l);const out=b.map(()=>null);if(b.length<n)return out;let a=mean(tr.slice(0,n));out[n-1]=a;for(let i=n;i<b.length;i++){a=(a*(n-1)+tr[i])/n;out[i]=a;}return out;}
export function pivots(b,width=3){let highs=[],lows=[];for(let i=width;i<b.length-width;i++){let hi=true,lo=true;for(let j=i-width;j<=i+width;j++){if(j===i)continue;if(b[j].h>=b[i].h)hi=false;if(b[j].l<=b[i].l)lo=false;}if(hi)highs.push({i,t:b[i].t,p:b[i].h,confirmedAt:b[i+width].end});if(lo)lows.push({i,t:b[i].t,p:b[i].l,confirmedAt:b[i+width].end});}return {highs,lows};}
function divergence(points,b,series,side){if(points.length<2)return null;const [p,q]=points.slice(-2);if(q.i-p.i<3||b.length-1-q.i>50||series[p.i]==null||series[q.i]==null)return null;return side==='bull'?q.p<p.p&&series[q.i]>series[p.i]:q.p>p.p&&series[q.i]<series[p.i];}
export function analyze(b,{fast=false}={}){
 if(b.length<35)return {available:false,bars:b.length,reason:'확정봉 35개 미만'};
 const c=b.map(v=>v.c),v=b.map(x=>x.v),z=last(b),prev=b.at(-2),rs=rsiSeries(c),e12=emaSeries(c,12),e26=emaSeries(c,26);
 const macd=c.map((_,i)=>e26[i]==null?null:e12[i]-e26[i]),valid=macd.filter(x=>x!=null),sig=emaSeries(valid,9),signal=last(sig),hist=signal==null?null:last(macd)-signal,oldHist=sig.at(-2)==null?null:valid.at(-2)-sig.at(-2);
 const atr=last(atrSeries(b)),vol=sma(v.slice(0,-1),20),rvol=vol>0?z.v/vol:null;
 const smas=Object.fromEntries(SMA_PERIODS.map(n=>[n,sma(c,n)])),emas=Object.fromEntries(EMA_PERIODS.map(n=>[n,last(emaSeries(c,n))]));
 let obv=0;const os=c.map((x,i)=>{if(i)obv+=x>c[i-1]?v[i]:x<c[i-1]?-v[i]:0;return obv;});
 const recent=b.slice(-20),rangeHigh=Math.max(...recent.map(x=>x.h)),rangeLow=Math.min(...recent.map(x=>x.l));
 const compression=atr>0?(Math.max(...[5,10,20,60].map(n=>smas[n]).filter(x=>x!=null))-Math.min(...[5,10,20,60].map(n=>smas[n]).filter(x=>x!=null)))/atr:null;
 const wasCompressed=b.length>=80?Array.from({length:12},(_,i)=>{const history=c.slice(0,-i-1),m=[5,10,20,60].map(n=>sma(history,n));return m.every(x=>x!=null)&&atr>0&&(Math.max(...m)-Math.min(...m))/atr<=1;}).some(Boolean):null;
 const breakout20=z.c>Math.max(...b.slice(-21,-1).map(x=>x.h));
 const ignitionStructure={wasCompressed,breakout20,trigger:wasCompressed===true&&breakout20&&rvol>=3};
 const buy=Number.isFinite(z.buy)?z.buy:null,sell=buy!=null?z.v-buy:null,taker=buy!=null&&sell>0?buy/sell:null;
 const base={ignitionStructure,available:true,bars:b.length,asOf:z.end,price:z.c,rsi:last(rs),macd:{value:last(macd),signal,histogram:hist,delta:hist!=null&&oldHist!=null?hist-oldHist:null},obv:last(os),obvRising:last(os)>os.at(-6),rvol,atr,sma:smas,ema:emas,above20:smas[20]!=null?z.c>smas[20]:null,above60:smas[60]!=null?z.c>smas[60]:null,alignment:smas[60]!=null&&smas[120]!=null?(smas[5]>smas[10]&&smas[10]>smas[20]&&smas[20]>smas[60]&&smas[60]>smas[120]):null,compression,compressed:compression!=null?compression<=1:null,extensionAtr:atr>0?(z.c-smas[20])/atr:null,change20:pct(z.c,c.at(-21)),rangePosition:rangeHigh>rangeLow?(z.c-rangeLow)/(rangeHigh-rangeLow):0.5,takerKline:taker,sparkline:c.slice(-40),ema448Warmup:b.length>=896?'충분':b.length>=448?'최소':'부족'};
 if(fast)return base;
 const sr=rs.map((r,i)=>{const w=rs.slice(Math.max(0,i-13),i+1);if(w.length<14||w.some(x=>x==null))return null;let lo=Math.min(...w),hi=Math.max(...w);return hi>lo?(r-lo)/(hi-lo)*100:50;});
 const ks=sr.map((_,i)=>i>=2&&sr.slice(i-2,i+1).every(x=>x!=null)?mean(sr.slice(i-2,i+1)):null);const ds=ks.map((_,i)=>i>=2&&ks.slice(i-2,i+1).every(x=>x!=null)?mean(ks.slice(i-2,i+1)):null);
 let k=50,d=50;for(let i=8;i<b.length;i++){const w=b.slice(i-8,i+1),lo=Math.min(...w.map(x=>x.l)),hi=Math.max(...w.map(x=>x.h)),r=hi>lo?(b[i].c-lo)/(hi-lo)*100:50;k=2/3*k+r/3;d=2/3*d+k/3;}
 const {highs,lows}=pivots(b);const hh=highs.at(-1),ll=lows.at(-1),ph=highs.at(-2),pl=lows.at(-2);
 const bias=hh&&ll&&ph&&pl?(hh.p>ph.p&&ll.p>pl.p?'up':hh.p<ph.p&&ll.p<pl.p?'down':'range'):'unknown';
 const up=!!hh&&prev.c<=hh.p&&z.c>hh.p,down=!!ll&&prev.c>=ll.p&&z.c<ll.p;
 const choch=up&&bias==='down'?'bull':down&&bias==='up'?'bear':null;
 const bos=up?(bias==='down'?null:'bull'):down?(bias==='up'?null:'bear'):null;
 const displacement=atr>0&&Math.abs(z.c-z.o)>=atr*0.8;
 const sweep=ll&&z.l<ll.p&&z.c>ll.p?'SSL reclaim':hh&&z.h>hh.p&&z.c<hh.p?'BSL reject':null;
 const fvgs=[];for(let i=Math.max(2,b.length-100);i<b.length;i++){let f=null;if(b[i].l>b[i-2].h)f={side:'bull',low:b[i-2].h,high:b[i].l,t:b[i].t};if(b[i].h<b[i-2].l)f={side:'bear',low:b[i].h,high:b[i-2].l,t:b[i].t};if(f&&!b.slice(i+1).some(x=>f.side==='bull'?x.l<=f.low:x.h>=f.high))fvgs.push(f);}
 let ob=null;if(up||down){for(let i=b.length-2;i>=Math.max(0,b.length-15);i--){if(up?b[i].c<b[i].o:b[i].c>b[i].o){ob={side:up?'bull':'bear',low:b[i].l,high:b[i].h,t:b[i].t};break;}}}
 // Descending resistance through two confirmed highs separated by >=20 bars.
 let trendline=null;const anchor=highs.slice(0,-1).reverse().find(p=>hh&&hh.i-p.i>=20&&p.p>hh.p);
 if(anchor&&hh){const slope=(hh.p-anchor.p)/(hh.i-anchor.i),level=hh.p+slope*(b.length-1-hh.i),prior=level-slope;trendline={level,slope,span:hh.i-anchor.i,breakout:prev.c<=prior&&z.c>level,retest:prev.c>prior&&z.l<=level+atr*.25&&z.c>level,above:z.c>level};}
 let bowl=null;if(b.length>=224){const early=b.slice(-224,-112),middle=b.slice(-112,-20);const high=Math.max(...early.map(x=>x.h)),low=Math.min(...middle.map(x=>x.l));const drop=pct(low,high),reclaim=z.c>emas[224],acc=middle.filter(x=>x.c<emas[224]).length/middle.length>.6;bowl={drawdown:drop,stage:drop<-20?(reclaim?(base.change20>15?'4번 진행':'3번 회복'):acc?'2번 축적':'1번 하락'):'미형성',heuristic:true};}
 return {...base,stochRsi:{k:last(ks),d:last(ds)},kdj:{k,d,j:3*k-2*d},structure:{bias,bos,choch,mss:choch&&displacement?choch:null,bsl:hh?.p??null,ssl:ll?.p??null,sweep,fvg:fvgs.slice(-4),ob,trendline,bowl},divergence:{rsiBull:divergence(lows,b,rs,'bull'),rsiBear:divergence(highs,b,rs,'bear'),macdBull:divergence(lows,b,macd,'bull'),macdBear:divergence(highs,b,macd,'bear'),obvBull:divergence(lows,b,os,'bull'),obvBear:divergence(highs,b,os,'bear')}};
}
export function classify(row){const f=row.frames||{},h=f['1h'],q=f['4h'],m=f['15m'],s=f['5m'];if(!h?.available||!q?.available)return {status:'제외',reasons:['1H/4H 데이터 부족']};
 const reasons=[];const ratio=row.taker?.ratio??h.takerKline;const bullish=ratio!=null&&ratio>1.2;const hot=h.rsi>=75||(m?.available&&m.rsi>=82)||h.extensionAtr>3;
 if(hot)return {status:'과열',reasons:['RSI 또는 이평 이격 과열']};
 if(row.change>10||h.change20>15)return {status:'이미 진행',reasons:['가격 선행 상승']};
 if(q.structure?.bos==='bear'||q.structure?.mss==='bear'||ratio!=null&&ratio<.8)return {status:'제외',reasons:['상위 구조 이탈 또는 taker 매도 우위']};
 if(h.structure?.trendline?.retest)return {status:'리테스트',reasons:['1H 하락추세선 돌파 후 재확인']};
 if((m?.rvol>=3||s?.rvol>=3)&&bullish&&h.above20){reasons.push('분봉 RVOL ≥3','taker 매수 우위','1H MA20 위');return {status:'점화초기',reasons};}
 if(h.obvRising&&h.above60&&h.rvol!=null&&h.rvol<1.5&&q.above20)return {status:'재축적',reasons:['추세 유지 · 거래량 진정 · OBV 상승']};
 if(h.compressed&&h.above20&&row.oi?.change4h>1)return {status:'점화대기',reasons:['이평 압축','OI 선행 증가','MA20 회복']};
 return {status:'점화전',reasons:[row.oi?.change4h>1?'OI 선행 증가':'OI 추가 확인',h.compressed?'이평 압축':'압축·점화 추가 확인']};}
export function rank(h,q,oi){return Math.round(Math.max(0,Math.min(100,20+Math.min(15,Math.max(0,oi||0)*2)+(h?.above20?10:0)+(q?.above20?10:0)+(h?.obvRising?10:0)+(h?.compressed?15:0)+(h?.rsi>=40&&h?.rsi<=65?10:0)+(h?.macd?.delta>0?10:0)-(h?.rsi>75?20:0))));}
export function vector(h,oi=null){if(!h?.available)return null;return {rsi:h.rsi/100,rvol:h.rvol==null?null:Math.min(5,h.rvol)/5,compression:h.compression==null?null:Math.min(5,h.compression)/5,extension:h.extensionAtr==null?null:Math.max(-5,Math.min(5,h.extensionAtr))/5,obv:h.obvRising?1:0,macd:h.atr>0?h.macd.histogram/h.atr:null,oi:oi==null?null:Math.max(-20,Math.min(20,oi))/20};}
export function similarity(a,b){if(!a||!b)return null;const keys=Object.keys(a).filter(k=>Number.isFinite(a[k])&&Number.isFinite(b[k]));if(keys.length<5)return null;const distance=Math.sqrt(keys.reduce((s,k)=>s+(a[k]-b[k])**2,0)/keys.length);return {score:Math.round(100*Math.max(0,1-distance)),dimensions:keys.length};}
