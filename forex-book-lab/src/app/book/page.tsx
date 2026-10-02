import Link from "next/link";
import { BOOK_TOTAL_PAGES } from "@/features/book/book-manifest";
import styles from "@/features/book/book.module.css";

export default function BookPage() {
  return (
    <section className={styles.library}>
      <header className={styles.libraryHeader}>
        <div className={styles.eyebrow}>PAGE-BY-PAGE BUILD</div>
        <h1 className={styles.libraryTitle}>Forex Book</h1>
        <p className={styles.libraryLead}>
          원본을 한 페이지씩 확인하고 완성한 뒤에만 다음 페이지로 넘어갑니다.
          현재는 Page 1 표지만 완성된 상태입니다.
        </p>
      </header>

      <div className={styles.progressRow}>
        <div className={styles.progressTrack} aria-label="Book implementation progress">
          <div className={styles.progressFill} />
        </div>
        <div className={styles.progressText}>1 / {BOOK_TOTAL_PAGES} complete</div>
      </div>

      <Link href="/book/1" className={styles.pageCard}>
        <div className={styles.thumb} aria-hidden="true">
          <div>
            ALL YOU<br />SHOULD KNOW
            <span>FOREX</span>
          </div>
        </div>
        <div className={styles.cardCopy}>
          <div className={styles.cardMeta}>PAGE 001 · COVER · COMPLETE</div>
          <h2 className={styles.cardTitle}>All You Should Know About Forex</h2>
          <p className={styles.cardDescription}>
            원본 표지의 타이포그래피와 금융 차트 모티프를 반응형 벡터 UI로 재구성했습니다.
          </p>
        </div>
        <span className={styles.openButton}>Open page →</span>
      </Link>
    </section>
  );
}
