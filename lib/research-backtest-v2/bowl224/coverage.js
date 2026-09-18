'use strict';
function rowsOf(x){return Array.isArray(x?.rows)?x.rows:[]}
function complete(x){return x?.coverage?.complete===true}
function assessWarmup({daily,h4,h1,m15,m5,future}={}){
  const d=rowsOf(daily).length,h4n=rowsOf(h4).length,h1n=rowsOf(h1).length;
  return{
    bowlDailyEligible:complete(daily)&&d>=344,
    preferredDailyWarmup:complete(daily)&&d>=400,
    h4Ready:complete(h4)&&h4n>=240,
    h1Ready:complete(h1)&&h1n>=500,
    lowerTimeframeReady:complete(h4)&&h4n>=240&&complete(h1)&&h1n>=500,
    m15Ready:m15==null?null:complete(m15),
    m5Ready:m5==null?null:complete(m5),
    future7dReady:complete(future)&&rowsOf(future).length>=672
  };
}
module.exports={assessWarmup};
