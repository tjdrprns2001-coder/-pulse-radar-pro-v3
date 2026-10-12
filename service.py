import asyncio,contextlib,hashlib,hmac,json,os,re,time,sys,logging
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Literal
from fastapi import FastAPI,Request,HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel,Field,ConfigDict
import ccxt.pro as ccxt
from core import Store,TradeWindow,outcome
ROOT=Path(__file__).parent
TOKEN=os.environ.get('RESEARCH_TOKEN','');DB_PATH=os.environ.get('DB_PATH','/tmp/smc-research/state.sqlite')
store=Store(DB_PATH);clients={};scan_task=None;trade_task=None;trade_key=None;trades=TradeWindow();oi_history={};backtest_task=None
status={'running':False,'done':0,'total':0,'errors':[],'lastRun':None,'nextRun':None}
last_scan=0;flow_cache={};external_lock=asyncio.Lock();job_lock=asyncio.Lock()
class Rules(BaseModel):
 model_config=ConfigDict(extra='forbid')
 mode:Literal['wyckoff','conditions']='wyckoff'
 join:Literal['all','any']='all'
 wyckoff:bool=True
 side:Literal['all','bull','bear']='all'
 age:int=Field(default=5,ge=0,le=20)
 rsiMode:Literal['off','low','high']='off'
 rsiThreshold:float=Field(default=30,ge=0,le=100)
 emaMode:Literal['off','bull','bear']='off'
 volume:bool=False
 volumeThreshold:float=Field(default=2,ge=.1,le=100)
 breakout:Literal['off','up','down']='off'
class Config(BaseModel):
 model_config=ConfigDict(extra='forbid')
 enabled:bool=False
 exchange:Literal['okx','bybit','binance','bitget','gate','kucoin','kraken','upbit','coinbase']='okx'
 types:list[Literal['spot','perpetual']]=Field(default=['spot','perpetual'],min_length=1,max_length=2)
 frames:list[Literal['1m','5m','15m','1h','4h','1d']]=Field(default=['1h'],min_length=1,max_length=3)
 quote:str=Field(default='USDT',pattern=r'^[A-Z0-9]{2,12}$')
 limit:int=Field(default=10,ge=1,le=50)
 interval:int=Field(default=300,ge=300,le=86400)
 rules:Rules=Field(default_factory=Rules)

async def client(exchange,kind):
 if exchange not in Config.model_fields['exchange'].annotation.__args__:raise HTTPException(400,'지원하지 않는 거래소')
 if kind not in ['spot','perpetual']:raise HTTPException(400,'현물·무기한 선물만 지원')
 key=(exchange,kind)
 if key not in clients:
  cls=getattr(ccxt,{'gate':'gateio'}.get(exchange,exchange));clients[key]=cls({'enableRateLimit':True,'timeout':18000,'options':{'defaultType':'spot' if kind=='spot' else 'swap'}})
 return clients[key]
async def resolve(exchange,kind,symbol):
 c=await client(exchange,kind);await c.load_markets()
 found=[m for m in c.markets.values() if m.get('active') is not False and (m.get('spot') if kind=='spot' else m.get('swap')) and symbol in [m['symbol'],m['id']]]
 if len(found)!=1:raise HTTPException(400,'계약 심볼을 정확히 선택하세요 (예: BTC/USDT:USDT)')
 return c,found[0]
