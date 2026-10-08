'use strict';

const fs=require('fs');
const path=require('path');

const SCHEMA_VERSION=1;
const DEFAULT_FILE=process.env.CHART_V1_STATE_FILE||path.join('/tmp','pulseradar-chart-v1-state.json');
const TABLE_SQL=[
  `CREATE TABLE IF NOT EXISTS chart_v1_events (
    event_id text PRIMARY KEY,
    event_type text NOT NULL,
    symbol text NOT NULL,
    event_time timestamptz NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS chart_v1_events_symbol_time_idx ON chart_v1_events(symbol,event_time DESC)`,
  `CREATE TABLE IF NOT EXISTS chart_v1_snapshots (
    snapshot_key text PRIMARY KEY,
    symbol text NOT NULL,
    snapshot_type text NOT NULL,
    observed_at timestamptz NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS chart_v1_snapshots_symbol_type_idx ON chart_v1_snapshots(symbol,snapshot_type)`,
  `CREATE TABLE IF NOT EXISTS chart_v1_alerts (
    alert_id text PRIMARY KEY,
    symbol text NOT NULL,
    alert_type text NOT NULL,
    captured_at timestamptz NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS chart_v1_alerts_symbol_time_idx ON chart_v1_alerts(symbol,captured_at DESC)`,
  `CREATE TABLE IF NOT EXISTS chart_v1_candles (
    symbol text NOT NULL,
    timeframe text NOT NULL,
    open_time timestamptz NOT NULL,
    close_time timestamptz NOT NULL,
    open numeric NOT NULL,
    high numeric NOT NULL,
    low numeric NOT NULL,
    close numeric NOT NULL,
    volume_base numeric,
    volume_quote numeric,
    source text,
    data_status text NOT NULL DEFAULT 'valid',
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(symbol,timeframe,open_time)
  )`,
  `CREATE INDEX IF NOT EXISTS chart_v1_candles_symbol_tf_close_idx ON chart_v1_candles(symbol,timeframe,close_time DESC)`,
  `CREATE TABLE IF NOT EXISTS chart_v1_derivatives (
    symbol text NOT NULL,
    series_type text NOT NULL,
    event_time timestamptz NOT NULL,
    value numeric,
    source text NOT NULL DEFAULT 'unknown',
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(symbol,series_type,event_time,source)
  )`,
  `CREATE INDEX IF NOT EXISTS chart_v1_derivatives_symbol_type_time_idx ON chart_v1_derivatives(symbol,series_type,event_time DESC)`
];

