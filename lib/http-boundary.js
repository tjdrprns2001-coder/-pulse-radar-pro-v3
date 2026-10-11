'use strict';
const fs=require('node:fs'),path=require('node:path');
const extensions=new Set(['.html','.js','.css','.json','.svg','.png','.jpg','.jpeg','.webp','.ico','.txt','.woff','.woff2','.ttf','.webmanifest']);
// Only library modules explicitly used by browser documents/workers are public.
function browserLibraries(root){
 const out=new Set();
 function inspect(file){const text=fs.readFileSync(file,'utf8');for(const m of text.matchAll(/["'](\/lib\/[A-Za-z0-9_./-]+\.js)(?:\?[^"']*)?["']/g))out.add(m[1])}
 for(const entry of fs.readdirSync(root,{withFileTypes:true}))if(entry.isFile()&&entry.name.endsWith('.html'))inspect(path.join(root,entry.name));
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name.startsWith('.'))continue;const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else if(e.isFile()&&e.name.endsWith('.js'))inspect(file)}}
 walk(path.join(root,'ui'));return out;
}
function publicFile(root,pathname,aliases,libraries){
 let decoded;try{decoded=decodeURIComponent(aliases[pathname]||pathname)}catch{const e=new Error('Malformed URL');e.statusCode=400;throw e}
 if(decoded.includes('\\')||decoded.includes('\0')||decoded.split('/').some(x=>x.startsWith('.')))return null;
 const ext=path.extname(decoded).toLowerCase(),parts=decoded.split('/').filter(Boolean);
 const allowed=parts.length===1&&ext==='.html'||['ui','assets','images','icons','vendor'].includes(parts[0])&&extensions.has(ext)||libraries.has(decoded)||['/favicon.ico','/robots.txt','/manifest.webmanifest'].includes(decoded);
 if(!allowed)return null;
 const file=path.resolve(root,'.'+decoded);
 if(!file.startsWith(root+path.sep))return null;
 // Do not permit links to escape the public tree.
 if(fs.existsSync(file)&&fs.realpathSync(file)!==file)return null;
 return file;
}
module.exports={browserLibraries,publicFile};
