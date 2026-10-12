import unittest,tempfile,time,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from core import TradeWindow,Store,outcome
class CoreTests(unittest.TestCase):
 def test_dedup_real_trade_side(self):
  w=TradeWindow();w.add({'id':'a','side':'buy','amount':3,'timestamp':100});w.add({'id':'a','side':'buy','amount':3,'timestamp':100});w.add({'id':'b','side':'sell','amount':1,'timestamp':101});w.add({'id':'c','amount':9,'timestamp':102});self.assertEqual(w.snapshot()['delta'],2);self.assertEqual(w.count,2);w.reset();self.assertEqual(w.count,0)
 def test_forward_only(self):
  r={'observedAt':100,'seconds':60,'price':100,'side':'bear'};bars=[[60000,100,102,98,101,10],[120000,100,101,94,95,10]];self.assertEqual(outcome(r,bars,179),{});v=outcome(r,bars,180)['1'];self.assertAlmostEqual(v['directionalReturnPct'],5);self.assertAlmostEqual(v['netAssumedPct'],4.8)
 def test_store_survives_reopen_and_deduplicates(self):
  with tempfile.TemporaryDirectory() as d:
   p=d+'/db';s=Store(p);r=dict(exchange='okx',type='spot',symbol='BTC/USDT',frame='1h',signalTime=1,ruleKey='rule',signalType='Spring',observedAt=2,price=100);s.record(r);s.record({**r,'price':200});s.save_config({'enabled':False});s.db.close();b=Store(p);self.assertEqual(len(b.signals()),1);self.assertEqual(b.signals()[0]['price'],100);self.assertFalse(b.config()['enabled'])
if __name__=='__main__':unittest.main()
