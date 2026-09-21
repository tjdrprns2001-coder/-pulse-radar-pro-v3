const handler=require('../../api/assistant-scan.js');
exports.handler=async function(event){
  let statusCode=200;const headers={};let body='';const req={query:event.queryStringParameters||{}};
  const res={setHeader(n,v){headers[n]=String(v)},status(c){statusCode=c;return this},json(v){body=JSON.stringify(v);headers['Content-Type']='application/json; charset=utf-8';return{statusCode,headers,body}}};
  const out=await handler(req,res);if(out&&typeof out.statusCode==='number')return out;return{statusCode,headers,body};
};
