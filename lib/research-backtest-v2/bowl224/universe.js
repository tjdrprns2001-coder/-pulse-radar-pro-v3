'use strict';
function classifyBowlUniverse(series,index){
  const completed=Math.max(0,Math.min((Array.isArray(series)?series.length:0),Number(index)+1));
  return{universe:completed>=224?'L':'N',completedDailyCount:completed,bowlEligible:completed>=224,preferred400d:completed>=400};
}
module.exports={classifyBowlUniverse};
