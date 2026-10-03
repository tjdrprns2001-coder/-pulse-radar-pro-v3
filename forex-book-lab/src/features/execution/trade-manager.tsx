"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./execution.module.css";

type Side = "LONG" | "SHORT";

type OpenTrade = {
  id:number;
  openedAt:string;
  pair:string;
  side:Side;
  entry:string;
  stop:string;
  target:string;
  current:string;
  lots:string;
  pipValue:string;
  note:string;
};

type JournalRow = {
  id:number;
  time:string;
  pair:string;
  side:Side;
  entry:string;
  stop:string;
  target:string;
  lots:string;
  resultR:string;
  note:string;
};

const pairs=["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","NZDUSD","USDCAD","EURJPY","GBPJPY","EURGBP"];

function n(v:string|number){
  const x=Number(v);
  return Number.isFinite(x)?x:0;
}

function fmt(v:number,d=2){
  return Number.isFinite(v)?v.toLocaleString(undefined,{maximumFractionDigits:d}):"—";
}

function pipSize(pair:string){
  return pair.includes("JPY") ? 0.01 : 0.0001;
}

function direction(side:Side){
  return side==="LONG" ? 1 : -1;
}

function calcR(t:OpenTrade){
  const risk=Math.abs(n(t.entry)-n(t.stop));
  if(risk<=0) return 0;
  const move=(n(t.current)-n(t.entry))*direction(t.side);
  return move/risk;
}

function currentPips(t:OpenTrade){
  return ((n(t.current)-n(t.entry))*direction(t.side))/pipSize(t.pair);
}

function stopRiskPips(t:OpenTrade){
  return Math.abs(n(t.entry)-n(t.stop))/pipSize(t.pair);
}

function targetR(t:OpenTrade){
  const risk=Math.abs(n(t.entry)-n(t.stop));
  if(risk<=0) return 0;
  return Math.abs(n(t.target)-n(t.entry))/risk;
}

function usdExposure(t:OpenTrade){
  if(t.pair.endsWith("USD")) return t.side==="LONG" ? -1 : 1;
  if(t.pair.startsWith("USD")) return t.side==="LONG" ? 1 : -1;
  return 0;
}

