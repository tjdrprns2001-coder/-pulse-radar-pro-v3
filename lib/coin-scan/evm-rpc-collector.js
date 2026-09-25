'use strict';
const crypto=require('crypto');
const TRANSFER_TOPIC='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
function hex(n){return '0x'+Number(n).toString(16)}
function num(v){return typeof v==='string'&&v.startsWith('0x')?parseInt(v,16):Number(v)}
function addr(topic){return topic&&topic.length>=42?'0x'+topic.slice(-40).toLowerCase():null}
function hash(v){return crypto.createHash('sha256').update(String(v)).digest('hex')}
function createRpcClient({url,fetchImpl=globalThis.fetch,timeoutMs=10000}={}){
  let id=0;
  async function call(method,params=[]){
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
    try{
      const r=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),signal:ctrl.signal});
      if(!r.ok)throw new Error('RPC HTTP '+r.status);
      const j=await r.json();if(j.error)throw new Error('RPC '+j.error.code+': '+j.error.message);return j.result;
    }finally{clearTimeout(timer)}
  }
  return{call};
}
function createEvmCollector({chainId='1',primary,secondary=null,confirmations=12,finalityBlocks=64,now=()=>Date.now()}={}){
  if(!primary)throw new Error('primary rpc required');
  const blockCache=new Map();
  async function head(){return num(await primary.call('eth_blockNumber',[]))}
  async function block(n,client=primary){return client.call('eth_getBlockByNumber',[hex(n),false])}
  async function compareBlock(n){
    const [a,b]=await Promise.all([block(n,primary),secondary?block(n,secondary):Promise.resolve(null)]);
    const ah=a?.hash?.toLowerCase()||null,bh=b?.hash?.toLowerCase()||null;
    return{number:n,primaryHash:ah,secondaryHash:bh,conflicted:Boolean(b&&ah&&bh&&ah!==bh),block:a};
  }
  async function logs({fromBlock,toBlock,address,topics=[TRANSFER_TOPIC]}={}){
    return primary.call('eth_getLogs',[{fromBlock:hex(fromBlock),toBlock:hex(toBlock),address,topics}]);
  }
  function finalityStatus(blockNumber,headNumber){
    const depth=headNumber-blockNumber;
    if(depth>=finalityBlocks)return'FINAL';
    if(depth>=confirmations)return'CONFIRMED';
    return'PENDING';
  }
  async function transferEvents({fromBlock,toBlock,contracts=[]}={}){
    const headNumber=await head(),events=[];
    for(const contract of contracts){
      const rows=await logs({fromBlock,toBlock,address:contract});
      for(const x of rows){
        const bnum=num(x.blockNumber),cmp=await compareBlock(bnum);
        const status=cmp.conflicted?'REORG_CANDIDATE':finalityStatus(bnum,headNumber);
        events.push({
          event_id:['evm',chainId,x.transactionHash,x.logIndex].join(':'),
          chain_id:String(chainId),block_number:bnum,block_hash:x.blockHash,block_timestamp:cmp.block?.timestamp?num(cmp.block.timestamp)*1000:null,
          tx_hash:x.transactionHash,log_index:num(x.logIndex),event_type:'TOKEN_TRANSFER',token_contract:(x.address||contract).toLowerCase(),
          from_address:addr(x.topics?.[1]),to_address:addr(x.topics?.[2]),amount_raw:x.data?BigInt(x.data).toString():null,
          source_name:'evm-json-rpc',observed_at:now(),finality_status:status,
          source_refs:[primary.url||'primary-rpc',secondary?.url||null].filter(Boolean),
          payload_hash:hash(JSON.stringify(x))
        });
      }
    }
    return{headNumber,events};
  }
  async function reconcile({fromBlock,toBlock,events=[]}={}){
    const corrections=[];for(let n=fromBlock;n<=toBlock;n++){
      const cmp=await compareBlock(n),old=blockCache.get(n);blockCache.set(n,cmp.primaryHash);
      if(cmp.conflicted||old&&old!==cmp.primaryHash){
        for(const e of events.filter(x=>x.block_number>=n&&x.finality_status!=='REORGED'))corrections.push({...e,event_id:e.event_id+':reorg:'+hash(cmp.primaryHash).slice(0,8),finality_status:'REORGED',correction_of:e.event_id,reorg_version:1,observed_at:now()});
      }
    }return corrections;
  }
  async function watermark(lastProcessedBlock=null){
    const latest=await head();return{chain_id:String(chainId),latest_seen_block:latest,latest_rpc_block:latest,latest_confirmed_block:Math.max(0,latest-confirmations),latest_final_block:Math.max(0,latest-finalityBlocks),last_processed_block:lastProcessedBlock};
  }
  return{head,block,compareBlock,logs,transferEvents,reconcile,watermark,finalityStatus};
}
module.exports={TRANSFER_TOPIC,createRpcClient,createEvmCollector};
