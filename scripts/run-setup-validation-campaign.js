'use strict';

const fs=require('fs');
const path=require('path');
const {createCryptoResearchDataEngine}=require('../lib/research-backtest-v2/crypto-data-engine.js');
const Campaign=require('../lib/research-backtest-v2/setup-validation-campaign.js');

function arg(name,def=null){
  const p='--'+name+'=';
  const hit=process.argv.slice(2).find(x=>String(x).startsWith(p));
  return hit==null?def:String(hit).slice(p.length);
}
function parseTime(v,def=null){
  if(v==null||v==='')return def;
  if(/^\d+$/.test(String(v)))return Number(v);
  const t=Date.parse(String(v));if(!Number.isFinite(t))throw new Error('invalid time: '+v);return t;
}
function parseSymbols(v){
  if(!v)return Campaign.DEFAULT_SYMBOLS.slice();
  return String(v).split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
}
function ensureDir(p){fs.mkdirSync(p,{recursive:true})}
function writeJson(p,v){fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n','utf8')}

(async()=>{
  const endTime=parseTime(arg('end'),Date.now());
  const days=Math.max(7,Math.min(90,Number(arg('days','28'))||28));
  const requestedStart=parseTime(arg('start'),endTime-days*86400000);
  const symbols=parseSymbols(arg('symbols'));
  const outDir=path.resolve(arg('out','artifacts/setup-validation-campaign'));
  const signalTimeframe=String(arg('tf','15m')).toLowerCase();
  const minimumUsableSymbols=Math.max(1,Number(arg('min-symbols','4'))||4);

  const provider=createCryptoResearchDataEngine({
    fetchImpl:globalThis.fetch,
    exchange:'BINANCE',
    marketType:'spot',
    quoteAsset:'USDT'
  });

  const result=await Campaign.runCampaign({
    provider,symbols,requestedStart,endTime,signalTimeframe,
    minimumUsableSymbols,
    executionConfig:{
      initialCash:100000,
      commissionRate:Number(arg('commission','0.0005')),
      slippageRate:Number(arg('slippage','0.0005')),
      riskPerTradeFraction:Number(arg('risk','0.01')),
      maxPositionValueFraction:Number(arg('max-position','0.25')),
      stopTargetPriority:'stop_first'
    },
    costMultipliers:[1,1.5,2]
  });

  ensureDir(outDir);
  writeJson(path.join(outDir,'lock.json'),result.lock);
  writeJson(path.join(outDir,'campaign.json'),result);
  fs.writeFileSync(path.join(outDir,'report.md'),result.report.markdown+'\n','utf8');

  const summary={
    version:result.version,
    lockId:result.lock.lockId,
    requestedSymbols:result.requested.symbols.length,
    usableSymbols:result.effective.symbols.length,
    startTime:new Date(result.effective.startTime).toISOString(),
    endTime:new Date(result.effective.endTime).toISOString(),
    lockedOos:result.effective.splits.lockedOos,
    errors:result.batch.errorCount,
    aggregateLockedOos:result.batch.aggregateLockedOos,
    outputDirectory:outDir
  };
  process.stdout.write(JSON.stringify(summary,null,2)+'\n');
})().catch(e=>{
  console.error(e&&e.stack||e);
  process.exit(1);
});
