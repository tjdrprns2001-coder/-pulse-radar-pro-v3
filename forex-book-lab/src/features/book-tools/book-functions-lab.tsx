"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./book-functions.module.css";

function num(v:string|number){const x=Number(v);return Number.isFinite(x)?x:0}
function fmt(v:number,d=2){return Number.isFinite(v)?v.toLocaleString(undefined,{maximumFractionDigits:d}):"—"}

const phases={
  accumulation:{title:"Accumulation",body:"횡보·통합 구간. 이전 하락 이후 수급이 쌓이는 단계로 책에서 설명한다.",points:"10,165 50,150 90,155 130,142 170,148 210,132 250,145 290,136 330,140 390,128"},
  uptrend:{title:"Up trend",body:"고점과 저점이 높아지는 상승 단계. 책은 추세 추종 기회와 함께 영원히 지속되지는 않는다는 점을 강조한다.",points:"10,190 55,166 90,178 135,137 170,150 215,100 250,118 300,70 335,88 390,42"},
  distribution:{title:"Distribution",body:"상승 뒤 상단에서 가격이 분산·정체되는 단계. 이후 하락으로 전환될 가능성을 관찰하는 구간이다.",points:"10,80 50,62 90,75 130,55 170,68 210,53 250,67 290,50 330,66 390,57"},
  downtrend:{title:"Down trend",body:"고점과 저점이 낮아지는 하락 단계. 시장 사이클의 마지막 축으로 책에서 설명한다.",points:"10,45 55,72 90,60 135,100 170,84 215,130 250,112 300,158 335,142 390,194"},
} as const;

const trendStages={
  early:{title:"Early trend",body:"추세의 시작. 이전 consolidation 이후 새로운 고점·저점 배열이 생기기 시작하는 단계.",points:"10,188 70,160 120,145 170,112 220,90 270,70 330,45 390,30"},
  mature:{title:"Mature trend",body:"추세가 명확하고 비교적 안정적으로 이어지는 단계. 방향성이 가장 선명한 구간.",points:"10,185 60,160 110,130 160,105 210,85 260,65 310,50 360,36 390,28"},
  late:{title:"Late trend",body:"추세가 오래 진행되어 속도가 둔화되거나 과도하게 확장될 수 있는 단계.",points:"10,180 60,145 110,116 160,88 210,65 255,55 300,48 345,52 390,58"},
  consolidation:{title:"Consolidation",body:"뚜렷한 방향이 줄고 범위 안에서 움직이는 단계. 책은 trend stage의 한 상태로 분리한다.",points:"10,105 50,88 90,118 130,92 170,112 210,90 250,114 290,87 335,110 390,94"},
} as const;

const lots={
  standard:{label:"Standard",units:100000,pip:10,note:"1.00 lot"},
  mini:{label:"Mini",units:10000,pip:1,note:"0.10 lot"},
  micro:{label:"Micro",units:1000,pip:.1,note:"0.01 lot"},
  nano:{label:"Nano",units:100,pip:.01,note:"0.001 lot"},
} as const;

const fakeChecks=[
  ["close","Key level 밖에서 종가 마감","단순 순간 돌파가 아닌 close 확인"],
  ["retest","돌파 레벨 재시험","책에서 제시한 retest 확인"],
  ["volume","거래량 증가","breakout confirmation 보조 근거"],
  ["indicator","RSI/MACD 확인","책에서 언급한 technical indicator confirmation"],
  ["risk","Stop-loss 정의","fakeout 시 손실 제한"],
] as const;

