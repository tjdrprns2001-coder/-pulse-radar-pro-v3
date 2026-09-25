'use strict';

const DEFAULT_THRESHOLDS=[60,70,80];

function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,Number(v)||0))}
function addReason(reasons,text){if(text&&!reasons.includes(text))reasons.push(text)}

function archiveProxyScore(pre={}){
  const price24=finite(pre.price24hPct),price6=finite(pre.price6hPct),oi6=finite(pre.oi6hPct),oi24=finite(pre.oi24hPct),taker6=finite(pre.taker6h),taker24=finite(pre.taker24h);
  let score=35;const reasons=[];
  if(price24!=null){
    const a=Math.abs(price24);
    if(a<=3){score+=20;addReason(reasons,'24H 가격 압축')}
    else if(a<=6){score+=16;addReason(reasons,'24H 저확장')}
    else if(a<=9){score+=10;addReason(reasons,'24H 중간 확장')}
    else if(a<=12){score+=6;addReason(reasons,'24H 허용 상단')}
    else if(price24<=18){score-=8;addReason(reasons,'24H 진행')}
    else{score-=20;addReason(reasons,'24H 과진행')}
  }
  if(price6!=null){
    const a=Math.abs(price6);
    if(a<=2){score+=10;addReason(reasons,'6H 가격 압축')}
    else if(a<=5){score+=6}
    else if(a<=8){score+=2}
    else if(a>12){score-=10;addReason(reasons,'6H 과확장')}
  }
  if(oi6!=null){
    if(oi6>=1&&oi6<=10){score+=12;addReason(reasons,'6H OI 선행')}
    else if(oi6>10){score+=5;addReason(reasons,'6H OI 과구축')}
    else if(oi6<=-2&&oi6>=-8){score+=6;addReason(reasons,'6H 디레버리징')}
    else if(oi6<-8){score+=2}
  }
  if(oi24!=null){
    if(oi24>=2&&oi24<=30)score+=6;
    else if(oi24>30)score+=2;
    else if(oi24<=-2&&oi24>=-25)score+=4;
  }
  if(taker6!=null){
    if(taker6>=1.1&&taker6<=1.8){score+=10;addReason(reasons,'6H taker 선행')}
    else if(taker6>=1){score+=6}
    else if(taker6>=.85){score+=4;addReason(reasons,'흡수 가능 taker')}
    else if(taker6<.75)score-=4;
  }else if(taker24!=null&&taker24>=1)score+=3;
  const quiet=price6!=null&&Math.abs(price6)<=4;
  if(quiet&&oi6!=null&&oi6>=1){score+=8;addReason(reasons,'가격 압축 + OI 구축')}
  if(quiet&&oi6!=null&&oi6<=-2){score+=6;addReason(reasons,'가격 압축 + OI 정리')}
  if(quiet&&taker6!=null&&taker6>=1.1){score+=8;addReason(reasons,'가격 압축 + taker 선행')}
  if(price6!=null&&price6>=0&&price6<=5&&taker6!=null&&taker6<1&&oi6!=null&&oi6>=1){score+=7;addReason(reasons,'매도흡수 + OI 구축')}
  return{score:Math.round(clamp(score)),reasons:reasons.slice(0,6),features:{price24,price6,oi6,oi24,taker6,taker24}};
}

function pointInTimeLabel(sample={}){
  const pre=sample.pre||{},price24=finite(pre.price24hPct),price6=finite(pre.price6hPct);
  const fresh=(price24!=null&&Math.abs(price24)<=12)&&(price6==null||Math.abs(price6)<=8);
  return fresh?'FRESH_PRE_T0':'EXTENDED_PRE_T0';
}

function calibrate(samples=[],thresholds=DEFAULT_THRESHOLDS){
  const rows=(Array.isArray(samples)?samples:[]).map(sample=>{
    const proxy=archiveProxyScore(sample.pre||{});
    return{symbol:String(sample.symbol||''),label:pointInTimeLabel(sample),score:proxy.score,reasons:proxy.reasons,stage:sample.stage||null,dna:sample.dna||null,pre:sample.pre||{}};
  });
  const fresh=rows.filter(x=>x.label==='FRESH_PRE_T0'),extended=rows.filter(x=>x.label==='EXTENDED_PRE_T0');
  const cuts=thresholds.map(threshold=>{
    const selected=rows.filter(x=>x.score>=threshold),freshSelected=selected.filter(x=>x.label==='FRESH_PRE_T0'),extendedSelected=selected.filter(x=>x.label==='EXTENDED_PRE_T0');
    const freshRecall=fresh.length?freshSelected.length/fresh.length:null,extendedLeakRate=extended.length?extendedSelected.length/extended.length:null;
    const balanced=freshRecall==null?null:freshRecall-(extendedLeakRate||0)*.75;
    return{threshold,selectedCount:selected.length,freshCaptured:freshSelected.length,freshTotal:fresh.length,freshRecall,extendedSelected:extendedSelected.length,extendedTotal:extended.length,extendedLeakRate,balancedScore:balanced,selectedSymbols:selected.map(x=>x.symbol),freshSymbols:freshSelected.map(x=>x.symbol),extendedSymbols:extendedSelected.map(x=>x.symbol)};
  });
  const ranked=cuts.filter(x=>x.balancedScore!=null).slice().sort((a,b)=>b.balancedScore-a.balancedScore||(b.threshold-a.threshold));
  return{
    version:'PREIGNITION_ARCHIVE_CALIBRATION_v1',
    methodology:'T-6H/T-24H archive proxy only; no T0 bar, RVOL or post-event snapshot fields are used in scoring',
    caveats:['surge archive is survivor-biased','failed pre-surge candidates are not yet represented','proxy score is not the production preIgnitionScore because archived v3/v2/ICT fields are incomplete','recommended cutoff is shadow-only until unbiased negative samples exist'],
    sampleCount:rows.length,freshCount:fresh.length,extendedCount:extended.length,thresholds:cuts,shadowThreshold:ranked[0]?.threshold??null,rows
  };
}

module.exports={DEFAULT_THRESHOLDS,archiveProxyScore,pointInTimeLabel,calibrate};
