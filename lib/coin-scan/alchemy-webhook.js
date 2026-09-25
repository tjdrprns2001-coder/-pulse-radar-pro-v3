'use strict';
const crypto=require('crypto');
function signature(body,key){return crypto.createHmac('sha256',String(key)).update(String(body),'utf8').digest('hex')}
function verify(body,sig,key){
  if(!sig||!key)return false;const a=Buffer.from(signature(body,key),'utf8'),b=Buffer.from(String(sig).toLowerCase(),'utf8');return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function normalizeAlchemy(rawBody,{signatureHeader,signingKey,receivedAt=Date.now()}={}){
  if(!verify(rawBody,signatureHeader,signingKey))return{ok:false,status:401,error:'INVALID_SIGNATURE'};
  let body;try{body=JSON.parse(rawBody)}catch{return{ok:false,status:400,error:'INVALID_JSON'}};
  if(!body.id||!body.type)return{ok:false,status:202,error:'SCHEMA_INVALID',dlq:true,body};
  return{ok:true,status:200,event:{source_name:'alchemy-webhook',source_kind:'webhook',provider:'alchemy',delivery_id:String(body.id),provider_event_id:String(body.id),source_time:Date.parse(body.createdAt)||null,received_time:receivedAt,available_time:null,payload:body,ingest_status:'RPC_PENDING'}};
}
module.exports={signature,verify,normalizeAlchemy};
