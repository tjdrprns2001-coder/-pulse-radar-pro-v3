'use strict';
const TF_MS={'1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'2h':7200000,'4h':14400000,'6h':21600000,'12h':43200000,'1d':86400000,'3d':259200000,'1w':604800000};
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function parseRow(r){if(!Array.isArray(r)||r.length<6)return null;return{t:finite(r[0]),o:finite(r[1]),h:finite(r[2]),l:finite(r[3]),c:finite(r[4]),v:finite(r[5]),ct:finite(r[6]),q:finite(r[7]),buyQ:finite(r[10])}}
function validateBar(x){const errors=[];if(!x||![x.t,x.o,x.h,x.l,x.c].every(Number.isFinite))errors.push('required_price_field_missing');if(x&&Number.isFinite(x.h)&&Number.isFinite(x.l)&&x.h<x.l)errors.push('high_below_low');if(x&&[x.o,x.c].some(v=>Number.isFinite(v))&&Number.isFinite(x.h)&&Number.isFinite(x.l)&&(x.o>x.h||x.o<x.l||x.c>x.h||x.c<x.l))errors.push('open_close_outside_range');if(x&&x.v!=null&&x.v<0)errors.push('negative_volume');return errors}
function normalizeFrame(rows,{tf='1h',nowMs=Date.now()}={}){
 const raw=Array.isArray(rows)?rows:[],source=String(raw._source||'unknown'),parsed=raw.map(parseRow).filter(Boolean).sort((a,b)=>a.t-b.t),seen=new Set(),bars=[],warnings=[],invalid=[];
 for(const x of parsed){const errs=validateBar(x);if(errs.length){invalid.push({t:x.t,errors:errs});continue}if(seen.has(x.t)){warnings.push('duplicate_candle');continue}seen.add(x.t);if(x.ct!=null&&x.ct>nowMs)continue;bars.push(x)}
 const step=TF_MS[tf]||null,gaps=[];if(step)for(let i=1;i<bars.length;i++){const d=bars[i].t-bars[i-1].t;if(d>step*1.5)gaps.push({after:bars[i-1].t,before:bars[i].t,missingApprox:Math.max(1,Math.round(d/step)-1)})}
 const last=bars.at(-1),ageMs=last?(nowMs-(last.ct??last.t)):null,zeroVolume=bars.filter(x=>x.v===0).length;
 let state='valid';if(!bars.length)state='invalid';else if(invalid.length>Math.max(2,bars.length*.05))state='suspect';else if(gaps.length||zeroVolume>bars.length*.1)state='partial';if(step&&ageMs!=null&&ageMs>step*3)state='stale';else if(step&&ageMs!=null&&ageMs>step*1.5&&state==='valid')state='delayed';
 return{tf,source,bars,state,valid:state!=='invalid',warnings:[...new Set(warnings)],invalidCount:invalid.length,gaps,zeroVolumeCount:zeroVolume,lastClosedAt:last?.ct??last?.t??null,ageMs,missingFields:[],closedOnly:true}
}
function aggregateQuality(frames={}){
 const rows=Object.values(frames).filter(Boolean),states=rows.map(x=>x.state),rank={valid:0,delayed:1,partial:2,suspect:3,stale:4,invalid:5},worst=states.sort((a,b)=>(rank[b]??9)-(rank[a]??9))[0]||'invalid';
 const missing=Object.entries(frames).filter(([,x])=>!x?.bars?.length).map(([tf])=>tf),sources=[...new Set(rows.map(x=>x.source).filter(Boolean))];
 return{state:worst,missingTimeframes:missing,sources,sourceCount:sources.length,closedCandlesOnly:true,hasGaps:rows.some(x=>x.gaps?.length),hasInvalidBars:rows.some(x=>x.invalidCount>0),calculatedFromApproximation:false}
}
module.exports={TF_MS,finite,parseRow,validateBar,normalizeFrame,aggregateQuality};
