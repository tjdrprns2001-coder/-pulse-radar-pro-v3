'use strict';
importScripts('/lib/chartbro/data.js','/lib/chartbro/indicators.js','/lib/chartbro/models.js','/lib/chartbro/engine.js');
self.onmessage=function(e){const {generation,bars,config,at}=e.data;try{const r=ChartBroEngine.analyze(bars,{...config,at,capture_snapshots:false});self.postMessage({generation,snapshot:r.last,bars:r.bars,events:r.events,feature_series:r.features});}catch(error){self.postMessage({generation,error:error.message});}};
