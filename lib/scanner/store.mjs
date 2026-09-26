export class Store {
 constructor(db){this.db=db;}
 async get(key){const r=await this.db.prepare('SELECT data,expires FROM cache WHERE key=?').bind(key).first();return r&&r.expires>Date.now()?JSON.parse(r.data):null;}
 async put(key,data,ttl){await this.db.prepare('INSERT INTO cache(key,data,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,expires=excluded.expires').bind(key,JSON.stringify(data),Date.now()+ttl).run();}
 async job(id){const r=await this.db.prepare('SELECT data FROM jobs WHERE id=?').bind(id).first();return r?JSON.parse(r.data):null;}
 async latest(kind='scan'){const r=await this.db.prepare('SELECT data FROM jobs WHERE kind=? ORDER BY updated DESC LIMIT 1').bind(kind).first();return r?JSON.parse(r.data):null;}
 async save(job){job.updatedAt=Date.now();await this.db.prepare('INSERT INTO jobs(id,kind,status,data,updated,lease) VALUES(?,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data,updated=excluded.updated').bind(job.id,job.kind,job.status,JSON.stringify(job),job.updatedAt).run();}
 async acquire(id){const r=await this.db.prepare('UPDATE jobs SET lease=? WHERE id=? AND lease<?').bind(Date.now()+300000,id,Date.now()).run();return r.meta.changes===1;}
 async release(id){await this.db.prepare('UPDATE jobs SET lease=0 WHERE id=?').bind(id).run();}
 async reserve(key,limit,ms,units){const bucket='rate:'+key+':'+Math.floor(Date.now()/ms);const expires=(Math.floor(Date.now()/ms)+1)*ms;const r=await this.db.prepare('INSERT INTO cache(key,data,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET data=CAST(CAST(cache.data AS INTEGER)+? AS TEXT) WHERE CAST(cache.data AS INTEGER)+?<=?').bind(bucket,String(units),expires,units,units,limit).run();return r.meta.changes===1;}
 async gate(key,ttl){const r=await this.db.prepare('INSERT INTO cache(key,data,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET expires=excluded.expires WHERE cache.expires<?').bind(key,'true',Date.now()+ttl,Date.now()).run();return r.meta.changes===1;}
 async samples(){const r=await this.db.prepare('SELECT data FROM samples ORDER BY cutoff DESC LIMIT 300').all();return r.results.map(x=>JSON.parse(x.data));}
 async sample(s){await this.db.prepare('INSERT OR IGNORE INTO samples(id,symbol,cutoff,data) VALUES(?,?,?,?)').bind(s.id,s.symbol,s.cutoff,JSON.stringify(s)).run();}
 async cleanup(){await this.db.batch([this.db.prepare('DELETE FROM cache WHERE expires<?').bind(Date.now()-3600000),this.db.prepare('DELETE FROM jobs WHERE updated<?').bind(Date.now()-7*86400000),this.db.prepare('DELETE FROM samples WHERE id NOT IN (SELECT id FROM samples ORDER BY cutoff DESC LIMIT 1000)')]);}
}
