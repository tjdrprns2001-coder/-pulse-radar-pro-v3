'use strict';
const HYPOTHESIS_SYMBOLS=Object.freeze([
 'ATOMUSDT','FILUSDT','ICPUSDT','ALGOUSDT','SANDUSDT',
 'UNIUSDT','NEARUSDT','INJUSDT','OPUSDT','ARBUSDT','APTUSDT','SEIUSDT','TIAUSDT','HBARUSDT','XLMUSDT','CRVUSDT','DYDXUSDT','GALAUSDT','IMXUSDT','STXUSDT','WLDUSDT','ARUSDT','MKRUSDT','RUNEUSDT','KAVAUSDT','ROSEUSDT','CHZUSDT','GRTUSDT','THETAUSDT',
 'AAVEUSDT','BONKUSDT','JUPUSDT'
]);
const HYPOTHESIS_AGGREGATE=Object.freeze({
 source:'manual-hypothesis-only',formal:false,totalCoins:32,
 cohorts:{
  '3A':{sampleCount:22,hit72h10:.227,hit7d10:.273,hit7d15:.227,hit7d20:.227,clean10Mae3:.136},
  '3B':{sampleCount:14,hit72h10:.286,hit7d10:.429,hit7d15:.357,hit7d20:.214,clean10Mae3:.143},
  '3C':{sampleCount:9,hit72h10:.111,hit7d10:.111,hit7d15:.111,hit7d20:.111,clean10Mae3:.111}
 }
});
module.exports={HYPOTHESIS_SYMBOLS,HYPOTHESIS_AGGREGATE};
