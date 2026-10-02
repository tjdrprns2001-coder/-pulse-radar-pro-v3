import { BookReaderBar } from "./book-reader-bar";
import styles from "./book.module.css";

export function Page001Cover() {
  return (
    <div className={styles.reader}>
      <BookReaderBar page={1} kind="cover" nextHref="/book/2" />

      <div className={styles.readerGrid}>
        <section className={styles.coverStage} aria-label="Forex Book page 1 cover recreation">
          <div className={styles.cover}>
            <div className={styles.coverTitle}>
              ALL YOU SHOULD<br />
              KNOW ABOUT
            </div>
            <div className={styles.forexWord}>FOREX</div>

            <svg
              className={styles.art}
              viewBox="0 0 760 760"
              role="img"
              aria-label="Financial reports, market charts, browser chart and dollar coin"
            >
              <g transform="translate(30 20)">
                <rect x="20" y="20" width="230" height="242" rx="12" fill="#efefef"/>
                <rect x="49" y="42" width="165" height="12" rx="2" fill="#d4d4d4"/>
                <rect x="49" y="68" width="165" height="12" rx="2" fill="#d4d4d4"/>
                <rect x="49" y="94" width="165" height="12" rx="2" fill="#d4d4d4"/>
                <circle cx="136" cy="178" r="56" fill="#1db9d8"/>
                <path d="M136 122 A56 56 0 0 1 188 199 L136 178Z" fill="#45d000"/>
                <path d="M188 199 A56 56 0 0 1 92 219 L136 178Z" fill="#ff0a4a"/>
                <path d="M92 219 A56 56 0 0 1 86 140 L136 178Z" fill="#17b8d7"/>
                <path d="M86 140 A56 56 0 0 1 136 122 L136 178Z" fill="#303030"/>
                <circle cx="136" cy="178" r="31" fill="#efefef"/>
              </g>

              <g transform="translate(460 76)">
                <rect x="0" y="0" width="246" height="201" rx="12" fill="#efefef"/>
                <rect x="22" y="20" width="203" height="163" rx="3" fill="#e7e7e7" stroke="#cfcfcf" strokeWidth="5"/>
                <rect x="46" y="133" width="29" height="36" fill="#f00043"/>
                <rect x="92" y="111" width="29" height="58" fill="#ff9f30"/>
                <rect x="139" y="122" width="29" height="47" fill="#ff5d18"/>
                <rect x="185" y="79" width="29" height="90" fill="#45d500"/>
                <path d="M45 119 L94 80 L142 100 L199 47" fill="none" stroke="#303030" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M197 46 L210 42 L206 56" fill="none" stroke="#303030" strokeWidth="10" strokeLinecap="round"/>
              </g>

              <g transform="translate(150 250)">
                <rect x="0" y="0" width="476" height="409" rx="15" fill="#efefef"/>
                <path d="M15 0 H461 A15 15 0 0 1 476 15 V84 H0 V15 A15 15 0 0 1 15 0Z" fill="#8267f6"/>
                <circle cx="43" cy="41" r="13" fill="#f20442"/>
                <circle cx="89" cy="41" r="13" fill="#ffe51b"/>
                <circle cx="135" cy="41" r="13" fill="#f5f5f5"/>
                <rect x="185" y="28" width="250" height="27" rx="2" fill="#ffffff"/>
                <rect x="37" y="120" width="401" height="245" fill="#e5e5e5" stroke="#cfcfcf" strokeWidth="6"/>
                <g stroke="#cfcfcf" strokeWidth="5">
                  <line x1="104" y1="120" x2="104" y2="365"/>
                  <line x1="171" y1="120" x2="171" y2="365"/>
                  <line x1="238" y1="120" x2="238" y2="365"/>
                  <line x1="305" y1="120" x2="305" y2="365"/>
                  <line x1="372" y1="120" x2="372" y2="365"/>
                  <line x1="37" y1="169" x2="438" y2="169"/>
                  <line x1="37" y1="218" x2="438" y2="218"/>
                  <line x1="37" y1="267" x2="438" y2="267"/>
                  <line x1="37" y1="316" x2="438" y2="316"/>
                </g>
                <path d="M45 300 C82 230 112 330 146 270 S204 226 231 246 S275 301 310 222 S369 258 430 176" fill="none" stroke="#765ef6" strokeWidth="9" strokeLinecap="round"/>
                <path d="M45 286 C95 215 123 355 179 314 S242 218 293 284 S350 335 371 214 S425 202 443 225" fill="none" stroke="#f10045" strokeWidth="9" strokeLinecap="round"/>
                <path d="M45 335 C88 345 114 297 151 278 S204 281 228 334 S290 335 316 271 S366 219 402 277 S430 326 443 331" fill="none" stroke="#43cf00" strokeWidth="9" strokeLinecap="round"/>
              </g>

              <g transform="translate(22 510)">
                <circle cx="105" cy="105" r="93" fill="#ff9d2e" stroke="#ff6d16" strokeWidth="8"/>
                <circle cx="105" cy="105" r="72" fill="none" stroke="#ff751a" strokeWidth="6"/>
                <text x="105" y="135" textAnchor="middle" fontSize="112" fontFamily="Arial, sans-serif" fill="#ef6818">$</text>
              </g>
            </svg>

            <div className={styles.creator}>
              <span className={styles.instagram} aria-hidden="true" />
              <span>@qof_trading</span>
            </div>
          </div>
        </section>

        <aside className={styles.side}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <div className={styles.panelKicker}>SOURCE VERIFIED</div>
                <h1 className={styles.panelTitle}>Page 1 · Cover</h1>
              </div>
              <span className={styles.completeBadge}>DONE</span>
            </div>

            <dl className={styles.factList}>
              <div className={styles.fact}>
                <dt>Primary title</dt>
                <dd>ALL YOU SHOULD KNOW ABOUT FOREX</dd>
              </div>
              <div className={styles.fact}>
                <dt>Creator mark</dt>
                <dd>@qof_trading</dd>
              </div>
              <div className={styles.fact}>
                <dt>Visual language</dt>
                <dd>Purple cover, oversized orange FOREX lettering, finance-report/chart illustrations.</dd>
              </div>
              <div className={styles.fact}>
                <dt>Page role</dt>
                <dd>Book identity and visual entry point. No lesson content is injected into the cover.</dd>
              </div>
            </dl>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <div className={styles.panelKicker}>IMPLEMENTATION STANDARD</div>
                <h2 className={styles.panelTitle}>완성 기준</h2>
              </div>
            </div>
            <ul className={styles.checks}>
              <li>원본 표지의 제목, 계층, 색 대비, 금융 차트 모티프를 반응형 벡터 UI로 재구성.</li>
              <li>원본 비트맵에 의존하지 않아 모바일·태블릿·데스크톱에서 선명하게 스케일.</li>
              <li>페이지 번호·종류·구현 상태를 manifest로 분리해 이후 페이지를 같은 구조로 확장.</li>
              <li>후속 페이지 내용을 미리 섞지 않고 Page 1의 정보 범위를 엄격히 유지.</li>
              <li>Next.js 정적 export만으로 동작해 별도 런타임/API 장애 없이 읽을 수 있게 구성.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
