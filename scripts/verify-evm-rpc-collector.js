const assert=require('assert');
const {createEvmCollector,TRANSFER_TOPIC}=require('../lib/coin-scan/evm-rpc-collector.js');

function rpc(blockHash='0xaaa'){
  return{url:'mock://rpc',async call(method,params){
    if(method==='eth_blockNumber')return'0x64';
    if(method==='eth_getBlockByNumber'){const n=parseInt(params[0],16);return{number:params[0],hash:blockHash,timestamp:'0x'+(1700000000+n).toString(16)}}
    if(method==='eth_getLogs')return[{blockNumber:'0x50',blockHash:'0xaaa',transactionHash:'0xtx',logIndex:'0x1',address:'0xtoken',topics:[TRANSFER_TOPIC,'0x'+'0'.repeat(24)+'1'.repeat(40),'0x'+'0'.repeat(24)+'2'.repeat(40)],data:'0x10'}];
    throw new Error(method);
  }};
}
(async()=>{
 const c=createEvmCollector({chainId:'1',primary:rpc(),secondary:rpc(),confirmations:12,finalityBlocks:16,now:()=>999});
 const r=await c.transferEvents({fromBlock:80,toBlock:80,contracts:['0xtoken']});
 assert.equal(r.events.length,1);assert.equal(r.events[0].finality_status,'FINAL');assert.equal(r.events[0].amount_raw,'16');
 const wm=await c.watermark(79);assert.equal(wm.latest_final_block,84);assert.equal(wm.last_processed_block,79);
 const conflict=createEvmCollector({primary:rpc('0xaaa'),secondary:rpc('0xbbb')});
 const cmp=await conflict.compareBlock(80);assert.equal(cmp.conflicted,true);
 console.log('evm rpc collector PASS');
})().catch(e=>{console.error(e);process.exit(1)});
