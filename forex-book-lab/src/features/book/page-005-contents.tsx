import { BookReaderBar } from "./book-reader-bar";
import styles from "./book.module.css";

const leadingItems = [
  [130, "Geopolitical events"],
  [132, "Market sentiment and investors psychology"],
  [133, "Using fundamental analysis for forecasting"],
  [135, "Comparing fundamental analysis and technical analysis"],
  [136, "Case studies"],
  [138, "Fundamental analysis tools and resources"],
  [139, "Interpreting economic calendar"],
] as const;

const sections = [
  { title: "Risk Management Strategies", items: [[143,"Position sizing"],[145,"Stop-loss orders"],[147,"Risk-reward ratio"],[149,"Risk management techniques for volatile markets"],[151,"Portfolio diversification"],[153,"Money management rules"],[155,"Managing drawdowns"],[157,"Risk management tools"],[159,"Psychological aspects of risk management"],[161,"Backtesting and risk management"]] },
  { title: "Money Management", items: [[165,"The importance of money management"],[167,"Setting trading goals"],[168,"Risk assessment and position sizing"],[170,"Protecting capital"],[172,"Risk-to-reward ration"],[173,"Diversification"],[175,"Managing drawdowns"],[177,"Reinvestment and compounding"],[178,"Account monitoring and perfomance evaluation"],[180,"Psychological considerations in money management"]] },
] as const;

export function Page005Contents() {
  const itemCount = leadingItems.length + sections.reduce((total, section) => total + section.items.length, 0);
  return (
    <div className={styles.reader}>
      <BookReaderBar page={5} kind="contents" previousHref="/book/4" nextHref="/book/6" />
      <div className={styles.readerGrid}>
        <section className={styles.lessonStage} aria-label="Source page 5 contents">
          <article className={styles.contentsPaper}>
            <h1 className={styles.contentsTitle}>CONTENTS</h1>
            <div className={styles.contentsSections}>
              <section className={styles.contentsSection}><div className={styles.contentsList}>
                {leadingItems.map(([pageRef, topic]) => <div className={styles.contentsItem} key={pageRef+topic}><span className={styles.contentsPageNo}>{pageRef}</span><span className={styles.contentsArrow}>▶</span><span className={styles.contentsTopic}>{topic}</span></div>)}
              </div></section>
              {sections.map(section => <section className={styles.contentsSection} key={section.title}><h2>{section.title}</h2><div className={styles.contentsList}>
                {section.items.map(([pageRef,topic]) => <div className={styles.contentsItem} key={pageRef+topic}><span className={styles.contentsPageNo}>{pageRef}</span><span className={styles.contentsArrow}>▶</span><span className={styles.contentsTopic}>{topic}</span></div>)}
              </div></section>)}
            </div>
          </article>
        </section>
        <aside className={styles.side}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><div className={styles.panelKicker}>SOURCE VERIFIED</div><h2 className={styles.panelTitle}>Page 5 · Contents</h2></div><span className={styles.completeBadge}>DONE</span></div>
            <dl className={styles.factList}>
              <div className={styles.fact}><dt>Continuation</dt><dd>Fundamental Analysis continues through printed ref 139.</dd></div>
              <div className={styles.fact}><dt>Sections</dt><dd>Risk Management Strategies + Money Management</dd></div>
              <div className={styles.fact}><dt>Entries</dt><dd>{itemCount} indexed topics</dd></div>
              <div className={styles.fact}><dt>Source refs</dt><dd>Printed book page references 130–180</dd></div>
            </dl>
          </section>
          <section className={styles.panel}><div className={styles.panelHeader}><div><div className={styles.panelKicker}>SOURCE FIDELITY</div><h2 className={styles.panelTitle}>표기까지 원본 유지</h2></div></div>
            <ul className={styles.checks}><li>Fundamental Analysis 후속 항목 7개를 원본 구조로 유지.</li><li>Risk Management Strategies와 Money Management를 별도 섹션으로 구조화.</li><li>원본의 “Risk-to-reward ration” 표기를 임의 교정하지 않음.</li><li>원본의 “perfomance evaluation” 표기도 동일하게 보존.</li></ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
