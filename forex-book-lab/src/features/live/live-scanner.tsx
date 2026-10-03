"use client";

import { useState } from "react";
import { TradingViewWidget } from "./tradingview-widget";
import styles from "./live.module.css";

const pairs=["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","NZDUSD","USDCAD","EURJPY","GBPJPY","EURGBP"];
const gates=[
  ["htf","1D/4H 방향","상위 시간봉 방향 확인"],
  ["structure","구조","HH/HL 또는 LH/LL 혹은 range 구분"],
  ["level","레벨","이전 고저점·지지저항·유동성 확인"],
  ["trigger","트리거","break/retest/close 확인"],
  ["news","뉴스","고영향 일정 확인"],
  ["risk","리스크","손절·lot·최대손실 계산"],
] as const;

export function LiveForexScanner(){
  const [pair,setPair]=useState("EURUSD");
  const [bias,setBias]=useState("NEUTRAL");
  const [setup,setSetup]=useState("BREAKOUT");
  const [rr,setRr]=useState("2");
  const [spread,setSpread]=useState("1.0");
  const [checks,setChecks]=useState<Record<string,boolean>>({});
  const done=gates.filter(([id])=>checks[id]).length;
  const completeness=Math.round(done/gates.length*100);

  return <div className={styles.desk}>
    <header className={styles.hero}>
      <div className={styles.eyebrow}>LIVE FOREX SCANNER</div>
      <h1>Market Scan → Shortlist → Gate</h1>
      <p>실시간 Forex screener와 캘린더로 시장을 훑고, 후보를 선택한 뒤 구조·뉴스·리스크 조건을 한 번에 검증합니다.</p>
    </header>

    <div className={styles.screenerGrid}>
      <section className={styles.panel}>
        <div className={styles.panelHead}><h2>Forex Screener</h2><span className={styles.badge}>LIVE</span></div>
        <TradingViewWidget script="embed-widget-screener.js" minHeight={650} config={{width:"100%",height:630,defaultColumn:"overview",defaultScreen:"general",market:"forex",showToolbar:true,colorTheme:"dark",locale:"en",isTransparent:true}} />
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHead}><h2>Economic Calendar</h2><span className={styles.badgeWarn}>EVENT RISK</span></div>
        <TradingViewWidget script="embed-widget-events.js" minHeight={650} config={{colorTheme:"dark",isTransparent:true,width:"100%",height:630,locale:"en",importanceFilter:"0,1",countryFilter:"us,eu,gb,jp,ca,au,nz,ch"}} />
      </section>
    </div>

    <section className={styles.panel}>
      <div className={styles.panelHead}><h2>Shortlist Gate</h2><span className={completeness===100?styles.badge:styles.badgeWarn}>{completeness}% COMPLETE</span></div>
      <div className={styles.shortlist}>
        <div className={styles.shortlistGrid}>
          <label className={styles.field}>PAIR<select value={pair} onChange={e=>setPair(e.target.value)}>{pairs.map(p=><option key={p}>{p}</option>)}</select></label>
          <label className={styles.field}>BIAS<select value={bias} onChange={e=>setBias(e.target.value)}><option>LONG</option><option>SHORT</option><option>NEUTRAL</option></select></label>
          <label className={styles.field}>SETUP<select value={setup} onChange={e=>setSetup(e.target.value)}><option>BREAKOUT</option><option>RETEST</option><option>TREND PULLBACK</option><option>RANGE REVERSAL</option><option>FAKEOUT</option></select></label>
          <label className={styles.field}>MIN R:R<input value={rr} onChange={e=>setRr(e.target.value)}/></label>
          <label className={styles.field}>SPREAD PIPS<input value={spread} onChange={e=>setSpread(e.target.value)}/></label>
        </div>

        <div className={styles.checklist}>{gates.map(([id,title,desc],idx)=><button key={id} className={checks[id]?styles.checkOn:styles.check} onClick={()=>setChecks(s=>({...s,[id]:!s[id]}))}><span>{checks[id]?"✓":String(idx+1).padStart(2,"0")}</span><div><strong>{title}</strong><small>{desc}</small></div></button>)}</div>

        <div className={styles.shortlistResults}>
          <article><small>PAIR</small><strong>{pair}</strong></article>
          <article><small>BIAS</small><strong>{bias}</strong></article>
          <article><small>SETUP</small><strong>{setup}</strong></article>
          <article><small>MIN R:R</small><strong>{rr}</strong></article>
          <article><small>SPREAD</small><strong>{spread} pips</strong></article>
          <article><small>GATE</small><strong>{done}/{gates.length}</strong></article>
        </div>
        <p className={styles.note}>이 Gate는 매수·매도 신호가 아니라, 후보를 실전 검토 단계로 넘기기 전에 확인해야 할 조건의 충족도만 표시합니다.</p>
      </div>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHead}><h2>Cross-Rate Board</h2><span className={styles.badge}>RELATIVE STRENGTH VIEW</span></div>
      <TradingViewWidget script="embed-widget-forex-cross-rates.js" minHeight={520} config={{width:"100%",height:500,currencies:["EUR","USD","JPY","GBP","CHF","AUD","CAD","NZD"],isTransparent:true,colorTheme:"dark",locale:"en",backgroundColor:"#0f131a"}} />
    </section>

    <div className={styles.disclaimer}>실시간 후보 선정은 시세 제공처의 지연·스프레드 차이를 받을 수 있습니다. 실제 주문 전 브로커 플랫폼의 가격과 경제 일정 최종 확인이 필요합니다.</div>
  </div>
}
