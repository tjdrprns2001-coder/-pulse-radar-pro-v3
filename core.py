import json,sqlite3,time,hashlib,math
from pathlib import Path
from collections import OrderedDict

class TradeWindow:
 def __init__(self):self.reset()
 def reset(self):self.ids=OrderedDict();self.buy=0.;self.sell=0.;self.count=0;self.start=None;self.end=None;self.status='connecting'
 def add(self,trade):
  ident=trade.get('id');side=trade.get('side');amount=trade.get('amount');stamp=trade.get('timestamp')
  if ident is None or side not in ('buy','sell') or not isinstance(amount,(float,int)) or not math.isfinite(amount) or amount<=0 or not stamp:return
  if str(ident) in self.ids:return
  self.ids[str(ident)]=True
  while len(self.ids)>20000:self.ids.popitem(last=False)
  if side=='buy':self.buy+=amount
  else:self.sell+=amount
  self.count+=1;self.start=min(self.start or stamp,stamp);self.end=max(self.end or stamp,stamp);self.status='streaming'
 def snapshot(self):return dict(buy=self.buy,sell=self.sell,delta=self.buy-self.sell,trades=self.count,fromTime=self.start,toTime=self.end,status=self.status,coverage='현재 연결 구간에서 수신한 실제 체결만 누적; 재연결 시 초기화')

def outcome(record,candles,now):
 # Only complete bars starting after the observation are eligible. Never fills past signals retroactively.
 future=[c for c in candles if c[0]/1000>=record['observedAt'] and c[0]/1000+record['seconds']<=now]
 future.sort(key=lambda c:c[0])
 expected=math.ceil(record['observedAt']/record['seconds'])*record['seconds']
 continuous=[]
 for c in future:
  if abs(c[0]/1000-expected)>0.001:break
  continuous.append(c);expected+=record['seconds']
 future=continuous
 result={}
 for horizon in [1,4,12]:
  if len(future)<horizon:continue
  bars=future[:horizon];p=record['price'];ret=(bars[-1][4]/p-1)*100;direction=-1 if record.get('side')=='bear' else 1
  result[str(horizon)]={'priceReturnPct':ret,'directionalReturnPct':ret*direction if record.get('side') in ('bull','bear') else None,'netAssumedPct':ret*direction-.2 if record.get('side') in ('bull','bear') else None,'highExcursionPct':(max(x[2] for x in bars)/p-1)*100,'lowExcursionPct':(min(x[3] for x in bars)/p-1)*100,'through':bars[-1][0]/1000+record['seconds']}
 return result

class Store:
 def __init__(self,path):
  Path(path).parent.mkdir(parents=True,exist_ok=True);self.db=sqlite3.connect(path,check_same_thread=False)
  self.db.execute('CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, body TEXT NOT NULL)')
  self.db.execute('CREATE TABLE IF NOT EXISTS signals (id TEXT PRIMARY KEY, observed REAL NOT NULL, body TEXT NOT NULL)');self.db.commit()
 def config(self):
  r=self.db.execute('SELECT body FROM settings WHERE id=1').fetchone();return json.loads(r[0]) if r else None
 def save_config(self,value):self.db.execute('INSERT OR REPLACE INTO settings VALUES (1,?)',(json.dumps(value),));self.db.commit()
 def record(self,value):
  key=hashlib.sha256(json.dumps([value[k] for k in ['exchange','type','symbol','frame','signalTime','ruleKey','signalType']],sort_keys=True).encode()).hexdigest()[:24];value={**value,'id':key}
  self.db.execute('INSERT OR IGNORE INTO signals VALUES (?,?,?)',(key,value['observedAt'],json.dumps(value)));self.db.execute('DELETE FROM signals WHERE id NOT IN (SELECT id FROM signals ORDER BY observed DESC LIMIT 5000)');self.db.commit()
 def signals(self,limit=200):return [json.loads(r[0]) for r in self.db.execute('SELECT body FROM signals ORDER BY observed DESC LIMIT ?',(limit,))]
 def update(self,r):self.db.execute('UPDATE signals SET body=? WHERE id=?',(json.dumps(r),r['id']));self.db.commit()
