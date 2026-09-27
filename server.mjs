import {createServer} from 'node:http';
import {createHandler} from './api.mjs';
import {createLocalScannerSource} from './scanner-runtime.mjs';

const source=createLocalScannerSource({env:process.env});
const handler=createHandler({
  env:process.env,
  latestCompleted:source,
  sourceHealth:()=>source.health()
});

export const server=createServer(async(req,res)=>{
  try{
    const headers=new Headers();
    for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
    const result=await handler(new Request(new URL(req.url,'http://readonly.internal'),{method:req.method,headers}));
    res.writeHead(result.status,Object.fromEntries(result.headers));
    res.end(Buffer.from(await result.arrayBuffer()));
  }catch{
    res.writeHead(400,{'Cache-Control':'no-store'});
    res.end();
  }
});
server.requestTimeout=10000;
server.headersTimeout=10000;
server.listen(Number(process.env.PORT||8080),'0.0.0.0');
