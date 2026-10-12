import {scanConditions} from './scan-indicators.js';
import {scanCandidate} from './scanner.js';
import {validateScanData} from './scan-quality.js';
let input='';for await(const chunk of process.stdin)input+=chunk;
try{const {data,frame,rules,now}=JSON.parse(input);validateScanData(data,frame,now);const r=rules.mode==='wyckoff'?scanCandidate(data,frame,{...rules,now}):scanConditions(data,frame,{...rules,now});console.log(JSON.stringify(r));}catch(e){console.log(JSON.stringify({error:e.message}));process.exitCode=1;}
