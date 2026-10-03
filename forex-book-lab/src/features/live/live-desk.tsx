"use client";

import { useEffect, useMemo, useState } from "react";
import { TradingViewWidget } from "./tradingview-widget";
import styles from "./live.module.css";

type Side = "LONG" | "SHORT";
type JournalRow = {
  id: number;
  time: string;
  pair: string;
  side: Side;
  entry: string;
  stop: string;
  target: string;
  lots: string;
  resultR: string;
  note: string;
};

const pairs = ["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","NZDUSD","USDCAD","EURJPY","GBPJPY","EURGBP"];
const checks = [
  ["trend","HTF 방향","1D/4H 방향과 아이디어가 충돌하지 않음"],
  ["structure","구조 확인","HH/HL · LH/LL · range 여부 확인"],
  ["level","핵심 레벨","이전 고저점·지지저항·유동성 확인"],
  ["session","세션 확인","런던/뉴욕 등 거래 시간대 확인"],
  ["news","뉴스 확인","고영향 경제지표·중앙은행 일정 확인"],
  ["risk","리스크 고정","진입 전에 최대 손실액과 lot 확정"],
  ["trigger","트리거 확인","종가·리테스트·캔들 등 실행조건 확인"],
] as const;

const sessions = [
  {name:"Tokyo",tz:"Asia/Tokyo",open:9,close:18},
  {name:"London",tz:"Europe/London",open:8,close:17},
  {name:"New York",tz:"America/New_York",open:8,close:17},
  {name:"Sydney",tz:"Australia/Sydney",open:8,close:17},
] as const;

function n(v:string|number){const x=Number(v);return Number.isFinite(x)?x:0}
function fmt(v:number,d=2){return Number.isFinite(v)?v.toLocaleString(undefined,{maximumFractionDigits:d}):"—"}
function localHour(date:Date,tz:string){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:tz,hour:"2-digit",hour12:false}).formatToParts(date);
  return Number(parts.find(p=>p.type==="hour")?.value||0);
}
function localClock(date:Date,tz:string){
  return new Intl.DateTimeFormat("en-GB",{timeZone:tz,hour:"2-digit",minute:"2-digit",hour12:false}).format(date);
}
function defaultPipValue(pair:string,entry:number){
  if(pair==="USDJPY") return entry>0 ? 1000/entry : 0;
  if(pair.endsWith("USD")) return 10;
  if(pair==="USDCAD"||pair==="USDCHF") return entry>0 ? 10/entry : 0;
  return 10;
}

