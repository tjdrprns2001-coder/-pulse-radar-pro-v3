const fs=require('fs');const p='api/radar.js';if(!fs.existsSync(p))throw new Error('radar api missing');const s=fs.readFileSync(p,'utf8');
['mode','snapshot','health','dex','cex','newPairs','source','geckoterminal','networks/new_pools','networks/trending_pools','dexscreener'].forEach(k=>{if(!s.toLowerCase().includes(k.toLowerCase()))throw new Error('missing '+k)});
if(!s.includes('sourceConfidence'))throw new Error('normalized confidence missing');
if(!s.includes('pairAddress'))throw new Error('address-aware identity missing');
console.log('radar api multi-source contract PASS');