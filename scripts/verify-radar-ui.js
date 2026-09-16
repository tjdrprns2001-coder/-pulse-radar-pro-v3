const fs=require('fs');
for(const p of ['radar.html','ui/radar-app.js','ui/radar.css','ui/radar-history.js','ui/radar-themes.js','ui/radar-alerts.js'])if(!fs.existsSync(p))throw new Error('missing '+p);
const h=fs.readFileSync('radar.html','utf8');
['LIVE RADAR','TOP MOVERS','NEW PAIRS','VOLUME SPIKE','LIQUIDITY ALERT','테마 쏠림','전체 테마','radar-history.js','radar-themes.js','radar-alerts.js','recentAlerts'].forEach(k=>{if(!h.includes(k))throw new Error('missing UI '+k)});
const a=fs.readFileSync('ui/radar-app.js','utf8');
['/api/radar?mode=snapshot','PulseRadarCore','PulseRadarStream','PulseRadarHistory','PulseRadarThemes','PulseRadarAlerts','준비 중','강한 움직임','위험','관찰','거래량 증가','매수세 증가','신규 페어','유동성 위험','자세히','1분 변화','5분 변화','themeHeat','selectedTheme'].forEach(k=>{if(!a.includes(k))throw new Error('missing '+k)});
const c=fs.readFileSync('ui/radar.css','utf8');
['beginnerState','whyList','detailPanel','detailToggle','themeSection','themeBar','themeBarFill','themeReset','alertToast'].forEach(k=>{if(!c.includes(k))throw new Error('missing style '+k)});
console.log('radar ui contract PASS');
