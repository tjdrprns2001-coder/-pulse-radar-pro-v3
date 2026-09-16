const vercelHandler=require('../../api/radar.js');

exports.handler=async function(event){
  let statusCode=200;
  const headers={};
  let body='';
  const req={query:event.queryStringParameters||{}};
  const res={
    setHeader(name,value){headers[name]=String(value)},
    status(code){statusCode=code;return this},
    json(value){body=JSON.stringify(value);headers['Content-Type']='application/json; charset=utf-8';return {statusCode,headers,body}}
  };
  const out=await vercelHandler(req,res);
  if(out&&typeof out.statusCode==='number')return out;
  return {statusCode,headers,body};
};
