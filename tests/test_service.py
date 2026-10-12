import unittest,sys,os,tempfile,asyncio
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
os.environ['RESEARCH_TOKEN']='test-only-not-production-token-00000000';temp=tempfile.TemporaryDirectory();os.environ['DB_PATH']=temp.name+'/db.sqlite'
from fastapi.testclient import TestClient
import service
class ServiceTests(unittest.TestCase):
 def test_auth_and_validation(self):
  with TestClient(service.app) as c:
   self.assertEqual(c.get('/healthz').status_code,200);self.assertEqual(c.get('/v1/status').status_code,401)
   h={'Authorization':'Bearer '+os.environ['RESEARCH_TOKEN']};self.assertEqual(c.get('/v1/status',headers=h).status_code,200)
   self.assertEqual(c.post('/v1/config',headers=h,json={'interval':1}).status_code,422)
   self.assertEqual(c.post('/v1/config',headers=h,json={'exchange':'evil'}).status_code,422)
   self.assertEqual(c.post('/v1/config',headers=h,json={'enabled':False,'types':['spot','perpetual'],'frames':['15m','1h']}).status_code,200)
 def test_shared_engine(self):
  import time
  end=int(time.time()//3600)*3600
  data=[dict(time=end-(61-i)*3600,open=100,close=100,high=110,low=90,volume=100) for i in range(60)]
  data.append(dict(time=end-3600,open=92,close=96,high=99,low=88,volume=180))
  result=asyncio.run(service.engine(data,'1h',{'mode':'wyckoff'}));self.assertEqual(result['matches'][0]['type'],'Spring')
if __name__=='__main__':unittest.main()
