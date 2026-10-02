import { BookReaderBar } from "./book-reader-bar";
import styles from "./book.module.css";

const leadingItems = [
  [71, "Economic and trade entities"],
  [73, "Sovereign wealth funds"],
] as const;

const sections = [
  {
    title: "Technical Analysis",
    items: [
      [77, "What is technical analysis?"],
      [78, "Trend line"],
      [80, "Double top"],
      [82, "Falling wedge"],
      [85, "Head and shoulders"],
      [87, "Rising wedge"],
      [90, "Double bottom"],
      [92, "Inverse head and shoulders"],
      [95, "Falling wedge"],
      [97, "Bullish rectangle"],
      [100, "Bullish pennant"],
      [102, "Bearish rectangle"],
      [104, "Bearish pennant"],
      [107, "Triple top"],
      [109, "Triple bottom"],
      [111, "Bearish diamond"],
      [113, "Rounding bottom"],
      [115, "Rounding top"],
      [117, "Cup and handle"],
      [119, "Inverse cup and handle"],
      [121, "Bullish bat"],
      [123, "Bearish bat"],
    ],
  },
  {
    title: "Fundamental Analysis",
    items: [
      [126, "Understanding fundamental analysis"],
      [127, "Economic indicators"],
      [129, "Central bank policies"],
    ],
  },
] as const;

export function Page004Contents() {
  const itemCount =
    leadingItems.length +
    sections.reduce((total, section) => total + section.items.length, 0);

  return (
    <div className={styles.reader}>
      <BookReaderBar
        page={4}
        kind="contents"
        previousHref="/book/3"
      />

      <div className={styles.readerGrid}>
        <section className={styles.lessonStage} aria-label="Source page 4 contents">
          <article className={styles.contentsPaper}>
            <h1 className={styles.contentsTitle}>CONTENTS</h1>

            <div className={styles.contentsSections}>
              <section className={styles.contentsSection}>
                <div className={styles.contentsList}>
                  {leadingItems.map(([pageRef, topic]) => (
                    <div className={styles.contentsItem} key={pageRef + topic}>
                      <span className={styles.contentsPageNo}>{pageRef}</span>
                      <span className={styles.contentsArrow} aria-hidden="true">▶</span>
                      <span className={styles.contentsTopic}>{topic}</span>
                    </div>
                  ))}
                </div>
              </section>

              {sections.map((section) => (
                <section className={styles.contentsSection} key={section.title}>
                  <h2>{section.title}</h2>
                  <div className={styles.contentsList}>
                    {section.items.map(([pageRef, topic]) => (
                      <div className={styles.contentsItem} key={pageRef + topic}>
                        <span className={styles.contentsPageNo}>{pageRef}</span>
                        <span className={styles.contentsArrow} aria-hidden="true">▶</span>
                        <span className={styles.contentsTopic}>{topic}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </article>
        </section>

        <aside className={styles.side}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <div className={styles.panelKicker}>SOURCE VERIFIED</div>
                <h2 className={styles.panelTitle}>Page 4 · Contents</h2>
              </div>
              <span className={styles.completeBadge}>DONE</span>
            </div>

            <dl className={styles.factList}>
              <div className={styles.fact}>
                <dt>Continuation</dt>
                <dd>Major Players continues with refs 71 and 73.</dd>
              </div>
              <div className={styles.fact}>
                <dt>Sections</dt>
                <dd>Technical Analysis + Fundamental Analysis</dd>
              </div>
              <div className={styles.fact}>
                <dt>Entries</dt>
                <dd>{itemCount} indexed topics</dd>
              </div>
              <div className={styles.fact}>
                <dt>Source refs</dt>
                <dd>Printed book page references 71–129</dd>
              </div>
            </dl>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <div className={styles.panelKicker}>SOURCE FIDELITY</div>
                <h2 className={styles.panelTitle}>원문 그대로 보존</h2>
              </div>
            </div>
            <ul className={styles.checks}>
              <li>원본에서 Major Players 제목이 반복되지 않는 첫 두 항목을 그대로 무제목 연속 항목으로 유지.</li>
              <li>Technical Analysis의 패턴 목록을 원본 순서 그대로 데이터화.</li>
              <li>원본에 82와 95 두 곳 모두 적힌 “Falling wedge” 중복도 임의 수정하지 않음.</li>
              <li>Fundamental Analysis의 세 항목을 분리해 후속 본문 연결용 인덱스로 보존.</li>
            </ul>
          </section>

          <div className={styles.locked}>
            <strong>Page 5 is not built yet</strong>
            <span>Page 4 배포 검증 후 다음 원본 페이지로 이어갑니다.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
