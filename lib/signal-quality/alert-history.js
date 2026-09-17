(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PulseAlertHistory=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
const KEY='pulse_alert_history_v2';
function storage(){return typeof localStorage!=='undefined'?localStorage:null}
function parse(v){try{const x=JSON.parse(v||'[]');return Array.isArray(x)?x:[]}catch{return[]}}
function read(s=storage()){return s?parse(s.getItem(KEY)):[]}
function write(rows,s=storage()){if(s)s.setItem(KEY,JSON.stringify(rows.slice(-4000)));return rows}
function recordTransition(prev={},next={},context={},s=storage()){const previousState=typeof prev==='string'?prev:(prev.state||'OBSERVE'),nextState=typeof next==='string'?next:(next.state||'OBSERVE'),atMs=Number(context.atMs||Date.now()),entry={id:[context.symbol||'NA',context.tf||'NA',atMs,previousState,nextState].join(':'),symbol:context.symbol||null,tf:context.tf||null,atMs,previousState,nextState,reason:next.reason||context.reason||null,conditionsMet:Number(next.conditionsMet??context.conditionsMet)||0,conditionsTotal:Number(next.conditionsTotal??context.conditionsTotal)||3,calibrationBucket:context.calibrationBucket||null,validationSource:context.validationSource||null,driftStatus:context.driftStatus||null,integrityStatus:context.integrityStatus||null,cooldownUntil:Number(next.cooldownUntil||context.cooldownUntil)||null,policyReason:context.policyReason||null};const rows=read(s);if(!rows.some(x=>x.id===entry.id))rows.push(entry);write(rows,s);return entry}
function list(filters={},s=storage()){return read(s).filter(x=>Object.entries(filters).every(([k,v])=>v==null||x[k]===v))}
function summary(filters={},s=storage()){const out={OBSERVE:0,WATCH:0,ARMED:0,TRIGGERED:0,CONFIRMED:0,INVALIDATED:0,EXPIRED:0,NO_SIGNAL:0};for(const x of list(filters,s))out[x.nextState]=(out[x.nextState]||0)+1;return out}
function clear(s=storage()){if(s)s.removeItem(KEY)}
return{KEY,read,recordTransition,list,summary,clear};
});
