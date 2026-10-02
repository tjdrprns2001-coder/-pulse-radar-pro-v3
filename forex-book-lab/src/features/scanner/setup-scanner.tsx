"use client";

import { useMemo, useState } from "react";
import styles from "./scanner.module.css";

const checks = [
  ["trend", "상위 시간봉 방향 확인", "1D/4H 추세가 현재 아이디어와 충돌하지 않는지 확인"],
  ["structure", "시장 구조 확인", "HH/HL 또는 LH/LL, range 여부를 구분"],
  ["level", "핵심 가격대 확인", "지지·저항·이전 고저점·유동성 구간 확인"],
  ["trigger", "진입 트리거 확인", "돌파/리테스트/캔들 확인 없이 추격하지 않기"],
  ["news", "뉴스/일정 확인", "중앙은행·CPI·고용지표 등 고변동 이벤트 확인"],
  ["risk", "손절과 포지션 크기 계산", "진입 전에 최대 손실액을 먼저 고정"],
  ["rr", "Risk:Reward 확인", "목표가와 손절의 거리 비율을 사전에 계산"],
] as const;

export function SetupScanner() {
  const [state, setState] = useState<Record<string,boolean>>({});
  const [note, setNote] = useState("");
  const completed = checks.filter(([id])=>state[id]).length;
  const score = Math.round(completed / checks.length * 100);
  const status = score === 100 ? "CHECKLIST COMPLETE" : score >= 70 ? "NEAR READY" : score >= 40 ? "INCOMPLETE" : "START CHECK";

  const missing = useMemo(() => checks.filter(([id])=>!state[id]).map(([,title])=>title), [state]);

  return (
    <div className={styles.wrap}>
      <header className={styles.hero}>
        <span>MANUAL SETUP SCANNER</span>
        <h1>Pre-Trade Checklist</h1>
        <p>책에서 배우는 구조·리스크·뉴스 확인을 실제 진입 전 체크리스트로 묶었습니다.</p>
      </header>

      <section className={styles.scoreCard}>
        <div><small>COMPLETENESS</small><strong>{score}%</strong><span>{status}</span></div>
        <div className={styles.meter}><i style={{width:score+"%"}}/></div>
      </section>

      <div className={styles.grid}>
        {checks.map(([id,title,desc],idx)=>(
          <button key={id} className={state[id]?styles.checkOn:styles.checkOff} onClick={()=>setState(s=>({...s,[id]:!s[id]}))}>
            <span>{state[id]?"✓":String(idx+1).padStart(2,"0")}</span>
            <div><strong>{title}</strong><p>{desc}</p></div>
          </button>
        ))}
      </div>

      <section className={styles.summary}>
        <h2>남은 확인</h2>
        {missing.length ? <p>{missing.join(" · ")}</p> : <p>모든 기본 체크를 완료했습니다.</p>}
        <textarea value={note} onChange={e=>setNote(e.target.value)} rows={5} placeholder="셋업 메모 / 무효화 조건 / 뉴스 이벤트 / 진입 이유"/>
      </section>
    </div>
  );
}
