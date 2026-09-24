'use strict';
const assert=require('assert');
const fs=require('fs');

const scan=fs.readFileSync('lib/coin-scan/scan-service.js','utf8');
const gate=fs.readFileSync('lib/coin-scan/recommendation-validation-gate.js','utf8');
const val=fs.readFileSync('lib/coin-scan/market-validation-engine.js','utf8');
const promo=fs.readFileSync('ui/book-ai/promotion-engine.js','utf8');
const app=fs.readFileSync('ui/book-ai/app.js','utf8');
const html=fs.readFileSync('book-ai-analyst.html','utf8');

assert(scan.includes("require('./recommendation-validation-gate.js')"),'scanner must wire recommendation validation gate');
assert(scan.includes('autoRecommendationValidation'),'scanner response must expose recommendation validation diagnostics');
assert(scan.includes('getExecutionContext'),'promotable recommendations must receive execution validation');
assert(gate.includes('ILLIQUID')&&gate.includes('PRICE_SOURCE_CONFLICT')&&gate.includes('DERIVATIVES_CROWDING'),'recommendation safety blockers required');
assert(gate.includes('VALIDATION_LIFT_NEGATIVE'),'mature negative validation performance must block promotion');
assert(val.includes("const VERSION='MARKET_VALIDATION_v2'"),'market validation v2 required');
assert(!val.includes('Binance 선물 미상장: 파생 gate 비필수'),'blocked futures access must not masquerade as delisting');
assert(val.includes('Binance Futures 직접조회 제한/미확인'),'futures access uncertainty must be explicit');
assert(promo.includes("const VERSION='RECOMMEND_PROMOTION_v2'"),'promotion v2 semantics required');
assert(promo.includes('confirmed&&g.readyCore'),'book confirmation must not bypass market READY');
assert(promo.includes('시장 승격용 Scanner READY 조건'),'book evidence and market promotion must be separately explained');
assert(app.includes("x.validationGate?.status"),'Book AI recommendation cards must render validation gate status');
assert(app.includes("vg==='INVALIDATED'"),'Book AI must visibly handle invalidated recommendations');
assert(html.includes('promotion-engine.js?v=20260925-final99'),'promotion cache bust required');
assert(html.includes('app.js?v=20260925-final99'),'Book AI app cache bust required');
assert(html.includes('MARKET_VALIDATION_v2'),'validation v2 must be visible in UI');

console.log('FINAL99 release contract PASS');
