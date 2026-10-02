import { BookReaderBar } from "./book-reader-bar";
import styles from "./book.module.css";

export function LessonPage({
  page,
  title,
  quote,
  quoteAuthor,
  paragraphs,
  takeaways,
  previousHref,
  nextHref,
  nextLabel,
}: {
  page: number;
  title: string;
  quote?: string;
  quoteAuthor?: string;
  paragraphs: string[];
  takeaways: { title: string; body: string }[];
  previousHref?: string;
  nextHref?: string;
  nextLabel?: string;
}) {
  return (
    <div className={styles.reader}>
      <BookReaderBar
        page={page}
        kind="lesson"
        previousHref={previousHref}
        nextHref={nextHref}
      />

      <div className={styles.readerGrid}>
        <section className={styles.lessonStage} aria-label={"Source page " + page}>
          <article className={styles.lessonPaper}>
            <h1 className={styles.lessonTitle}>{title}</h1>

            {quote ? (
              <blockquote className={styles.lessonQuote}>
                “{quote}”
                {quoteAuthor ? <span> - {quoteAuthor}</span> : null}
              </blockquote>
            ) : null}

            <div className={styles.lessonBody}>
              {paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </article>
        </section>

        <aside className={styles.side}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <div className={styles.panelKicker}>SOURCE VERIFIED</div>
                <h2 className={styles.panelTitle}>Page {page} · {title}</h2>
              </div>
              <span className={styles.completeBadge}>DONE</span>
            </div>

            <dl className={styles.factList}>
              <div className={styles.fact}>
                <dt>Page type</dt>
                <dd>Introduction / orientation</dd>
              </div>
              <div className={styles.fact}>
                <dt>Reader level</dt>
                <dd>Forex beginner / novice</dd>
              </div>
              <div className={styles.fact}>
                <dt>Primary purpose</dt>
                <dd>Set expectations, explain the book’s learning goal, and frame Forex as a subject that requires practice and continued learning.</dd>
              </div>
            </dl>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <div className={styles.panelKicker}>CORE TAKEAWAYS</div>
                <h2 className={styles.panelTitle}>이 페이지에서 잡아야 할 것</h2>
              </div>
            </div>

            <div className={styles.takeawayStack}>
              {takeaways.map((item, index) => (
                <div className={styles.takeawayCard} key={item.title}>
                  <span className={styles.takeawayNumber}>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.guardrail}>
            <div className={styles.guardrailLabel}>EXPECTATION GUARDRAIL</div>
            <strong>“Overnight millionaire” 약속을 하지 않는다.</strong>
            <p>
              이 페이지 자체가 빠른 부를 약속하지 않는다고 명시한다. 앞으로의 구현도
              수익 보장보다 구조 이해, 반복 학습, 리스크 통제를 우선한다.
            </p>
          </section>

          <div className={styles.locked}>
            <strong>{nextLabel ?? "Next page locked"}</strong>
            <span>다음 원본 페이지를 확인하고 구현·빌드 검증을 마친 뒤 활성화합니다.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
