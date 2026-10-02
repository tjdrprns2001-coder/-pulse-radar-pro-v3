import { BookReaderBar } from "./book-reader-bar";
import styles from "./book.module.css";

const sections = [
  {
    title: "Forex Trading Tools",
    items: [
      [184, "Trading Platforms"],
      [185, "Advantages of trading software"],
      [187, "Using economic calendar"],
      [188, "News aggregators"],
      [190, "Charting tools"],
      [192, "Automated trading tools"],
      [194, "Risk management tools"],
      [195, "Performance tracking and analysis tools"],
      [197, "Mobile trading tools"],
      [199, "Social trading and copy trading tools"],
      [201, "Signal services"],
      [203, "Educational resources and tools"],
    ],
  },
  {
    title: "Candlestick patterns",
    items: [
      [206, "How are candlestick patterns composed?"],
      [207, "Hammer"],
      [209, "Piercing"],
      [210, "Bullish engulfing"],
      [212, "Morning star"],
      [213, "Three white soldiers"],
      [215, "White marubozu"],
      [216, "Three inside up"],
      [217, "Bullish harami"],
      [219, "Tweezer bottom"],
      [220, "Inverted hammer"],
      [221, "Three outside up"],
      [222, "On-neck"],
      [223, "Hanging man"],
      [224, "Dark cloud cover"],
    ],
  },
] as const;

export function Page006Contents() {
  const itemCount = sections.reduce((t,s)=>t+s.items.length,0);
  return (
    <div className={styles.reader}>
      <BookReaderBar page={6} kind="contents" previousHref="/book/5" />
      <div className={styles.readerGrid}>
        <section className={styles.lessonStage} aria-label="Source page 6 contents">
          <article className={styles.contentsPaper}>
            <h1 className={styles.contentsTitle}>CONTENTS</h1>
            <div className={styles.contentsSections}>
              {sections.map(section=>(
                <section className={styles.contentsSection} key={section.title}>
                  <h2>{section.title}</h2>
                  <div className={styles.contentsList}>
                    {section.items.map(([pageRef,topic])=>(
                      <div className={styles.contentsItem} key={pageRef+topic}>
                        <span className={styles.contentsPageNo}>{pageRef}</span>
                        <span className={styles.contentsArrow}>▶</span>
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
            <div className={styles.panelHeader}><div><div className={styles.panelKicker}>SOURCE VERIFIED</div><h2 className={styles.panelTitle}>Page 6 · Contents</h2></div><span className={styles.completeBadge}>DONE</span></div>
            <dl className={styles.factList}>
              <div className={styles.fact}><dt>Sections</dt><dd>Forex Trading Tools + Candlestick patterns</dd></div>
              <div className={styles.fact}><dt>Entries</dt><dd>{itemCount} indexed topics</dd></div>
              <div className={styles.fact}><dt>Source refs</dt><dd>Printed book page references 184–224</dd></div>
            </dl>
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><div className={styles.panelKicker}>FEATURE LINKS</div><h2 className={styles.panelTitle}>실제 기능과 연결</h2></div></div>
            <ul className={styles.checks}>
              <li>Chart Lab에 Pip, Position Size, R:R, Drawdown, Compounding 계산기 구현.</li>
              <li>Market Structure 인터랙티브 차트 구현.</li>
              <li>Candlestick Pattern Lab 구현.</li>
              <li>Scanner에 실전 Pre-Trade 체크리스트 구현.</li>
            </ul>
          </section>
          <div className={styles.locked}><strong>Page 7 is not built yet</strong><span>다음 원본 페이지 확인 후 이어집니다.</span></div>
        </aside>
      </div>
    </div>
  );
}
