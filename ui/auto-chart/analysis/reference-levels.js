(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseAutoChartReferenceLevels=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const NY_TZ='America/New_York';
const nyFmt=new Intl.DateTimeFormat('en-CA',{timeZone:NY_TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function finite(v){return v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null}
function kstDate(ts){return new Date(Number(ts)+9*3600000).toISOString().slice(0,10)}
function kstParts(ts){const d=new Date(Number(ts)+9*3600000);return{y:d.getUTCFullYear(),m:d.getUTCMonth()+1,d:d.getUTCDate(),h:d.getUTCHours(),dow:d.getUTCDay()}}
function weekKey(ts){const p=kstParts(ts),d=new Date(Date.UTC(p.y,p.m-1,p.d)),dow=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-dow);return d.toISOString().slice(0,10)}
function nyParts(ts){const p=Object.fromEntries(nyFmt.formatToParts(new Date(Number(ts))).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return{h:+p.hour,min:+p.minute}}
function sessionOf(ts){
 const k=kstParts(ts),n=nyParts(ts);
 if(k.h>=8&&k.h<13)return'ASIA';
 if(n.h>=2&&n.h<5)return'LONDON';
 if(n.h>=7&&n.h<10)return'NEW_YORK';
 return'OTHER'
}
function closed(frame,asOf){return(frame?.candles||[]).filter(x=>Number(x.closeTime)<=Number(asOf)).sort((a,b)=>a.openTime-b.openTime)}
function range(rows=[]){if(!rows.length)return null;return{high:Math.max(...rows.map(x=>Number(x.high))),low:Math.min(...rows.map(x=>Number(x.low))),open:Number(rows[0].open),close:Number(rows.at(-1).close),firstAt:rows[0].openTime,lastAt:rows.at(-1).closeTime,count:rows.length}}
function groups(rows,keyFn){const m=new Map();for(const x of rows){const k=keyFn(x.openTime);if(!m.has(k))m.set(k,[]);m.get(k).push(x)}return m}
function previousGroup(m,currentKey){const keys=[...m.keys()].filter(k=>k<currentKey).sort();return keys.length?range(m.get(keys.at(-1))):null}
function currentGroup(m,key){return m.has(key)?range(m.get(key)):null}
function latestSwing(frame,type,asOf){return[...(frame?.swings||[])].filter(x=>x.type===type&&Number(x.knownAt||0)<=Number(asOf)).sort((a,b)=>Number(a.knownAt||0)-Number(b.knownAt||0)).at(-1)||null}
function line(label,price,kind,group){const p=finite(price);return p==null?null:{label,price:p,kind,group}}
function build(frameMap={},asOf=Date.now()){
 const f15=frameMap['15m']||frameMap['5m']||frameMap['1h'],f1h=frameMap['1h']||f15,f4h=frameMap['4h']||f1h;
 const intraday=closed(f15,asOf),hourly=closed(f1h,asOf),fourH=closed(f4h,asOf);
 const dayRows=intraday.length?intraday:hourly,weekRows=fourH.length?fourH:hourly,dayKey=kstDate(asOf),wkKey=weekKey(asOf);
 const dayGroups=groups(dayRows,kstDate),weekGroups=groups(weekRows,weekKey),prevDay=previousGroup(dayGroups,dayKey),curDay=currentGroup(dayGroups,dayKey),prevWeek=previousGroup(weekGroups,wkKey),curWeek=currentGroup(weekGroups,wkKey);
 const today=dayGroups.get(dayKey)||[],asia=range(today.filter(x=>sessionOf(x.openTime)==='ASIA')),london=range(today.filter(x=>sessionOf(x.openTime)==='LONDON')),newYork=range(today.filter(x=>sessionOf(x.openTime)==='NEW_YORK'));
 const h4High=latestSwing(f4h,'H',asOf),h4Low=latestSwing(f4h,'L',asOf),last=dayRows.at(-1)?.close??fourH.at(-1)?.close??null;
 const dealing=h4High&&h4Low&&h4High.price>h4Low.price?{high:h4High.price,low:h4Low.price,equilibrium:(h4High.price+h4Low.price)/2,position:last==null?'UNKNOWN':last>(h4High.price+h4Low.price)/2?'PREMIUM':last<(h4High.price+h4Low.price)/2?'DISCOUNT':'EQUILIBRIUM',positionPct:last==null?null:(last-h4Low.price)/(h4High.price-h4Low.price)*100,highKnownAt:h4High.knownAt,lowKnownAt:h4Low.knownAt,method:'latest confirmed 4H swing high/low proxy'}:null;
 const lines=[
  line('PDH',prevDay?.high,'resistance','previous-day'),line('PDL',prevDay?.low,'support','previous-day'),
  line('PWH',prevWeek?.high,'resistance','previous-week'),line('PWL',prevWeek?.low,'support','previous-week'),
  line('D OPEN',curDay?.open,'open','current-open'),line('W OPEN',curWeek?.open,'open','current-open'),
  line('ASIA H',asia?.high,'resistance','asia'),line('ASIA L',asia?.low,'support','asia'),
  line('LONDON H',london?.high,'resistance','london'),line('LONDON L',london?.low,'support','london'),
  line('NY H',newYork?.high,'resistance','new-york'),line('NY L',newYork?.low,'support','new-york')
 ].filter(Boolean);
 return{asOf,tradeDate:dayKey,weekKey:wkKey,currentSession:sessionOf(asOf),previousDay:prevDay,previousWeek:prevWeek,opens:{day:curDay?.open??null,week:curWeek?.open??null},sessions:{asia,london,newYork},dealingRange:dealing,lines}
}
return{kstDate,weekKey,sessionOf,range,build};
});