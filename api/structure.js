const BASES = ['https://api.binance.com','https://api-gcp.binance.com','https://data-api.binance.vision'];
const num = (v, f=0) => { const x = Number(v); return Number.isFinite(x) ? x : f; };
const clamp = (v,a=0,b=100) => Math.max(a, Math.min(b, v));

async function getJson(path, params={}) {
  const qs = new URLSearchParams(params).toString();
  let last = null;
  for (const base of BASES) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 3500);
    try {
      const r = await fetch(base + path + (qs ? '?' + qs : ''), {
        signal: ac.signal,
        headers: {'User-Agent':'PulseRadar-Pro/3.12.4b'}
      });
      const text = await r.text();
      if (!r.ok) throw new Error('Binance ' + r.status + ': ' + text.slice(0,120));
      return JSON.parse(text);
    } catch (e) {
      last = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw last || new Error('Binance request failed');
}

function ema(a,p){
  if(!a.length) return [];
  const k=2/(p+1), out=[]; let x=a[0];
  for(let i=0;i<a.length;i++){ x=i ? a[i]*k+x*(1-k) : a[i]; out.push(x); }
  return out;
}
function sma(a,p){
  const out=Array(a.length).fill(null); let s=0;
  for(let i=0;i<a.length;i++){ s+=a[i]; if(i>=p)s-=a[i-p]; if(i>=p-1)out[i]=s/p; }
  return out;
}
function rsi(a,p=14){
  const out=Array(a.length).fill(null); if(a.length<=p)return out;
  let g=0,l=0;
  for(let i=1;i<=p;i++){const d=a[i]-a[i-1];g+=Math.max(d,0);l+=Math.max(-d,0)}
  g/=p;l/=p;out[p]=l?100-100/(1+g/l):100;
  for(let i=p+1;i<a.length;i++){const d=a[i]-a[i-1];g=(g*(p-1)+Math.max(d,0))/p;l=(l*(p-1)+Math.max(-d,0))/p;out[i]=l?100-100/(1+g/l):100}
  return out;
}
function atr(h,l,c,p=14){
  const tr=h.map((x,i)=>i?Math.max(x-l[i],Math.abs(x-c[i-1]),Math.abs(l[i]-c[i-1])):x-l[i]);
  return ema(tr,p);
}
function pivots(h,l,left=3,right=3){
  const out=[];
  for(let i=left;i<h.length-right;i++){
    let ph=true,pl=true;
    for(let j=i-left;j<=i+right;j++){
      if(j===i)continue;
      if(h[j]>=h[i])ph=false;
      if(l[j]<=l[i])pl=false;
    }
    if(ph)out.push({i,type:'H',price:h[i],status:'confirmed',left,right,confirmedAt:i+right});
    if(pl)out.push({i,type:'L',price:l[i],status:'confirmed',left,right,confirmedAt:i+right});
  }
  return out.sort((a,b)=>a.confirmedAt-b.confirmedAt||a.i-b.i);
}
function provisional(h,l,left=3){
  const out=[], start=Math.max(left,h.length-left-5);
  for(let i=start;i<h.length;i++){
    let ph=true,pl=true;
    for(let j=Math.max(0,i-left);j<i;j++){
      if(h[j]>=h[i])ph=false;
      if(l[j]<=l[i])pl=false;
    }
    if(ph)out.push({i,type:'H',price:h[i],status:'provisional'});
    if(pl)out.push({i,type:'L',price:l[i],status:'provisional'});
  }
  return out.slice(-4);
}
function classify(ps){
  let lastH=null,lastL=null;
  return ps.map(p=>{
    let label=p.type;
    if(p.type==='H'){label=lastH==null?'H':p.price>lastH?'HH':'LH';lastH=p.price;}
    else {label=lastL==null?'L':p.price>lastL?'HL':'LL';lastL=p.price;}
    return {...p,label};
  });
}
function structureEvents(ps,c,v,vs,times,aa){
  const events=[]; let hi=null,lo=null,trend='neutral',pi=0;
  const ordered=[...ps].sort((a,b)=>a.confirmedAt-b.confirmedAt);
  for(let i=0;i<c.length;i++){
    while(pi<ordered.length && ordered[pi].confirmedAt<=i){
      const p=ordered[pi++]; if(p.type==='H')hi=p; else lo=p;
    }
    const vr=vs[i]?v[i]/vs[i]:null;
    if(hi && c[i]>hi.price){
      events.push({i,type:trend==='down'?'CHOCH':'BOS',dir:'up',level:hi.price,breakPrice:c[i],sourcePivotIndex:hi.i,pivotConfirmedAt:hi.confirmedAt,availableAt:hi.confirmedAt,confirmation:'close',confirmationTime:times[i],confirmed:true,volumeRatio:vr,retestStatus:'pending',barsSinceEvent:c.length-1-i});
      trend='up'; hi=null;
    }
    if(lo && c[i]<lo.price){
      events.push({i,type:trend==='up'?'CHOCH':'BOS',dir:'down',level:lo.price,breakPrice:c[i],sourcePivotIndex:lo.i,pivotConfirmedAt:lo.confirmedAt,availableAt:lo.confirmedAt,confirmation:'close',confirmationTime:times[i],confirmed:true,volumeRatio:vr,retestStatus:'pending',barsSinceEvent:c.length-1-i});
      trend='down'; lo=null;
    }
  }
  for(const ev of events){
    let tested=-1;
    for(let j=ev.i+1;j<c.length;j++){
      const av=aa[j]||0, near=Math.abs(c[j]-ev.level)<=Math.max(ev.level*.002,av*.25);
      const failed=ev.dir==='up'?c[j]<ev.level-av*.5:c[j]>ev.level+av*.5;
      if(failed){ev.retestStatus='failed';ev.retestTime=times[j];break;}
      if(near && tested<0){tested=j;ev.retestStatus='tested';ev.retestTime=times[j];}
      if(tested>=0 && j>=tested+2){
        const held=ev.dir==='up'?c[j]>ev.level:c[j]<ev.level;
        if(held){ev.retestStatus='held';ev.retestHoldTime=times[j];break;}
      }
    }
  }
  return events.slice(-20);
}
function fit(points){
  if(points.length<2)return null;
  const mx=points.reduce((s,p)=>s+p.i,0)/points.length;
  const my=points.reduce((s,p)=>s+p.price,0)/points.length;
  let n=0,d=0;
  for(const p of points){n+=(p.i-mx)*(p.price-my);d+=(p.i-mx)*(p.i-mx)}
  const slope=d?n/d:0; return {slope,intercept:my-slope*mx};
}
const lineAt=(L,i)=>L.intercept+L.slope*i;
function candidates(ps,c,o,h,l,v,vs,aa,bias,side,asOf){
  const target=ps.filter(p=>p.confirmedAt<=asOf&&(side==='support'?p.type==='L':p.type==='H')).slice(-12);
  const out=[]; if(target.length<3)return out;
  for(let a=0;a<target.length-1;a++) for(let b=a+1;b<target.length;b++){
    const A=target[a],B=target[b],span=B.i-A.i; if(span<8)continue;
    const m=(B.price-A.price)/span, raw={slope:m,intercept:A.price-m*A.i};
    let touches=target.filter(p=>p.i>=A.i&&Math.abs(p.price-lineAt(raw,p.i))<=Math.max(p.price*.002,(aa[p.i]||aa[asOf]||0)*.30));
    if(touches.length<3)continue;
    let L=fit(touches); if(!L)continue;
    touches=target.filter(p=>p.i>=A.i&&Math.abs(p.price-lineAt(L,p.i))<=Math.max(p.price*.002,(aa[p.i]||aa[asOf]||0)*.30));
    if(touches.length<3)continue;
    L=fit(touches)||L;
    const firstI=Math.min(...touches.map(p=>p.i)), lastTouch=Math.max(...touches.map(p=>p.i)), spanBars=lastTouch-firstI;
    if(spanBars<8||asOf-lastTouch>40)continue;
    let bodyCross=0, consecutive=0, breakCount=0, brokenAt=null;
    for(let i=Math.max(B.confirmedAt,firstI);i<=asOf;i++){
      const lp=lineAt(L,i), av=aa[i]||aa[asOf]||0, bad=side==='support'?c[i]<lp-av*.50:c[i]>lp+av*.50;
      if(bad){consecutive++;if(consecutive===2){breakCount++;brokenAt=i;}} else consecutive=0;
      const lo=Math.min(o[i],c[i]),hi=Math.max(o[i],c[i]); if(lp>lo&&lp<hi)bodyCross++;
    }
    let reaction=0; const vols=[];
    for(const p of touches){
      const av=aa[p.i]||0;
      if(av){let best=0;for(let j=p.i+1;j<=Math.min(asOf,p.i+3);j++)best=Math.max(best,side==='support'?(h[j]-p.price)/av:(p.price-l[j])/av);reaction+=Math.min(best,2);}
      if(vs[p.i])vols.push(v[p.i]/vs[p.i]);
    }
    reaction/=touches.length;
    const avgVol=vols.length?vols.reduce((s,x)=>s+x,0)/vols.length:null;
    const recency=Math.max(0,20-(asOf-lastTouch)*.5),spanScore=Math.min(20,spanBars*.25),touchScore=Math.min(40,touches.length*10),reactionScore=Math.min(15,reaction*7.5),align=((side==='support'&&bias.score>0)||(side==='resistance'&&bias.score<0))?10:0;
    const score=Math.round(clamp(touchScore+recency+spanScore+reactionScore+align-breakCount*28-bodyCross*2));
    const current=lineAt(L,asOf), av=aa[asOf]||0, dist=av?(c[asOf]-current)/av:null;
    let state=breakCount?'broken':'active'; if(!breakCount&&dist!=null&&Math.abs(dist)<=.35)state='retest'; else if(!breakCount&&score<60)state='candidate';
    out.push({id:`${side}-${firstI}-${lastTouch}`,side,state,slope:L.slope,intercept:L.intercept,anchorA:{barIndex:firstI,price:lineAt(L,firstI)},anchorB:{barIndex:lastTouch,price:lineAt(L,lastTouch)},touchCount:touches.length,touchBars:touches.map(p=>p.i),touchConfirmedAt:touches.map(p=>p.confirmedAt),spanBars,lastTouchBarsAgo:asOf-lastTouch,brokenCloseCount:breakCount,bodyCrossCount:bodyCross,reactionAtr:Number(reaction.toFixed(3)),avgTouchVolumeRatio:avgVol==null?null:Number(avgVol.toFixed(3)),structureAlignmentScore:align,totalScore:score,currentLinePrice:current,currentDistanceAtr:dist,currentDistancePct:current?(c[asOf]/current-1)*100:null,brokenAt,availableAt:Math.max(...touches.map(p=>p.confirmedAt))});
  }
  return out.sort((a,b)=>b.totalScore-a.totalScore);
}
function dedupe(lines,aa,asOf){
  const kept=[],clusters=[], av=aa[asOf]||1;
  for(const L of lines){
    let idx=-1;
    for(let i=0;i<kept.length;i++){
      const K=kept[i],bars=Math.max(L.spanBars,K.spanBars,8),sg=Math.abs((L.slope-K.slope)*bars)/av,eg=Math.abs(lineAt(L,asOf)-lineAt(K,asOf))/av;
      if(sg<.18&&eg<.35){idx=i;break;}
    }
    if(idx<0){kept.push(L);clusters.push({primaryId:L.id,members:[L.id]});}
    else clusters[idx].members.push(L.id);
  }
  return {kept,clusters,rawCount:lines.length,uniqueCount:kept.length};
}
function trendlines(ps,c,o,h,l,v,vs,aa,bias,times){
  const asOf=c.length-1, sd=dedupe(candidates(ps,c,o,h,l,v,vs,aa,bias,'support',asOf),aa,asOf), rd=dedupe(candidates(ps,c,o,h,l,v,vs,aa,bias,'resistance',asOf),aa,asOf);
  const decorate=x=>x?{...x,anchorA:{...x.anchorA,time:times[x.anchorA.barIndex]},anchorB:{...x.anchorB,time:times[x.anchorB.barIndex]},lastTouchTime:times[x.touchBars[x.touchBars.length-1]],htfAlignment:0}:null;
  const support=decorate(sd.kept.find(x=>x.state!=='broken')||sd.kept[0]||null), resistance=decorate(rd.kept.find(x=>x.state!=='broken')||rd.kept[0]||null);
  return {support,resistance,secondary:{support:sd.kept.slice(1,3).map(decorate),resistance:rd.kept.slice(1,3).map(decorate)},channel:null,dedup:{support:{raw:sd.rawCount,unique:sd.uniqueCount},resistance:{raw:rd.rawCount,unique:rd.uniqueCount}},parameters:{recentConfirmedPivots:12,minAnchorGapBars:8,minTouches:3,touchToleranceAtr:.30,breakThresholdAtr:.50,breakConfirmBars:2,maxBarsSinceLastTouch:40}};
}
function zones(ps,close,av,last){
  const tol=Math.max(close*.0025,av*.35),groups=[];
  for(const p of ps.filter(x=>x.confirmedAt<=last).slice(-30)){
    let g=groups.find(x=>Math.abs(x.center-p.price)<=tol);
    if(!g){g={center:p.price,values:[],pivots:[]};groups.push(g)}
    g.values.push(p.price);g.pivots.push(p);g.center=g.values.reduce((s,x)=>s+x,0)/g.values.length;
  }
  return groups.map(g=>{const low=Math.min(...g.values)-tol*.45,high=Math.max(...g.values)+tol*.45,lastI=Math.max(...g.pivots.map(p=>p.i)),age=last-lastI,touchCount=g.values.length,strengthScore=Math.round(clamp(touchCount*26-Math.min(age,80)*.25));return{type:g.center>=close?'resistance':'support',low,high,center:g.center,touchCount,strengthScore,source:'confirmed_swing_cluster',ageBars:age}}).filter(z=>z.touchCount>=2).sort((a,b)=>Math.abs(a.center-close)-Math.abs(b.center-close)).slice(0,8);
}
function biasScore(ps,events,c,e20,e60){
  const recent=ps.slice(-8),parts=[];let score=0;
  const bull=recent.filter(p=>p.label==='HH'||p.label==='HL').length,bear=recent.filter(p=>p.label==='LH'||p.label==='LL').length;
  if(bull>bear){score+=2;parts.push({reason:'최근 HH/HL 우세',points:2})} else if(bear>bull){score-=2;parts.push({reason:'최근 LH/LL 우세',points:-2})}
  const ev=events[events.length-1]; if(ev&&ev.dir==='up'){score+=2;parts.push({reason:`최근 ${ev.type} up`,points:2})} else if(ev&&ev.dir==='down'){score-=2;parts.push({reason:`최근 ${ev.type} down`,points:-2})}
  if(c[c.length-1]>e20[e20.length-1]){score++;parts.push({reason:'가격 > EMA20',points:1})}else{score--;parts.push({reason:'가격 < EMA20',points:-1})}
  if(e20[e20.length-1]>e60[e60.length-1]){score++;parts.push({reason:'EMA20 > EMA60',points:1})}else{score--;parts.push({reason:'EMA20 < EMA60',points:-1})}
  return {score,label:score>=4?'bullish':score<=-4?'bearish':score>0?'neutral-bullish':score<0?'neutral-bearish':'neutral',components:parts};
}
function scenario(close,zs,ps,av,interval){
  const res=zs.filter(z=>z.type==='resistance'&&z.center>close).sort((a,b)=>a.center-b.center),sup=zs.filter(z=>z.type==='support'&&z.center<close).sort((a,b)=>b.center-a.center);
  const highs=ps.filter(x=>x.type==='H'),lows=ps.filter(x=>x.type==='L'),trigger=res[0]?.high||(highs.length?highs[highs.length-1].price:null),invalidation=sup[0]?.low||(lows.length?lows[lows.length-1].price:null);
  return {up:{trigger,confirmation:`${interval} 종가 기준 trigger 상단 마감 여부`,volumeDiagnostic:'Vol/SMA20 >= 1.2 여부 표시',retestCondition:'이후 구조 재시험 여부 관찰',targetZones:res.slice(1,4)},down:{invalidation,confirmation:`${interval} 종가 기준 invalidation 하단 마감 여부`,observationZones:sup.slice(1,4)},distance:{toTriggerAtr:trigger&&av?(trigger-close)/av:null,toInvalidationAtr:invalidation&&av?(close-invalidation)/av:null}};
}
function audit(ps,events,lines,last){
  let futurePivotUse=0,eventBeforeConfirmation=0,lineFutureTouch=0;
  for(const p of ps)if(p.confirmedAt>last)futurePivotUse++;
  for(const e of events)if(e.i<e.pivotConfirmedAt)eventBeforeConfirmation++;
  for(const L of [lines.support,lines.resistance].filter(Boolean))for(const x of (L.touchConfirmedAt||[]))if(x>last)lineFutureTouch++;
  return {pass:futurePivotUse===0&&eventBeforeConfirmation===0&&lineFutureTouch===0,futurePivotUse,eventBeforeConfirmation,lineFutureTouch,rule:'pivotTime <= confirmedAt <= event/line availability'};
}

