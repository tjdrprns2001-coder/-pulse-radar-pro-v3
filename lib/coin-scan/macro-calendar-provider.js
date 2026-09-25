'use strict';

const FOMC_DATES={
  2026:['2026-01-28','2026-03-18','2026-04-29','2026-06-17','2026-07-29','2026-09-16','2026-10-28','2026-12-09'],
  2027:['2027-01-27','2027-03-17','2027-04-28','2027-06-09','2027-07-28','2027-09-15','2027-10-27','2027-12-08']
};
function nyReleaseUtc(date,hh=14,mm=0){
  const d=new Date(date+'T12:00:00Z');
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',timeZoneName:'shortOffset',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d);
  const z=parts.find(x=>x.type==='timeZoneName')?.value||'GMT-5',m=z.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const off=m?(m[1]==='-'?-1:1)*(Number(m[2])*60+Number(m[3]||0)):-300;
  return Date.parse(date+'T'+String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0')+':00Z')-off*60000;
}
function parseIcs(text='',observedAt=Date.now()){
  const events=[];for(const chunk of String(text).split('BEGIN:VEVENT').slice(1)){
    const body=chunk.split('END:VEVENT')[0]||'',summary=(body.match(/\nSUMMARY:(.*)/)?.[1]||'').trim(),dt=(body.match(/\nDTSTART(?:;[^:]*)?:(\d{8}T?\d{0,6}Z?)/)?.[1]||'').trim(),uid=(body.match(/\nUID:(.*)/)?.[1]||'').trim();
    if(!summary||!dt)continue;
    let scheduled=null;
    if(/^\d{8}T\d{6}Z$/.test(dt))scheduled=Date.UTC(+dt.slice(0,4),+dt.slice(4,6)-1,+dt.slice(6,8),+dt.slice(9,11),+dt.slice(11,13),+dt.slice(13,15));
    else if(/^\d{8}$/.test(dt))scheduled=Date.UTC(+dt.slice(0,4),+dt.slice(4,6)-1,+dt.slice(6,8),13,30,0);
    if(scheduled==null)continue;
    const low=summary.toLowerCase();let type=null;
    if(/consumer price index|cpi/.test(low))type='CPI';
    else if(/producer price index|ppi/.test(low))type='PPI';
    else if(/employment situation|payroll/.test(low))type='NFP';
    else if(/job openings|jolts/.test(low))type='JOLTS';
    if(!type)continue;
    events.push({event_id:'bls:'+uid,event_type:type,jurisdiction:'US',source_name:'BLS',source_tier:1,scheduled_at:scheduled,actual_at:null,release_status:'scheduled',importance:'high',consensus:null,prior:null,actual:null,revision:null,observed_at:observedAt,source_ref:'https://www.bls.gov/schedule/news_release/bls.ics',original_timezone:'America/New_York'});
  }return events;
}
function fomcEvents(now=Date.now()){
  const out=[];for(const [year,dates] of Object.entries(FOMC_DATES))for(const date of dates)out.push({event_id:'fed:fomc:'+date,event_type:'FOMC',jurisdiction:'US',source_name:'Federal Reserve',source_tier:1,scheduled_at:nyReleaseUtc(date,14,0),actual_at:null,release_status:'scheduled',importance:'high',consensus:null,prior:null,actual:null,revision:null,observed_at:now,source_ref:'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',original_timezone:'America/New_York',source_version:'fomc-calendar-2026-09-16'});
  return out;
}
function createMacroCalendarProvider({fetchImpl=globalThis.fetch,cache=null,now=()=>Date.now()}={}){
  async function getBls(){const key='macro:bls:ics';if(cache?.get){const hit=cache.get(key);if(hit)return hit}try{const r=await fetchImpl('https://www.bls.gov/schedule/news_release/bls.ics',{headers:{'user-agent':'PulseRadar-selector-r0.2'}});if(!r.ok)throw new Error('HTTP '+r.status);const rows=parseIcs(await r.text(),now());const out={available:rows.length>0,provider:'BLS',items:rows};cache?.set?.(key,out,6*3600000);return out}catch(e){return{available:false,provider:'BLS',items:[],error:String(e?.message||e)}}}
  async function get(){const bls=await getBls(),fed=fomcEvents(now());const items=[...(bls.items||[]),...fed].sort((a,b)=>a.scheduled_at-b.scheduled_at);return{available:items.length>0,provider:'BLS+Federal Reserve',items,sourceVersions:['bls-ics-live','fomc-calendar-2026-09-16'],errors:bls.error?[bls.error]:[]}}
  return{get,getBls};
}
module.exports={FOMC_DATES,nyReleaseUtc,parseIcs,fomcEvents,createMacroCalendarProvider};
