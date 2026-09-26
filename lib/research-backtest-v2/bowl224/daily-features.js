'use strict';
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function sma(values,n){if(values.length<n)return null;const xs=values.slice(-n);return xs.every(Number.isFinite)?xs.reduce((a,b)=>a+b,0)/n:null}
function buildDailySeries(rows,{cutoffTs=Infinity}={}){
  const raw=(Array.isArray(rows)?rows:[]).map(r=>({
    openTime:finite(Array.isArray(r)?r[0]:r?.openTime),
    high:finite(Array.isArray(r)?r[2]:r?.high),
    low:finite(Array.isArray(r)?r[3]:r?.low),
    close:finite(Array.isArray(r)?r[4]:r?.close),
    closeTime:finite(Array.isArray(r)?r[6]:r?.closeTime)
  })).filter(x=>x.openTime!=null&&x.closeTime!=null&&x.close!=null&&x.closeTime<=cutoffTs).sort((a,b)=>a.openTime-b.openTime);
  const closes=[];
  return raw.map((x,i)=>{
    closes.push(x.close);
    const ma224=sma(closes,224);
    let atr14=null;
    if(i>=14){
      const trs=[];for(let j=i-13;j<=i;j++){const cur=raw[j],prev=raw[j-1];if(!prev||cur.high==null||cur.low==null)continue;trs.push(Math.max(cur.high-cur.low,Math.abs(cur.high-prev.close),Math.abs(cur.low-prev.close)))}
      if(trs.length===14)atr14=trs.reduce((a,b)=>a+b,0)/14;
    }
    return{...x,ma224,atr14};
  }).map((x,i,all)=>{
    const ma5=i>=5?all[i-5]?.ma224:null,ma20=i>=20?all[i-20]?.ma224:null;
    return{...x,
      ma224_slope_5d:x.ma224!=null&&ma5!=null&&ma5!==0?((x.ma224/ma5)-1)*100:null,
      ma224_slope_20d:x.ma224!=null&&ma20!=null&&ma20!==0?((x.ma224/ma20)-1)*100:null
    };
  });
}
function buildBowlFeatureAt(series,index){
  const rows=Array.isArray(series)?series:[],cur=rows[index];if(!cur)throw new Error('daily index unavailable');
  const prev120=index>=120?rows.slice(index-120,index):[];
  const comparable=prev120.length===120&&prev120.every(x=>finite(x.close)!=null&&finite(x.ma224)!=null);
  const below=comparable?prev120.map(x=>x.close<x.ma224):[];
  let below224_days=0;if(comparable){for(let i=below.length-1;i>=0&&below[i];i--)below224_days++}
  let max=0,run=0;if(comparable){for(const b of below){if(b){run++;if(run>max)max=run}else run=0}}
  const firstMa=rows.findIndex(x=>finite(x.ma224)!=null);
  const ma=finite(cur.ma224),close=finite(cur.close),atr=finite(cur.atr14);
  const ratio=comparable?below.filter(Boolean).length/120:null;
  return{
    ma224:ma,
    atr14:atr,
    distance_to_ma224_pct:ma&&close!=null?((close/ma)-1)*100:null,
    distance_to_ma224_atr:atr&&ma!=null&&close!=null?(close-ma)/atr:null,
    ma224_slope_5d:finite(cur.ma224_slope_5d),
    ma224_slope_20d:finite(cur.ma224_slope_20d),
    below224_days:comparable?below224_days:null,
    below224_ratio_120d:ratio,
    max_consecutive_below224_days_120d:comparable?max:null,
    days_since_first_ma224_available:firstMa>=0?index-firstMa:null,
    strict_bowl_120d:comparable&&below.every(Boolean),
    original_bowl_4m_80pct:ratio!=null&&ratio>=0.8,
    historySufficient:comparable
  };
}
module.exports={buildDailySeries,buildBowlFeatureAt};
