"""Isolated, fixed read-only adapters. Never accepts commands, paths or code from callers."""
import sys,json,re,asyncio,contextlib,io,tempfile,subprocess,zipfile,time
from pathlib import Path

def validate(body):
 exchange=str(body.get('exchange','OKX')).upper();symbol=str(body.get('symbol','BTCUSDT')).upper();frame=str(body.get('frame','1h'))
 if exchange not in ['OKX','BYBIT','BINANCE','KUCOIN','COINBASE','KRAKEN','BITGET']:raise ValueError('Unsupported exchange')
 if not re.fullmatch(r'[A-Z0-9_.]{2,40}',symbol):raise ValueError('Invalid TradingView symbol')
 if frame not in ['5m','15m','1h','4h','1d']:raise ValueError('Unsupported timeframe')
 return exchange,symbol,frame

def screener(body):
 from tvscreener import CryptoScreener,CryptoField
 exchange,symbol,frame=validate(body);s=CryptoScreener();s.select(CryptoField.NAME,CryptoField.EXCHANGE,CryptoField.PRICE,CryptoField.CHANGE,CryptoField.VOLUME,CryptoField.RELATIVE_STRENGTH_INDEX_14);s.where(CryptoField.EXCHANGE==exchange);s.set_range(0,20)
 d=s.get();return {'source':'tvscreener 0.5.2 · 비공식 TradingView 스크리너','timeframe':'TradingView 기본 필드; 현재 차트 시간봉과 독립','asOf':time.time(),'data':json.loads(d.to_json(orient='records'))}
async def mcp(body):
 # Execute the package through the actual MCP stdio protocol, with a fixed tool allowlist.
 from mcp import ClientSession,StdioServerParameters
 from mcp.client.stdio import stdio_client
 exchange,symbol,frame=validate(body)
 params=StdioServerParameters(command=sys.executable,args=['-m','tradingview_mcp.server'])
 async with stdio_client(params) as (read,write):
  async with ClientSession(read,write) as session:
   await session.initialize();r=await session.call_tool('coin_analysis',{'symbol':symbol,'exchange':exchange,'timeframe':frame})
   return {'source':'tradingview-mcp-server 0.8.1','symbol':exchange+':'+symbol,'frame':frame,'isError':r.isError,'data':[c.text for c in r.content if hasattr(c,'text')]}

def freqtrade(body):
 import ccxt
 exchange=str(body.get('exchange','okx')).lower();frame=body.get('frame','1h');symbol=body.get('pair','BTC/USDT')
 if exchange not in ['okx','binance','kraken'] or frame not in ['5m','15m','1h','4h','1d'] or not re.fullmatch(r'[A-Z0-9]{2,20}/USDT',symbol):raise ValueError('Baseline backtest supports OKX/Binance/Kraken USDT spot only')
 c=getattr(ccxt,exchange)({'enableRateLimit':True,'timeout':15000});rows=c.fetch_ohlcv(symbol,frame,limit=1000);now=time.time()*1000;seconds=c.parse_timeframe(frame);rows=[r for r in rows if r[0]+seconds*1000<=now]
 if len(rows)<250:raise ValueError('Need at least 250 closed candles, including 200-bar warmup')
 with tempfile.TemporaryDirectory() as temp:
  root=Path(temp);(root/'data').mkdir();(root/'results').mkdir();(root/'data'/f'{symbol.replace("/","_")}-{frame}.json').write_text(json.dumps(rows))
  config={'max_open_trades':1,'stake_currency':'USDT','stake_amount':100,'tradable_balance_ratio':.99,'dry_run':True,'dry_run_wallet':1000,'trading_mode':'spot','timeframe':frame,'stoploss':-.02,'minimal_roi':{'0':.03},'fee':.001,'exchange':{'name':exchange,'key':'','secret':'','pair_whitelist':[symbol],'pair_blacklist':[]},'pairlists':[{'method':'StaticPairList'}],'entry_pricing':{'price_side':'other','use_order_book':False,'price_last_balance':0},'exit_pricing':{'price_side':'other','use_order_book':False,'price_last_balance':0},'dataformat_ohlcv':'json'}
  conf=root/'config.json';conf.write_text(json.dumps(config))
  cmd=[sys.executable,'-m','freqtrade','backtesting','--config',str(conf),'--strategy','AtlasBaseline','--strategy-path',str(Path(__file__).parent/'strategies'),'--userdir',str(root),'--datadir',str(root/'data'),'--data-format-ohlcv','json','--backtest-directory',str(root/'results'),'--cache','none','--export','trades']
  run=subprocess.run(cmd,capture_output=True,text=True,timeout=65)
  if run.returncode:raise RuntimeError(run.stderr[-500:])
  results=[]
  for path in (root/'results').glob('*.zip'):
   with zipfile.ZipFile(path) as z:
    for name in z.namelist():
     if name.endswith('.json') and not any(k in name for k in ['config','meta']):
      content=json.loads(z.read(name))
      if 'strategy' in content:
       for strategy,stats in content['strategy'].items():results.append({k:stats.get(k) for k in ['strategy_name','total_trades','profit_total','profit_total_abs','winrate','max_drawdown_account','backtest_start','backtest_end']})
  if not results:raise RuntimeError('Freqtrade returned no readable result archive')
  return {'source':'Freqtrade 2026.9 CLI','strategy':'AtlasBaseline (현물 EMA20/50/200 + RSI<70; 기존 SMC 전략 아님)','candles':len(rows),'feePerSide':.001,'slippageMode':'명시적 슬리피지 모델 없음 · OHLCV 체결 가정','data':results}
if __name__=='__main__':
 try:
  mode=sys.argv[1];body=json.load(sys.stdin)
  with contextlib.redirect_stdout(sys.stderr):
   result=asyncio.run(mcp(body)) if mode=='mcp' else screener(body) if mode=='screener' else freqtrade(body) if mode=='freqtrade' else (_ for _ in ()).throw(ValueError('Unknown adapter'))
  print(json.dumps(result,default=str,allow_nan=False))
 except Exception as e:print(type(e).__name__+': '+str(e)[:700],file=sys.stderr);sys.exit(1)
