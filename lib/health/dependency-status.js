'use strict';
// Public component health: never expose connection strings, environment, stack traces or user data.
const REASONS=new Set(['postgres_not_configured','postgres_startup_failed','postgres_unavailable','unavailable','degraded','available','ready']);
function dependencyStatus(runtime={},release=null){
  const durable=runtime?.persistence?.durable===true&&runtime?.persistence?.kind==='postgres';
  const ready=runtime?.storage_ready===true&&durable;
  const reason=ready?null:REASONS.has(runtime?.reason)?runtime.reason:'storage_not_ready';
  return{
    ok:true,service:'pulseradar',release:release||null,
    http:{status:'alive'},
    chartStorage:{status:ready?'ready':'degraded',durable,kind:durable?'postgres':'non-durable-or-unknown',reason},
    note:ready?'Persistent chart storage is ready':'The site can respond while persistent chart storage is unavailable. /health/ready remains 503 until storage is ready.'
  };
}
module.exports={dependencyStatus};
