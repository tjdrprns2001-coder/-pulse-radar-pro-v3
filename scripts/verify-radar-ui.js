const fs=require('fs');
for(const p of ['radar.html','ui/radar-app.js','ui/radar.css'])if(!fs.existsSync(p))throw new Error('missing '+p);
const h=fs.readFileSync('radar.html','utf8');
['LIVE RADAR','TOP MOVERS','NEW PAIRS','VOLUME SPIKE','LIQUIDITY ALERT'].forEach(k=>{if(!h.includes(k))throw new Error('missing tab '+k)});
const a=fs.readFileSync('ui/radar-app.js','utf8');
['/api/radar?mode=snapshot','PulseRadarCore','PulseRadarStream','준비 중','강한 움직임','위험','관찰','거래량 증가','매수세 증가','신규 페어','유동성 위험','자세히'].forEach(k=>{if(!a.includes(k))throw new Error('missing '+k)});
const c=fs.readFileSync('ui/radar.css','utf8');
['beginnerState','whyList','detailPanel','detailToggle'].forEach(k=>{if(!c.includes(k))throw new Error('missing beginner style '+k)});
console.log('radar ui contract PASS');