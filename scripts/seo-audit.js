#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules','.git','.next','dist','build','coverage'].includes(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full);
    else if (/\.(tsx?|jsx?|html)$/.test(ent.name)) files.push(full);
  }
}
for (const dir of ['app','pages','src','public']) walk(path.join(root, dir));
const read = p => fs.existsSync(p) ? fs.readFileSync(p,'utf8') : '';
const all = files.map(read).join('\n');
const checks = [
  ['robots', ['public/robots.txt','app/robots.ts','app/robots.js','src/app/robots.ts'].some(p=>fs.existsSync(path.join(root,p)))],
  ['sitemap', ['public/sitemap.xml','app/sitemap.ts','app/sitemap.js','src/app/sitemap.ts'].some(p=>fs.existsSync(path.join(root,p)))],
  ['metadata', /<title|metadata\s*=|generateMetadata|next\/head/i.test(all)],
  ['canonical', /canonical|alternates\s*:/i.test(all)],
  ['structured-data', /application\/ld\+json|schema\.org/i.test(all)],
  ['og-tags', /openGraph|og:title/i.test(all)],
  ['description', /description\s*:|name=["']description/i.test(all)],
  ['semantic-h1', /<h1\b/i.test(all)]
];
const result = {scannedFiles:files.length, checks:checks.map(([name,pass])=>({name,pass})), notes:['Static presence checks only; inspect rendered HTML and production URLs separately.','No claims about search rankings or AI citations.']};
console.log(JSON.stringify(result,null,2));
if (process.argv.includes('--strict') && checks.some(([,pass])=>!pass)) process.exitCode=1;
