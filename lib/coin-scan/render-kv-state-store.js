'use strict';

const net=require('net');
const tls=require('tls');

function parseUrl(value){
  const u=new URL(String(value||''));
  if(!['redis:','rediss:'].includes(u.protocol))throw new Error('CHARTBRO_KV_URL must use redis:// or rediss://');
  return{tls:u.protocol==='rediss:',host:u.hostname,port:Number(u.port)||6379,username:decodeURIComponent(u.username||''),password:decodeURIComponent(u.password||'')};
}
function resp(args=[]){
  const parts=[Buffer.from('*'+args.length+'\r\n')];
  for(const a of args){const b=Buffer.from(String(a));parts.push(Buffer.from('$'+b.length+'\r\n'),b,Buffer.from('\r\n'))}
  return Buffer.concat(parts);
}
function parseOne(buf){
  if(!buf.length)return null;
  const type=String.fromCharCode(buf[0]),lineEnd=buf.indexOf('\r\n');
  if(lineEnd<0)return null;
  const line=buf.subarray(1,lineEnd).toString();
  if(type==='+')return{value:line,bytes:lineEnd+2};
  if(type==='-')throw new Error('Redis '+line);
  if(type===':')return{value:Number(line),bytes:lineEnd+2};
  if(type==='$'){
    const len=Number(line);if(len===-1)return{value:null,bytes:lineEnd+2};
    const start=lineEnd+2,end=start+len;if(buf.length<end+2)return null;
    return{value:buf.subarray(start,end).toString(),bytes:end+2};
  }
  throw new Error('Unsupported Redis response '+type);
}
function createRedisClient({url,timeoutMs=5000}={}){
  const cfg=parseUrl(url);
  async function command(args=[]){
    return new Promise((resolve,reject)=>{
      let done=false,data=Buffer.alloc(0),authPending=Boolean(cfg.password),commandSent=false;
      const finish=(err,val)=>{if(done)return;done=true;socket.destroy();err?reject(err):resolve(val)};
      const onConnect=()=>{
        if(cfg.password){socket.write(resp(['AUTH',cfg.username||'default',cfg.password]));}
        else{commandSent=true;socket.write(resp(args))}
      };
      const socket=(cfg.tls?tls.connect({host:cfg.host,port:cfg.port,rejectUnauthorized:true},onConnect):net.createConnection({host:cfg.host,port:cfg.port},onConnect));
      socket.setTimeout(timeoutMs,()=>finish(new Error('Redis timeout')));
      socket.on('error',e=>finish(e));
      socket.on('data',chunk=>{
        try{
          data=Buffer.concat([data,chunk]);
          while(data.length){
            const p=parseOne(data);if(!p)return;data=data.subarray(p.bytes);
            if(authPending){authPending=false;if(!commandSent){commandSent=true;socket.write(resp(args));}continue}
            return finish(null,p.value);
          }
        }catch(e){finish(e)}
      });
      socket.on('end',()=>{if(!done)finish(new Error('Redis connection ended'))});
    });
  }
  return{command};
}
function createRenderKvStateStore({url=process.env.CHARTBRO_KV_URL,prefix='pulseradar:chartbro'}={}){
  if(!url)throw new Error('CHARTBRO_KV_URL required');
  const client=createRedisClient({url});
  const key=id=>prefix+':'+String(id);
  async function putState(id,value){const out=await client.command(['SET',key(id),JSON.stringify(value??null)]);return out==='OK'}
  async function getState(id){const raw=await client.command(['GET',key(id)]);if(raw==null)return null;try{return JSON.parse(raw)}catch{return null}}
  async function ping(){return client.command(['PING'])}
  return{putState,getState,ping,keyPrefix:prefix};
}
module.exports={parseUrl,resp,parseOne,createRedisClient,createRenderKvStateStore};
