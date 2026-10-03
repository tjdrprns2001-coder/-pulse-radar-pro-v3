(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ChartBroData=api;})(globalThis,function(){'use strict';
const TF_MS={'1m':60000,'5m':300000,'15m':900000,'1h':3600000,'4h':14400000,'12h':43200000,'1d':86400000,'1w':604800000};
const num=v=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const copy=x=>JSON.parse(JSON.stringify(x));
function canonical(x){if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';return JSON.stringify(x);}
// Content identity; API layer additionally stores SHA-256 of this canonical input.
function digest(x){const s=canonical(x);let a=2166136261,b=5381;for(let i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b,33)^s.charCodeAt(i);}return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
function nextOpen(t,tf){if(tf!=='1M')return t+TF_MS[tf];const d=new Date(t);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1);}
function normalize(rows,{tf='4h',at=Infinity,availability='bar_close'}={}){
 if(!TF_MS[tf]&&tf!=='1M')throw new Error('unsupported timeframe');
 const byTime=new Map(),excluded={open:0,not_received:0},bars=[];
 for(const x of rows||[]){const arr=Array.isArray(x),get=(a,b)=>arr?x[a]:x[b],o=num(get(0,'open_time')??x.openTime??x.time),c=num(get(6,'close_time')??x.closeTime);
  if(o==null||c==null||c<o)throw new Error('bar timestamp required');
  const b={open_time:o,close_time:c,open:num(get(1,'open')),high:num(get(2,'high')),low:num(get(3,'low')),close:num(get(4,'close')),base_volume:num(get(5,'base_volume')??x.volume),quote_volume:num(get(7,'quote_volume')??x.quoteVolume),taker_buy_base:num(get(9,'taker_buy_base')),taker_buy_quote:num(get(10,'taker_buy_quote')),received_at:num(x.received_at),is_closed:x.is_closed!==false&&x.partial!==true,source_version:x.source_version||'unknown'};
  if([b.open,b.high,b.low,b.close].some(v=>v==null||v<=0)||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close,b.high))throw new Error('invalid OHLC');
  if([b.base_volume,b.quote_volume,b.taker_buy_base,b.taker_buy_quote].some(v=>v!=null&&v<0))throw new Error('invalid volume');
  if(byTime.has(o)&&canonical(byTime.get(o))!==canonical(b))throw new Error('conflicting duplicate bar');byTime.set(o,b);
 }
 for(const b of [...byTime.values()].sort((a,b)=>a.open_time-b.open_time)){if(!b.is_closed||b.close_time>at){excluded.open++;continue;}if(availability==='received_at'&&(b.received_at==null||b.received_at>at)){excluded.not_received++;continue;}bars.push(b);}
 const gaps=[];for(let i=1;i<bars.length;i++)if(bars[i].open_time!==nextOpen(bars[i-1].open_time,tf))gaps.push({after:bars[i-1].close_time,before:bars[i].open_time,index:i});
 return {bars,quality:{gaps,excluded,availability_assumption:availability,price:bars.length?'available':'missing'}};
}
function asOf(snapshots,at){let result=null;for(const s of snapshots||[])if(s.decision_at<=at&&(!result||s.decision_at>result.decision_at))result=s;return result;}
function aggregate(rows,tf,{boundary=0}={}){const step=TF_MS[tf];if(!step)throw new Error('fixed timeframe required');const norm=normalize(rows,{tf:'1m'});const groups=new Map();for(const b of norm.bars){const t=Math.floor((b.open_time-boundary)/step)*step+boundary;if(!groups.has(t))groups.set(t,[]);groups.get(t).push(b);}return [...groups].filter(([,xs])=>xs.length===step/60000&&xs.every((b,i)=>b.open_time===xs[0].open_time+i*60000)).map(([t,xs])=>({open_time:t,close_time:t+step-1,open:xs[0].open,high:Math.max(...xs.map(b=>b.high)),low:Math.min(...xs.map(b=>b.low)),close:xs.at(-1).close,base_volume:xs.every(b=>b.base_volume!=null)?xs.reduce((s,b)=>s+b.base_volume,0):null,quote_volume:xs.every(b=>b.quote_volume!=null)?xs.reduce((s,b)=>s+b.quote_volume,0):null,is_closed:true,source_version:'aggregate:1m:'+tf+':'+boundary}));}
return {TF_MS,num,copy,canonical,digest,nextOpen,normalize,asOf,aggregate};
});
