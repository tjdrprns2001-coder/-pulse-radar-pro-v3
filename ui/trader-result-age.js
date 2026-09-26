(function(root){
  'use strict';
  function isStale(item,now=Date.now()){
    const t=item?.asOf;
    return t==null||t===''||!Number.isFinite(Number(t))||now-Number(t)>120000||Number(t)>now+60000;
  }
  const api={isStale};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TraderResultAge=api;
})(typeof window==='undefined'?{}:window);
