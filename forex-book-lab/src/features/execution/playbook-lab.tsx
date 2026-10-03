"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./execution.module.css";

type Bias="LONG"|"SHORT"|"NEUTRAL";
type Status="WATCHING"|"ARMED"|"TRIGGERED"|"INVALID";

type QueueItem={
  id:number;
  createdAt:string;
  pair:string;
  setup:string;
  bias:Bias;
  session:string;
  level:string;
  invalidation:string;
  target:string;
  status:Status;
  note:string;
};

const presets=[
  {
    name:"London Sweep + Reclaim",
    session:"London",
    bias:"LONG" as Bias,
    minRR:"2",
    rules:[
      ["htf","HTF bias","1D/4H 방향 또는 주요 discount/premium 위치 확인"],
      ["liquidity","Liquidity sweep","Asia high/low 또는 전일 고저점 sweep 확인"],
      ["reclaim","Reclaim","15m 종가 기준 sweep 레벨 재진입"],
      ["trigger","5m trigger","5m 구조 전환·retest·candle trigger 확인"],
      ["risk","Risk fixed","진입 전에 Stop과 최대손실액 확정"],
      ["news","News clear","고영향 뉴스 직전 진입 아님"],
    ]
  },
  {
    name:"Breakout + Retest",
    session:"London / New York",
    bias:"LONG" as Bias,
    minRR:"2",
    rules:[
      ["structure","Structure","상위 구조와 breakout 방향 일치"],
      ["close","Confirmed close","핵심 레벨 밖에서 종가 마감"],
      ["retest","Retest","돌파 레벨 재시험 후 유지"],
      ["momentum","Momentum","실행 TF에서 follow-through 확인"],
      ["risk","Risk fixed","Stop이 breakout invalidation 뒤에 위치"],
      ["news","News clear","이벤트 직전 추격 아님"],
    ]
  },
  {
    name:"Trend Pullback",
    session:"London / New York",
    bias:"LONG" as Bias,
    minRR:"2",
    rules:[
      ["trend","Trend intact","4H/1H HH/HL 또는 LH/LL 유지"],
      ["pullback","Pullback","중간값·이평·이전 breakout level 쪽 눌림"],
      ["hold","Hold","구조 저점/고점 훼손 없이 반응"],
      ["trigger","Trigger","15m/5m 재가속 확인"],
      ["risk","Risk fixed","구조 invalidation 기준 Stop"],
      ["rr","R:R","다음 liquidity까지 최소 R:R 확보"],
    ]
  },
  {
    name:"Range Fakeout",
    session:"Any liquid session",
    bias:"NEUTRAL" as Bias,
    minRR:"1.5",
    rules:[
      ["range","Range defined","Range high/low가 명확"],
      ["sweep","Boundary sweep","경계 밖 liquidity sweep 발생"],
      ["return","Return inside","다시 range 안으로 종가 복귀"],
      ["trigger","Trigger","하위 TF 반전 구조 확인"],
      ["target","Target","중앙값 또는 반대편 range target 정의"],
      ["risk","Risk fixed","sweep extreme 뒤 Stop"],
    ]
  },
] as const;

const pairs=["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","NZDUSD","USDCAD","EURJPY","GBPJPY","EURGBP"];
const sessions=["Tokyo","London","New York","London / New York","Any liquid session"];
const statuses:Status[]=["WATCHING","ARMED","TRIGGERED","INVALID"];

function fmt(v:number,d=0){
  return Number.isFinite(v)?v.toLocaleString(undefined,{maximumFractionDigits:d}):"—";
}