module.exports = async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=15, stale-while-revalidate=30');
  try{
    const symbol=String(req.query.symbol||'BTCUSDT').toUpperCase();
    const interval=String(req.query.interval||'15m');
    const limit=Math.max(150,Math.min(500,num(req.query.limit,320)));
    const raw=await getJson('/api/v3/klines',{symbol,interval,limit:String(limit)});
    if(!Array.isArray(raw)) throw new Error('Unexpected Binance response');
    const closed=raw.filter(k=>num(k[6])<Date.now());
    if(closed.length<80) throw new Error('Not enough closed candles');
    const times=closed.map(k=>num(k[0])),o=closed.map(k=>num(k[1])),h=closed.map(k=>num(k[2])),l=closed.map(k=>num(k[3])),c=closed.map(k=>num(k[4])),v=closed.map(k=>num(k[5]));
    const rr=rsi(c),aa=atr(h,l,c),vs=sma(v,20),e20=ema(c,20),e60=ema(c,60);
    const ps=classify(pivots(h,l,3,3)).filter(p=>p.confirmedAt<=c.length-1);
    const events=structureEvents(ps,c,v,vs,times,aa),av=aa[aa.length-1]||0,zs=zones(ps,c[c.length-1],av,c.length-1),bias=biasScore(ps,events,c,e20,e60),tls=trendlines(ps,c,o,h,l,v,vs,aa,bias,times),au=audit(ps,events,tls,c.length-1);
    return res.status(200).json({ok:true,version:'3.12.4b',symbol,interval,pivotRule:{left:3,right:3,confirmedDelayBars:3,activation:'confirmedAt only'},candles:closed.map((k,i)=>({time:times[i],open:o[i],high:h[i],low:l[i],close:c[i],volume:v[i],rsi:rr[i],atr:aa[i],volSma20:vs[i]})),pivots:ps.slice(-28),provisionalPivots:provisional(h,l,3),events,zones:zs,trendlines:tls,divergences:[],bias,htfDiagnostic:{interval:null,bias:'neutral',status:'deferred',reason:'HTF fetch isolated from main Structure API for reliability'},audit:au,scenario:scenario(c[c.length-1],zs,ps,av,interval),current:{price:c[c.length-1],atr14:av,ema20:e20[e20.length-1],ema60:e60[e60.length-1]},disclaimer:'Educational Spot market-structure visualization only. No execution or trading recommendation.'});
  }catch(e){
    return res.status(502).json({ok:false,version:'3.12.4b',error:e&&e.message?e.message:String(e)});
  }
};
