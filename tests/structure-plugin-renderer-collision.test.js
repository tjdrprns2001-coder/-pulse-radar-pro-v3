const test=require('node:test');
const assert=require('node:assert/strict');
const {createStructurePlugin}=require('../ui/chart/plugins/structure-plugin');

test('series-marker renderer does not emit multiple overlapping structure labels that only differ by virtual layout offset',()=>{
  let emitted=[];
  const plugin=createStructurePlugin();
  const candles=[
    {time:100,open:100,high:101,low:99,close:100},
    {time:200,open:100,high:102,low:98,close:101},
    {time:300,open:101,high:103,low:97,close:99}
  ];
  plugin.mount({
    candlesSeries:{priceToCoordinate:()=>120},
    chart:{timeScale:()=>({timeToCoordinate:()=>140})},
    container:{clientWidth:390,clientHeight:300},
    library:{createSeriesMarkers(_series,markers){emitted=markers;return{setMarkers(){},detach(){}};}},
    addLineSeries(){return{setData(){}};}
  });
  plugin.update({
    timeframe:'15m',
    viewportLevel:'compact',
    candles,
    analysis:{events:[
      {type:'CHOCH',index:1,eventTime:200,dir:'down'},
      {type:'BOS',index:1,eventTime:200,dir:'down'}
    ]}
  });
  assert.equal(emitted.length,1,'renderer cannot apply annotation-layout pixel offsets, so lower-priority overlapping label must be hidden');
  assert.equal(emitted[0].text,'CHoCH');
});
