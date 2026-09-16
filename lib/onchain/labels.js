const registries=new Map();
function key(chain,address){return `${String(chain||'').toLowerCase()}:${String(address||'').toLowerCase()}`}
function registerTrusted(chain,address,label,type,confidence=95){if(!chain||!address||!label||!type)return null;const rec={label:String(label),type:String(type),confidence:Math.max(0,Math.min(100,Number(confidence)||0))};registries.set(key(chain,address),rec);return rec}
function lookupLabel(chain,address){return registries.get(key(chain,address))||null}
function classifyAddress(chain,address){return lookupLabel(chain,address)||{label:null,type:'unlabeled-wallet',confidence:0}}
function reset(){registries.clear()}
module.exports={registerTrusted,lookupLabel,classifyAddress,reset};
