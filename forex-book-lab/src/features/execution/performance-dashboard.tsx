"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./execution.module.css";

type Row = {
  id:number;
  time:string;
  pair:string;
  side:string;
  entry:string;
  stop:string;
  target:string;
  lots:string;
  resultR:string;
  note:string;
};

function n(v:string|number){
  const x=Number(v);
  return Number.isFinite(x)?x:0;
}

function fmt(v:number,d=2){
  return Number.isFinite(v)?v.toLocaleString(undefined,{maximumFractionDigits:d}):"—";
}

export function PerformanceDashboard(){
  const [rows,setRows]=useState<Row[]>([]);
  const [pairFilter,setPairFilter]=useState("ALL");
  const [sideFilter,setSideFilter]=useState("ALL");
  const [dailyLossLimit,setDailyLossLimit]=useState("3");
  const [currentDailyR,setCurrentDailyR]=useState("0");
  const [maxConsecutiveLosses,setMaxConsecutiveLosses]=useState("3");

  useEffect(()=>{
    try{
      const raw=localStorage.getItem("forex-execution-desk:journal");
      if(raw) setRows(JSON.parse(raw));
    }catch{}
  },[]);

  const filtered=useMemo(
    ()=>rows.filter(r=>(pairFilter==="ALL"||r.pair===pairFilter)&&(sideFilter==="ALL"||r.side===sideFilter)),
    [rows,pairFilter,sideFilter]
  );

  const stats=useMemo(()=>{
    const done=filtered.filter(r=>r.resultR.trim()!=="");
    const rs=done.map(r=>n(r.resultR));
    const wins=rs.filter(x=>x>0);
    const losses=rs.filter(x=>x<0);
    const net=rs.reduce((a,b)=>a+b,0);
    const avg=rs.length?net/rs.length:0;
    const grossWin=wins.reduce((a,b)=>a+b,0);
    const grossLoss=Math.abs(losses.reduce((a,b)=>a+b,0));
    const pf=grossLoss>0?grossWin/grossLoss:(grossWin>0?Infinity:0);

    let equity=0;
    let peak=0;
    let maxDd=0;
    let lossStreak=0;
    let maxLossStreak=0;
    const curve=[0];

    for(const r of rs.slice().reverse()){
      equity+=r;
      curve.push(equity);
      peak=Math.max(peak,equity);
      maxDd=Math.max(maxDd,peak-equity);

      if(r<0){
        lossStreak++;
        maxLossStreak=Math.max(maxLossStreak,lossStreak);
      }else{
        lossStreak=0;
      }
    }

    return {
      count:done.length,
      wins:wins.length,
      winRate:done.length?wins.length/done.length*100:0,
      net,
      avg,
      pf,
      maxDd,
      maxLossStreak,
      curve,
      avgWin:wins.length?grossWin/wins.length:0,
      avgLoss:losses.length?grossLoss/losses.length:0
    };
  },[filtered]);

  const pairStats=useMemo(()=>{
    const map:Record<string,{count:number;net:number;wins:number}>={};

    for(const r of rows.filter(x=>x.resultR.trim()!=="")){
      const m=map[r.pair]||(map[r.pair]={count:0,net:0,wins:0});
      m.count++;
      m.net+=n(r.resultR);
      if(n(r.resultR)>0) m.wins++;
    }

    return Object.entries(map).sort((a,b)=>b[1].net-a[1].net);
  },[rows]);

  const pairs=["ALL",...Array.from(new Set(rows.map(r=>r.pair)))];
  const curve=stats.curve;
  const min=Math.min(...curve,0);
  const max=Math.max(...curve,0);
  const span=Math.max(1,max-min);
  const points=curve.map((v,i)=>{
    const x=i/Math.max(1,curve.length-1)*390+5;
    const y=240-((v-min)/span)*210;
    return x+","+y;
  }).join(" ");

  const zeroY=240-((0-min)/span)*210;
  const dailyBlocked=n(currentDailyR)<=-Math.abs(n(dailyLossLimit));
  const streakBlocked=stats.maxLossStreak>=n(maxConsecutiveLosses)&&n(maxConsecutiveLosses)>0;
  const blocked=dailyBlocked||streakBlocked;

  return (
    <div className={styles.wrap}>
      <header className={styles.hero}>
        <div className={styles.eyebrow}>PERFORMANCE & RISK CONTROL</div>
        <h1>Journal Analytics</h1>
        <p>실전 기록에서 승률보다 중요한 Net R, Expectancy, Profit Factor, Drawdown, 연속 손실을 바로 확인합니다.</p>
      </header>

      <section className={styles.panel}>
        <div className={styles.head}>
          <h2>Risk Guard</h2>
          <span className={blocked?styles.badgeWarn:styles.badgeOk}>{blocked?"BLOCK NEW RISK":"RISK OK"}</span>
        </div>

        <div className={styles.fields}>
          <label className={styles.field}>Daily loss limit (R)<input value={dailyLossLimit} onChange={e=>setDailyLossLimit(e.target.value)}/></label>
          <label className={styles.field}>Current daily P/L (R)<input value={currentDailyR} onChange={e=>setCurrentDailyR(e.target.value)}/></label>
          <label className={styles.field}>Max consecutive losses<input value={maxConsecutiveLosses} onChange={e=>setMaxConsecutiveLosses(e.target.value)}/></label>
        </div>

        <div className={styles.guard}>
          <article><small>DAILY P/L</small><strong>{fmt(n(currentDailyR),2)}R</strong></article>
          <article><small>MAX DD</small><strong>{fmt(stats.maxDd,2)}R</strong></article>
          <article><small>LOSS STREAK</small><strong>{stats.maxLossStreak}</strong></article>
          <article><small>STATUS</small><strong>{blocked?"STOP":"ACTIVE"}</strong></article>
        </div>

        <div className={blocked?styles.guardBlock:styles.guardOk}>
          {blocked?"신규 리스크 중단 조건 충족":"신규 진입 검토 가능 범위"}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.head}>
          <h2>Performance</h2>
          <div className={styles.filters}>
            <select value={pairFilter} onChange={e=>setPairFilter(e.target.value)}>
              {pairs.map(p=><option key={p}>{p}</option>)}
            </select>
            <select value={sideFilter} onChange={e=>setSideFilter(e.target.value)}>
              <option>ALL</option>
              <option>LONG</option>
              <option>SHORT</option>
            </select>
          </div>
        </div>

        <div className={styles.statGrid}>
          <div className={styles.stat}><small>TRADES</small><strong>{stats.count}</strong></div>
          <div className={styles.stat}><small>WIN RATE</small><strong>{fmt(stats.winRate,1)}%</strong></div>
          <div className={styles.stat}><small>NET R</small><strong>{fmt(stats.net,2)}R</strong></div>
          <div className={styles.stat}><small>EXPECTANCY</small><strong>{fmt(stats.avg,2)}R</strong></div>
          <div className={styles.stat}><small>PROFIT FACTOR</small><strong>{Number.isFinite(stats.pf)?fmt(stats.pf,2):"∞"}</strong></div>
          <div className={styles.stat}><small>MAX DRAWDOWN</small><strong>{fmt(stats.maxDd,2)}R</strong></div>
          <div className={styles.stat}><small>AVG WIN</small><strong>{fmt(stats.avgWin,2)}R</strong></div>
          <div className={styles.stat}><small>AVG LOSS</small><strong>-{fmt(stats.avgLoss,2)}R</strong></div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.head}>
          <h2>Cumulative R Curve</h2>
          <span className={stats.net>=0?styles.badgeOk:styles.badgeWarn}>{fmt(stats.net,2)}R</span>
        </div>

        {curve.length>1 ? (
          <div className={styles.equity}>
            <svg viewBox="0 0 400 260" preserveAspectRatio="none">
              <line x1="0" y1={zeroY} x2="400" y2={zeroY} stroke="#364152" strokeWidth="1"/>
              <polyline points={points} fill="none" stroke="#d7ff46" strokeWidth="3" vectorEffect="non-scaling-stroke"/>
            </svg>
          </div>
        ) : (
          <div className={styles.empty}>Trade Journal에 Result R을 저장하면 성과 곡선이 생성됩니다.</div>
        )}
      </section>

      <div className={styles.grid2}>
        <section className={styles.panel}>
          <div className={styles.head}><h2>Pair Breakdown</h2></div>
          <div className={styles.pairGrid}>
            {pairStats.length ? pairStats.map(([pair,s])=>(
              <article key={pair}>
                <strong>{pair}</strong>
                <span>{s.count} trades · {fmt(s.net,2)}R · {fmt(s.wins/s.count*100,1)}% win</span>
              </article>
            )) : <div className={styles.empty}>데이터 없음</div>}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.head}><h2>Recent Trades</h2></div>
          {filtered.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>TIME</th><th>PAIR</th><th>SIDE</th><th>LOTS</th><th>R</th><th>NOTE</th></tr></thead>
                <tbody>
                  {filtered.slice(0,12).map(r=>(
                    <tr key={r.id}>
                      <td>{r.time}</td><td>{r.pair}</td><td>{r.side}</td><td>{r.lots}</td><td>{r.resultR}</td><td>{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className={styles.empty}>데이터 없음</div>}
        </section>
      </div>
    </div>
  );
}
