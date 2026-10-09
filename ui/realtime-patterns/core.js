(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PulseRealtimePatternsCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
  const MS={ '5m':300000,'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000,'1w':604800000 };
  const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
  const val=x=>Number(x);
  const round=x=>Number(x.toFixed(2));
  const average=a=>a.reduce((x,y)=>x+y,0)/(a.length||1);
  function stamp(t){const n=Number(t);return n<1e11?n*1000:n}
  function candle(x){
    if(!x||!finite(x.openTime??x.time)||!['open','high','low','close'].every(k=>finite(x[k])))return null;
    const k={openTime:stamp(x.openTime??x.time),closeTime:finite(x.closeTime)?stamp(x.closeTime):null,open:val(x.open),high:val(x.high),low:val(x.low),close:val(x.close),volume:finite(x.volume)?val(x.volume):0};
    if(k.open<=0||k.low<=0||k.high<Math.max(k.open,k.close,k.low)||k.low>Math.min(k.open,k.close)||k.volume<0)return null;
    return k;
  }
  function normalizeRows(rows,tf,now=Date.now()){
    const seen=new Map(),step=MS[tf]||3600000;
    for(const r of rows||[]){
      if(r?.partial===true||r?.closed===false)continue;
      const k=candle(r);if(!k)continue;
      k.closeTime=k.closeTime??k.openTime+step-1;
      if(k.closeTime>=now)continue;
      seen.set(k.openTime,k);
    }
    return [...seen.values()].sort((a,b)=>a.openTime-b.openTime).slice(-500);
  }
  function applyClosedKline(candles,message,tf){
    const m=message?.k||message;
    if(!m||m.x!==true)return{accepted:false,reason:'unclosed'};
    const row=candle({openTime:m.t,closeTime:m.T,open:m.o,high:m.h,low:m.l,close:m.c,volume:m.v});
    if(!row)return{accepted:false,reason:'invalid'};
    const a=candles||[],last=a.at(-1),step=MS[tf]||3600000;
    if(last&&row.openTime<last.openTime)return{accepted:false,reason:'older'};
    if(last&&row.openTime===last.openTime)return{accepted:false,reason:'duplicate'};
    const gap=!!last&&row.openTime-last.openTime>step*1.5;
    a.push(row);if(a.length>500)a.splice(0,a.length-500);
    return{accepted:true,gap,candle:row};
  }
  function atr(a,period=14){
    const b=a.slice(-period-1);if(!b.length)return 0;
    return average(b.slice(1).map((k,i)=>Math.max(k.high-k.low,Math.abs(k.high-b[i].close),Math.abs(k.low-b[i].close))))||average(b.map(k=>k.high-k.low));
  }
  function pivot(a,type,left=3,right=3){
    const out=[];for(let i=left;i<a.length-right;i++){
      const v=type==='H'?a[i].high:a[i].low;
      let ok=true;for(let j=i-left;j<=i+right;j++){
        if(j===i)continue;
        const n=type==='H'?a[j].high:a[j].low;
        if(type==='H'?n>=v:n<=v){ok=false;break}
      }
      if(ok)out.push({i,price:v,confirmedAt:i+right});
    }
    return out;
  }
  function line(pts){
    if(pts.length<2)return null;
    const mx=average(pts.map(p=>p.i)),my=average(pts.map(p=>p.price));
    let cov=0,variance=0,total=0,error=0;
    for(const p of pts){cov+=(p.i-mx)*(p.price-my);variance+=(p.i-mx)**2;total+=(p.price-my)**2}
    if(!variance)return null;
    const slope=cov/variance,intercept=my-slope*mx;
    for(const p of pts)error+=(p.price-(slope*p.i+intercept))**2;
    return{slope,intercept,r2:total?Math.max(0,1-error/total):1,start:pts[0].i,end:pts.at(-1).i};
  }
  const point=(l,i)=>l.slope*i+l.intercept;
  function detect(input,{symbol='BTCUSDT',timeframe='4h'}={}){
    const a=Array.isArray(input)?input:[],n=a.length;
    if(n<80)return[];
    const k=a[n-1],prev=a[n-2],vol=a.slice(-21,-1).map(x=>x.volume),baseVol=average(vol);
    const rvol=baseVol>0?k.volume/baseVol:null,rangeAtr=atr(a),tol=Math.max(rangeAtr*.38,k.close*.002),items=[];
    const add=(type,label,direction,state,score,level,reason,extra={})=>{
      if(!finite(level)||!finite(score))return;
      items.push({type,label,direction,state,score:Math.max(0,Math.min(100,Math.round(score))),level:Number(level),reason,rvol:rvol==null?null:round(rvol),symbol,timeframe,candleAt:k.closeTime,openTime:k.openTime,price:k.close,...extra});
    };
    const prior=a.slice(-21,-1),high=Math.max(...prior.map(x=>x.high)),low=Math.min(...prior.map(x=>x.low));
    const volStrong=rvol!=null&&rvol>=1.5;
    if(k.close>high&&prev.close<=high)add('breakout','박스 상단 돌파','long','확정',volStrong?84:68,high,'직전 20봉 고점 종가 돌파'+(volStrong?' · 거래량 동반':''),{invalidation:low});
    else if(k.close<low&&prev.close>=low)add('breakdown','박스 하단 이탈','short','확정',volStrong?84:68,low,'직전 20봉 저점 종가 이탈'+(volStrong?' · 거래량 동반':''),{invalidation:high});
    else if(k.close<=high&&high-k.close<=tol)add('breakout','박스 상단 접근','long','형성 중',55,high,'마감 돌파 전 · 저항 확인 필요');
    else if(k.close>=low&&k.close-low<=tol)add('breakdown','박스 하단 접근','short','형성 중',55,low,'마감 이탈 전 · 지지 확인 필요');
    const h=pivot(a,'H'),l=pivot(a,'L'),lastH=h.at(-1),lastL=l.at(-1);
    if(lastH&&k.close>lastH.price&&prev.close<=lastH.price){
      const bear=h.length>=2&&l.length>=2&&h.at(-1).price<h.at(-2).price&&l.at(-1).price<l.at(-2).price;
      add(bear?'choch_up':'bos_up',bear?'상승 CHoCH':'상승 BOS','long','확정',bear?78:72,lastH.price,'확정 스윙 고점 종가 돌파');
    }
    if(lastL&&k.close<lastL.price&&prev.close>=lastL.price){
      const bull=h.length>=2&&l.length>=2&&h.at(-1).price>h.at(-2).price&&l.at(-1).price>l.at(-2).price;
      add(bull?'choch_down':'bos_down',bull?'하락 CHoCH':'하락 BOS','short','확정',bull?78:72,lastL.price,'확정 스윙 저점 종가 이탈');
    }
    function doubles(points,opposite,kind){
      if(points.length<2)return;
      const p1=points.at(-2),p2=points.at(-1),dist=p2.i-p1.i;
      if(dist<5||dist>65||Math.abs(p1.price-p2.price)>Math.max(rangeAtr*.65,p2.price*.006))return;
      const mid=opposite.filter(x=>x.i>p1.i&&x.i<p2.i);
      const middle=kind==='bottom'?Math.max(...a.slice(p1.i+1,p2.i).map(x=>x.high)):Math.min(...a.slice(p1.i+1,p2.i).map(x=>x.low));
      if(!mid.length||!Number.isFinite(middle)||Math.abs(middle-p2.price)<rangeAtr*1.2)return;
      const dir=kind==='bottom'?'long':'short',cross=kind==='bottom'?k.close>middle&&prev.close<=middle:k.close<middle&&prev.close>=middle;
      const approaching=kind==='bottom'?k.close<=middle&&middle-k.close<=rangeAtr*.6:k.close>=middle&&k.close-middle<=rangeAtr*.6;
      if(cross||approaching)add('double_'+kind,kind==='bottom'?'이중 바닥':'이중 천장',dir,cross?'확정':'형성 중',cross?80:63,middle,cross?'넥라인 종가 돌파 확인':'넥라인 마감 확인 대기',{invalidation:p2.price});
    }
    doubles(l,h,'bottom');doubles(h,l,'top');
    if(h.length>=3&&l.length>=3){
      const u=line(h.slice(-3)),d=line(l.slice(-3)),start=Math.max(u?.start??0,d?.start??0),t=n-1;
      if(u&&d&&t-start>=8&&t-start<=95&&u.r2>=.55&&d.r2>=.55){
        const startGap=point(u,start)-point(d,start),endGap=point(u,t)-point(d,t);
        if(startGap>rangeAtr&&endGap>rangeAtr*.2&&endGap<startGap*.85){
          const wedge=u.slope<0&&d.slope<0&&u.slope<d.slope?'하락 쐐기':u.slope>0&&d.slope>0&&u.slope<d.slope?'상승 쐐기':'삼각 수렴';
          const ul=point(u,t),dl=point(d,t),pu=point(u,t-1),pd=point(d,t-1);
          const up=k.close>ul&&prev.close<=pu,down=k.close<dl&&prev.close>=pd;
          const nearUp=k.close<=ul&&ul-k.close<rangeAtr*.45,nearDown=k.close>=dl&&k.close-dl<rangeAtr*.45;
          const lines={upperLine:u,lowerLine:d};
          if(up||nearUp)add('convergence_up',wedge+' 상단','long',up?'확정':'형성 중',up?82:66,ul,up?'수렴 상단 종가 돌파':'수렴 상단 접근 · 미확정',lines);
          if(down||nearDown)add('convergence_down',wedge+' 하단','short',down?'확정':'형성 중',down?82:66,dl,down?'수렴 하단 종가 이탈':'수렴 하단 접근 · 미확정',lines);
        }
      }
    }
    const ema=(period)=>{const weight=2/(period+1);let e=a[0].close;for(let i=1;i<n;i++)e=a[i].close*weight+e*(1-weight);return e};
    const emas=[14,28,57,92].map(ema),compression=(Math.max(...emas)-Math.min(...emas))/k.close;
    if(compression<=.05){
      const burst=volStrong&&(k.close>high||k.close<low),dir=k.close>high?'long':k.close<low?'short':k.close>=average(emas)?'long':'short';
      add('ema_squeeze','EMA 14·28·57·92 압축',dir,burst?'확정':'형성 중',burst?83:Math.round(64-compression*150),average(emas),burst?'EMA 압축 뒤 거래량 동반 범위 이탈':'이평선 압축 · 방향 미확정',{compressionPct:round(compression*100)});
    }
    const body=Math.abs(k.close-k.open),span=k.high-k.low,lowerWick=Math.min(k.open,k.close)-k.low,upperWick=k.high-Math.max(k.open,k.close);
    const priorDown=a[n-2].close<a[n-5].close,priorUp=a[n-2].close>a[n-5].close;
    if(span>0&&body/span<.38&&lowerWick>=Math.max(body*2,span*.52)&&upperWick<span*.22&&priorDown)
      add('hammer','망치형 반전','long','확정',67,k.low,'하락 이후 긴 아래꼬리 · 후속봉 확인 필요',{invalidation:k.low});
    if(span>0&&body/span<.38&&upperWick>=Math.max(body*2,span*.52)&&lowerWick<span*.22&&priorUp)
      add('shooting_star','유성형 반전','short','확정',67,k.high,'상승 이후 긴 위꼬리 · 후속봉 확인 필요',{invalidation:k.high});
    const pb=Math.abs(prev.close-prev.open);
    if(k.close>k.open&&prev.close<prev.open&&k.open<=prev.close&&k.close>=prev.open&&body>pb*1.05)
      add('engulf_up','상승 장악형','long','확정',67,prev.high,'양봉이 직전 음봉 몸통 장악',{invalidation:k.low});
    if(k.close<k.open&&prev.close>prev.open&&k.open>=prev.close&&k.close<=prev.open&&body>pb*1.05)
      add('engulf_down','하락 장악형','short','확정',67,prev.low,'음봉이 직전 양봉 몸통 장악',{invalidation:k.high});
    const order={ '확정':0,'형성 중':1 };
    return items.sort((a,b)=>(order[a.state]-order[b.state])||b.score-a.score).slice(0,12);
  }
  function eventKey(p){return[p.symbol,p.timeframe,p.type,p.state,p.openTime].join('|')}
  return{MS,candle,normalizeRows,applyClosedKline,detect,eventKey,pivot,line};
});