export function BookFunctionsLab(){
  const [from,setFrom]=useState("1.24735");
  const [to,setTo]=useState("1.25745");
  const [jpy,setJpy]=useState(false);
  const pipSize=jpy?0.01:0.0001;
  const pips=Math.abs(num(to)-num(from))/pipSize;

  const [phase,setPhase]=useState<keyof typeof phases>("accumulation");
  const [stage,setStage]=useState<keyof typeof trendStages>("early");

  const [lot,setLot]=useState<keyof typeof lots>("standard");
  const [leverage,setLeverage]=useState("100");
  const [price,setPrice]=useState("1.1000");
  const lotData=lots[lot];
  const notional=lotData.units*num(price);
  const margin=num(leverage)>0?notional/num(leverage):0;

  const [seriesSensitivity,setSeriesSensitivity]=useState("1");
  const prices=[100,104,102,109,106,113,108,116,111,120,115,123,118,125,119,127];
  const sensitivity=Math.max(1,Math.min(3,Math.round(num(seriesSensitivity))));
  const swings=useMemo(()=>prices.map((v,i)=>{
    if(i<sensitivity||i>=prices.length-sensitivity)return null;
    const left=prices.slice(i-sensitivity,i),right=prices.slice(i+1,i+1+sensitivity);
    if(left.every(x=>v>x)&&right.every(x=>v>x))return "H";
    if(left.every(x=>v<x)&&right.every(x=>v<x))return "L";
    return null;
  }),[sensitivity]);

  const [currentPrice,setCurrentPrice]=useState("1.1065");
  const [trendPrice,setTrendPrice]=useState("1.1040");
  const [warnPips,setWarnPips]=useState("20");
  const trendDistance=Math.abs(num(currentPrice)-num(trendPrice))/0.0001;
  const distanceState=trendDistance<=num(warnPips)?"Close to trendline":"Extended from trendline";

  const [checks,setChecks]=useState<Record<string,boolean>>({});
  const evidence=fakeChecks.filter(([id])=>checks[id]).length;
  const evidencePct=evidence/fakeChecks.length*100;

  const [balance,setBalance]=useState("10000");
  const [riskPct,setRiskPct]=useState("1");
  const [stopPips,setStopPips]=useState("50");
  const [pipValue,setPipValue]=useState("10");
  const riskAmount=num(balance)*num(riskPct)/100;
  const positionLots=num(stopPips)>0&&num(pipValue)>0?riskAmount/(num(stopPips)*num(pipValue)):0;

  const [entry,setEntry]=useState("1.1000");
  const [stop,setStop]=useState("1.0950");
  const [target,setTarget]=useState("1.1100");
  const riskDist=Math.abs(num(entry)-num(stop));
  const rewardDist=Math.abs(num(target)-num(entry));
  const rr=riskDist>0?rewardDist/riskDist:0;

  const [atr,setAtr]=useState("20");
  const [atrMult,setAtrMult]=useState("2");
  const atrStop=num(atr)*num(atrMult);
  const atrLots=atrStop>0&&num(pipValue)>0?riskAmount/(atrStop*num(pipValue)):0;

  const digits=from.replace(".","").slice(-6).padStart(6,"0").split("");
  const swingPoints=prices.map((v,i)=>(i/(prices.length-1)*390+5)+","+(205-(v-95)*6)).join(" ");

  return <div className={styles.wrap}>
    <header className={styles.hero}>
      <span>BOOK → FUNCTION</span>
      <h1>Book Functions Lab</h1>
      <p>책의 개념을 그대로 읽는 화면이 아니라, 직접 계산하고 눌러보고 판별하는 기능으로 구현한 공간입니다.</p>
      <div className={styles.sourceBar}>
        {[28,31,33,35,37,39,41,143,145,147,149].map(p=><Link key={p} href={"/book-tools#p"+p}>BOOK p.{p}</Link>)}
      </div>
    </header>

    <div className={styles.grid}>
      <section className={styles.card} id="p28">
        <div className={styles.head}><div><div className={styles.kicker}>HOW TO COUNT PIPS</div><h2>Pip Counter</h2></div><span className={styles.pageTag}>Book p.28</span></div>
        <div className={styles.pipDigits}>{digits.map((d,i)=><span key={i}>{d}</span>)}</div>
        <div className={styles.legend}><div><strong>1,000 PIP</strong><span>left scale</span></div><div><strong>100 PIP</strong><span>major digit</span></div><div><strong>10 PIP</strong><span>next digit</span></div><div><strong>1 PIP</strong><span>pip digit</span></div></div>
        <div className={styles.fields}><label>From<input value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To<input value={to} onChange={e=>setTo(e.target.value)}/></label></div>
        <div className={styles.segmented}><button className={!jpy?styles.active:""} onClick={()=>setJpy(false)}>Most pairs 0.0001</button><button className={jpy?styles.active:""} onClick={()=>setJpy(true)}>JPY 0.01</button></div>
        <div className={styles.result}>{fmt(pips,1)} pips</div>
      </section>

      <section className={styles.card} id="p35">
        <div className={styles.head}><div><div className={styles.kicker}>FOREX LOT SIZE</div><h2>Lot & Margin</h2></div><span className={styles.pageTag}>Book p.35–36</span></div>
        <div className={styles.lotCards}>{(Object.keys(lots) as Array<keyof typeof lots>).map(k=><button key={k} className={lot===k?styles.lotActive:styles.lotCard} onClick={()=>setLot(k)}><small>{lots[k].note}</small><strong>{lots[k].label}</strong><span>{lots[k].units.toLocaleString()} units</span></button>)}</div>
        <div className={styles.fields}><label>Pair price<input value={price} onChange={e=>setPrice(e.target.value)}/></label><label>Leverage 1 :<input value={leverage} onChange={e=>setLeverage(e.target.value)}/></label></div>
        <div className={styles.subResult}><div><span>UNITS</span><strong>{lotData.units.toLocaleString()}</strong></div><div><span>APPROX PIP VALUE*</span><strong>{"$" + fmt(lotData.pip,2)}</strong></div><div><span>APPROX MARGIN*</span><strong>{"$" + fmt(margin,2)}</strong></div></div>
        <p className={styles.note}>* USD-quoted pair 교육용 단순화. 실제 pip value와 margin은 통화쌍·계좌통화·브로커 조건에 따라 달라질 수 있음.</p>
      </section>

      <section className={styles.wide} id="p31">
        <div className={styles.head}><div><div className={styles.kicker}>MARKET PHASES</div><h2>{phases[phase].title}</h2></div><span className={styles.pageTag}>Book p.31</span></div>
        <div className={styles.segmented}>{(Object.keys(phases) as Array<keyof typeof phases>).map(k=><button key={k} className={phase===k?styles.active:""} onClick={()=>setPhase(k)}>{phases[k].title}</button>)}</div>
        <div className={styles.phaseVisual}><svg viewBox="0 0 400 220" preserveAspectRatio="none"><polyline points={phases[phase].points} fill="none" stroke="#d7ff46" strokeWidth="4" vectorEffect="non-scaling-stroke"/></svg></div>
        <div className={styles.info}><strong>{phases[phase].title}</strong><p>{phases[phase].body}</p></div>
      </section>

      <section className={styles.card} id="p33">
        <div className={styles.head}><div><div className={styles.kicker}>TREND STAGES</div><h2>{trendStages[stage].title}</h2></div><span className={styles.pageTag}>Book p.33</span></div>
        <div className={styles.segmented}>{(Object.keys(trendStages) as Array<keyof typeof trendStages>).map(k=><button key={k} className={stage===k?styles.active:""} onClick={()=>setStage(k)}>{trendStages[k].title}</button>)}</div>
        <div className={styles.trendVisual}><svg viewBox="0 0 400 220" preserveAspectRatio="none"><polyline points={trendStages[stage].points} fill="none" stroke="#d7ff46" strokeWidth="4" vectorEffect="non-scaling-stroke"/></svg></div>
        <div className={styles.info}><p>{trendStages[stage].body}</p></div>
      </section>

      <section className={styles.card} id="p37">
        <div className={styles.head}><div><div className={styles.kicker}>MARKET SWINGS</div><h2>Swing High / Low Detector</h2></div><span className={styles.pageTag}>Book p.37–38</span></div>
        <label className={styles.oneField}>Sensitivity<input type="range" min="1" max="3" value={seriesSensitivity} onChange={e=>setSeriesSensitivity(e.target.value)}/></label>
        <div className={styles.swingVisual}><svg viewBox="0 0 400 220" preserveAspectRatio="none">
          <polyline points={swingPoints} fill="none" stroke="#d7ff46" strokeWidth="3" vectorEffect="non-scaling-stroke"/>
          {swings.map((s,i)=>s?<circle key={i} cx={i/(prices.length-1)*390+5} cy={205-(prices[i]-95)*6} r="6" fill={s==="H"?"#ff766a":"#d7ff46"}/>:null)}
        </svg></div>
        <div className={styles.swingLegend}><span><i className={styles.dotHigh}/>Swing high</span><span><i className={styles.dotLow}/>Swing low</span></div>
      </section>

      <section className={styles.card} id="p39">
        <div className={styles.head}><div><div className={styles.kicker}>TRENDLINE DISTANCE</div><h2>Distance Meter</h2></div><span className={styles.pageTag}>Book p.39–40</span></div>
        <div className={styles.fields}><label>Current price<input value={currentPrice} onChange={e=>setCurrentPrice(e.target.value)}/></label><label>Trendline price<input value={trendPrice} onChange={e=>setTrendPrice(e.target.value)}/></label><label>Warning threshold pips<input value={warnPips} onChange={e=>setWarnPips(e.target.value)}/></label></div>
        <div className={styles.result}>{fmt(trendDistance,1)} pips</div>
        <div className={styles.info}><strong>{distanceState}</strong><p>책의 핵심은 trendline과 가격 사이의 수직 거리를 관찰해 trend following과 overextension을 구분하는 것.</p></div>
      </section>

      <section className={styles.card} id="p41">
        <div className={styles.head}><div><div className={styles.kicker}>WHAT IS A FAKEOUT?</div><h2>Breakout Evidence Builder</h2></div><span className={styles.pageTag}>Book p.41–42</span></div>
        <div className={styles.checkGrid}>{fakeChecks.map(([id,title,desc])=><button key={id} className={checks[id]?styles.checkOn:styles.checkOff} onClick={()=>setChecks(s=>({...s,[id]:!s[id]}))}><span>{checks[id]?"✓":"·"}</span><div><strong>{title}</strong><small>{desc}</small></div></button>)}</div>
        <div className={styles.evidence}><strong>{evidence}/{fakeChecks.length}</strong><div className={styles.meter}><i style={{width:evidencePct+"%"}}/></div></div>
        <p className={styles.note}>책의 confirmation · indicators · risk management 항목을 체크 가능한 구조로 구현. 점수는 수익 신호가 아니라 확인 항목 충족도임.</p>
      </section>

      <section className={styles.card} id="p143">
        <div className={styles.head}><div><div className={styles.kicker}>POSITION SIZING</div><h2>Risk-Based Position Size</h2></div><span className={styles.pageTag}>Book p.143</span></div>
        <div className={styles.fields}><label>Account<input value={balance} onChange={e=>setBalance(e.target.value)}/></label><label>Risk %<input value={riskPct} onChange={e=>setRiskPct(e.target.value)}/></label><label>Stop pips<input value={stopPips} onChange={e=>setStopPips(e.target.value)}/></label><label>Pip value / 1 lot<input value={pipValue} onChange={e=>setPipValue(e.target.value)}/></label></div>
        <div className={styles.subResult}><div><span>RISK AMOUNT</span><strong>{"$" + fmt(riskAmount,2)}</strong></div><div><span>POSITION</span><strong>{fmt(positionLots,4)} lots</strong></div><div><span>STOP</span><strong>{fmt(num(stopPips),1)} pips</strong></div></div>
      </section>

      <section className={styles.card} id="p147">
        <div className={styles.head}><div><div className={styles.kicker}>RISK-REWARD RATIO</div><h2>Entry / Stop / Target</h2></div><span className={styles.pageTag}>Book p.147</span></div>
        <div className={styles.fields}><label>Entry<input value={entry} onChange={e=>setEntry(e.target.value)}/></label><label>Stop-loss<input value={stop} onChange={e=>setStop(e.target.value)}/></label><label>Profit target<input value={target} onChange={e=>setTarget(e.target.value)}/></label></div>
        <div className={styles.result}>1 : {fmt(rr,2)}</div>
        <p className={styles.note}>책의 공식대로 potential reward distance ÷ risk distance.</p>
      </section>

      <section className={styles.wide} id="p145">
        <div className={styles.head}><div><div className={styles.kicker}>STOP-LOSS + VOLATILE MARKETS</div><h2>ATR Stop / Position Rebalancer</h2></div><span className={styles.pageTag}>Book p.145 & 149</span></div>
        <div className={styles.fields}><label>ATR (pips)<input value={atr} onChange={e=>setAtr(e.target.value)}/></label><label>ATR multiplier<input value={atrMult} onChange={e=>setAtrMult(e.target.value)}/></label><label>Account<input value={balance} onChange={e=>setBalance(e.target.value)}/></label><label>Risk %<input value={riskPct} onChange={e=>setRiskPct(e.target.value)}/></label></div>
        <div className={styles.riskCompare}><article><small>VOLATILITY STOP</small><strong>{fmt(atrStop,1)} pips</strong></article><article><small>RECALCULATED SIZE</small><strong>{fmt(atrLots,4)} lots</strong></article></div>
        <p className={styles.note}>책의 volatility-based stop-loss와 volatile market에서 position size를 줄이고 stop distance를 넓히는 원리를 같은 최대손실액을 유지하면서 계산하도록 구현.</p>
      </section>
    </div>
  </div>
}
