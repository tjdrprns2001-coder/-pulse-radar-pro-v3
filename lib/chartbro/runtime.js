'use strict';
const {Journal}=require('./journal'),{Provider}=require('./provider'),{Service}=require('./service');
let service=null,timer=null,active=false;
function getService(){if(!service)service=new Service({provider:new Provider(),journal:new Journal({dir:process.env.CHARTBRO_DATA_DIR||null})});return service;}
function startWorker(){if(timer)return;if(!process.env.CHARTBRO_DATA_DIR)throw new Error('CHARTBRO_DATA_DIR required for durable worker');timer=setInterval(async()=>{if(active)return;active=true;try{await getService().tick();}catch(e){console.error('ChartBro worker:',e.message);}finally{active=false;}},1000);timer.unref();}
module.exports={getService,startWorker};