export function PlaybookLab(){
  const [presetIndex,setPresetIndex]=useState(0);
  const preset=presets[presetIndex];
  const [pair,setPair]=useState("EURUSD");
  const [bias,setBias]=useState<Bias>(preset.bias);
  const [session,setSession]=useState<string>(preset.session);
  const [minRR,setMinRR]=useState<string>(preset.minRR);
  const [checks,setChecks]=useState<Record<string,boolean>>({});
  const [level,setLevel]=useState("");
  const [invalidation,setInvalidation]=useState("");
  const [target,setTarget]=useState("");
  const [note,setNote]=useState("");
  const [queue,setQueue]=useState<QueueItem[]>([]);
  const [filter,setFilter]=useState<Status|"ALL">("ALL");

  useEffect(()=>{
    try{
      const raw=localStorage.getItem("forex-execution-desk:playbook-queue");
      if(raw) setQueue(JSON.parse(raw));
    }catch{}
  },[]);

  useEffect(()=>{
    try{localStorage.setItem("forex-execution-desk:playbook-queue",JSON.stringify(queue))}catch{}
  },[queue]);

  useEffect(()=>{
    setBias(preset.bias);
    setSession(preset.session);
    setMinRR(preset.minRR);
    setChecks({});
  },[presetIndex]);

  const done=preset.rules.filter(([id])=>checks[id]).length;
  const score=Math.round(done/preset.rules.length*100);
  const ready=score===100 && !!level && !!invalidation && !!target;

  const filtered=useMemo(
    ()=>queue.filter(q=>filter==="ALL"||q.status===filter),
    [queue,filter]
  );

  const stats=useMemo(()=>{
    const watching=queue.filter(q=>q.status==="WATCHING").length;
    const armed=queue.filter(q=>q.status==="ARMED").length;
    const triggered=queue.filter(q=>q.status==="TRIGGERED").length;
    const invalid=queue.filter(q=>q.status==="INVALID").length;
    return {watching,armed,triggered,invalid};
  },[queue]);

  function addQueue(){
    const item:QueueItem={
      id:Date.now(),
      createdAt:new Date().toISOString(),
      pair,
      setup:preset.name,
      bias,
      session,
      level,
      invalidation,
      target,
      status:ready?"ARMED":"WATCHING",
      note
    };
    setQueue(rows=>[item,...rows]);
    setNote("");
  }

  function updateStatus(id:number,status:Status){
    setQueue(rows=>rows.map(r=>r.id===id?{...r,status}:r));
  }

  function remove(id:number){
    setQueue(rows=>rows.filter(r=>r.id!==id));
  }

  function exportCsv(){
    const header=["createdAt","pair","setup","bias","session","level","invalidation","target","status","note"];
    const body=queue.map(row=>header.map(k=>String(row[k as keyof QueueItem]??"").replaceAll('"','""')).map(v=>'"'+v+'"').join(","));
    const blob=new Blob([[header.join(","),...body].join("\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download="forex-playbook-queue.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.hero}>
        <div className={styles.eyebrow}>SETUP PLAYBOOK</div>
        <h1>Plan Before Trigger</h1>
        <p>시장 보기 전에 셋업 조건·무효화·목표·최소 R:R를 먼저 고정하고, 후보를 WATCHING → ARMED → TRIGGERED → INVALID 상태로 관리합니다.</p>
      </header>

      <section className={styles.panel}>
        <div className={styles.head}>
          <h2>Setup Preset</h2>
          <span className={ready?styles.badgeOk:styles.badgeWarn}>{ready?"ARMED":"NOT READY"}</span>
        </div>

        <div className={styles.playbookPresetGrid}>
          {presets.map((p,i)=>(
            <button key={p.name} className={i===presetIndex?styles.presetActive:styles.presetCard} onClick={()=>setPresetIndex(i)}>
              <small>{p.session}</small>
              <strong>{p.name}</strong>
              <span>Min R:R {p.minRR}</span>
            </button>
          ))}
        </div>

        <div className={styles.fields}>
          <label className={styles.field}>Pair<select value={pair} onChange={e=>setPair(e.target.value)}>{pairs.map(p=><option key={p}>{p}</option>)}</select></label>
          <label className={styles.field}>Bias<select value={bias} onChange={e=>setBias(e.target.value as Bias)}><option>LONG</option><option>SHORT</option><option>NEUTRAL</option></select></label>
          <label className={styles.field}>Session<select value={session} onChange={e=>setSession(e.target.value)}>{sessions.map(s=><option key={s}>{s}</option>)}</select></label>
          <label className={styles.field}>Min R:R<input value={minRR} onChange={e=>setMinRR(e.target.value)}/></label>
        </div>
      </section>

      <div className={styles.grid2}>
        <section className={styles.panel}>
          <div className={styles.head}><h2>{preset.name} Gate</h2><span className={score===100?styles.badgeOk:styles.badgeWarn}>{score}%</span></div>
          <div className={styles.checklist}>
            {preset.rules.map(([id,title,desc],i)=>(
              <button key={id} className={checks[id]?styles.checkOn:styles.check} onClick={()=>setChecks(s=>({...s,[id]:!s[id]}))}>
                <span>{checks[id]?"✓":String(i+1).padStart(2,"0")}</span>
                <div><strong>{title}</strong><small>{desc}</small></div>
              </button>
            ))}
          </div>
          <div className={styles.score}><strong>{done}/{preset.rules.length}</strong><div className={styles.meter}><i style={{width:score+"%"}}/></div></div>
        </section>

        <section className={styles.panel}>
          <div className={styles.head}><h2>Trade Map</h2><span className={styles.badge}>PRE-TRIGGER</span></div>
          <div className={styles.fields}>
            <label className={styles.field}>Trigger level<input value={level} onChange={e=>setLevel(e.target.value)} placeholder="ex. 1.10250"/></label>
            <label className={styles.field}>Invalidation<input value={invalidation} onChange={e=>setInvalidation(e.target.value)} placeholder="ex. 1.09980"/></label>
            <label className={styles.field}>Target / liquidity<input value={target} onChange={e=>setTarget(e.target.value)} placeholder="ex. PDH / 1.10800"/></label>
            <label className={styles.field}>Required R:R<input value={minRR} onChange={e=>setMinRR(e.target.value)}/></label>
          </div>

          <textarea className={styles.textarea} value={note} onChange={e=>setNote(e.target.value)} placeholder="왜 이 셋업인지 · 기다릴 가격 · 진입 안 할 조건 · 뉴스 시간"/>

          <div className={styles.guard}>
            <article><small>PAIR</small><strong>{pair}</strong></article>
            <article><small>BIAS</small><strong>{bias}</strong></article>
            <article><small>SESSION</small><strong>{session}</strong></article>
            <article><small>MIN R:R</small><strong>{minRR}</strong></article>
          </div>

          <div className={ready?styles.guardOk:styles.guardBlock}>
            {ready?"조건과 가격 지도가 모두 준비됨":"체크리스트 + Trigger + Invalidation + Target이 모두 필요"}
          </div>

          <div className={styles.actions}>
            <button className={styles.btnPrimary} onClick={addQueue}>Add to Queue</button>
          </div>
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.head}>
          <h2>Setup Queue</h2>
          <div className={styles.actions}>
            <button className={styles.btn} onClick={exportCsv}>CSV Export</button>
            <button className={styles.danger} onClick={()=>setQueue([])}>Clear</button>
          </div>
        </div>

        <div className={styles.statGrid}>
          <div className={styles.stat}><small>WATCHING</small><strong>{stats.watching}</strong></div>
          <div className={styles.stat}><small>ARMED</small><strong>{stats.armed}</strong></div>
          <div className={styles.stat}><small>TRIGGERED</small><strong>{stats.triggered}</strong></div>
          <div className={styles.stat}><small>INVALID</small><strong>{stats.invalid}</strong></div>
        </div>

        <div className={styles.filters}>
          {(["ALL","WATCHING","ARMED","TRIGGERED","INVALID"] as const).map(v=>(
            <button key={v} className={filter===v?styles.btnPrimary:styles.btn} onClick={()=>setFilter(v)}>{v}</button>
          ))}
        </div>

        {filtered.length ? (
          <div className={styles.playbookQueue}>
            {filtered.map(item=>(
              <article key={item.id} className={styles.queueCard}>
                <div className={styles.head}>
                  <div>
                    <div className={styles.eyebrow}>{item.bias} · {item.session}</div>
                    <h2>{item.pair} · {item.setup}</h2>
                  </div>
                  <span className={item.status==="ARMED"||item.status==="TRIGGERED"?styles.badgeOk:item.status==="INVALID"?styles.badgeWarn:styles.badge}>{item.status}</span>
                </div>

                <div className={styles.planGrid}>
                  <div><small>TRIGGER</small><strong>{item.level||"—"}</strong></div>
                  <div><small>INVALIDATION</small><strong>{item.invalidation||"—"}</strong></div>
                  <div><small>TARGET</small><strong>{item.target||"—"}</strong></div>
                  <div><small>CREATED</small><strong>{new Date(item.createdAt).toLocaleString()}</strong></div>
                </div>

                {item.note?<div className={styles.note}>{item.note}</div>:null}

                <div className={styles.actions}>
                  {statuses.map(s=><button key={s} className={item.status===s?styles.btnPrimary:styles.btn} onClick={()=>updateStatus(item.id,s)}>{s}</button>)}
                  <button className={styles.danger} onClick={()=>remove(item.id)}>Remove</button>
                </div>
              </article>
            ))}
          </div>
        ) : <div className={styles.empty}>해당 상태의 셋업이 없습니다.</div>}
      </section>

      <section className={styles.panel}>
        <div className={styles.head}><h2>No-Trade Conditions</h2><span className={styles.badgeWarn}>HARD FILTER</span></div>
        <div className={styles.noTradeGrid}>
          <article><strong>뉴스 직전</strong><span>고영향 지표·중앙은행 이벤트 직전 추격 진입 금지</span></article>
          <article><strong>R:R 부족</strong><span>다음 liquidity까지 보상 여유가 최소 기준보다 작으면 제외</span></article>
          <article><strong>HTF 충돌</strong><span>상위 구조와 실행 방향이 정면 충돌하면 셋업 강등</span></article>
          <article><strong>레벨 불명확</strong><span>Stop을 둘 구조적 무효화 지점이 없으면 진입하지 않음</span></article>
          <article><strong>이미 확장</strong><span>트리거 전에 가격이 과도하게 달렸다면 리테스트 전까지 추격 금지</span></article>
          <article><strong>리스크 한도 초과</strong><span>Portfolio open risk 또는 daily loss guard를 넘으면 신규 위험 중단</span></article>
        </div>
      </section>
    </div>
  );
}