async def engine(data,frame,rules):
 p=await asyncio.create_subprocess_exec('node',str(ROOT/'engine/analyze.mjs'),stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
 try:out,err=await asyncio.wait_for(p.communicate(json.dumps({'data':data,'frame':frame,'rules':rules,'now':time.time()}).encode()),15)
 except BaseException:
  if p.returncode is None:p.kill()
  await p.wait();raise
 r=json.loads(out)
 if r.get('error'):raise ValueError(r['error'])
 return r

def candles(rows):return [dict(zip(['time','open','high','low','close','volume'],[r[0]/1000,*r[1:6]])) for r in rows]
async def run_scan(config):
 global last_scan
 status.update(running=True,done=0,total=0,errors=[],lastRun=time.time(),nextRun=None)
 try:
  cdict=config.model_dump();rules=cdict['rules'];rule_key=hashlib.sha256(json.dumps(rules,sort_keys=True).encode()).hexdigest()[:16]
  for kind in dict.fromkeys(config.types):
   c=await client(config.exchange,kind)
   try:await c.load_markets()
   except Exception as e:status['errors'].append(f'{kind}: {type(e).__name__} {str(e)[:180]}');continue
   markets=sorted([m for m in c.markets.values() if m.get('active') is not False and m.get('quote')==config.quote and (m.get('spot') if kind=='spot' else m.get('swap'))],key=lambda m:m['symbol'])[:config.limit]
   status['total']+=len(markets)*len(set(config.frames));failures=0
   for m in markets:
    for frame in dict.fromkeys(config.frames):
     try:
      if frame not in (c.timeframes or {}):raise ValueError('지원하지 않는 시간봉')
      rows=await c.fetch_ohlcv(m['symbol'],frame,limit=300);r=await engine(candles(rows),frame,rules);observed=time.time()
      for event in r.get('matches',[]):
       # Detection refers to closed bars; observation price is the latest returned candle close, not a retroactive entry.
       store.record(dict(exchange=config.exchange,type=kind,symbol=m['symbol'],nativeId=m['id'],frame=frame,seconds=c.parse_timeframe(frame),signalTime=event['time'],signalType=event['type'],side=event.get('side'),ruleKey=rule_key,rules=rules,evidence=event,observedAt=observed,price=rows[-1][4],priceSource='latest returned candle close',performance={}))
      for record in store.signals(500):
       if (record['exchange'],record['type'],record['symbol'],record['frame'])==(config.exchange,kind,m['symbol'],frame):record['performance']=outcome(record,rows,observed);store.update(record)
      failures=0
     except Exception as e:
      status['errors']=(status['errors']+[f'{kind} {m["symbol"]} {frame}: {type(e).__name__} {str(e)[:150]}'])[-20:];failures+=1
      if isinstance(e,(ccxt.RateLimitExceeded,ccxt.DDoSProtection)) or re.search(r'\b(403|418|429)\b',str(e)):raise RuntimeError('거래소 제한으로 스캔 중지')
      if failures>=5:raise RuntimeError('연속 5회 실패로 스캔 중지')
     finally:status['done']+=1
     await asyncio.sleep(.7)
 except asyncio.CancelledError:status['errors'].append('사용자 요청으로 중지');raise
 except Exception as e:status['errors']=(status['errors']+[str(e)[:200]])[-20:]
 finally:status['running']=False;last_scan=time.time();status['nextRun']=last_scan+config.interval if config.enabled else None
async def scheduler():
 global scan_task
 while True:
  try:
   saved=store.config();config=Config(**saved) if saved else None
   if config and config.enabled and not status['running'] and time.time()-last_scan>=config.interval:
    scan_task=asyncio.create_task(run_scan(config))
   await asyncio.sleep(5)
  except asyncio.CancelledError:raise
  except Exception:await asyncio.sleep(10)
@asynccontextmanager
async def lifespan(app):
 if len(TOKEN)<32:raise RuntimeError('RESEARCH_TOKEN must be configured (32+ characters)')
 task=asyncio.create_task(scheduler())
 yield
 task.cancel()
 if scan_task:scan_task.cancel()
 if trade_task:trade_task.cancel()
 await asyncio.gather(*[c.close() for c in clients.values()],return_exceptions=True)
app=FastAPI(lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)
@app.middleware('http')
async def auth(request,call_next):
 if request.url.path!='/healthz' and not hmac.compare_digest(request.headers.get('authorization',''),'Bearer '+TOKEN):return JSONResponse({'error':'Unauthorized'},status_code=401)
 try:return await call_next(request)
 except Exception as e:return JSONResponse({'error':f'{type(e).__name__}: {str(e)[:250]}'},status_code=502)
@app.get('/healthz')
async def health():return {'status':'ready','service':'smc-research','version':'1.0'}
@app.get('/v1/status')
async def get_status():return {'scan':status,'config':store.config(),'signals':store.signals(),'storage':{'persistent':os.environ.get('PERSISTENT_STORAGE')=='true','note':'무료 서비스는 유휴 중단·재배포 시 기록 유실 가능. JSON 내보내기 권장.'},'packages':{'ccxt':'4.5.85','tvscreener':'0.5.2','tradingview-mcp-server':'0.8.1','freqtrade':'2026.9'},'tradeStream':{'market':trade_key,**trades.snapshot()}}
@app.post('/v1/config')
async def save_config(config:Config):
 global scan_task
 if scan_task and not scan_task.done():scan_task.cancel();await asyncio.gather(scan_task,return_exceptions=True)
 store.save_config(config.model_dump());status['nextRun']=time.time() if config.enabled else None
 return {'saved':config.model_dump()}
@app.post('/v1/scan')
async def scan():
 global scan_task
 async with job_lock:
  if scan_task and not scan_task.done():raise HTTPException(409,'이미 검사 중')
  config=Config(**(store.config() or {}));scan_task=asyncio.create_task(run_scan(config));status['running']=True
 return {'started':True}
@app.post('/v1/stop')
async def stop():
 config=Config(**(store.config() or {}));config.enabled=False;store.save_config(config.model_dump())
 if scan_task and not scan_task.done():scan_task.cancel();await asyncio.gather(scan_task,return_exceptions=True)
 status['nextRun']=None
 return {'stopped':True}

async def stream(c,m):
 while True:
  try:
   batch=await c.watch_trades(m['symbol'])
   for t in batch:trades.add(t)
  except asyncio.CancelledError:raise
  except Exception as e:
   trades.reset();trades.status='reconnecting: '+type(e).__name__;await asyncio.sleep(10)
@app.post('/v1/stream')
async def start_stream(request:Request):
 global trade_task,trade_key
 body=await request.json();exchange=body.get('exchange','okx');kind=body.get('type','perpetual');symbol=body.get('symbol','BTC/USDT:USDT')
 c,m=await resolve(exchange,kind,symbol)
 if not c.has.get('watchTrades'):raise HTTPException(400,'실시간 체결 스트림 미지원')
 key=f'{exchange}|{kind}|{m["symbol"]}'
 if key!=trade_key or not trade_task or trade_task.done():
  if trade_task:trade_task.cancel();await asyncio.gather(trade_task,return_exceptions=True)
  trades.reset();trade_key=key;trade_task=asyncio.create_task(stream(c,m))
 return {'market':key,'unit':'거래소 CCXT amount 단위 (선물은 계약 단위일 수 있음)','contractSize':m.get('contractSize'),**trades.snapshot()}
@app.post('/v1/stream/stop')
async def stop_stream():
 global trade_task,trade_key
 if trade_task:trade_task.cancel();await asyncio.gather(trade_task,return_exceptions=True)
 trade_task=None;trade_key=None;trades.reset();trades.status='stopped';return {'stopped':True}
@app.get('/v1/flow')
async def flow(exchange:str='okx',type:str='perpetual',symbol:str='BTC/USDT:USDT'):
 key=(exchange,type,symbol)
 if key in flow_cache and time.time()-flow_cache[key][0]<15:return flow_cache[key][1]
 c,m=await resolve(exchange,type,symbol);out={'exchange':exchange,'type':type,'symbol':m['symbol'],'asOf':time.time(),'funding':None,'openInterest':None,'bookImbalance':None,'errors':[]}
 for name,method in [('funding','fetch_funding_rate'),('openInterest','fetch_open_interest'),('book','fetch_order_book')]:
  if type=='spot' and name!='book':continue
  try:
   result=await getattr(c,method)(m['symbol'])
   if name=='book':
    bids=sum(x[1] for x in result['bids'][:20]);asks=sum(x[1] for x in result['asks'][:20]);out['bookImbalance']=(bids-asks)/(bids+asks) if bids+asks else None;out['bookTimestamp']=result.get('timestamp')
   else:out[name]={k:result.get(k) for k in (['fundingRate','fundingTimestamp','timestamp'] if name=='funding' else ['openInterestAmount','openInterestValue','timestamp'])}
  except Exception as e:out['errors'].append(name+': '+type_name(e))
 h=oi_history.setdefault(key,[]);value=(out['openInterest'] or {}).get('openInterestAmount');stamp=(out['openInterest'] or {}).get('timestamp')
 if value is not None and (not h or h[-1]['timestamp']!=(stamp or int(time.time()*1000))):h.append({'timestamp':stamp or int(time.time()*1000),'value':value});del h[:-120]
 out['oiHistory']=h.copy();out['oiChangePct']=(h[-1]['value']/h[0]['value']-1)*100 if len(h)>1 and h[0]['value'] else None;out['oiWindowStart']=h[0]['timestamp'] if h else None
 out['tradeStream']=trades.snapshot() if trade_key==f'{exchange}|{type}|{m["symbol"]}' else None
 flow_cache[key]=(time.time(),out)
 while len(flow_cache)>100:flow_cache.pop(next(iter(flow_cache)))
 while len(oi_history)>100:oi_history.pop(next(iter(oi_history)))
 return out

def type_name(e):return e.__class__.__name__+': '+str(e)[:150]
async def python_tool(mode,body):
 if external_lock.locked():raise HTTPException(409,'외부 분석이 실행 중입니다')
 async with external_lock:
  p=await asyncio.create_subprocess_exec(sys.executable,str(ROOT/'integrations.py'),mode,stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
  try:out,err=await asyncio.wait_for(p.communicate(json.dumps(body).encode()),75)
  except BaseException:
   if p.returncode is None:p.kill()
   await p.wait();raise
  if p.returncode:raise HTTPException(502,'외부 분석 실패: '+err.decode()[-350:])
  return json.loads(out)
@app.post('/v1/tradingview')
async def tradingview(request:Request):return await python_tool('screener',await request.json())
@app.post('/v1/mcp')
async def mcp(request:Request):return await python_tool('mcp',await request.json())
@app.post('/v1/backtest')
async def backtest(request:Request):return await python_tool('freqtrade',await request.json())