function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function cleanSymbol(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function initial(){return{schemaVersion:SCHEMA_VERSION,events:[],snapshots:{},alerts:[],candles:{},derivatives:{},updatedAt:Date.now()}}
function normalize(v){const x=v&&typeof v==='object'?v:initial();if(!Array.isArray(x.events))x.events=[];if(!Array.isArray(x.alerts))x.alerts=[];if(!x.snapshots||typeof x.snapshots!=='object')x.snapshots={};if(!x.candles||typeof x.candles!=='object')x.candles={};if(!x.derivatives||typeof x.derivatives!=='object')x.derivatives={};x.schemaVersion=SCHEMA_VERSION;return x}
function createFileStore({file=DEFAULT_FILE,maxEvents=5000,maxAlerts=2000}={}){
  let state=null;
  function load(){if(state)return state;try{state=normalize(JSON.parse(fs.readFileSync(file,'utf8')))}catch{state=initial()}return state}
  function flush(){const s=load();s.updatedAt=Date.now();try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(s));return true}catch{return false}}
  return{
    kind:'file',durable:false,file,
    async init(){load();return true},
    async appendEvent(e){const s=load(),id=String(e.event_id||e.id||'');if(!id||s.events.some(x=>x.event_id===id))return false;s.events.push(clone(e));if(s.events.length>maxEvents)s.events=s.events.slice(-maxEvents);flush();return true},
    async listEvents({symbol=null,type=null,limit=200,since=null}={}){const sym=symbol?cleanSymbol(symbol):null,t=type?String(type):null,st=Number(since)||0;return clone(load().events.filter(x=>(!sym||cleanSymbol(x.symbol)===sym)&&(!t||String(x.event_type)===t)&&Number(x.event_time)>=st).sort((a,b)=>Number(b.event_time)-Number(a.event_time)).slice(0,Math.max(1,Math.min(2000,Number(limit)||200))))},
    async putSnapshot(key,row){const s=load();s.snapshots[String(key)]=clone(row);flush();return true},
    async getSnapshot(key){return clone(load().snapshots[String(key)]||null)},
    async putAlert(a){const s=load(),id=String(a.alert_id||a.id||'');if(!id||s.alerts.some(x=>x.alert_id===id))return false;s.alerts.push(clone(a));if(s.alerts.length>maxAlerts)s.alerts=s.alerts.slice(-maxAlerts);flush();return true},
    async listAlerts({symbol=null,limit=100}={}){const sym=symbol?cleanSymbol(symbol):null;return clone(load().alerts.filter(x=>!sym||cleanSymbol(x.symbol)===sym).sort((a,b)=>Number(b.captured_at)-Number(a.captured_at)).slice(0,Math.max(1,Math.min(1000,Number(limit)||100))))},
    async upsertCandles({symbol,timeframe,rows=[]}={}){const s=load(),key=cleanSymbol(symbol)+':'+String(timeframe||'4h'),map=new Map((s.candles[key]||[]).map(x=>[Number(x.open_time),x]));for(const x of rows||[])if(Number.isFinite(Number(x.open_time)))map.set(Number(x.open_time),clone(x));s.candles[key]=[...map.values()].sort((a,b)=>Number(a.open_time)-Number(b.open_time)).slice(-2000);flush();return rows.length},
    async listCandles({symbol,timeframe='4h',limit=800,before=null}={}){const key=cleanSymbol(symbol)+':'+String(timeframe),end=before==null?Infinity:Number(before);return clone((load().candles[key]||[]).filter(x=>Number(x.open_time)<=end).slice(-Math.max(1,Math.min(2000,Number(limit)||800))))},
    async appendDerivative({symbol,series_type,rows=[]}={}){const s=load(),key=cleanSymbol(symbol)+':'+String(series_type),map=new Map((s.derivatives[key]||[]).map(x=>[String(x.event_time)+':'+String(x.source||'unknown'),x]));for(const x of rows||[])map.set(String(x.event_time)+':'+String(x.source||'unknown'),clone(x));s.derivatives[key]=[...map.values()].sort((a,b)=>Number(a.event_time)-Number(b.event_time)).slice(-5000);flush();return rows.length},
    async listDerivatives({symbol,series_type,limit=1000}={}){const key=cleanSymbol(symbol)+':'+String(series_type);return clone((load().derivatives[key]||[]).slice(-Math.max(1,Math.min(5000,Number(limit)||1000))))},
    async health(){const s=load();return{kind:'file',durable:false,file,updated_at:s.updatedAt,event_count:s.events.length,alert_count:s.alerts.length,candle_series:Object.keys(s.candles).length,derivative_series:Object.keys(s.derivatives).length}}
  }
}
function createPostgresStore({connectionString=null,PoolCtor=null}={}){
  const url=connectionString||process.env.CHART_V1_DATABASE_URL||process.env.DATABASE_URL||process.env.CHARTBRO_DATABASE_URL||null;
  if(!url)return null;
  let Pool=PoolCtor;if(!Pool){try{Pool=require('pg').Pool}catch{throw new Error('Postgres is configured but pg driver is missing; refusing ephemeral storage fallback')}}
  const pool=new Pool({connectionString:url,ssl:/localhost|127\.0\.0\.1/.test(url)?false:{rejectUnauthorized:false},max:3,idleTimeoutMillis:30000,connectionTimeoutMillis:5000});
  let ready=null,smokeAt=null;
  async function init(){
    if(ready)return ready;
    ready=(async()=>{
      const client=await pool.connect();
      try{
        for(const sql of TABLE_SQL)await client.query(sql);
        const testKey='chart_v1:startup_smoke';
        await client.query('BEGIN');
        try{
          await client.query("INSERT INTO chart_v1_snapshots(snapshot_key,symbol,snapshot_type,observed_at,payload) VALUES($1,'SYSTEM','smoke',now(),$2::jsonb) ON CONFLICT(snapshot_key) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()",[testKey,JSON.stringify({probe:'chart_v1_pg_roundtrip'})]);
          const probe=await client.query('SELECT payload FROM chart_v1_snapshots WHERE snapshot_key=$1',[testKey]);
          if(probe.rows?.[0]?.payload?.probe!=='chart_v1_pg_roundtrip')throw new Error('Postgres write/read verification failed');
        }finally{await client.query('ROLLBACK')}
        smokeAt=new Date().toISOString();
        return true;
      }finally{client.release()}
    })();
    try{return await ready}catch(e){ready=null;throw e}
  }
  async function q(sql,p=[]){await init();return pool.query(sql,p)}
  return{
    kind:'postgres',durable:true,pool,init,
    async appendEvent(e){const r=await q('INSERT INTO chart_v1_events(event_id,event_type,symbol,event_time,payload) VALUES($1,$2,$3,to_timestamp($4/1000.0),$5::jsonb) ON CONFLICT(event_id) DO NOTHING RETURNING event_id',[String(e.event_id||e.id),String(e.event_type||e.type||'event'),cleanSymbol(e.symbol),Number(e.event_time||e.time||Date.now()),JSON.stringify(e)]);return Boolean(r?.rowCount)},
    async listEvents({symbol=null,type=null,limit=200,since=null}={}){const where=[],p=[];if(symbol){p.push(cleanSymbol(symbol));where.push('symbol=$'+p.length)}if(type){p.push(String(type));where.push('event_type=$'+p.length)}if(since){p.push(Number(since)/1000);where.push('event_time>=to_timestamp($'+p.length+')')}p.push(Math.max(1,Math.min(2000,Number(limit)||200)));const r=await q('SELECT payload FROM chart_v1_events'+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY event_time DESC LIMIT $'+p.length,p);return(r.rows||[]).map(x=>x.payload)},
    async putSnapshot(key,row){await q('INSERT INTO chart_v1_snapshots(snapshot_key,symbol,snapshot_type,observed_at,payload) VALUES($1,$2,$3,to_timestamp($4/1000.0),$5::jsonb) ON CONFLICT(snapshot_key) DO UPDATE SET observed_at=EXCLUDED.observed_at,payload=EXCLUDED.payload,updated_at=now()',[String(key),cleanSymbol(row.symbol),String(row.snapshot_type||row.type||'snapshot'),Number(row.observed_at||row.time||Date.now()),JSON.stringify(row)]);return true},
    async getSnapshot(key){const r=await q('SELECT payload FROM chart_v1_snapshots WHERE snapshot_key=$1',[String(key)]);return r.rows?.[0]?.payload||null},
    async putAlert(a){const r=await q('INSERT INTO chart_v1_alerts(alert_id,symbol,alert_type,captured_at,payload) VALUES($1,$2,$3,to_timestamp($4/1000.0),$5::jsonb) ON CONFLICT(alert_id) DO NOTHING RETURNING alert_id',[String(a.alert_id||a.id),cleanSymbol(a.symbol),String(a.alert_type||a.type||'alert'),Number(a.captured_at||a.time||Date.now()),JSON.stringify(a)]);return Boolean(r?.rowCount)},
    async listAlerts({symbol=null,limit=100}={}){const p=[];let where='';if(symbol){p.push(cleanSymbol(symbol));where=' WHERE symbol=$1'}p.push(Math.max(1,Math.min(1000,Number(limit)||100)));const r=await q('SELECT payload FROM chart_v1_alerts'+where+' ORDER BY captured_at DESC LIMIT $'+p.length,p);return(r.rows||[]).map(x=>x.payload)},
    async upsertCandles({symbol,timeframe,rows=[]}={}){const xs=(rows||[]).filter(x=>Number.isFinite(Number(x.open_time))&&Number.isFinite(Number(x.close_time)));if(!xs.length)return 0;const sql=`INSERT INTO chart_v1_candles(symbol,timeframe,open_time,close_time,open,high,low,close,volume_base,volume_quote,source,data_status)
SELECT $1,$2,to_timestamp((x->>'open_time')::double precision/1000.0),to_timestamp((x->>'close_time')::double precision/1000.0),(x->>'open')::numeric,(x->>'high')::numeric,(x->>'low')::numeric,(x->>'close')::numeric,NULLIF(x->>'volume_base','')::numeric,NULLIF(x->>'volume_quote','')::numeric,x->>'source',COALESCE(x->>'data_status','valid')
FROM jsonb_array_elements($3::jsonb) x
ON CONFLICT(symbol,timeframe,open_time) DO UPDATE SET close_time=EXCLUDED.close_time,open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,close=EXCLUDED.close,volume_base=EXCLUDED.volume_base,volume_quote=EXCLUDED.volume_quote,source=EXCLUDED.source,data_status=EXCLUDED.data_status,updated_at=now()`;await q(sql,[cleanSymbol(symbol),String(timeframe||'4h'),JSON.stringify(xs)]);return xs.length},
    async listCandles({symbol,timeframe='4h',limit=800,before=null}={}){const p=[cleanSymbol(symbol),String(timeframe)],where=before==null?'':' AND open_time<=to_timestamp($3/1000.0)';if(before!=null)p.push(Number(before));p.push(Math.max(1,Math.min(2000,Number(limit)||800)));const r=await q(`SELECT EXTRACT(EPOCH FROM open_time)*1000 AS open_time,EXTRACT(EPOCH FROM close_time)*1000 AS close_time,open,high,low,close,volume_base,volume_quote,source,data_status FROM chart_v1_candles WHERE symbol=$1 AND timeframe=$2${where} ORDER BY open_time DESC LIMIT $${p.length}`,p);return(r.rows||[]).reverse().map(x=>Object.fromEntries(Object.entries(x).map(([k,v])=>[k,['open_time','close_time'].includes(k)?Number(v):['open','high','low','close','volume_base','volume_quote'].includes(k)&&v!=null?Number(v):v])))},
    async appendDerivative({symbol,series_type,rows=[]}={}){const xs=(rows||[]).filter(x=>Number.isFinite(Number(x.event_time)));if(!xs.length)return 0;const sql=`INSERT INTO chart_v1_derivatives(symbol,series_type,event_time,value,source,payload)
SELECT $1,$2,to_timestamp((x->>'event_time')::double precision/1000.0),NULLIF(x->>'value','')::numeric,COALESCE(x->>'source','unknown'),x
FROM jsonb_array_elements($3::jsonb) x
ON CONFLICT(symbol,series_type,event_time,source) DO UPDATE SET value=EXCLUDED.value,payload=EXCLUDED.payload`;await q(sql,[cleanSymbol(symbol),String(series_type),JSON.stringify(xs)]);return xs.length},
    async listDerivatives({symbol,series_type,limit=1000}={}){const r=await q('SELECT payload FROM chart_v1_derivatives WHERE symbol=$1 AND series_type=$2 ORDER BY event_time DESC LIMIT $3',[cleanSymbol(symbol),String(series_type),Math.max(1,Math.min(5000,Number(limit)||1000))]);return(r.rows||[]).reverse().map(x=>x.payload)},
    async health(){try{const r=await q("SELECT now() AS now,(SELECT count(*) FROM chart_v1_events) AS events,(SELECT count(*) FROM chart_v1_alerts) AS alerts,(SELECT count(*) FROM chart_v1_candles) AS candles,(SELECT count(*) FROM chart_v1_derivatives) AS derivatives");return{kind:'postgres',durable:true,status:'available',migration_status:'ready',write_read_smoke:'passed',smoke_verified_at:smokeAt,server_time:r.rows?.[0]?.now,event_count:Number(r.rows?.[0]?.events||0),alert_count:Number(r.rows?.[0]?.alerts||0),candle_count:Number(r.rows?.[0]?.candles||0),derivative_count:Number(r.rows?.[0]?.derivatives||0)}}catch(e){return{kind:'postgres',durable:true,status:'unavailable',error:String(e?.message||e)}}},
    async close(){await pool.end()}
  }
}
function createPersistence(opts={}){
  const pg=createPostgresStore(opts);
  return pg||createFileStore(opts)
}
module.exports={SCHEMA_VERSION,TABLE_SQL,createFileStore,createPostgresStore,createPersistence};
