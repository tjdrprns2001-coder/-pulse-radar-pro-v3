# IGNITION — 독립 선물 검색기

Binance USDT 무기한 선물 전체를 단계적으로 압축하고 상위 후보만 정밀 분석한다.

## 실행
Node 22.13+ (SQL 테스트는 Node24 권장).
```
npm install
npm run dev
npm test
npm run build
```
현재 체크아웃은 pnpm-lock.yaml을 기준으로 한다. pnpm 사용시 `pnpm install --frozen-lockfile` 권장.
DB 바인딩 DB 및 D1 필요. 로컬 DB 초기화:
```
npm run build
node node_modules/wrangler/bin/wrangler.js d1 execute DB --local --persist-to .wrangler/state --config dist/server/wrangler.json --file drizzle/0000_dusty_thunderbird.sql
```
독립 Cloudflare 배포는 생성된 `dist/server/wrangler.json`의 D1에 본인 데이터베이스ID를 연결하고 마이그레이션 적용 후 `wrangler deploy --config dist/server/wrangler.json` 사용. Sites에서는 배포 시 D1 자동구성/마이그레이션. 기존 Pulse Radar와 배포/DB/소스가 분리되어 있다.

## 사용
전체 시장 검색 → 단계별 진척 → 후보표 → 종목클릭 → 10TF 세부확인.
Sample Engine 탭에서 실제 급등직전 샘플 수집. 다음 검색에서 후보와 자동대조.
창이 열려 있는 동안 제한된 배치를 순차 실행한다. 창닫기/새로고침 이후 이어하기 지원. 예약작업/상주백그라운드 자동실행은 포함하지 않음.

- [프로젝트 구조·계산 정의](docs/ARCHITECTURE.md)
- [결과/작업 API](docs/API.md)
- [검증 결과](docs/VALIDATION.md)

결과 합치도/샘플 유사도는 상승확률이 아니다. 결측을 추정하지 않으며 데이터나 구조가 부족하면 N/A/제외를 반환한다.
