// Independent OHLCV heuristics, not a port of WyckoffTradingAgent.
// Input must contain only closed candles in chronological order.
export function wyckoff(data){
 const events=[];let range=null;
 for(let i=60;i<data.length;i++){
  const c=data[i],history=data.slice(i-60,i),support=Math.min(...history.map(x=>x.low)),resistance=Math.max(...history.map(x=>x.high)),width=resistance-support;
  const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
  const drift=Math.abs(mean(history.slice(-10).map(x=>x.close))-mean(history.slice(0,10).map(x=>x.close)));
  const lower=history.filter(x=>x.low<=support+width*.15).length,upper=history.filter(x=>x.high>=resistance-width*.15).length;
  const valid=width>0&&support>0&&drift<=width*.4&&lower>=3&&upper>=3;
  const vols=history.slice(-20).map(x=>x.volume),volumeOK=vols.every(v=>Number.isFinite(v)&&v>0)&&Number.isFinite(c.volume)&&c.volume>0;
  const volumeRatio=volumeOK?c.volume/mean(vols):null;
  range={support,resistance,valid,volumeRatio,lower,upper};
  // Update previously detected candidates without revising their detection facts.
  for(const e of events){if(e.status==='invalidated'||e.status==='expired')continue;
   if(i-e.i>20){e.status='expired';e.statusI=i;continue;}
   if(e.side==='bull'?c.close<e.invalidation:c.close>e.invalidation){e.status='invalidated';e.statusI=i;}
   else if(e.status==='watch'&&(e.side==='bull'?c.close>e.resistance:c.close<e.support)&&volumeRatio>=1.3){e.status='confirmed';e.statusI=i;}
  }
  if(!valid||volumeRatio===null)continue;
  const penetration=width*.02,bodyRange=c.high-c.low;
  if(c.low<support-penetration&&c.high>resistance+penetration)continue;
  const spring=c.low<support-penetration&&c.close>support&&c.close<resistance&&bodyRange>0&&(c.close-c.low)/bodyRange>=.6;
  const upthrust=c.high>resistance+penetration&&c.close<resistance&&c.close>support&&bodyRange>0&&(c.high-c.close)/bodyRange>=.6;
  if(volumeRatio<1.3||spring===upthrust)continue;
  const side=spring?'bull':'bear';
  if(events.some(e=>e.side===side&&i-e.i<5&&e.status==='watch'))continue;
  events.push({i,time:c.time,side,type:spring?'Spring':'Upthrust',support,resistance,volumeRatio,invalidation:spring?c.low:c.high,status:'watch',statusI:i,price:c.close});
 }
 const latest=events.at(-1)||null;
 return {events,latest,range,bars:data.length,asOf:data.at(-1)?.time??null};
}
