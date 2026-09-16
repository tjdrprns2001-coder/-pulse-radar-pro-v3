const assert=require('assert');
const alerts=require('../ui/radar-alerts.js');

alerts.reset();
const base={id:'binance:spot:BTCUSDT',symbol:'BTCUSDT',label:'WATCH',signal:'WATCH',reasons:['관찰']};
assert.equal(alerts.observe(base,0),null,'first observation must not alert');
const pre=alerts.observe({...base,label:'PRE-SURGE',signal:'PRE_SURGE',reasons:['거래량 증가']},1000);
assert(pre&&pre.to==='PRE-SURGE','WATCH to PRE-SURGE should alert');
assert.equal(alerts.observe({...base,label:'PRE-SURGE',signal:'PRE_SURGE'},2000),null,'unchanged state should not repeat');
const surgeTooSoon=alerts.observe({...base,label:'SURGE',signal:'SURGE'},3000);
assert.equal(surgeTooSoon,null,'cooldown should suppress rapid repeat alert');
const surge=alerts.observe({...base,label:'SURGE',signal:'SURGE',reasons:['매수세 증가']},70000);
assert(surge&&surge.to==='SURGE','PRE-SURGE to SURGE after cooldown should alert');
const risk=alerts.observe({...base,label:'RISK',signal:'LIQUIDITY_RISK',riskScore:80,reasons:['유동성 위험']},140000);
assert(risk&&risk.to==='RISK','transition to RISK should alert');
assert(alerts.recent().length<=20,'recent alerts must stay bounded');

alerts.reset();
assert.equal(alerts.observe(base,0),null);
const direct=alerts.observe({...base,label:'SURGE',signal:'SURGE'},70000);
assert(direct&&direct.from==='WATCH'&&direct.to==='SURGE','WATCH to SURGE should alert');

console.log('radar alerts behavior PASS');
