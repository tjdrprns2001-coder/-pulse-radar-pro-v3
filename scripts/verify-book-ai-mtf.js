'use strict';
const assert=require('assert');
const M=require('../ui/book-ai/mtf-composer.js');
function ctx(){return{save(){},restore(){},fillRect(){},strokeRect(){},clearRect(){},fillText(){},drawImage(){},set fillStyle(v){},set strokeStyle(v){},set font(v){}}}
function canvas(w=1280,h=900){return{width:w,height:h,dataset:{},getContext(){return ctx()},toDataURL(){return'data:image/png;base64,x'}}}
const doc={createElement(){return canvas(640,420)}};
let calls=0;const renderer={draw(c,args){calls++;assert(['1d','4h','1h','15m'].includes(args.timeframe));assert.equal(args.show.dante,false)}};
const panels={};for(const tf of M.ORDER)panels[tf]={candles:[{close:1}],analysis:{},smc:{},liquidity:{},ict:{}};
const target=canvas(),r=M.compose({canvas:target,panels,renderer,documentRef:doc,symbol:'BTCUSDT'});
assert.equal(r.panelCount,4);assert.equal(calls,4);assert.equal(target.dataset.bookAiMtfRendered,'1');assert(M.pngDataUrl(target).startsWith('data:image/png'));
console.log('book ai mtf composer PASS');