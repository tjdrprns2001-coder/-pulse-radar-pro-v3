'use strict';
const {ema,atr}=require('./intersection.js');
function n(v){const x=Number(v);return v===null||v===undefined||v===''||!Number.isFinite(x)?null:x}
function close(r){return n(Array.isArray(r)?r[4]:r?.close)}
function volume(r){return n(Array.isArray(r)?r[5]:r?.volume)}
function closeTime(r){return n(Array.isArray(r)?r[6]:r?.closeTime)}
function build4hContext(rows,{cutoffTs=Infinity}={}){
  const xs=(Array.isArray(rows)?rows:[]).filter(r=>{const t=closeTime(r);return t!=null&&t<=cutoffTs}).sort((a,b)=>closeTime(a)-closeTime(b));
  if(!xs.length)return{return_4h_pct:null,volume_acceleration:null,ema_distance_atr:null,ema_convergence_atr:null,structure_code:0,pullback_depth_pct:null};
  const i=xs.length-1,closes=xs.map(close),cur=closes[i],prev=i?closes[i-1]:null,a=atr(xs,i,14),e14=ema(closes,14),e28=ema(closes,28),e92=ema(closes,92);
  const pv=xs.slice(Math.max(0,i-6),i).map(volume).filter(v=>v!=null),mv=pv.length?pv.reduce((s,v)=>s+v,0)/pv.length:null,cv=volume(xs[i]);
  const recent=closes.slice(-6).filter(v=>v!=null),peak=recent.length?Math.max(...recent):null;
  return{
    return_4h_pct:prev?((cur/prev)-1)*100:null,
    volume_acceleration:mv&&cv!=null?cv/mv:null,
    ema_distance_atr:a&&e28!=null&&cur!=null?(cur-e28)/a:null,
    ema_convergence_atr:a&&e14!=null&&e92!=null?Math.abs(e14-e92)/a:null,
    structure_code:e28!=null&&e92!=null&&cur!=null?(cur>e28&&e28>e92?1:cur<e28&&e28<e92?-1:0):0,
    pullback_depth_pct:peak&&cur!=null?((cur/peak)-1)*100:null,
    ema14:e14,ema28:e28,ema92:e92,atr14:a,cutoffTs:xs[i]?closeTime(xs[i]):null
  };
}
module.exports={build4hContext};
