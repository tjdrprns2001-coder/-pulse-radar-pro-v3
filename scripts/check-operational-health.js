#!/usr/bin/env node
'use strict';
const base=process.env.PULSE_SITE_BASE||'https://pulseradar-pro-unified-0926.onrender.com';
async function read(path){const response=await fetch(base+path,{signal:AbortSignal.timeout(18000)});const json=await response.json();return {status:response.status,json};}
async function main(){const live=await read('/health/live');const ready=await read('/health/ready');const market=await read('/api/astra-scan?stage=universe&method=dna&minQuoteVolume=0');const report={live:live.status,ready:ready.status,readyReason:ready.json.reason||null,release:live.json.release||null,marketSource:market.json.sourceState?.marketSource||null,marketError:market.json.sourceState?.lastFuturesError||null,universeCount:market.json.universeCount};console.log(JSON.stringify(report,null,2));if(live.status!==200||ready.status!==200||market.status!==200||!report.marketSource)process.exitCode=1;}
main().catch(error=>{console.error(error);process.exitCode=1});
