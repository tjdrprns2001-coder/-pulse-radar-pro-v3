(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PulseMicrostructure=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
function num(v){v=Number(v);return Number.isFinite(v)?v:null}
function clamp(v,min=-1,max=1){v=num(v);return v==null?null:Math.max(min,Math.min(max,v))}
function cexFeatures(x={}){const bid=num(x.bidDepth),ask=num(x.askDepth),den=(bid||0)+(ask||0),depthImbalance=den>0?clamp((bid-ask)/den):null;const buy=num(x.takerBuy),sell=num(x.takerSell),td=(buy||0)+(sell||0),takerImbalance=td>0?clamp((buy-sell)/td):null;return{venue:'cex',depthImbalance,takerImbalance,spreadBps:num(x.spreadBps),oiAccelerationPct:num(x.oiAccelerationPct),fundingPct:num(x.fundingPct),volumeAcceleration:num(x.volumeAcceleration),compressionScore:num(x.compressionScore)}}
function dexFeatures(x={}){const buy=num(x.buySwapVolume),sell=num(x.sellSwapVolume),d=(buy||0)+(sell||0),swapImbalance=d>0?clamp((buy-sell)/d):null;return{venue:'dex',swapImbalance,poolLiquidityChangePct:num(x.poolLiquidityChangePct),lpNetFlowUsd:num(x.lpNetFlowUsd),priceImpactBps:num(x.priceImpactBps),uniqueTraderAcceleration:num(x.uniqueTraderAcceleration),whaleSwapShare:num(x.whaleSwapShare),volumeAcceleration:num(x.volumeAcceleration)}}
function buildFeatures(venue,x={}){return String(venue).toLowerCase()==='dex'?dexFeatures(x):cexFeatures(x)}
return{cexFeatures,dexFeatures,buildFeatures};
});
