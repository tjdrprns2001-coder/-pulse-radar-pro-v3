# API v1

Base: 사이트 URL + `/api/v1`.
현재 Sites 기본 접근은 소유자 비공개다. 비공개 주소는 인증 없이 다른 사이트/서버에서 호출할 수 없다. CORS는 인증을 우회하지 않는다. Pulse Radar 외부 서버 연동에는 접근 공개 설정 또는 별도 공개 호스팅/인증 연동이 필요하다. 공유된 쿠키나 임시 우회 토큰을 운영 비밀키로 사용하지 않는다.

|Method|Path|역할|
|---|---|---|
|GET|/health|서버 버전/시각|
|POST|/scans|작업 생성/활성작업 재사용|
|POST|/jobs/:id/step|다음 배치 실행, 체크포인트 저장|
|GET|/jobs/:id|진행/부분결과|
|POST|/jobs/:id/cancel|작업 종료, 실행중배치는409|
|GET|/results|최신 검색 결과, 부분완료 포함|
|GET|/samples|최대300개 최근 샘플|
|POST|/samples/collect|샘플 수집작업 생성. 동일 step API로 실행|

생성 body: `{"maxChange":10,"minVolume":10000000,"minOi":1,"top":30}`.
반환202. 진행API는200, 존재하지않는작업404, 입력/연결실패503. 기존실행배치가 있으면 `{busy:true}`이므로1초후조회. Binance제한은 `status:paused,retryAt`으로전달.

결과 주요필드:
- schemaVersion:1.0 / source / id / status / stage / asOf / updatedAt / finishedAt
- counts:universe,filtered,oi,prescan,candidates,deep
- config,metrics:requests,hits,errors,weight / timings(stage ms) / freshnessMs
- candidates[]:symbol,price,change,quoteVolume,oi,score,status,reasons,detailComplete,coverage
- frames[tf]:RSI/MACD/StochRSI/KDJ/OBV/RVOL/ATR/SMA/EMA/structure/divergence
- taker:ratio,klineRatio,aligned,discrepancy,asOf,direction
- funding:rate(decimal),asOf; spot:price,futuresPrice,basisPct,quoteVolume1h,futuresQuoteVolume1h,volumeRatio,rvol,rsi
- matches[]:symbol,cutoff,score,dimensions,outcome
- errors / excluded:실패 및 필터탈락근거

모든 시각은 UNIX milliseconds, 가격USDT, 거래대금USDT, 변화율은%포인트, funding은소수. 결측은null 또는available:false이며0으로바꾸지말것. 결과 소비자는 freshnessMs와 detailComplete/coverage를 확인해야 한다.

Pulse Radar 서버 연동(접근 가능한 배포 origin 확보 후):
```js
const response = await fetch(`${process.env.SCANNER_ORIGIN}/api/v1/results`);
if (!response.ok) throw new Error(`Scanner HTTP ${response.status}`);
const scan = await response.json();
const usable = (scan.candidates ?? []).filter(x => x.detailComplete && x.coverage === 10);
// scan.freshnessMs를 UI에 표시. 상태/점수는 주문 신호로 직접 사용하지 않는다.
```
기존 Pulse Radar 운영 origin에 대해 GET CORS 허용. 쓰기 요청은 same-origin만 허용. private Sites gateway 인증이 먼저 적용된다.
