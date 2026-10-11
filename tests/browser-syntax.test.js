'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.name.endsWith('.js')?[path.join(dir,e.name)]:[])}
test('every browser UI script and inline HTML script parses before release',()=>{
 const errors=[];
 for(const f of files('ui'))try{new vm.Script(fs.readFileSync(f,'utf8'),{filename:f})}catch(e){errors.push(e.message+' in '+f)}
 for(const f of fs.readdirSync('.').filter(x=>x.endsWith('.html'))){let i=0;for(const m of fs.readFileSync(f,'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){i++;if(/\bsrc\s*=|type\s*=\s*["'](?:module|application\/ld\+json|application\/json)/i.test(m[1])||!m[2].trim())continue;try{new vm.Script(m[2],{filename:f+':script'+i})}catch(e){errors.push(e.message+' in '+f+':script'+i)}}}
 assert.deepEqual(errors,[]);
});
