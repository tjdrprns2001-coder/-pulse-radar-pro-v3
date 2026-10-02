"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./study.module.css";

type StudyState = {
  complete: boolean;
  bookmarked: boolean;
  note: string;
};

const defaultState: StudyState = { complete: false, bookmarked: false, note: "" };

function key(page: number) {
  return "forex-book-lab:study:" + page;
}

export function PageStudyControls({
  page,
  maxBuiltPage,
}: {
  page: number;
  maxBuiltPage: number;
}) {
  const [state, setState] = useState<StudyState>(defaultState);
  const [showNote, setShowNote] = useState(false);
  const [jump, setJump] = useState(String(page));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key(page));
      if (raw) setState({ ...defaultState, ...JSON.parse(raw) });
    } catch {}
    setReady(true);
  }, [page]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(key(page), JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("forex-book-study-updated", { detail: { page, state } }));
  }, [page, ready, state]);

  const noteCount = useMemo(() => state.note.trim().length, [state.note]);

  function go(e: FormEvent) {
    e.preventDefault();
    const n = Math.max(1, Math.min(maxBuiltPage, Number(jump) || page));
    window.location.href = "/book/" + n + "/";
  }

  return (
    <div className={styles.controls}>
      <div className={styles.controlRow}>
        <button
          className={state.complete ? styles.activeButton : styles.button}
          onClick={() => setState((s) => ({ ...s, complete: !s.complete }))}
          type="button"
        >
          {state.complete ? "✓ 학습완료" : "학습완료"}
        </button>

        <button
          className={state.bookmarked ? styles.activeButton : styles.button}
          onClick={() => setState((s) => ({ ...s, bookmarked: !s.bookmarked }))}
          type="button"
        >
          {state.bookmarked ? "★ 북마크됨" : "☆ 북마크"}
        </button>

        <button
          className={showNote ? styles.activeButton : styles.button}
          onClick={() => setShowNote((v) => !v)}
          type="button"
        >
          메모 {noteCount ? "(" + noteCount + ")" : ""}
        </button>

        <form className={styles.jumpForm} onSubmit={go}>
          <input
            aria-label="페이지 이동"
            min={1}
            max={maxBuiltPage}
            type="number"
            value={jump}
            onChange={(e) => setJump(e.target.value)}
          />
          <button type="submit">이동</button>
        </form>
      </div>

      {showNote ? (
        <textarea
          className={styles.note}
          value={state.note}
          onChange={(e) => setState((s) => ({ ...s, note: e.target.value }))}
          placeholder="이 페이지에서 기억할 내용, 질문, 매매 아이디어를 적어두세요."
          rows={4}
        />
      ) : null}
    </div>
  );
}
