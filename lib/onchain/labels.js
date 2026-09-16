const registries=new Map();
function key(chain,address){return `${String(chain||'').toLowerCase()}:${String(address||'').toLowerCase()}`}
function registerTrusted(chain,address,label,type,confidence=95){if(!chain||!address||!label||!type)return null;const rec={label:String(label),type:String(type),confidence:Math.max(0,Math.min(100,Number(confidence)||0))};registries.set(key(chain,address),rec);return rec}
function loadTrustedLabels(rows=[]){let count=0;for(const r of Array.isArray(rows)?rows:[]){if(registerTrusted(r?.chain,r?.address,r?.label,r?.type,r?.confidence??95))count++}return count}
function loadTrustedLabelsJson(value){if(!value)return 0;try{const parsed=typeof value==='string'?JSON.parse(value):value;return loadTrustedLabels(parsed)}catch{return 0}}
function lookupLabel(chain,address){return registries.get(key(chain,address))||null}
function classifyAddress(chain,address){return lookupLabel(chain,address)||{label:null,type:'unlabeled-wallet',confidence:0}}
function reset(){registries.clear()}
module.exports={registerTrusted,loadTrustedLabels,loadTrustedLabelsJson,lookupLabel,classifyAddress,reset};
