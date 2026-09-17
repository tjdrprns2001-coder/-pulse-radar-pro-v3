'use strict';
const TYPES=new Set(['official-project','exchange','protocol','regulatory','ecosystem','news']);
const TRUST=new Set(['official-project','exchange','regulatory']);
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function safeUrl(raw){try{const u=new URL(String(raw||''));if(!/^https?:$/.test(u.protocol))return null;u.hash='';return u.toString()}catch{return null}}
function normalizeEvidence(input={}){
  const title=String(input.title||'').trim();if(!title)throw new Error('evidence title required');
  const url=safeUrl(input.url);if(!url)throw new Error('evidence url required');
  const publishedAt=finite(input.publishedAt??input.observedAt);if(publishedAt==null)throw new Error('evidence publishedAt required');
  const type=TYPES.has(String(input.type||''))?String(input.type):'news';
  let domain=String(input.domain||'').trim().toLowerCase();if(!domain){try{domain=new URL(url).hostname.toLowerCase()}catch{domain='unknown'}}
  return{id:String(input.id||`${domain}:${publishedAt}:${title.toLowerCase().slice(0,80)}`),title,url,domain,publishedAt,observedAt:finite(input.observedAt)??publishedAt,symbols:[...new Set((Array.isArray(input.symbols)?input.symbols:[]).map(x=>String(x||'').toUpperCase()).filter(Boolean))],sectors:[...new Set((Array.isArray(input.sectors)?input.sectors:[]).map(x=>String(x||'').trim()).filter(Boolean))],type,direction:['positive','negative','neutral'].includes(String(input.direction||''))?String(input.direction):'neutral',summary:input.summary?String(input.summary).slice(0,500):null};
}
function rankEvidence(items=[],{now=Date.now(),ttlMs=21600000}={}){
  const seen=new Set(),unique=[];for(const raw of Array.isArray(items)?items:[]){let x;try{x=raw?.url&&raw?.publishedAt!=null&&raw?.type?normalizeEvidence(raw):normalizeEvidence(raw)}catch{continue}const canonical=x.url.replace(/\/$/,'').toLowerCase();if(seen.has(canonical))continue;seen.add(canonical);unique.push({...x,stale:now-x.publishedAt>ttlMs,conflict:false})}
  const fresh=unique.filter(x=>!x.stale);
  for(const item of unique){if(item.direction==='neutral')continue;const opposite=item.direction==='positive'?'negative':'positive';item.conflict=unique.some(other=>other!==item&&other.direction===opposite&&item.symbols.some(s=>other.symbols.includes(s)))}
  const trusted=fresh.some(x=>TRUST.has(x.type));const sources=fresh.length;const strength=sources===0?'none':trusted||sources>=2?'strong':'moderate';
  return{strength,sources,items:unique,conflicts:unique.filter(x=>x.conflict).length,latestPublishedAt:fresh.length?Math.max(...fresh.map(x=>x.publishedAt)):null};
}
module.exports={TYPES,TRUST,normalizeEvidence,rankEvidence};
