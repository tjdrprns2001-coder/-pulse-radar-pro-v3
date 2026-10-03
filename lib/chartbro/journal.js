'use strict';
const fs=require('node:fs'),path=require('node:path'),{canonical,copy}=require('./data');
/** Single worker append-only store. Use a persistent disk; multiple writers are unsupported. */
class Journal{
 constructor({dir=null}={}){this.tables=new Map();this.file=dir?path.join(dir,'chartbro-events.jsonl'):null;this.durable=!!dir;if(dir){fs.mkdirSync(dir,{recursive:true,mode:0o700});if(fs.existsSync(this.file)){const raw=fs.readFileSync(this.file,'utf8'),lines=raw.split('\n');let bytes=0;for(let i=0;i<lines.length;i++){if(!lines[i])continue;try{this.apply(JSON.parse(lines[i]));bytes+=Buffer.byteLength(lines[i]+'\n');}catch(e){if(i!==lines.length-1)throw new Error('journal corruption at line '+(i+1));fs.truncateSync(this.file,bytes);}}}}}
 apply(e){if(!this.tables.has(e.table))this.tables.set(e.table,new Map());const t=this.tables.get(e.table);if(e.op==='put'){if(t.has(e.id)&&canonical(t.get(e.id))!==canonical(e.value))throw new Error('immutable record conflict');t.set(e.id,copy(e.value));}else if(e.op==='project')t.set(e.id,copy(e.value));else throw new Error('invalid journal event');}
 append(e){const old=this.tables.get(e.table)?.get(e.id);if(e.op==='put'&&old!=null&&canonical(old)!==canonical(e.value))throw new Error('immutable record conflict');if(this.file){const fd=fs.openSync(this.file,'a',0o600);try{fs.writeSync(fd,JSON.stringify(e)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}this.apply(e);}
 put(table,id,value){const old=this.get(table,id);if(old!=null){if(canonical(old)!==canonical(value))throw new Error('immutable record conflict');return old;}this.append({op:'put',table,id,value});return copy(value);}
 project(table,id,value){this.append({op:'project',table,id,value});return copy(value);}
 get(table,id){const x=this.tables.get(table)?.get(id);return x==null?null:copy(x);}
 all(table){return [...(this.tables.get(table)?.values()||[])].map(copy);}
}
module.exports={Journal};
