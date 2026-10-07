'use strict';
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function recent(arr,n=1){return Array.isArray(arr)&&arr.length?arr.slice(-n):[]}
function directionFromStructure(structure){const e=[...(structure?.events||[])].reverse().find(x=>['CHOCH','BOS'].includes(x.type));if(e)return e.side;return structure?.trend==='bullish'?'bullish':structure?.trend==='bearish'?'bearish':null}
function candidate({bars=[],structure=null,liquidity=null,ict=null,volumeProfile=null,derivatives=null}={}){
 const side=directionFromStructure(structure),lastBar=bars.at(-1),avgVol=bars.length>20?bars.slice(-21,-1).reduce((s,x)=>s+(finite(x.v)||0),0)/20:null,volRatio=avgVol>0&&lastBar?.v!=null?lastBar.v/avgVol:null;
 const sweeps=(ict?.sweeps||[]).filter(x=>x.confirmedByStructure),lastSweep=sweeps.at(-1),lastDisp=recent(ict?.displacements,1)[0]||null,lastOb=recent((ict?.orderBlocks||[]).filter(x=>x.status!=='invalidated'),1)[0]||null,lastFvg=recent((ict?.fvgs||[]).filter(x=>x.status!=='invalidated'),1)[0]||null;
 const oi=finite(derivatives?.oi4hPct??derivatives?.oi1hPct),fund=finite(derivatives?.funding8hPct??derivatives?.fundingPct),derivKnown=derivatives?.dataAvailable===true||oi!=null||fund!=null;
 const evidence={
  structureShift:side?{known:true,pass:true,detail:(structure?.lastChoch?.type||structure?.lastBos?.type||structure?.trend)}:{known:true,pass:false,detail:'no_confirmed_shift'},
  liquiditySweep:{known:Boolean(liquidity?.priceBased?.available),pass:Boolean(lastSweep),detail:lastSweep?.type||'none'},
  displacement:{known:Boolean(ict?.available),pass:Boolean(lastDisp&&(!side||lastDisp.side===side)),detail:lastDisp?(lastDisp.side+' '+(lastDisp.bodyAtr?.toFixed?.(2)||'')+' ATR'):null},
  orderBlockOrFvg:{known:Boolean(ict?.available),pass:Boolean(lastOb||lastFvg),detail:lastOb?.type||lastFvg?.type||'none'},
  volume:{known:volRatio!=null,pass:volRatio!=null?volRatio>=1.15:null,detail:volRatio==null?null:(volRatio.toFixed(2)+'x')},
  derivatives:{known:derivKnown,pass:derivKnown?(oi==null?fund!=null:Math.abs(oi)>=.1):null,detail:derivKnown?('OI '+(oi==null?'N/A':oi.toFixed(2)+'%')+' · Funding '+(fund==null?'N/A':fund.toFixed(4)+'%')):null},
  valueArea:{known:Boolean(volumeProfile?.available),pass:volumeProfile?.available?['inside','above','below'].includes(volumeProfile.valueAreaPosition):null,detail:volumeProfile?.valueAreaPosition||null}
 };
 const known=Object.values(evidence).filter(x=>x.known),passed=known.filter(x=>x.pass===true),coverage=known.length/Object.keys(evidence).length,score=known.length?passed.length/known.length*100:null;
 const label=!side?'none':score>=75&&coverage>=.7?(side==='bullish'?'smart_money_candidate_bullish':'smart_money_candidate_bearish'):score>=50?(side==='bullish'?'institutional_style_price_action_bullish':'institutional_style_price_action_bearish'):'structure_only';
 return{available:known.length>0,side,label,score,coverage,evidence,missingData:Object.entries(evidence).filter(([,v])=>!v.known).map(([k])=>k),wordingPolicy:'기관 거래 확정 표현 금지 · 가격 구조 기반 후보로만 표시',institutionalFlowConfirmed:false}
}
module.exports={directionFromStructure,candidate};
