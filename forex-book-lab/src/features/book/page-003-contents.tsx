import { BookReaderBar } from "./book-reader-bar";
import styles from "./book.module.css";

const sections = [
  {
    title: "Forex Market Basics",
    items: [
      [12, "What is forex?"],
      [13, "Digging deeper intro forex"],
      [15, "Who is forex trader?"],
      [16, "Who is broker?"],
      [18, "What is trading terminal?"],
      [20, "What is Bull and Bear market?"],
      [21, "Forex currency symbols"],
      [28, "How to count pips?"],
      [31, "Market phases"],
      [33, "Trend stages"],
      [35, "Forex lot size"],
      [39, "Trendline distance"],
      [41, "What is a fakeout?"],
    ],
  },
  {
    title: "Psychology in Forex",
    items: [
      [44, "Market cycle psychology"],
      [46, "Forex trading psychological levels"],
      [52, "Influence of Media and News"],
      [54, "Role of Confidence and Overconfidence"],
    ],
  },
  {
    title: "Major Players",
    items: [
      [57, "Central banks"],
      [58, "Commercial banks"],
      [60, "Hedge funds"],
      [62, "Multinational corporations"],
      [64, "Retail forex traders"],
      [66, "Brokerage firms"],
      [68, "Pension funds and insurance companies"],
      [69, "ETFs and currency futures traders"],
    ],
  },
] as const;

export function Page003Contents() {
  const itemCount = sections.reduce((total, section) => total + section.items.length, 0);

  return (
    <div className={styles.reader}>
      <BookReaderBar
        page={3}
        kind="contents"
        previousHref="/book/2"
      />

      <div className={styles.readerGrid}>
        <section className={styles.lessonStage} aria-label="Source page 3 contents">
          <article className={styles.contentsPaper}>
            <h1 className={styles.contentsTitle}>CONTENTS</h1>

            <div className={styles.contentsSections}>
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
                <h2 className={styles.panelTitle}>Page 3 · Contents</h2>
              </div>
              <span className={styles.completeBadge}>DONE</span>
            </div>

            <dl className={styles.factList}>
              <div className={styles.fact}>
                <dt>Sections</dt>
                <dd>3 major groups</dd>
              </div>
              <div className={styles.fact}>
                <dt>Entries</dt>
                <dd>{itemCount} indexed topics</dd>
              </div>
              <div className={styles.fact}>
                <dt>Source refs</dt>
                <dd>Printed book page references 12–69</dd>
              </div>
              <div className={styles.fact}>
                <dt>Important</dt>
                <dd>These numbers are the original book’s printed references, not this website’s source-page numbers.</dd>
              </div>
            </dl>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <div className={styles.panelKicker}>STRUCTURED INDEX</div>
                <h2 className={styles.panelTitle}>목차를 데이터로 저장</h2>
              </div>
            </div>
            <ul className={styles.checks}>
              <li>목차 항목을 텍스트 이미지가 아니라 section / pageRef / topic 데이터로 분리.</li>
              <li>원본의 보라색 CONTENTS 제목, 검은 섹션 제목, 번호 → 화살표 → 주제 계층을 그대로 유지.</li>
              <li>향후 해당 본문 페이지 구현 시 목차 항목을 실제 사이트 라우트에 연결할 수 있는 구조.</li>
              <li>원본에 없는 설명이나 매매 판단은 목차 본문 영역에 섞지 않음.</li>
            </ul>
          </section>

          <div className={styles.locked}>
            <strong>Page 4 is not built yet</strong>
            <span>Page 3 배포 검증 후 다음 원본 페이지를 확인해 이어서 구현합니다.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
