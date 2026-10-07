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
  `CREATE INDEX IF NOT EXISTS chart_v1_alerts_symbol_time_idx ON chart_v1_alerts(symbol,captured_at DESC)`
];

function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function cleanSymbol(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function initial(){return{schemaVersion:SCHEMA_VERSION,events:[],snapshots:{},alerts:[],updatedAt:Date.now()}}
function normalize(v){const x=v&&typeof v==='object'?v:initial();if(!Array.isArray(x.events))x.events=[];if(!Array.isArray(x.alerts))x.alerts=[];if(!x.snapshots||typeof x.snapshots!=='object')x.snapshots={};x.schemaVersion=SCHEMA_VERSION;return x}
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
    async health(){return{kind:'file',durable:false,file,updated_at:load().updatedAt,event_count:load().events.length,alert_count:load().alerts.length}}
  }
}
function createPostgresStore({connectionString=null,PoolCtor=null}={}){
  const url=connectionString||process.env.CHART_V1_DATABASE_URL||process.env.DATABASE_URL||null;
  if(!url)return null;
  let Pool=PoolCtor;try{if(!Pool)Pool=require('pg').Pool}catch{return null}
  const pool=new Pool({connectionString:url,ssl:/localhost|127\.0\.0\.1/.test(url)?false:{rejectUnauthorized:false},max:3,idleTimeoutMillis:30000,connectionTimeoutMillis:5000});
  let ready=null;
  async function init(){if(ready)return ready;ready=(async()=>{const client=await pool.connect();try{for(const sql of TABLE_SQL)await client.query(sql);return true}finally{client.release()}})();try{return await ready}catch(e){ready=null;throw e}}
  async function q(sql,p=[]){await init();return pool.query(sql,p)}
  return{
    kind:'postgres',durable:true,pool,init,
    async appendEvent(e){const r=await q('INSERT INTO chart_v1_events(event_id,event_type,symbol,event_time,payload) VALUES($1,$2,$3,to_timestamp($4/1000.0),$5::jsonb) ON CONFLICT(event_id) DO NOTHING RETURNING event_id',[String(e.event_id||e.id),String(e.event_type||e.type||'event'),cleanSymbol(e.symbol),Number(e.event_time||e.time||Date.now()),JSON.stringify(e)]);return Boolean(r?.rowCount)},
    async listEvents({symbol=null,type=null,limit=200,since=null}={}){const where=[],p=[];if(symbol){p.push(cleanSymbol(symbol));where.push('symbol=$'+p.length)}if(type){p.push(String(type));where.push('event_type=$'+p.length)}if(since){p.push(Number(since)/1000);where.push('event_time>=to_timestamp($'+p.length+')')}p.push(Math.max(1,Math.min(2000,Number(limit)||200)));const r=await q('SELECT payload FROM chart_v1_events'+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY event_time DESC LIMIT $'+p.length,p);return(r.rows||[]).map(x=>x.payload)},
    async putSnapshot(key,row){await q('INSERT INTO chart_v1_snapshots(snapshot_key,symbol,snapshot_type,observed_at,payload) VALUES($1,$2,$3,to_timestamp($4/1000.0),$5::jsonb) ON CONFLICT(snapshot_key) DO UPDATE SET observed_at=EXCLUDED.observed_at,payload=EXCLUDED.payload,updated_at=now()',[String(key),cleanSymbol(row.symbol),String(row.snapshot_type||row.type||'snapshot'),Number(row.observed_at||row.time||Date.now()),JSON.stringify(row)]);return true},
    async getSnapshot(key){const r=await q('SELECT payload FROM chart_v1_snapshots WHERE snapshot_key=$1',[String(key)]);return r.rows?.[0]?.payload||null},
    async putAlert(a){const r=await q('INSERT INTO chart_v1_alerts(alert_id,symbol,alert_type,captured_at,payload) VALUES($1,$2,$3,to_timestamp($4/1000.0),$5::jsonb) ON CONFLICT(alert_id) DO NOTHING RETURNING alert_id',[String(a.alert_id||a.id),cleanSymbol(a.symbol),String(a.alert_type||a.type||'alert'),Number(a.captured_at||a.time||Date.now()),JSON.stringify(a)]);return Boolean(r?.rowCount)},
    async listAlerts({symbol=null,limit=100}={}){const p=[];let where='';if(symbol){p.push(cleanSymbol(symbol));where=' WHERE symbol=$1'}p.push(Math.max(1,Math.min(1000,Number(limit)||100)));const r=await q('SELECT payload FROM chart_v1_alerts'+where+' ORDER BY captured_at DESC LIMIT $'+p.length,p);return(r.rows||[]).map(x=>x.payload)},
    async health(){try{const r=await q("SELECT now() AS now,(SELECT count(*) FROM chart_v1_events) AS events,(SELECT count(*) FROM chart_v1_alerts) AS alerts");return{kind:'postgres',durable:true,status:'available',server_time:r.rows?.[0]?.now,event_count:Number(r.rows?.[0]?.events||0),alert_count:Number(r.rows?.[0]?.alerts||0)}}catch(e){return{kind:'postgres',durable:true,status:'unavailable',error:String(e?.message||e)}}},
    async close(){await pool.end()}
  }
}
function createPersistence(opts={}){
  const pg=createPostgresStore(opts);
  return pg||createFileStore(opts)
}
module.exports={SCHEMA_VERSION,TABLE_SQL,createFileStore,createPostgresStore,createPersistence};
