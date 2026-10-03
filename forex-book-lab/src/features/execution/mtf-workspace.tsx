"use client";

import { useEffect, useState } from "react";
import { TradingViewWidget } from "@/features/live/tradingview-widget";
import styles from "./execution.module.css";

type Bias = "BULL" | "BEAR" | "NEUTRAL";

const pairs = ["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","NZDUSD","USDCAD","EURJPY","GBPJPY","EURGBP"];

const gates = [
  ["d1","1D 방향","Daily 방향과 trade idea 일치"],
  ["h4","4H 구조","4H HH/HL 또는 LH/LL 확인"],
  ["h1","1H 위치","핵심 레벨·range 위치 확인"],
  ["m15","15m sweep","고저점 sweep/reclaim 또는 breakout 확인"],
  ["m5","5m trigger","실행봉 종가·retest·candle trigger 확인"],
  ["news","뉴스","고영향 이벤트 직전이 아님"],
  ["rr","R:R","목표가 기준 최소 R:R 충족"],
] as const;

function n(v:string|number){
  const x=Number(v);
  return Number.isFinite(x)?x:0;
}

function fmt(v:number,d=2){
  return Number.isFinite(v)?v.toLocaleString(undefined,{maximumFractionDigits:d}):"—";
}

export function MtfWorkspace(){
  const [pair,setPair]=useState("EURUSD");
  const [bias,setBias]=useState<Bias>("NEUTRAL");
  const [account,setAccount]=useState("10000");
  const [riskPct,setRiskPct]=useState("1");
  const [entry,setEntry]=useState("1.1000");
  const [stop,setStop]=useState("1.0950");
  const [target,setTarget]=useState("1.1100");
  const [pipValue,setPipValue]=useState("10");
  const [pdh,setPdh]=useState("");
  const [pdl,setPdl]=useState("");
  const [asiaH,setAsiaH]=useState("");
  const [asiaL,setAsiaL]=useState("");
  const [checks,setChecks]=useState<Record<string,boolean>>({});
  const [plan,setPlan]=useState("");

  useEffect(()=>{
    try{
      const raw=localStorage.getItem("forex-mtf-workspace:"+pair);
      if(!raw) return;
      const x=JSON.parse(raw);
      setBias(x.bias||"NEUTRAL");
      setAccount(x.account||"10000");
      setRiskPct(x.riskPct||"1");
      setEntry(x.entry||"");
      setStop(x.stop||"");
      setTarget(x.target||"");
      setPipValue(x.pipValue||"10");
      setPdh(x.pdh||"");
      setPdl(x.pdl||"");
      setAsiaH(x.asiaH||"");
      setAsiaL(x.asiaL||"");
      setChecks(x.checks||{});
      setPlan(x.plan||"");
    }catch{}
  },[pair]);

  const pipSize=pair.includes("JPY")?0.01:0.0001;
  const stopPips=Math.abs(n(entry)-n(stop))/pipSize;
  const targetPips=Math.abs(n(target)-n(entry))/pipSize;
  const riskAmount=n(account)*n(riskPct)/100;
  const lots=stopPips>0&&n(pipValue)>0?riskAmount/(stopPips*n(pipValue)):0;
  const rr=stopPips>0?targetPips/stopPips:0;
  const done=gates.filter(([id])=>checks[id]).length;
  const readiness=Math.round(done/gates.length*100);

  function save(){
    localStorage.setItem("forex-mtf-workspace:"+pair,JSON.stringify({
      bias,account,riskPct,entry,stop,target,pipValue,pdh,pdl,asiaH,asiaL,checks,plan
    }));
  }

  function reset(){
    setBias("NEUTRAL");
    setChecks({});
    setPdh("");
    setPdl("");
    setAsiaH("");
    setAsiaL("");
    setPlan("");
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.hero}>
        <div className={styles.eyebrow}>MULTI-TIMEFRAME EXECUTION</div>
        <h1>4H → 1H → 15m → 5m</h1>
        <p>같은 통화쌍을 4개 시간봉으로 동시에 보면서 상위 방향부터 실행 트리거까지 한 화면에서 정리합니다.</p>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.field}>
          PAIR
          <select value={pair} onChange={e=>setPair(e.target.value)}>
            {pairs.map(p=><option key={p}>{p}</option>)}
          </select>
        </label>

        <div className={styles.seg}>
          {(["BULL","BEAR","NEUTRAL"] as Bias[]).map(v=>(
            <button key={v} className={bias===v?styles.active:""} onClick={()=>setBias(v)}>{v}</button>
          ))}
        </div>

        <button className={styles.btnPrimary} onClick={save}>Save Workspace</button>
        <button className={styles.btn} onClick={reset}>Reset</button>
      </div>

      <div className={styles.charts}>
        {[
          ["4H","240"],
          ["1H","60"],
          ["15m","15"],
          ["5m","5"]
        ].map(([label,interval])=>(
          <section className={styles.chartCard} key={label}>
            <div className={styles.chartHead}>
              <strong>{label}</strong>
              <span className={label==="4H"||label==="1H"?styles.badgeOk:styles.badge}>
                {label==="4H"||label==="1H"?"STRUCTURE":"EXECUTION"}
              </span>
            </div>
            <TradingViewWidget
              script="embed-widget-advanced-chart.js"
              minHeight={430}
              config={{
                autosize:true,
                symbol:"FX:"+pair,
                interval,
                timezone:"Etc/UTC",
                theme:"dark",
                style:"1",
                locale:"en",
                allow_symbol_change:false,
                calendar:false,
                support_host:"https://www.tradingview.com"
              }}
            />
          </section>
        ))}
      </div>

      <div className={styles.grid2}>
        <section className={styles.panel}>
          <div className={styles.head}>
            <h2>Key Levels</h2>
            <span className={styles.badge}>{bias}</span>
          </div>

          <div className={styles.levels}>
            <label className={styles.field}>PDH<input value={pdh} onChange={e=>setPdh(e.target.value)} placeholder="Previous day high"/></label>
            <label className={styles.field}>PDL<input value={pdl} onChange={e=>setPdl(e.target.value)} placeholder="Previous day low"/></label>
            <label className={styles.field}>Asia High<input value={asiaH} onChange={e=>setAsiaH(e.target.value)}/></label>
            <label className={styles.field}>Asia Low<input value={asiaL} onChange={e=>setAsiaL(e.target.value)}/></label>
          </div>

          <textarea
            className={styles.textarea}
            value={plan}
            onChange={e=>setPlan(e.target.value)}
            placeholder="시나리오: 예) London에서 Asia Low sweep → 15m reclaim → 5m retest 후 long. 무효화 조건도 같이 기록."
          />
        </section>

        <section className={styles.panel}>
          <div className={styles.head}>
            <h2>MTF Gate</h2>
            <span className={readiness===100?styles.badgeOk:styles.badgeWarn}>{readiness}%</span>
          </div>

          <div className={styles.checklist}>
            {gates.map(([id,title,desc],i)=>(
              <button
                key={id}
                className={checks[id]?styles.checkOn:styles.check}
                onClick={()=>setChecks(s=>({...s,[id]:!s[id]}))}
              >
                <span>{checks[id]?"✓":String(i+1).padStart(2,"0")}</span>
                <div><strong>{title}</strong><small>{desc}</small></div>
              </button>
            ))}
          </div>

          <div className={styles.score}>
            <strong>{done}/{gates.length}</strong>
            <div className={styles.meter}><i style={{width:readiness+"%"}}/></div>
          </div>
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.head}>
          <h2>Execution Calculator</h2>
          <span className={rr>=2?styles.badgeOk:styles.badgeWarn}>R:R {fmt(rr,2)}</span>
        </div>

        <div className={styles.fields}>
          <label className={styles.field}>Account<input value={account} onChange={e=>setAccount(e.target.value)}/></label>
          <label className={styles.field}>Risk %<input value={riskPct} onChange={e=>setRiskPct(e.target.value)}/></label>
          <label className={styles.field}>Entry<input value={entry} onChange={e=>setEntry(e.target.value)}/></label>
          <label className={styles.field}>Stop<input value={stop} onChange={e=>setStop(e.target.value)}/></label>
          <label className={styles.field}>Target<input value={target} onChange={e=>setTarget(e.target.value)}/></label>
          <label className={styles.field}>Pip value / lot<input value={pipValue} onChange={e=>setPipValue(e.target.value)}/></label>
        </div>

        <div className={styles.primary}>{fmt(lots,3)} lots · 1:{fmt(rr,2)}</div>

        <div className={styles.results}>
          <article><small>MAX LOSS</small><strong>{fmt(riskAmount,2)}</strong></article>
          <article><small>STOP</small><strong>{fmt(stopPips,1)} pips</strong></article>
          <article><small>TARGET</small><strong>{fmt(targetPips,1)} pips</strong></article>
          <article><small>READINESS</small><strong>{readiness}%</strong></article>
        </div>
      </section>
    </div>
  );
}
