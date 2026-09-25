'use strict';
function createAddressLabelRegistry(){
  const rows=[];
  function add(x){
    const row={chain_id:String(x.chain_id),address:String(x.address).toLowerCase(),label:String(x.label),label_type:String(x.label_type||'unknown'),confidence:Number(x.confidence)||0,valid_from:Number(x.valid_from),observed_at:Number(x.observed_at),source_ref:String(x.source_ref||''),version:Number(x.version||1)};
    rows.push(row);return{...row};
  }
  function resolve(chainId,address,decisionTime){
    const t=Number(decisionTime),a=String(address||'').toLowerCase();
    return rows.filter(x=>x.chain_id===String(chainId)&&x.address===a&&x.valid_from<=t&&x.observed_at<=t).sort((a,b)=>b.version-a.version||b.observed_at-a.observed_at)[0]||null;
  }
  function list(){return rows.map(x=>({...x}))}
  return{add,resolve,list};
}
module.exports={createAddressLabelRegistry};
