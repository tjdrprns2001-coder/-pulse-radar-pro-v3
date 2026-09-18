'use strict';
const fs=require('fs');const req=p=>{if(!fs.existsSync(p))throw new Error('missing '+p);return fs.readFileSync(p,'utf8')};
const h=req('bowl224-research.html'),j=req('ui/bowl224-research.js'),c=req('ui/bowl224-research.css'),parent=req('research-backtest.html');
for(const s of ['224MA 밥그릇 연구','Universe-L','Universe-N','strict 120일','3A','3B','3C','1H 교집합','A / B / C / D','72H +10%','7D +10%','7D +15%','7D +20%','MAE -3% 이내','Time-to-hit','데이터 완전성','가설용 32코인 제외'])if(!(h+j).includes(s))throw new Error('missing '+s);
for(const q of ['action=status','action=stats','action=events'])if(!j.includes(q))throw new Error('missing API '+q);
if(/BOWL224_RESEARCH_ADMIN_TOKEN|x-bowl224-admin-token/.test(h+j))throw new Error('admin token leaked to browser');
if(!/@media\s*\(max-width:\s*650px\)/.test(c))throw new Error('mobile layout missing');
if(!parent.includes('bowl224-research'))throw new Error('formal backtest page link missing');
console.log('bowl224 UI PASS');