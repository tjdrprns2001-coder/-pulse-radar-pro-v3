"use client";

import { useEffect, useMemo, useState } from "react";
import { TradingViewWidget } from "@/features/live/tradingview-widget";
import styles from "./execution.module.css";

type Bias="BULL"|"BEAR"|"NEUTRAL";
type Session="Tokyo"|"London"|"New York"|"All";
type ChecklistKey="calendar"|"levels"|"bias"|"risk"|"session"|"sleep";

type DayPlan={
  date:string;
  bias:Bias;
  session:Session;
  maxRisk:string;
  maxTrades:string;
  dailyStopR:string;
  pairs:string[];
  note:string;
  noTradeStart:string;
  noTradeEnd:string;
  checklist:Record<ChecklistKey,boolean>;
};

type JournalRow={
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

type QueueItem={
  id:number;
  createdAt:string;
  pair:string;
  setup:string;
  bias:string;
  session:string;
  level:string;
  invalidation:string;
  target:string;
  status:string;
  note:string;
};

const pairList=["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","NZDUSD","USDCAD","EURJPY","GBPJPY","EURGBP"];
const checks: Array<[ChecklistKey,string,string]> = [
  ["calendar","Economic calendar","고영향 이벤트와 발표 시간을 확인"],
  ["levels","Key levels","PDH/PDL·Asia range·핵심 지지저항 확인"],
  ["bias","Daily bias","1D/4H 방향과 오늘 시나리오 일치"],
  ["risk","Risk limits","최대 일손실·거래당 risk·최대 거래 수 설정"],
  ["session","Session plan","오늘 거래할 세션을 명확히 정함"],
  ["sleep","Condition check","피로·감정·충동 상태를 확인"],
];

function todayKey(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return y+"-"+m+"-"+day;
}

function n(v:string|number){
  const x=Number(v);
  return Number.isFinite(x)?x:0;
}

function fmt(v:number,d=2){
  return Number.isFinite(v)?v.toLocaleString(undefined,{maximumFractionDigits:d}):"—";
}

function defaultPlan():DayPlan{
  return {
    date:todayKey(),
    bias:"NEUTRAL",
    session:"London",
    maxRisk:"1",
    maxTrades:"3",
    dailyStopR:"3",
    pairs:["EURUSD","GBPUSD","USDJPY"],
    note:"",
    noTradeStart:"",
    noTradeEnd:"",
    checklist:{calendar:false,levels:false,bias:false,risk:false,session:false,sleep:false}
  };
}

export function DailyPlan(){
  const [plan,setPlan]=useState<DayPlan>(defaultPlan());
  const [journal,setJournal]=useState<JournalRow[]>([]);
  const [queue,setQueue]=useState<QueueItem[]>([]);
  const [saved,setSaved]=useState(false);

  useEffect(()=>{
    try{
      const key="forex-execution-desk:daily-plan:"+todayKey();
      const raw=localStorage.getItem(key);
      if(raw) setPlan(JSON.parse(raw));
      const j=localStorage.getItem("forex-execution-desk:journal");
      if(j) setJournal(JSON.parse(j));
      const q=localStorage.getItem("forex-execution-desk:playbook-queue");
      if(q) setQueue(JSON.parse(q));
    }catch{}
  },[]);

  const todayTrades=useMemo(
    ()=>journal.filter(r=>String(r.time||"").slice(0,10)===plan.date),
    [journal,plan.date]
  );

  const todayR=todayTrades.reduce((s,r)=>s+n(r.resultR),0);
  const losing=Math.min(0,todayR);
  const dailyStopped=losing<=-Math.abs(n(plan.dailyStopR));
  const tradeLimitReached=todayTrades.length>=Math.max(1,n(plan.maxTrades));
  const checklistDone=checks.filter(([id])=>plan.checklist[id]).length;
  const readiness=Math.round(checklistDone/checks.length*100);
  const armed=queue.filter(q=>q.status==="ARMED"||q.status==="TRIGGERED");
  const activeCandidates=armed.filter(q=>plan.pairs.includes(q.pair));
  const hardBlocked=dailyStopped||tradeLimitReached;

  function patch<K extends keyof DayPlan>(key:K,value:DayPlan[K]){
    setPlan(p=>({...p,[key]:value}));
    setSaved(false);
  }

  function togglePair(pair:string){
    patch("pairs",plan.pairs.includes(pair)?plan.pairs.filter(p=>p!==pair):[...plan.pairs,pair]);
  }

  function save(){
    localStorage.setItem("forex-execution-desk:daily-plan:"+plan.date,JSON.stringify(plan));
    setSaved(true);
  }

  function reset(){
    const next=defaultPlan();
    setPlan(next);
    setSaved(false);
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.hero}>
        <div className={styles.eyebrow}>DAILY TRADING PLAN</div>
        <h1>Plan the Day Before the Trade</h1>
        <p>그날의 방향·세션·뉴스·감시 통화쌍·리스크 한도를 먼저 고정하고, Playbook Queue와 Journal 상태를 함께 보면서 신규 진입 가능 여부를 결정합니다.</p>
      </header>

      <section className={styles.panel}>
        <div className={styles.head}>
          <h2>Daily Guard</h2>
          <span className={hardBlocked?styles.badgeWarn:readiness===100?styles.badgeOk:styles.badge}>
            {hardBlocked?"STOP NEW TRADES":readiness===100?"PLAN READY":"PLAN INCOMPLETE"}
          </span>
        </div>

        <div className={styles.guard}>
          <article><small>TODAY TRADES</small><strong>{todayTrades.length} / {plan.maxTrades}</strong></article>
          <article><small>TODAY P/L</small><strong>{fmt(todayR,2)}R</strong></article>
          <article><small>DAILY STOP</small><strong>-{Math.abs(n(plan.dailyStopR))}R</strong></article>
          <article><small>READINESS</small><strong>{readiness}%</strong></article>
        </div>

        <div className={hardBlocked?styles.guardBlock:styles.guardOk}>
          {dailyStopped
            ? "일손실 제한 도달: 오늘 신규 위험 중단"
            : tradeLimitReached
            ? "일 최대 거래 수 도달: 오늘 신규 진입 중단"
            : readiness<100
            ? "신규 진입 전 Daily Checklist 완료 필요"
            : "오늘의 거래 계획이 준비되어 있음"}
        </div>
      </section>

      <div className={styles.grid2}>
        <section className={styles.panel}>
          <div className={styles.head}><h2>Core Plan</h2><span className={saved?styles.badgeOk:styles.badge}>LOCAL SAVE</span></div>

          <div className={styles.fields}>
            <label className={styles.field}>Date<input type="date" value={plan.date} onChange={e=>patch("date",e.target.value)}/></label>
            <label className={styles.field}>Bias<select value={plan.bias} onChange={e=>patch("bias",e.target.value as Bias)}><option>BULL</option><option>BEAR</option><option>NEUTRAL</option></select></label>
            <label className={styles.field}>Session<select value={plan.session} onChange={e=>patch("session",e.target.value as Session)}><option>Tokyo</option><option>London</option><option>New York</option><option>All</option></select></label>
            <label className={styles.field}>Risk / trade %<input value={plan.maxRisk} onChange={e=>patch("maxRisk",e.target.value)}/></label>
            <label className={styles.field}>Max trades<input value={plan.maxTrades} onChange={e=>patch("maxTrades",e.target.value)}/></label>
            <label className={styles.field}>Daily stop R<input value={plan.dailyStopR} onChange={e=>patch("dailyStopR",e.target.value)}/></label>
            <label className={styles.field}>No-trade from<input type="time" value={plan.noTradeStart} onChange={e=>patch("noTradeStart",e.target.value)}/></label>
            <label className={styles.field}>No-trade until<input type="time" value={plan.noTradeEnd} onChange={e=>patch("noTradeEnd",e.target.value)}/></label>
          </div>

          <textarea className={styles.textarea} value={plan.note} onChange={e=>patch("note",e.target.value)} placeholder="오늘 핵심 시나리오 · 뉴스 리스크 · 기다릴 가격 · 절대 하지 않을 행동"/>

          <div className={styles.actions}>
            <button className={styles.btnPrimary} onClick={save}>Save Daily Plan</button>
            <button className={styles.btn} onClick={reset}>Reset</button>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.head}><h2>Daily Checklist</h2><span className={readiness===100?styles.badgeOk:styles.badgeWarn}>{checklistDone}/{checks.length}</span></div>

          <div className={styles.checklist}>
            {checks.map(([id,title,desc],i)=>(
              <button
                key={id}
                className={plan.checklist[id]?styles.checkOn:styles.check}
                onClick={()=>patch("checklist",{...plan.checklist,[id]:!plan.checklist[id]})}
              >
                <span>{plan.checklist[id]?"✓":String(i+1).padStart(2,"0")}</span>
                <div><strong>{title}</strong><small>{desc}</small></div>
              </button>
            ))}
          </div>

          <div className={styles.score}><strong>{readiness}%</strong><div className={styles.meter}><i style={{width:readiness+"%"}}/></div></div>
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.head}><h2>Today Watchlist</h2><span className={styles.badge}>{plan.pairs.length} PAIRS</span></div>
        <div className={styles.watchGrid}>
          {pairList.map(pair=>(
            <button key={pair} className={plan.pairs.includes(pair)?styles.watchActive:styles.watchCard} onClick={()=>togglePair(pair)}>
              <strong>{pair}</strong>
              <span>{plan.pairs.includes(pair)?"IN PLAN":"ADD"}</span>
            </button>
          ))}
        </div>
      </section>

      <div className={styles.grid2}>
        <section className={styles.panel}>
          <div className={styles.head}><h2>Playbook Candidates</h2><span className={styles.badge}>{activeCandidates.length} MATCH</span></div>
          {activeCandidates.length ? (
            <div className={styles.playbookQueue}>
              {activeCandidates.map(item=>(
                <article key={item.id} className={styles.queueCard}>
                  <div className={styles.head}>
                    <div><div className={styles.eyebrow}>{item.bias} · {item.session}</div><h2>{item.pair}</h2></div>
                    <span className={item.status==="TRIGGERED"?styles.badgeOk:styles.badge}>{item.status}</span>
                  </div>
                  <div className={styles.planGrid}>
                    <div><small>SETUP</small><strong>{item.setup}</strong></div>
                    <div><small>TRIGGER</small><strong>{item.level||"—"}</strong></div>
                    <div><small>INVALIDATION</small><strong>{item.invalidation||"—"}</strong></div>
                    <div><small>TARGET</small><strong>{item.target||"—"}</strong></div>
                  </div>
                </article>
              ))}
            </div>
          ) : <div className={styles.empty}>오늘 Watchlist와 일치하는 ARMED/TRIGGERED 셋업이 없습니다.</div>}
        </section>

        <section className={styles.panel}>
          <div className={styles.head}><h2>Today Journal</h2><span className={todayR>=0?styles.badgeOk:styles.badgeWarn}>{fmt(todayR,2)}R</span></div>
          {todayTrades.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>TIME</th><th>PAIR</th><th>SIDE</th><th>R</th><th>NOTE</th></tr></thead>
                <tbody>{todayTrades.map(t=><tr key={t.id}><td>{t.time}</td><td>{t.pair}</td><td>{t.side}</td><td>{t.resultR}</td><td>{t.note}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <div className={styles.empty}>오늘 기록된 거래가 없습니다.</div>}
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.head}><h2>Economic Calendar</h2><span className={styles.badgeWarn}>CHECK BEFORE ENTRY</span></div>
        <TradingViewWidget
          script="embed-widget-events.js"
          minHeight={620}
          config={{
            colorTheme:"dark",
            isTransparent:true,
            width:"100%",
            height:600,
            locale:"en",
            importanceFilter:"0,1",
            countryFilter:"us,eu,gb,jp,ca,au,nz,ch"
          }}
        />
      </section>
    </div>
  );
}