export function TradeManager(){
  const [trades,setTrades]=useState<OpenTrade[]>([]);
  const [account,setAccount]=useState("10000");
  const [maxOpenRiskPct,setMaxOpenRiskPct]=useState("3");

  const [pair,setPair]=useState("EURUSD");
  const [side,setSide]=useState<Side>("LONG");
  const [entry,setEntry]=useState("1.1000");
  const [stop,setStop]=useState("1.0950");
  const [target,setTarget]=useState("1.1100");
  const [current,setCurrent]=useState("1.1000");
  const [lots,setLots]=useState("0.20");
  const [pipValue,setPipValue]=useState("10");
  const [note,setNote]=useState("");

  const [beTrigger,setBeTrigger]=useState("1");
  const [trailPips,setTrailPips]=useState("20");
  const [tp1R,setTp1R]=useState("1");
  const [tp1Pct,setTp1Pct]=useState("50");
  const [tp2R,setTp2R]=useState("2");
  const [tp2Pct,setTp2Pct]=useState("50");

  useEffect(()=>{
    try{
      const raw=localStorage.getItem("forex-execution-desk:open-trades");
      if(raw) setTrades(JSON.parse(raw));
      const rawAccount=localStorage.getItem("forex-execution-desk:account");
      if(rawAccount) setAccount(rawAccount);
    }catch{}
  },[]);

  useEffect(()=>{
    try{
      localStorage.setItem("forex-execution-desk:open-trades",JSON.stringify(trades));
      localStorage.setItem("forex-execution-desk:account",account);
    }catch{}
  },[trades,account]);

  const portfolio=useMemo(()=>{
    let risk=0;
    let unreal=0;
    let usd=0;

    for(const t of trades){
      const riskPips=stopRiskPips(t);
      risk += riskPips*n(t.pipValue)*n(t.lots);
      unreal += currentPips(t)*n(t.pipValue)*n(t.lots);
      usd += usdExposure(t);
    }

    const riskPct=n(account)>0 ? risk/n(account)*100 : 0;
    return {risk,unreal,riskPct,usd};
  },[trades,account]);

  const newRiskPips=Math.abs(n(entry)-n(stop))/pipSize(pair);
  const newRisk=newRiskPips*n(pipValue)*n(lots);
  const projectedRiskPct=n(account)>0 ? (portfolio.risk+newRisk)/n(account)*100 : 0;
  const riskBlocked=projectedRiskPct>n(maxOpenRiskPct);

  const partialPlan=((n(tp1R)*n(tp1Pct))+(n(tp2R)*n(tp2Pct)))/100;

  function addTrade(){
    if(!entry||!stop||!current||!lots) return;
    const t:OpenTrade={
      id:Date.now(),
      openedAt:new Date().toISOString(),
      pair,
      side,
      entry,
      stop,
      target,
      current,
      lots,
      pipValue,
      note
    };
    setTrades(v=>[t,...v]);
    setNote("");
  }

  function updateTrade(id:number,patch:Partial<OpenTrade>){
    setTrades(rows=>rows.map(r=>r.id===id?{...r,...patch}:r));
  }

  function closeToJournal(t:OpenTrade){
    const resultR=calcR(t);
    let journal:JournalRow[]=[];
    try{
      const raw=localStorage.getItem("forex-execution-desk:journal");
      if(raw) journal=JSON.parse(raw);
    }catch{}

    const row:JournalRow={
      id:Date.now(),
      time:new Date().toISOString().slice(0,16),
      pair:t.pair,
      side:t.side,
      entry:t.entry,
      stop:t.stop,
      target:t.target,
      lots:t.lots,
      resultR:resultR.toFixed(2),
      note:t.note ? "Managed trade · "+t.note : "Managed trade"
    };

    localStorage.setItem("forex-execution-desk:journal",JSON.stringify([row,...journal]));
    setTrades(rows=>rows.filter(r=>r.id!==t.id));
  }

  function applyBreakEven(t:OpenTrade){
    updateTrade(t.id,{stop:t.entry});
  }

  function applyTrail(t:OpenTrade){
    const delta=n(trailPips)*pipSize(t.pair);
    const next=t.side==="LONG" ? n(t.current)-delta : n(t.current)+delta;
    updateTrade(t.id,{stop:next.toFixed(t.pair.includes("JPY")?3:5)});
  }

  function exportOpenCsv(){
    const header=["openedAt","pair","side","entry","stop","target","current","lots","pipValue","note"];
    const body=trades.map(t=>header.map(k=>String(t[k as keyof OpenTrade]??"").replaceAll('"','""')).map(v=>'"'+v+'"').join(","));
    const blob=new Blob([[header.join(","),...body].join("\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download="forex-open-trades.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.hero}>
        <div className={styles.eyebrow}>OPEN TRADE MANAGEMENT</div>
        <h1>Position Manager</h1>
        <p>진입 후 현재가·Stop·Target·부분청산·Break-even·Trailing stop·포트폴리오 오픈 리스크를 한 화면에서 관리합니다.</p>
      </header>

      <section className={styles.panel}>
        <div className={styles.head}>
          <h2>Portfolio Risk Guard</h2>
          <span className={riskBlocked?styles.badgeWarn:styles.badgeOk}>{riskBlocked?"RISK CAP":"WITHIN CAP"}</span>
        </div>

        <div className={styles.fields}>
          <label className={styles.field}>Account<input value={account} onChange={e=>setAccount(e.target.value)}/></label>
          <label className={styles.field}>Max open risk %<input value={maxOpenRiskPct} onChange={e=>setMaxOpenRiskPct(e.target.value)}/></label>
        </div>

        <div className={styles.guard}>
          <article><small>OPEN RISK</small><strong>{fmt(portfolio.risk,2)}</strong></article>
          <article><small>OPEN RISK %</small><strong>{fmt(portfolio.riskPct,2)}%</strong></article>
          <article><small>UNREALIZED</small><strong>{fmt(portfolio.unreal,2)}</strong></article>
          <article><small>USD STACK</small><strong>{portfolio.usd>1?"LONG USD x"+portfolio.usd:portfolio.usd<-1?"SHORT USD x"+Math.abs(portfolio.usd):"BALANCED"}</strong></article>
        </div>

        <div className={riskBlocked?styles.guardBlock:styles.guardOk}>
          {riskBlocked?"새 포지션 추가 시 설정한 오픈 리스크 한도를 초과합니다.":"새 포지션 추가 후에도 설정한 오픈 리스크 한도 이내입니다."}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.head}>
          <h2>Add Open Position</h2>
          <span className={riskBlocked?styles.badgeWarn:styles.badgeOk}>Projected {fmt(projectedRiskPct,2)}%</span>
        </div>

        <div className={styles.fields}>
          <label className={styles.field}>Pair<select value={pair} onChange={e=>setPair(e.target.value)}>{pairs.map(p=><option key={p}>{p}</option>)}</select></label>
          <label className={styles.field}>Side<select value={side} onChange={e=>setSide(e.target.value as Side)}><option>LONG</option><option>SHORT</option></select></label>
          <label className={styles.field}>Entry<input value={entry} onChange={e=>setEntry(e.target.value)}/></label>
          <label className={styles.field}>Stop<input value={stop} onChange={e=>setStop(e.target.value)}/></label>
          <label className={styles.field}>Target<input value={target} onChange={e=>setTarget(e.target.value)}/></label>
          <label className={styles.field}>Current price<input value={current} onChange={e=>setCurrent(e.target.value)}/></label>
          <label className={styles.field}>Lots<input value={lots} onChange={e=>setLots(e.target.value)}/></label>
          <label className={styles.field}>Pip value / lot<input value={pipValue} onChange={e=>setPipValue(e.target.value)}/></label>
        </div>

        <textarea className={styles.textarea} value={note} onChange={e=>setNote(e.target.value)} placeholder="진입 이유 · 세션 · 핵심 레벨 · 무효화 조건"/>

        <div className={styles.results}>
          <article><small>NEW RISK</small><strong>{fmt(newRisk,2)}</strong></article>
          <article><small>STOP</small><strong>{fmt(newRiskPips,1)} pips</strong></article>
          <article><small>PROJECTED</small><strong>{fmt(projectedRiskPct,2)}%</strong></article>
          <article><small>STATUS</small><strong>{riskBlocked?"BLOCK":"OK"}</strong></article>
        </div>

        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={addTrade} disabled={riskBlocked}>Add Position</button>
          <button className={styles.btn} onClick={exportOpenCsv}>CSV Export</button>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.head}>
          <h2>Management Plan</h2>
          <span className={styles.badge}>Weighted {fmt(partialPlan,2)}R</span>
        </div>

        <div className={styles.fields}>
          <label className={styles.field}>Break-even trigger (R)<input value={beTrigger} onChange={e=>setBeTrigger(e.target.value)}/></label>
          <label className={styles.field}>Trailing distance (pips)<input value={trailPips} onChange={e=>setTrailPips(e.target.value)}/></label>
          <label className={styles.field}>TP1 R<input value={tp1R} onChange={e=>setTp1R(e.target.value)}/></label>
          <label className={styles.field}>TP1 close %<input value={tp1Pct} onChange={e=>setTp1Pct(e.target.value)}/></label>
          <label className={styles.field}>TP2 R<input value={tp2R} onChange={e=>setTp2R(e.target.value)}/></label>
          <label className={styles.field}>TP2 close %<input value={tp2Pct} onChange={e=>setTp2Pct(e.target.value)}/></label>
        </div>

        <div className={styles.note}>부분청산 가중 R은 계획 비교용입니다. 실제 체결·슬리피지·스프레드는 포함하지 않습니다.</div>
      </section>

      <section className={styles.panel}>
        <div className={styles.head}>
          <h2>Open Positions</h2>
          <span className={styles.badge}>{trades.length} OPEN</span>
        </div>

        {trades.length ? (
          <div className={styles.positionGrid}>
            {trades.map(t=>{
              const r=calcR(t);
              const pips=currentPips(t);
              const pnl=pips*n(t.pipValue)*n(t.lots);
              const canBe=r>=n(beTrigger);
              const risk=Math.abs(n(t.entry)-n(t.stop));
              const bePrice=t.entry;
              const tp1Price=t.side==="LONG" ? n(t.entry)+risk*n(tp1R) : n(t.entry)-risk*n(tp1R);
              const tp2Price=t.side==="LONG" ? n(t.entry)+risk*n(tp2R) : n(t.entry)-risk*n(tp2R);
              const trailDelta=n(trailPips)*pipSize(t.pair);
              const trail=t.side==="LONG" ? n(t.current)-trailDelta : n(t.current)+trailDelta;

              return (
                <article className={styles.positionCard} key={t.id}>
                  <div className={styles.head}>
                    <div>
                      <div className={styles.eyebrow}>{t.side}</div>
                      <h2>{t.pair}</h2>
                    </div>
                    <span className={r>=0?styles.badgeOk:styles.badgeWarn}>{fmt(r,2)}R</span>
                  </div>

                  <div className={styles.fields}>
                    <label className={styles.field}>Current<input value={t.current} onChange={e=>updateTrade(t.id,{current:e.target.value})}/></label>
                    <label className={styles.field}>Stop<input value={t.stop} onChange={e=>updateTrade(t.id,{stop:e.target.value})}/></label>
                    <label className={styles.field}>Target<input value={t.target} onChange={e=>updateTrade(t.id,{target:e.target.value})}/></label>
                    <label className={styles.field}>Lots<input value={t.lots} onChange={e=>updateTrade(t.id,{lots:e.target.value})}/></label>
                  </div>

                  <div className={styles.results}>
                    <article><small>UNREALIZED</small><strong>{fmt(pnl,2)}</strong></article>
                    <article><small>CURRENT</small><strong>{fmt(pips,1)} pips</strong></article>
                    <article><small>TARGET R</small><strong>{fmt(targetR(t),2)}R</strong></article>
                    <article><small>BE STATUS</small><strong>{canBe?"READY":"WAIT"}</strong></article>
                  </div>

                  <div className={styles.planGrid}>
                    <div><small>BE PRICE</small><strong>{bePrice}</strong></div>
                    <div><small>TRAIL CANDIDATE</small><strong>{trail.toFixed(t.pair.includes("JPY")?3:5)}</strong></div>
                    <div><small>TP1</small><strong>{tp1Price.toFixed(t.pair.includes("JPY")?3:5)}</strong></div>
                    <div><small>TP2</small><strong>{tp2Price.toFixed(t.pair.includes("JPY")?3:5)}</strong></div>
                  </div>

                  <div className={styles.actions}>
                    <button className={styles.btn} onClick={()=>applyBreakEven(t)} disabled={!canBe}>Move Stop → BE</button>
                    <button className={styles.btn} onClick={()=>applyTrail(t)}>Apply Trail</button>
                    <button className={styles.btnPrimary} onClick={()=>closeToJournal(t)}>Close → Journal</button>
                    <button className={styles.danger} onClick={()=>setTrades(rows=>rows.filter(r=>r.id!==t.id))}>Remove</button>
                  </div>

                  {t.note ? <div className={styles.note}>{t.note}</div> : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>열린 포지션이 없습니다.</div>
        )}
      </section>
    </div>
  );
}
