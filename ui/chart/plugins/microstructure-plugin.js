(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseMicrostructurePlugin=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
function createMicrostructurePlugin(){
  let ctx=null,visible=true,canvas=null,state=null,ro=null;
  const sec=v=>{const n=Number(v);return Number.isFinite(n)?Math.trunc(n>1e12?n/1000:n):null};
  function cleanup(){try{ro?.disconnect()}catch{}ro=null;if(canvas?.parentNode)canvas.parentNode.removeChild(canvas);canvas=null}
  function ensure(){if(canvas||!ctx?.container)return;ctx.container.style.position=ctx.container.style.position||'relative';canvas=document.createElement('canvas');canvas.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:4;width:100%;height:100%';ctx.container.appendChild(canvas);if(typeof ResizeObserver!=='undefined'){ro=new ResizeObserver(draw);ro.observe(ctx.container)}}
  function draw(){
    if(!visible||!canvas||!ctx||!state)return;
    const dpr=Math.max(1,window.devicePixelRatio||1),w=ctx.container.clientWidth,h=ctx.container.clientHeight;if(!w||!h)return;
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const g=canvas.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
    const data=state.chartV1||{},book=data.orderbook||{},wallState=book.wall_state||{},walls=(wallState.persistent_walls||[]).filter(x=>Number.isFinite(Number(x.price))&&Number.isFinite(Number(x.quote_value))).slice(0,20);
    if(walls.length&&ctx.candlesSeries?.priceToCoordinate){
      const max=Math.max(...walls.map(x=>Number(x.quote_value)||0),1),x1=w*.62,x2=w-5;
      for(const wall of walls){
        const y=ctx.candlesSeries.priceToCoordinate(Number(wall.price));if(!Number.isFinite(y))continue;
        const ratio=Math.max(.08,Math.min(1,(Number(wall.quote_value)||0)/max)),age=Math.max(0,Date.now()-Number(wall.first_seen||Date.now())),persist=Math.min(1,age/30000),alpha=.08+.22*ratio+.12*persist;
        g.fillStyle=wall.side==='bid'?'rgba(61,204,177,'+alpha+')':'rgba(255,174,92,'+alpha+')';g.fillRect(x1,y-4,(x2-x1)*ratio,8);
        g.strokeStyle=wall.side==='bid'?'rgba(82,231,202,.72)':'rgba(255,193,118,.72)';g.lineWidth=1;g.beginPath();g.moveTo(x1,y);g.lineTo(x1+(x2-x1)*ratio,y);g.stroke();
      }
      g.fillStyle='rgba(220,232,245,.72)';g.font='10px system-ui';g.fillText('L2 WALL HEAT · snapshot inference',Math.max(8,x1),28);
    }
    const liq=(data.liquidations?.series||[]).filter(x=>Number.isFinite(Number(x.event_time))&&Number.isFinite(Number(x.price))&&Number.isFinite(Number(x.notional_usd))).slice(-60);
    if(liq.length&&ctx.chart?.timeScale&&ctx.candlesSeries?.priceToCoordinate){
      const max=Math.max(...liq.map(x=>Number(x.notional_usd)||0),1);
      for(const x of liq){
        const px=ctx.chart.timeScale().timeToCoordinate(sec(x.event_time)),py=ctx.candlesSeries.priceToCoordinate(Number(x.price));if(!Number.isFinite(px)||!Number.isFinite(py))continue;
        const r=3+8*Math.sqrt(Math.max(0,Number(x.notional_usd)||0)/max);g.beginPath();g.arc(px,py,r,0,Math.PI*2);g.fillStyle=x.side==='short'?'rgba(53,214,154,.28)':'rgba(255,101,119,.30)';g.fill();g.strokeStyle=x.side==='short'?'rgba(83,235,179,.78)':'rgba(255,123,139,.80)';g.lineWidth=1;g.stroke();
      }
      g.fillStyle='rgba(220,232,245,.72)';g.font='10px system-ui';g.fillText('LIQUIDATION HEAT · actual force orders',8,28);
    }
    const tp=data.trade_volume_profile;if(tp?.available&&tp.poc?.price!=null&&ctx.candlesSeries?.priceToCoordinate){
      const y=ctx.candlesSeries.priceToCoordinate(Number(tp.poc.price));if(Number.isFinite(y)){g.strokeStyle='rgba(255,196,95,.82)';g.setLineDash([3,3]);g.beginPath();g.moveTo(0,y);g.lineTo(Math.min(w*.34,240),y);g.stroke();g.setLineDash([])}
    }
  }
  return{id:'microstructure',version:'1.0.0',requiredData:['chartV1'],mount(c){ctx=c;ensure()},update(s){state=s;ensure();draw()},setVisible(v){visible=!!v;if(visible){ensure();draw()}else if(canvas){const g=canvas.getContext('2d');g.clearRect(0,0,canvas.width,canvas.height)}},dispose(){cleanup();ctx=null;state=null}}
}
return{createMicrostructurePlugin};
});