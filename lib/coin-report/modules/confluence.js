'use strict';
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function overlap(a,b,tol=0){return Math.max(a.from,b.from)<=Math.min(a.to,b.to)+tol}
function pushZone(out,z){if(!z||![z.from,z.to].every(Number.isFinite)||z.to<z.from)return;out.push({...z,mid:(z.from+z.to)/2,evidence:Array.isArray(z.evidence)?z.evidence:[]})}
function sourceZones({volumeProfile,liquidity,ict,structure,currentPrice}={}){
 const out=[],p=finite(currentPrice);
 if(volumeProfile?.available){
  pushZone(out,{zoneType:'POC',from:volumeProfile.poc.from,to:volumeProfile.poc.to,side:p==null?'neutral':volumeProfile.poc.price<=p?'support':'resistance',evidence:['volume_profile_poc']});
  if(Number.isFinite(volumeProfile.val))pushZone(out,{zoneType:'VAL',from:volumeProfile.val,to:volumeProfile.val,side:p!=null&&volumeProfile.val<=p?'support':'resistance',evidence:['volume_profile_val']});
  if(Number.isFinite(volumeProfile.vah))pushZone(out,{zoneType:'VAH',from:volumeProfile.vah,to:volumeProfile.vah,side:p!=null&&volumeProfile.vah<=p?'support':'resistance',evidence:['volume_profile_vah']});
  for(const x of volumeProfile.hvn||[])pushZone(out,{zoneType:'HVN',from:x.from,to:x.to,side:p!=null&&x.price<=p?'support':'resistance',evidence:['volume_profile_hvn']});
  for(const x of volumeProfile.lvn||[])pushZone(out,{zoneType:'LVN',from:x.from,to:x.to,side:'neutral',evidence:['volume_profile_lvn']});
 }
 for(const x of liquidity?.priceBased?.zones||[])pushZone(out,{zoneType:x.type,from:x.from,to:x.to,side:x.type==='liquidity_low'?'support':'resistance',evidence:['price_liquidity_cluster'],status:x.status});
 for(const x of ict?.orderBlocks||[])if(x.status!=='invalidated')pushZone(out,{zoneType:x.type,from:x.from,to:x.to,side:x.side==='bullish'?'support':'resistance',evidence:['ict_order_block'],status:x.status,lastTestAt:x.lastTestAt});
 for(const x of ict?.fvgs||[])if(x.status!=='invalidated')pushZone(out,{zoneType:x.type,from:x.from,to:x.to,side:x.side==='bullish'?'support':'resistance',evidence:['ict_fvg'],status:x.status,lastTestAt:x.firstTouchAt});
 for(const x of (structure?.swings||[]).slice(-8))pushZone(out,{zoneType:x.type==='low'?'swing_low':'swing_high',from:x.price,to:x.price,side:x.type==='low'?'support':'resistance',evidence:['confirmed_swing'],originTimestamp:x.eventAt});
 return out
}
function mergeZones(zones,{tolerance=0}={}){
 const sorted=(zones||[]).slice().sort((a,b)=>a.from-b.from),groups=[];
 for(const z of sorted){let g=groups.find(x=>overlap(x,z,tolerance));if(!g){g={from:z.from,to:z.to,items:[]};groups.push(g)}g.items.push(z);g.from=Math.min(g.from,z.from);g.to=Math.max(g.to,z.to)}
 return groups.map((g,i)=>({zoneId:'Z'+String(i+1).padStart(2,'0'),from:g.from,to:g.to,mid:(g.from+g.to)/2,types:[...new Set(g.items.map(x=>x.zoneType))],sides:[...new Set(g.items.map(x=>x.side))],status:g.items.some(x=>x.status==='tested')?'tested':g.items.some(x=>x.status==='swept')?'swept':'active',evidence:[...new Set(g.items.flatMap(x=>x.evidence||[]))],items:g.items,lastTestTimestamp:Math.max(0,...g.items.map(x=>finite(x.lastTestAt)||0))||null,originTimestamp:Math.min(...g.items.map(x=>finite(x.originTimestamp)||Infinity).filter(Number.isFinite))||null}))
}
const WEIGHTS={htfStructure:20,swing:15,volumeProfile:15,ict:15,volume:10,oi:10,spot:5,orderbook:5,retest:5};
function scoreZone(zone,ctx={}){
 const side=zone.sides.includes('support')&&!zone.sides.includes('resistance')?'bullish':zone.sides.includes('resistance')&&!zone.sides.includes('support')?'bearish':'neutral',checks={};
 const htf=ctx.htfTrend;checks.htfStructure={weight:WEIGHTS.htfStructure,known:Boolean(htf&&htf!=='unknown'&&htf!=='range'),pass:side==='neutral'?null:(side==='bullish'?htf==='bullish':htf==='bearish'),detail:htf||null};
 checks.swing={weight:WEIGHTS.swing,known:true,pass:zone.evidence.includes('confirmed_swing')||zone.types.some(x=>/^liquidity_/.test(x)),detail:zone.types.filter(x=>/swing|liquidity/.test(x)).join(',')||null};
 checks.volumeProfile={weight:WEIGHTS.volumeProfile,known:Boolean(ctx.volumeProfileAvailable),pass:zone.evidence.some(x=>x.startsWith('volume_profile_')),detail:zone.types.filter(x=>['POC','VAH','VAL','HVN','LVN'].includes(x)).join(',')||null};
 checks.ict={weight:WEIGHTS.ict,known:Boolean(ctx.ictAvailable),pass:zone.evidence.some(x=>x.startsWith('ict_')),detail:zone.types.filter(x=>x.startsWith('order_block')||x.startsWith('fvg')).join(',')||null};
 const vr=finite(ctx.volumeRatio);checks.volume={weight:WEIGHTS.volume,known:vr!=null,pass:vr!=null?vr>=1.1:null,detail:vr==null?null:(vr.toFixed(2)+'x')};
 const oi=finite(ctx.oiChangePct);checks.oi={weight:WEIGHTS.oi,known:ctx.derivativesAvailable===true&&oi!=null,pass:oi!=null?Math.abs(oi)>=.1:null,detail:oi==null?null:(oi.toFixed(2)+'%')};
 const spot=finite(ctx.spotConfirmation);checks.spot={weight:WEIGHTS.spot,known:spot!=null,pass:spot!=null?spot>0:null,detail:spot};
 const imb=finite(ctx.orderbookImbalance);checks.orderbook={weight:WEIGHTS.orderbook,known:ctx.orderbookAvailable===true&&imb!=null,pass:imb!=null?(side==='bullish'?imb>0:side==='bearish'?imb<0:Math.abs(imb)>.1):null,detail:imb};
 checks.retest={weight:WEIGHTS.retest,known:zone.status!=null,pass:['tested','swept'].includes(zone.status),detail:zone.status};
 const available=Object.values(checks).filter(x=>x.known),earned=available.reduce((s,x)=>s+(x.pass===true?x.weight:0),0),max=available.reduce((s,x)=>s+x.weight,0),score=max?earned/max*100:null,coverage=Object.values(checks).reduce((s,x)=>s+x.weight,0)?max/Object.values(checks).reduce((s,x)=>s+x.weight,0):0;
 const confidence=score==null?'limited':score>=80&&coverage>=.7?'high':score>=60&&coverage>=.5?'medium':score>=40?'mixed':'low';
 return{score,coverage,confidence,evidence:checks,missingData:Object.entries(checks).filter(([,x])=>!x.known).map(([k])=>k),side}
}
function breakoutState({bars=[],structure=null,volumeRatio=null,derivatives=null,zone=null,htfTrend=null}={}){
 if(!zone||bars.length<2)return{state:'needs_confirmation',reason:'level_or_bars_missing'};const last=bars.at(-1),prev=bars.at(-2),res=zone.sides?.includes('resistance'),sup=zone.sides?.includes('support');
 let direction=null,closedBreak=false,wickOnly=false;if(res){direction='bullish';closedBreak=prev.c<=zone.to&&last.c>zone.to;wickOnly=last.h>zone.to&&last.c<=zone.to}else if(sup){direction='bearish';closedBreak=prev.c>=zone.from&&last.c<zone.from;wickOnly=last.l<zone.from&&last.c>=zone.from}
 const vr=finite(volumeRatio),oi=finite(derivatives?.oi1hPct??derivatives?.oi4hPct),fund=finite(derivatives?.funding8hPct??derivatives?.fundingPct),volumeGood=vr!=null?vr>=1.2:null,oiKnown=oi!=null;
 if(wickOnly)return{state:'fakeout_candidate',direction,closedBreak:false,volumeGood,oiChangePct:oi,fundingPct:fund,reason:'intrabar_break_reclaimed_by_close'};
 if(!closedBreak)return{state:'needs_confirmation',direction,closedBreak:false,volumeGood,oiChangePct:oi,fundingPct:fund,reason:'close_break_not_confirmed'};
 const htfOk=!htfTrend||htfTrend==='unknown'||htfTrend==='range'||htfTrend===direction;if(volumeGood===true&&htfOk&&(oiKnown?Math.abs(oi)<15:true))return{state:'valid',direction,closedBreak:true,volumeGood,oiChangePct:oi,fundingPct:fund,htfOk,reason:'close_break_with_volume_and_htf_alignment'};
 if(volumeGood===false||htfOk===false)return{state:'failed',direction,closedBreak:true,volumeGood,oiChangePct:oi,fundingPct:fund,htfOk,reason:'close_break_without_required_confirmation'};
 return{state:'needs_confirmation',direction,closedBreak:true,volumeGood,oiChangePct:oi,fundingPct:fund,htfOk,reason:'break_confirmed_but_supporting_data_incomplete'}
}
module.exports={WEIGHTS,sourceZones,mergeZones,scoreZone,breakoutState};
