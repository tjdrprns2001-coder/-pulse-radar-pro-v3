import Link from "next/link";
import { BOOK_PAGES, BOOK_TOTAL_PAGES } from "@/features/book/book-manifest";
import styles from "@/features/book/book.module.css";

export default function BookPage() {
  const complete = BOOK_PAGES.filter((page) => page.status === "complete").length;
  const progress = Math.max(1, (complete / BOOK_TOTAL_PAGES) * 100);

  return (
    <section className={styles.library}>
      <header className={styles.libraryHeader}>
        <div className={styles.eyebrow}>PAGE-BY-PAGE BUILD</div>
        <h1 className={styles.libraryTitle}>Forex Book</h1>
        <p className={styles.libraryLead}>
          원본을 한 페이지씩 직접 확인하고, 구현과 빌드 검증이 끝난 페이지만 활성화합니다.
          현재 Page 1–5까지 완성했습니다.
        </p>
      </header>

      <div className={styles.progressRow}>
        <div className={styles.progressTrack} aria-label="Book implementation progress">
          <div className={styles.progressFill} style={{ width: progress + "%" }} />
        </div>
        <div className={styles.progressText}>{complete} / {BOOK_TOTAL_PAGES} complete</div>
      </div>

      <div className={styles.pageCards}>
        {BOOK_PAGES.map((page) => (
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
                  <>
                    ALL YOU<br />SHOULD KNOW
                    <span>FOREX</span>
                  </>
                ) : (
                  <>
                    PAGE {String(page.number).padStart(3, "0")}
                    <span>{page.title.toUpperCase()}</span>
                  </>
                )}
              </div>
            </div>

            <div className={styles.cardCopy}>
              <div className={styles.cardMeta}>
                PAGE {String(page.number).padStart(3, "0")} · {page.kind.toUpperCase()} · COMPLETE
              </div>
              <h2 className={styles.cardTitle}>{page.title}</h2>
              <p className={styles.cardDescription}>{page.summary}</p>
            </div>

            <span className={styles.openButton}>Open page →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
