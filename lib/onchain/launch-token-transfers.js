'use strict';
// Read-only recent ERC20 transfer evidence; NOT complete genesis transactions or swap side.
const HOST={ethereum:'https://eth.blockscout.com',base:'https://base.blockscout.com',bsc:'https://bsc.blockscout.com',arbitrum:'https://arbitrum.blockscout.com',polygon_pos:'https://polygon.blockscout.com'};
const EVM=/^0x[a-fA-F0-9]{40}$/;
function norm(i,token,host){
 const from=String(i?.from?.hash||''),to=String(i?.to?.hash||''),hash=String(i?.tx_hash||i?.transaction_hash||'');
 const contract=String(i?.token?.address_hash||i?.token?.address||'');
 if(!EVM.test(from)||!EVM.test(to)||!/^0x[a-fA-F0-9]{64}$/.test(hash)||contract.toLowerCase()!==token.toLowerCase())return null;
 const raw=String(i?.total?.value??i?.value??'');
 const dec=Number(i?.total?.decimals??i?.token?.decimals);
 const timestamp=new Date(i?.timestamp);
 return{from,to,transactionHash:hash,blockNumber:Number.isFinite(Number(i?.block_number))?Number(i.block_number):null,time:Number.isFinite(timestamp.getTime())?timestamp.toISOString():null,amountRaw:/^\d+$/.test(raw)?raw:null,tokenDecimals:Number.isInteger(dec)&&dec>=0&&dec<=36?dec:null,explorerUrl:host+'/tx/'+hash}
}
async function readRecent({network,token,fetchImpl=globalThis.fetch}){
 const host=HOST[network];
 if(!host||!EVM.test(String(token)))return{status:'NOT_SUPPORTED',network,items:[],warning:'지원되는 EVM 체인 토큰 주소 필요'};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await fetchImpl(host+'/api/v2/tokens/'+encodeURIComponent(token)+'/transfers',{signal:controller.signal,headers:{accept:'application/json'}});
  if(!response.ok)throw Error('Blockscout HTTP '+response.status);
  const json=await response.json();
  if(!Array.isArray(json?.items))throw Error('missing transfer items');
  const items=json.items.map(i=>norm(i,token,host)).filter(Boolean).slice(0,50);
  const uniqueFrom=new Set(items.map(x=>x.from.toLowerCase())).size,uniqueTo=new Set(items.map(x=>x.to.toLowerCase())).size;
  return{status:'RECENT_SAMPLE_ONLY',network,provider:'Blockscout',sourceUrl:host+'/token/'+token,items,stats:{sampleCount:items.length,uniqueSenders:uniqueFrom,uniqueRecipients:uniqueTo},hasOlderPages:!!json.next_page_params,warning:'최근 최대 50건의 토큰 전송 샘플. 첫 거래나 매수/매도·스마트머니로 해석 금지. 전송은 DEX 매매와 동일하지 않음.'};
 }catch(e){return{status:'UNAVAILABLE',network,items:[],warning:'블록 탐색기 조회 실패: '+String(e.message||e)}}
 finally{clearTimeout(timer)}
}
module.exports={readRecent,norm};
