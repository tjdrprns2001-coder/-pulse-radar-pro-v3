const VERSION='PATTERN_SET_v2';
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));

function stateFor({support,resistance}){
  const sb=support?.breakStatus||{},rb=resistance?.breakStatus||{};
  if(sb.confirmed||rb.confirmed)return'BREAKOUT_CONFIRMED';
  if(Number(sb.maxDistanceAtr)>=.5||Number(rb.maxDistanceAtr)>=.5)return'BREAKOUT_CANDIDATE';
  const sd=Math.abs(Number(support?.currentDistanceAtr)),rd=Math.abs(Number(resistance?.currentDistanceAtr));
  if((Number.isFinite(sd)&&sd<=.35)||(Number.isFinite(rd)&&rd<=.35))return'PRE_BREAKOUT';
  if(support?.state==='broken'||resistance?.state==='broken')return'FAILED';
  return'FORMING';
}

function normalizeType(p){
  if(!p?.type)return null;
  const type=String(p.type).toLowerCase();
  if(type==='channel')return{type:'channel',subtype:p.subtype||'horizontal'};
  if(type==='triangle')return{type:'triangle',subtype:p.subtype||'symmetrical'};
  if(type==='falling_wedge'||type==='rising_wedge')return{type,subtype:null};
  return null;
}

function analyzePatternSet({trendlines,candles=[],tf='4h'}={}){
  const p=trendlines?.patterns||trendlines?.pattern||null,normalized=normalizeType(p);
  if(!normalized||p?.confirmed===false)return{version:VERSION,tf,primary:null,patterns:[]};
  const support=trendlines?.support,resistance=trendlines?.resistance;
  if(!support?.id||!resistance?.id)return{version:VERSION,tf,primary:null,patterns:[]};
  const primary={...normalized,state:stateFor({support,resistance}),confidence:Math.round(clamp(Number(p.confidence)||0)),reasons:Array.isArray(p.reasons)?[...p.reasons]:[],sourceIds:[support.id,resistance.id],source:'trendline-v2',definitionVersion:VERSION};
  return{version:VERSION,tf,primary,patterns:[primary],asOfIndex:Math.max(-1,candles.length-1)};
}

module.exports={PATTERN_SET_v2:VERSION,analyzePatternSet,stateFor};