export function LiveTradingDesk() {
  const [pair,setPair]=useState("EURUSD");
  const [interval,setIntervalValue]=useState("60");
  const [now,setNow]=useState<Date|null>(null);
  const [side,setSide]=useState<Side>("LONG");
  const [account,setAccount]=useState("10000");
  const [riskPct,setRiskPct]=useState("1");
  const [entry,setEntry]=useState("1.1000");
  const [stop,setStop]=useState("1.0950");
  const [target,setTarget]=useState("1.1100");
  const [pipValue,setPipValue]=useState("10");
  const [checkState,setCheckState]=useState<Record<string,boolean>>({});

  const [journal,setJournal]=useState<JournalRow[]>([]);
  const [journalPair,setJournalPair]=useState("EURUSD");
  const [journalSide,setJournalSide]=useState<Side>("LONG");
  const [journalEntry,setJournalEntry]=useState("");
  const [journalStop,setJournalStop]=useState("");
  const [journalTarget,setJournalTarget]=useState("");
  const [journalLots,setJournalLots]=useState("");
  const [journalR,setJournalR]=useState("");
  const [journalNote,setJournalNote]=useState("");
  const [journalTime,setJournalTime]=useState("");

  useEffect(()=>{
    setNow(new Date());
    const timer=window.setInterval(()=>setNow(new Date()),30000);
    try{
      const raw=localStorage.getItem("forex-execution-desk:journal");
      if(raw) setJournal(JSON.parse(raw));
    }catch{}
    const d=new Date();
    setJournalTime(d.toISOString().slice(0,16));
    return()=>window.clearInterval(timer);
  },[]);

  useEffect(()=>{
    try{localStorage.setItem("forex-execution-desk:journal",JSON.stringify(journal))}catch{}
  },[journal]);

  useEffect(()=>{
    const defaults:Record<string,[string,string,string]>={
      EURUSD:["1.1000","1.0950","1.1100"],GBPUSD:["1.3000","1.2940","1.3120"],USDJPY:["150.00","149.40","151.20"],
      USDCHF:["0.9200","0.9150","0.9300"],AUDUSD:["0.6700","0.6660","0.6780"],NZDUSD:["0.6100","0.6060","0.6180"],
      USDCAD:["1.3600","1.3540","1.3720"],EURJPY:["165.00","164.40","166.20"],GBPJPY:["195.00","194.20","196.60"],EURGBP:["0.8500","0.8460","0.8580"]
    };
    const d=defaults[pair]||defaults.EURUSD;
    setEntry(d[0]); setStop(d[1]); setTarget(d[2]);
    setPipValue(String(defaultPipValue(pair,Number(d[0])).toFixed(2)));
  },[pair]);

  const pipSize=pair.includes("JPY")?0.01:0.0001;
  const stopPips=Math.abs(n(entry)-n(stop))/pipSize;
  const targetPips=Math.abs(n(target)-n(entry))/pipSize;
  const riskAmount=n(account)*n(riskPct)/100;
  const lots=stopPips>0&&n(pipValue)>0?riskAmount/(stopPips*n(pipValue)):0;
  const rr=stopPips>0?targetPips/stopPips:0;
  const notional=lots*100000;
  const plannedGain=riskAmount*rr;

  const complete=checks.filter(([id])=>checkState[id]).length;
  const readiness=Math.round(complete/checks.length*100);

  const journalStats=useMemo(()=>{
    const rs=journal.map(r=>n(r.resultR)).filter(v=>Number.isFinite(v));
    const completedRows=journal.filter(r=>r.resultR.trim()!=="");
    const wins=completedRows.filter(r=>n(r.resultR)>0).length;
    const net=completedRows.reduce((s,r)=>s+n(r.resultR),0);
    const avg=completedRows.length?net/completedRows.length:0;
    return {count:journal.length,wins,winRate:completedRows.length?wins/completedRows.length*100:0,net,avg};
  },[journal]);

  function addJournal(){
    if(!journalTime) return;
    setJournal(rows=>[{
      id:Date.now(),time:journalTime,pair:journalPair,side:journalSide,entry:journalEntry,stop:journalStop,target:journalTarget,lots:journalLots,resultR:journalR,note:journalNote
    },...rows]);
    setJournalEntry("");setJournalStop("");setJournalTarget("");setJournalLots("");setJournalR("");setJournalNote("");
  }

  function exportCsv(){
    const header=["time","pair","side","entry","stop","target","lots","resultR","note"];
    const body=journal.map(r=>header.map(k=>String(r[k as keyof JournalRow]??"").replaceAll('"','""')).map(v=>'"'+v+'"').join(","));
    const blob=new Blob([[header.join(","),...body].join("\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download="forex-journal.csv";a.click();URL.revokeObjectURL(url);
  }

  return <div className={styles.desk}>
    <header className={styles.hero}>
      <div className={styles.eyebrow}>LIVE FOREX EXECUTION DESK</div>
      <h1>Chart · Plan · Risk · Journal</h1>
      <p>실시간 차트와 경제 캘린더를 보면서 진입 전 리스크 계산, 체크리스트, 기록까지 한 화면에서 처리합니다.</p>
    </header>

    <div className={styles.toolbar}>
      <label>PAIR<select value={pair} onChange={e=>setPair(e.target.value)}>{pairs.map(p=><option key={p}>{p}</option>)}</select></label>
      <label>TIMEFRAME<select value={interval} onChange={e=>setIntervalValue(e.target.value)}><option value="1">1m</option><option value="5">5m</option><option value="15">15m</option><option value="60">1H</option><option value="240">4H</option><option value="D">1D</option><option value="W">1W</option></select></label>
      <div className={styles.badge}>FX:{pair}</div>
      <div className={styles.badgeWarn}>실거래 주문 전 브로커 호가 확인</div>
    </div>

    <div className={styles.grid2}>
      <section className={styles.chartPanel}>
        <TradingViewWidget
          script="embed-widget-advanced-chart.js"
          minHeight={660}
          config={{autosize:true,symbol:"FX:"+pair,interval,timezone:"Etc/UTC",theme:"dark",style:"1",locale:"en",allow_symbol_change:true,calendar:false,support_host:"https://www.tradingview.com"}}
        />
      </section>

      <div style={{display:"grid",gap:14}}>
        <section className={styles.panel}>
          <div className={styles.panelHead}><h2>Session Clock</h2><span className={styles.badge}>{now?now.toUTCString().slice(17,22)+" UTC":"--:-- UTC"}</span></div>
          <div className={styles.sessions}>
            {sessions.map(s=>{
              const hour=now?localHour(now,s.tz):0;
              const active=!!now&&hour>=s.open&&hour<s.close;
              return <div key={s.name} className={active?styles.sessionActive:styles.session}><small>{active?"OPEN":"CLOSED"}</small><strong>{s.name}</strong><span>{now?localClock(now,s.tz):"--:--"}</span></div>
            })}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}><h2>Execution Risk</h2><div className={styles.segmented}>
            <button className={side==="LONG"?styles.buttonPrimary:styles.button} onClick={()=>setSide("LONG")}>LONG</button>
            <button className={side==="SHORT"?styles.buttonPrimary:styles.button} onClick={()=>setSide("SHORT")}>SHORT</button>
          </div></div>
          <div className={styles.fields}>
            <label className={styles.field}>Account<input value={account} onChange={e=>setAccount(e.target.value)}/></label>
            <label className={styles.field}>Risk %<input value={riskPct} onChange={e=>setRiskPct(e.target.value)}/></label>
            <label className={styles.field}>Entry<input value={entry} onChange={e=>setEntry(e.target.value)}/></label>
            <label className={styles.field}>Stop<input value={stop} onChange={e=>setStop(e.target.value)}/></label>
            <label className={styles.field}>Target<input value={target} onChange={e=>setTarget(e.target.value)}/></label>
            <label className={styles.field}>Pip value / 1 lot<input value={pipValue} onChange={e=>setPipValue(e.target.value)}/></label>
          </div>
          <div className={styles.primaryResult}>{fmt(lots,3)} lots · 1:{fmt(rr,2)} R:R</div>
          <div className={styles.riskResults}>
            <article><small>MAX LOSS</small><strong>{fmt(riskAmount,2)}</strong></article>
            <article><small>STOP</small><strong>{fmt(stopPips,1)} pips</strong></article>
            <article><small>TARGET</small><strong>{fmt(targetPips,1)} pips</strong></article>
            <article><small>NOTIONAL</small><strong>{fmt(notional,0)}</strong></article>
            <article><small>PLANNED GAIN</small><strong>{fmt(plannedGain,2)}</strong></article>
            <article><small>DIRECTION</small><strong>{side}</strong></article>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}><h2>Pre-Trade Gate</h2><span className={readiness===100?styles.badge:styles.badgeWarn}>{readiness}%</span></div>
          <div className={styles.checklist}>{checks.map(([id,title,desc],idx)=><button key={id} className={checkState[id]?styles.checkOn:styles.check} onClick={()=>setCheckState(s=>({...s,[id]:!s[id]}))}><span>{checkState[id]?"✓":String(idx+1).padStart(2,"0")}</span><div><strong>{title}</strong><small>{desc}</small></div></button>)}</div>
          <div className={styles.ready}><strong>{complete}/{checks.length}</strong><div className={styles.meter}><i style={{width:readiness+"%"}}/></div></div>
        </section>
      </div>
    </div>

    <div className={styles.gridEqual}>
      <section className={styles.panel}>
        <div className={styles.panelHead}><h2>Economic Calendar</h2><span className={styles.badgeWarn}>NEWS RISK</span></div>
        <TradingViewWidget script="embed-widget-events.js" minHeight={560} config={{colorTheme:"dark",isTransparent:true,width:"100%",height:540,locale:"en",importanceFilter:"0,1",countryFilter:"us,eu,gb,jp,ca,au,nz,ch"}} />
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHead}><h2>Forex Cross Rates</h2><span className={styles.badge}>LIVE MARKET VIEW</span></div>
        <TradingViewWidget script="embed-widget-forex-cross-rates.js" minHeight={560} config={{width:"100%",height:540,currencies:["EUR","USD","JPY","GBP","CHF","AUD","CAD","NZD"],isTransparent:true,colorTheme:"dark",locale:"en",backgroundColor:"#0f131a"}} />
      </section>
    </div>

    <section className={styles.panel}>
      <div className={styles.panelHead}><h2>Trade Journal</h2><div className={styles.actions}><button className={styles.button} onClick={exportCsv}>CSV Export</button><button className={styles.danger} onClick={()=>setJournal([])}>Clear</button></div></div>
      <div className={styles.journalStats}>
        <div><small>TRADES</small><strong>{journalStats.count}</strong></div>
        <div><small>WIN RATE</small><strong>{fmt(journalStats.winRate,1)}%</strong></div>
        <div><small>NET R</small><strong>{fmt(journalStats.net,2)}R</strong></div>
        <div><small>AVG R</small><strong>{fmt(journalStats.avg,2)}R</strong></div>
      </div>
      <div className={styles.journalForm}>
        <input type="datetime-local" value={journalTime} onChange={e=>setJournalTime(e.target.value)}/>
        <select value={journalPair} onChange={e=>setJournalPair(e.target.value)}>{pairs.map(p=><option key={p}>{p}</option>)}</select>
        <select value={journalSide} onChange={e=>setJournalSide(e.target.value as Side)}><option>LONG</option><option>SHORT</option></select>
        <input placeholder="Lots" value={journalLots} onChange={e=>setJournalLots(e.target.value)}/>
        <input placeholder="Entry" value={journalEntry} onChange={e=>setJournalEntry(e.target.value)}/>
        <input placeholder="Stop" value={journalStop} onChange={e=>setJournalStop(e.target.value)}/>
        <input placeholder="Target" value={journalTarget} onChange={e=>setJournalTarget(e.target.value)}/>
        <input placeholder="Result R (ex: 1.5 / -1)" value={journalR} onChange={e=>setJournalR(e.target.value)}/>
        <textarea placeholder="진입 이유 · 세션 · 뉴스 · 실수 · 복기" value={journalNote} onChange={e=>setJournalNote(e.target.value)}/>
      </div>
      <div className={styles.actions}><button className={styles.buttonPrimary} onClick={addJournal}>Save Trade</button></div>

      {journal.length?<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>TIME</th><th>PAIR</th><th>SIDE</th><th>ENTRY</th><th>STOP</th><th>TARGET</th><th>LOTS</th><th>R</th><th>NOTE</th><th></th></tr></thead><tbody>{journal.map(row=><tr key={row.id}><td>{row.time}</td><td>{row.pair}</td><td>{row.side}</td><td>{row.entry}</td><td>{row.stop}</td><td>{row.target}</td><td>{row.lots}</td><td>{row.resultR}</td><td>{row.note}</td><td><button className={styles.danger} onClick={()=>setJournal(rows=>rows.filter(r=>r.id!==row.id))}>×</button></td></tr>)}</tbody></table></div>:<div className={styles.empty}>저장된 트레이드가 없습니다.</div>}
    </section>

    <div className={styles.disclaimer}>TradingView 위젯의 시세·캘린더는 제3자 데이터이며 지연될 수 있습니다. 주문 전에는 사용하는 브로커의 실시간 호가·스프레드·증거금 조건을 확인해야 합니다.</div>
  </div>
}
