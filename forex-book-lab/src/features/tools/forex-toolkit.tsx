"use client";

import { useMemo, useState } from "react";
import styles from "./tools.module.css";

function n(value: string | number) {
  const v = Number(value);
  return Number.isFinite(v) ? v : 0;
}

function fmt(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : "—";
}

const candlePatterns = [
  { name: "Hammer", note: "작은 몸통 + 긴 아래꼬리. 하락 뒤 반전 후보.", candles: [[45,58,25,52]] },
  { name: "Inverted hammer", note: "작은 몸통 + 긴 위꼬리. 하락 뒤 확인 필요.", candles: [[45,50,20,18]] },
  { name: "Bullish engulfing", note: "작은 음봉을 다음 큰 양봉이 감싸는 구조.", candles: [[45,35,14,18],[34,56,12,18]] },
  { name: "Morning star", note: "하락 → 작은 몸통 → 강한 상승의 3캔들 구조.", candles: [[55,28,12,18],[30,32,18,18],[33,58,12,18]] },
  { name: "Three white soldiers", note: "연속적인 3개 강한 양봉.", candles: [[25,45,12,18],[38,58,12,18],[50,70,12,18]] },
] as const;

export function ForexToolkit() {
  const [balance, setBalance] = useState("10000");
  const [riskPct, setRiskPct] = useState("1");
  const [stopPips, setStopPips] = useState("30");
  const [pipValue, setPipValue] = useState("10");

  const riskAmount = n(balance) * n(riskPct) / 100;
  const lots = n(stopPips) > 0 && n(pipValue) > 0 ? riskAmount / (n(stopPips) * n(pipValue)) : 0;

  const [fromPrice, setFromPrice] = useState("1.1000");
  const [toPrice, setToPrice] = useState("1.1050");
  const [isJpy, setIsJpy] = useState(false);
  const pipSize = isJpy ? 0.01 : 0.0001;
  const pips = Math.abs(n(toPrice) - n(fromPrice)) / pipSize;

  const [entry, setEntry] = useState("1.1000");
  const [stop, setStop] = useState("1.0970");
  const [target, setTarget] = useState("1.1090");
  const riskDistance = Math.abs(n(entry) - n(stop));
  const rewardDistance = Math.abs(n(target) - n(entry));
  const rr = riskDistance > 0 ? rewardDistance / riskDistance : 0;

  const [drawdown, setDrawdown] = useState("20");
  const dd = Math.min(99.99, Math.max(0, n(drawdown))) / 100;
  const recovery = dd < 1 ? dd / (1 - dd) * 100 : 0;

  const [compoundStart, setCompoundStart] = useState("1000");
  const [compoundRate, setCompoundRate] = useState("2");
  const [compoundPeriods, setCompoundPeriods] = useState("12");
  const compound = n(compoundStart) * Math.pow(1 + n(compoundRate)/100, Math.max(0,n(compoundPeriods)));

  const [pair, setPair] = useState("EUR/USD");
  const [pattern, setPattern] = useState(0);
  const [structure, setStructure] = useState<"up"|"down"|"range">("up");

  const [base, quote] = pair.split("/");
  const structurePoints = useMemo(() => {
    if (structure === "up") return "10,80 90,45 160,65 240,30 310,48 390,15";
    if (structure === "down") return "10,20 90,52 160,36 240,70 310,52 390,88";
    return "10,52 70,38 130,62 190,42 250,58 320,40 390,54";
  }, [structure]);

  return (
    <div className={styles.wrap}>
      <header className={styles.hero}>
        <span>FOREX TOOLKIT</span>
        <h1>Chart Lab</h1>
        <p>Pip · Position Size · R:R · Drawdown · Compounding · Market Structure · Candlestick Pattern Lab</p>
      </header>

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.kicker}>RISK ENGINE</div>
          <h2>Position Size</h2>
          <div className={styles.fields}>
            <label>Account balance<input value={balance} onChange={e=>setBalance(e.target.value)} inputMode="decimal"/></label>
            <label>Risk %<input value={riskPct} onChange={e=>setRiskPct(e.target.value)} inputMode="decimal"/></label>
            <label>Stop distance (pips)<input value={stopPips} onChange={e=>setStopPips(e.target.value)} inputMode="decimal"/></label>
            <label>Pip value / 1 lot<input value={pipValue} onChange={e=>setPipValue(e.target.value)} inputMode="decimal"/></label>
          </div>
          <div className={styles.results}>
            <div><span>Risk amount</span><strong>{fmt(riskAmount,2)}</strong></div>
            <div><span>Standard lots</span><strong>{fmt(lots,4)}</strong></div>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.kicker}>PIP ENGINE</div>
          <h2>Pip Distance</h2>
          <div className={styles.fields}>
            <label>From<input value={fromPrice} onChange={e=>setFromPrice(e.target.value)} inputMode="decimal"/></label>
            <label>To<input value={toPrice} onChange={e=>setToPrice(e.target.value)} inputMode="decimal"/></label>
          </div>
          <label className={styles.check}><input type="checkbox" checked={isJpy} onChange={e=>setIsJpy(e.target.checked)}/> JPY pair (0.01 pip size)</label>
          <div className={styles.bigResult}>{fmt(pips,1)} pips</div>
        </section>

        <section className={styles.card}>
          <div className={styles.kicker}>TRADE PLAN</div>
          <h2>Risk : Reward</h2>
          <div className={styles.fields}>
            <label>Entry<input value={entry} onChange={e=>setEntry(e.target.value)} inputMode="decimal"/></label>
            <label>Stop<input value={stop} onChange={e=>setStop(e.target.value)} inputMode="decimal"/></label>
            <label>Target<input value={target} onChange={e=>setTarget(e.target.value)} inputMode="decimal"/></label>
          </div>
          <div className={styles.bigResult}>1 : {fmt(rr,2)}</div>
        </section>

        <section className={styles.card}>
          <div className={styles.kicker}>CAPITAL SURVIVAL</div>
          <h2>Drawdown Recovery</h2>
          <label>Drawdown %<input value={drawdown} onChange={e=>setDrawdown(e.target.value)} inputMode="decimal"/></label>
          <div className={styles.bigResult}>{fmt(recovery,2)}% recovery needed</div>
          <p className={styles.muted}>손실률이 커질수록 원금 회복에 필요한 수익률은 비선형적으로 증가합니다.</p>
        </section>

        <section className={styles.card}>
          <div className={styles.kicker}>MONEY MANAGEMENT</div>
          <h2>Compounding</h2>
          <div className={styles.fields}>
            <label>Start<input value={compoundStart} onChange={e=>setCompoundStart(e.target.value)} inputMode="decimal"/></label>
            <label>Rate / period %<input value={compoundRate} onChange={e=>setCompoundRate(e.target.value)} inputMode="decimal"/></label>
            <label>Periods<input value={compoundPeriods} onChange={e=>setCompoundPeriods(e.target.value)} inputMode="numeric"/></label>
          </div>
          <div className={styles.bigResult}>{fmt(compound,2)}</div>
        </section>

        <section className={styles.card}>
          <div className={styles.kicker}>PAIR ANATOMY</div>
          <h2>Base / Quote</h2>
          <select value={pair} onChange={e=>setPair(e.target.value)}>
            <option>EUR/USD</option><option>GBP/USD</option><option>USD/JPY</option><option>AUD/USD</option><option>EUR/GBP</option>
          </select>
          <div className={styles.pairVisual}>
            <div><small>BASE</small><strong>{base}</strong><span>1 unit</span></div>
            <div className={styles.pairArrow}>→</div>
            <div><small>QUOTE</small><strong>{quote}</strong><span>price currency</span></div>
          </div>
        </section>

        <section className={styles.wideCard}>
          <div className={styles.kicker}>MARKET STRUCTURE LAB</div>
          <div className={styles.sectionHead}>
            <h2>Trend Structure</h2>
            <div className={styles.segmented}>
              {(["up","down","range"] as const).map(v=><button key={v} className={structure===v?styles.segmentActive:""} onClick={()=>setStructure(v)}>{v.toUpperCase()}</button>)}
            </div>
          </div>
          <div className={styles.chartBox}>
            <svg viewBox="0 0 400 100" preserveAspectRatio="none">
              <polyline points={structurePoints} fill="none" stroke="currentColor" strokeWidth="4" vectorEffect="non-scaling-stroke"/>
            </svg>
            <div className={styles.structureLabels}>
              {structure==="up" ? "HH → HL → HH → HL → HH" : structure==="down" ? "LL → LH → LL → LH → LL" : "Range High ↔ Mid ↔ Range Low"}
            </div>
          </div>
        </section>

        <section className={styles.wideCard}>
          <div className={styles.kicker}>CANDLESTICK LAB</div>
          <div className={styles.sectionHead}>
            <h2>{candlePatterns[pattern].name}</h2>
            <select value={pattern} onChange={e=>setPattern(Number(e.target.value))}>
              {candlePatterns.map((p,i)=><option value={i} key={p.name}>{p.name}</option>)}
            </select>
          </div>
          <div className={styles.candleArea}>
            <div className={styles.candles}>
              {candlePatterns[pattern].candles.map((c,i)=>{
                const [open,close,wickTop,wickBottom]=c;
                const top=Math.min(open,close);
                const height=Math.max(8,Math.abs(close-open));
                const bullish=close>=open;
                return <div className={styles.candleSlot} key={i}>
                  <span className={styles.wick} style={{top:wickTop+"%",bottom:wickBottom+"%"}}/>
                  <span className={bullish?styles.candleUp:styles.candleDown} style={{top:top+"%",height:height+"%"}}/>
                </div>
              })}
            </div>
            <p>{candlePatterns[pattern].note}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
