import Link from "next/link";
import { PageStudyControls } from "@/features/study/study-controls";
import styles from "./book.module.css";

export function BookReaderBar({
  page,
  kind,
  previousHref,
  nextHref,
}: {
  page: number;
  kind: string;
  previousHref?: string;
  nextHref?: string;
}) {
  return (
    <div className={styles.readerBar}>
      <div className={styles.readerBarLeft}>
        <Link href="/book" className={styles.backLink}>← Book index</Link>
        <span className={styles.pill}>SOURCE PAGE {String(page).padStart(3, "0")}</span>
        <span className={styles.pill + " " + styles.pillStrong}>BUILT</span>
      </div>

      <div className={styles.readerBarRight}>
        {previousHref ? <Link href={previousHref} className={styles.pageNavLink}>← Prev</Link> : <span className={styles.pageNavDisabled}>← Prev</span>}
        <span className={styles.pill}>{kind.toUpperCase()}</span>
        <span className={styles.pill}>{String(page).padStart(3, "0")} / 406</span>
        {nextHref ? <Link href={nextHref} className={styles.pageNavLink}>Next →</Link> : <span className={styles.pageNavDisabled}>Next →</span>}
      </div>

      <PageStudyControls page={page} maxBuiltPage={6} />
    </div>
  );
}
