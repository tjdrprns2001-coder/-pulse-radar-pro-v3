export class MemoryStore{
 constructor(){this.cache=new Map();this.jobs=new Map();this.ss=new Map();this.lock=false;}
 async get(k){const e=this.cache.get(k);return e&&e.expires>Date.now()?e.data:null;}
 async put(k,data,ttl){this.cache.set(k,{data,expires:Date.now()+ttl});}
 async gate(k,ttl){if(await this.get(k))return false;await this.put(k,true,ttl);return true;}
 async reserve(k,limit,ms,units){const bucket='rate:'+k+':'+Math.floor(Date.now()/ms);const used=await this.get(bucket)||0;if(used+units>limit)return false;await this.put(bucket,used+units,ms);return true;}
 async latest(kind){return [...this.jobs.values()].filter(j=>j.kind===kind).at(-1)||null;}
 async job(id){return this.jobs.get(id)||null;}
 async save(j){j.updatedAt=Date.now();this.jobs.set(j.id,j);}
 async acquire(){if(this.lock)return false;this.lock=true;return true;}
 async release(){this.lock=false;}
 async samples(){return [...this.ss.values()];}
 async sample(s){this.ss.set(s.id,s);}
 async cleanup(){}
}
