const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
const at=(line,i)=>Number(line?.intercept||0)+Number(line?.slope||0)*i;
const finite=v=>Number.isFinite(Number(v));

function evaluateTrendlineBreak({candles=[],line,side,start=0,end=candles.length-1,strongCloseAtr=.5,confirmBars=2}){
  if(!line||!Array.isArray(candles)||!candles.length)return{confirmed:false,brokenAt:null,consecutiveCloses:0,direction:null,maxDistanceAtr:0};
  let consecutive=0,brokenAt=null,maxDistanceAtr=0;
  const from=Math.max(0,Number(start)||0),to=Math.min(candles.length-1,Number.isInteger(end)?end:candles.length-1);
  for(let i=from;i<=to;i++){
    const c=candles[i],atr=Number(c?.atr||0);if(!(atr>0)){consecutive=0;continue;}
    const y=at(line,i),close=Number(c?.close);if(!finite(close)){consecutive=0;continue;}
    const dist=side==='support'?(y-close)/atr:(close-y)/atr;
    if(dist>maxDistanceAtr)maxDistanceAtr=dist;
    if(dist>=strongCloseAtr){consecutive++;if(consecutive>=confirmBars&&!brokenAt)brokenAt=i;}else consecutive=0;
  }
  return{confirmed:brokenAt!=null,brokenAt,consecutiveCloses:consecutive,direction:side==='support'?'down':'up',maxDistanceAtr:Number(maxDistanceAtr.toFixed(3)),thresholdAtr:strongCloseAtr,confirmBars};
}

function classifyTrendlinePattern({support,resistance,pair}={}){
  if(!support||!resistance||!pair)return{type:null,subtype:null,confirmed:false,confidence:0,reasons:['pair-unavailable']};
  const s=Number(support.normalizedSlope),r=Number(resistance.normalizedSlope),conv=Number(pair.convergencePct),parallel=Number(pair.parallelScore),width=Number(pair.widthNowAtr),barsToApex=Number(pair.barsToApex);
  if(![s,r,width].every(Number.isFinite)||!(width>0))return{type:null,subtype:null,confirmed:false,confidence:0,reasons:['invalid-geometry']};
  const converging=Number.isFinite(conv)&&conv>=25&&(Number.isFinite(barsToApex)?barsToApex>-8:true);
  if(parallel>=78&&(!Number.isFinite(conv)||conv<20)){
    return{type:'channel',subtype:s>0.05&&r>0.05?'ascending':s<-0.05&&r<-0.05?'descending':'horizontal',confirmed:true,confidence:Math.round(clamp((parallel-70)*3+55)),reasons:['parallel-boundaries','positive-width']};
  }
  if(converging&&s<-.04&&r<-.04&&r<s){
    const score=clamp(55+Math.min(25,conv*.35)+Math.min(20,Math.abs(r-s)*90));
    return{type:'falling_wedge',subtype:null,confirmed:true,confidence:Math.round(score),reasons:['both-boundaries-falling','converging','resistance-steeper']};
  }
  if(converging&&s>.04&&r>.04&&s>r){
    const score=clamp(55+Math.min(25,conv*.35)+Math.min(20,Math.abs(s-r)*90));
    return{type:'rising_wedge',subtype:null,confirmed:true,confidence:Math.round(score),reasons:['both-boundaries-rising','converging','support-steeper']};
  }
  if(converging){
    let subtype=null;
    if(s>.05&&r<-.05)subtype='symmetrical';
    else if(s>.05&&Math.abs(r)<=.08)subtype='ascending';
    else if(Math.abs(s)<=.08&&r<-.05)subtype='descending';
    if(subtype){
      const score=clamp(50+Math.min(35,conv*.45)+Math.min(15,Math.abs(r-s)*55));
      return{type:'triangle',subtype,confirmed:true,confidence:Math.round(score),reasons:['converging-boundaries',subtype]};
    }
  }
  return{type:null,subtype:null,confirmed:false,confidence:0,reasons:['geometry-not-qualified']};
}

module.exports={evaluateTrendlineBreak,classifyTrendlinePattern};
