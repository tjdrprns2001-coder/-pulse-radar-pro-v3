"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "@/features/book/book.module.css";
import study from "./study.module.css";

export type IndexPage = {
  number: number;
  slug: string;
  title: string;
  kind: "cover" | "lesson" | "contents";
  summary: string;
};

type LocalState = { complete?: boolean; bookmarked?: boolean };

const glossary = [
  ["Forex", "Foreign Exchange. 서로 다른 통화를 교환하는 외환시장."],
  ["Currency pair", "두 통화의 상대가치를 표시하는 표기. 예: EUR/USD."],
  ["Base currency", "통화쌍의 앞쪽 통화."],
  ["Quote currency", "통화쌍의 뒤쪽 통화."],
  ["Pip", "환율 움직임을 측정하는 표준 단위."],
  ["Lot", "Forex 포지션 크기의 표준 단위."],
  ["Spread", "Bid와 Ask 가격의 차이."],
  ["Leverage", "증거금보다 큰 명목 포지션을 제어하는 구조."],
  ["Margin", "레버리지 포지션을 유지하기 위해 필요한 증거금."],
  ["Stop loss", "손실 제한을 위해 미리 지정하는 청산 가격."],
  ["Take profit", "목표 이익 실현을 위해 지정하는 가격."],
  ["Risk-reward", "감수하는 위험 대비 기대 보상의 비율."],
  ["Drawdown", "계좌 고점 대비 자산 감소 폭."],
  ["Bull market", "가격이 상승하는 시장 환경."],
  ["Bear market", "가격이 하락하는 시장 환경."],
  ["Fakeout", "돌파처럼 보였지만 가격이 다시 기존 범위로 돌아오는 움직임."],
  ["Technical analysis", "가격·거래량·패턴을 이용해 시장을 해석하는 방법."],
  ["Fundamental analysis", "경제지표·금리·정책·뉴스 등을 이용해 가치를 분석하는 방법."],
];

function loadPageState(page: number): LocalState {
  try {
    return JSON.parse(localStorage.getItem("forex-book-lab:study:" + page) || "{}");
  } catch {
    return {};
  }
}

export function BookIndexClient({
  pages,
  totalPages,
}: {
  pages: IndexPage[];
  totalPages: number;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "bookmarked" | "complete">("all");
  const [states, setStates] = useState<Record<number, LocalState>>({});
  const [glossaryQuery, setGlossaryQuery] = useState("");

  useEffect(() => {
    const refresh = () => {
      const next: Record<number, LocalState> = {};
      for (const page of pages) next[page.number] = loadPageState(page.number);
      setStates(next);
    };
    refresh();
    window.addEventListener("forex-book-study-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("forex-book-study-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [pages]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pages.filter((page) => {
      const state = states[page.number] || {};
      if (filter === "bookmarked" && !state.bookmarked) return false;
      if (filter === "complete" && !state.complete) return false;
      if (!q) return true;
      return (page.title + " " + page.summary + " " + page.number).toLowerCase().includes(q);
    });
  }, [filter, pages, query, states]);

  const studied = pages.filter((page) => states[page.number]?.complete).length;
  const builtProgress = Math.max(1, (pages.length / totalPages) * 100);
  const studyProgress = pages.length ? (studied / pages.length) * 100 : 0;

  const glossaryResults = glossary.filter(([term, def]) =>
    (term + " " + def).toLowerCase().includes(glossaryQuery.trim().toLowerCase())
  );

  return (
    <section className={styles.library}>
      <header className={styles.libraryHeader}>
        <div className={styles.eyebrow}>INTERACTIVE BOOK</div>
        <h1 className={styles.libraryTitle}>Forex Book</h1>
        <p className={styles.libraryLead}>
          원본 페이지, 학습 진행률, 북마크, 개인 메모, 검색과 Glossary를 한 곳에서 관리합니다.
        </p>
      </header>

      <div className={styles.progressRow}>
        <div>
          <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: builtProgress + "%" }} /></div>
          <div className={study.progressCaption}>구현 {pages.length} / {totalPages}</div>
        </div>
        <div>
          <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: studyProgress + "%" }} /></div>
          <div className={study.progressCaption}>학습완료 {studied} / {pages.length}</div>
        </div>
      </div>

      <div className={study.searchPanel}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="페이지 제목·주제·번호 검색" />
        <div className={study.filterRow}>
          {(["all","bookmarked","complete"] as const).map((value) => (
            <button
              key={value}
              className={filter === value ? study.filterActive : study.filterButton}
              onClick={() => setFilter(value)}
            >
              {value === "all" ? "전체" : value === "bookmarked" ? "북마크" : "학습완료"}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.pageCards}>
        {filtered.map((page) => (
          <Link href={"/book/" + page.slug} className={styles.pageCard} key={page.number}>
            <div
              className={
                page.kind === "cover"
                  ? styles.thumb
                  : page.kind === "contents"
                    ? styles.thumb + " " + styles.thumbContents
                    : styles.thumb + " " + styles.thumbLesson
              }
              aria-hidden="true"
            >
              <div>
                {page.kind === "cover" ? (
                  <>ALL YOU<br />SHOULD KNOW<span>FOREX</span></>
                ) : (
                  <>PAGE {String(page.number).padStart(3, "0")}<span>{page.title.toUpperCase()}</span></>
                )}
              </div>
            </div>

            <div className={styles.cardCopy}>
              <div className={styles.cardMeta}>
                PAGE {String(page.number).padStart(3, "0")} · {page.kind.toUpperCase()}
                {states[page.number]?.complete ? " · ✓ STUDIED" : ""}
                {states[page.number]?.bookmarked ? " · ★" : ""}
              </div>
              <h2 className={styles.cardTitle}>{page.title}</h2>
              <p className={styles.cardDescription}>{page.summary}</p>
            </div>
            <span className={styles.openButton}>Open →</span>
          </Link>
        ))}
      </div>

      <section className={study.glossary}>
        <div className={styles.eyebrow}>GLOSSARY</div>
        <h2>용어 검색</h2>
        <input
          value={glossaryQuery}
          onChange={(e) => setGlossaryQuery(e.target.value)}
          placeholder="pip, lot, margin, fakeout..."
        />
        <div className={study.glossaryGrid}>
          {glossaryResults.map(([term, def]) => (
            <article key={term}>
              <strong>{term}</strong>
              <p>{def}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
