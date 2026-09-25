'use strict';
const assert=require('assert');
const fs=require('fs');
const read=p=>fs.readFileSync(p,'utf8');
const html=read('preignition-oos.html'),js=read('ui/preignition-oos.js'),css=read('ui/preignition-oos.css');

for(const s of ['점화전 점수 실전 검증','60 · 70 · 80 컷오프 비교','6H','24H','점수 구간 분포','최근 시점 스냅샷','SHADOW ONLY'])assert(html.includes(s),'OOS dashboard html missing '+s);
assert(html.includes('/ui/preignition-oos.css?v=20260925-oos1')&&html.includes('/ui/preignition-oos.js?v=20260925-oos1'),'OOS dashboard cache-bust wiring missing');
assert(js.includes("mode','preignition-history")&&js.includes("action',action"),'OOS history API wiring missing');
for(const s of ["['24h']","['3d']","['7d']","S60_69","S70_79","S80_PLUS","REJECTED","h6","h24"])assert(js.includes(s),'OOS dashboard JS missing '+s);
assert(js.includes("get('evaluate')")&&js.includes("Promise.all([get('stats'),get('list')])"),'OOS evaluation/parallel refresh missing');
assert(js.includes('setInterval')&&js.includes('visibilitychange'),'OOS auto-refresh lifecycle missing');
assert(js.includes('escape')||js.includes('esc('),'OOS table safe rendering helper missing');
assert(css.includes('@media(max-width:560px)')&&css.includes('@media(max-width:850px)'),'OOS mobile breakpoints missing');
assert(css.includes('overflow:auto')&&css.includes('min-width:850px'),'OOS mobile table containment missing');
assert(css.includes('html[data-shell="1"]'),'OOS shell child-mode styling missing');
console.log('preignition OOS dashboard PASS');
