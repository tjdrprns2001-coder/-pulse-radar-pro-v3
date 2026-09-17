(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseSessionProfile=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
  const NY_TZ='America/New_York';
  const SESSION_PROFILE_v1=Object.freeze({
    version:'SESSION_PROFILE_v1',
    timeZone:NY_TZ,
    windows:Object.freeze({
      asia:Object.freeze({start:'20:00',end:'22:00'}),
      london:Object.freeze({start:'02:00',end:'05:00'}),
      newYork:Object.freeze({start:'07:00',end:'10:00'}),
      londonClose:Object.freeze({start:'10:00',end:'12:00'})
    })
  });
  const KILLZONE_PROFILE_v1=Object.freeze({
    version:'KILLZONE_PROFILE_v1',
    timeZone:NY_TZ,
    windows:SESSION_PROFILE_v1.windows
  });

  const formatterCache=new Map();
  function formatter(timeZone){
    const tz=timeZone||NY_TZ;
    if(!formatterCache.has(tz))formatterCache.set(tz,new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
    return formatterCache.get(tz);
  }
  function toParts(utcMs,timeZone){
    const ms=Number(utcMs);
    if(!Number.isFinite(ms))throw new Error('utcMs must be a finite timestamp');
    const parts={};
    for(const p of formatter(timeZone).formatToParts(new Date(ms))){if(p.type!=='literal')parts[p.type]=p.value;}
    return {year:Number(parts.year),month:Number(parts.month),day:Number(parts.day),hour:Number(parts.hour),minute:Number(parts.minute),second:Number(parts.second),timeZone:timeZone||NY_TZ};
  }
  function toNewYorkParts(utcMs){return toParts(utcMs,NY_TZ);}
  function minuteOfDay(parts){return Number(parts.hour)*60+Number(parts.minute);}
  function parseClock(value){
    if(typeof value!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))throw new Error('invalid session clock: '+value);
    const [h,m]=value.split(':').map(Number);return h*60+m;
  }
  function inWindow(now,start,end){return start===end?true:start<end?(now>=start&&now<end):(now>=start||now<end);}
  function resolveSession(utcMs,profile){
    const p=profile||SESSION_PROFILE_v1;
    if(!p||!p.windows)throw new Error('session profile requires windows');
    const local=toParts(utcMs,p.timeZone||NY_TZ),now=minuteOfDay(local),hits=[];
    for(const [name,window] of Object.entries(p.windows)){
      const start=parseClock(window.start),end=parseClock(window.end);
      if(inWindow(now,start,end))hits.push(name);
    }
    return hits;
  }
  return {NY_TZ,SESSION_PROFILE_v1,KILLZONE_PROFILE_v1,toNewYorkParts,resolveSession};
});