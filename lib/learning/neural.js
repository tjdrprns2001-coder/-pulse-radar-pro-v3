'use strict';

const VERSION='RESEARCH_NEURAL_v2';
const MODEL_TYPE='tiny_mlp_18x12x6x1';

function sigmoid(x){return 1/(1+Math.exp(-Math.max(-30,Math.min(30,Number(x)||0))))}
function deterministicWeight(i,j,scale=.12){return Math.sin((i+1)*17.13+(j+1)*9.77)*scale}
function createModel(inputSize=18,{h1=12,h2=6}={}){
  return{
    version:VERSION,type:MODEL_TYPE,inputSize,h1,h2,trainedLabels:0,trainedAt:null,
    w1:Array.from({length:h1},(_,j)=>Array.from({length:inputSize},(_,i)=>deterministicWeight(i,j))),
    b1:Array(h1).fill(0),
    w2:Array.from({length:h2},(_,j)=>Array.from({length:h1},(_,i)=>deterministicWeight(i,j,.1))),
    b2:Array(h2).fill(0),
    w3:Array.from({length:h2},(_,i)=>deterministicWeight(i,0,.1)),
    b3:0
  };
}
function validateModel(model,inputSize){
  return Boolean(model&&model.type===MODEL_TYPE&&Array.isArray(model.w1)&&model.w1.length===model.h1&&model.w1.every(r=>Array.isArray(r)&&r.length===inputSize));
}
function forward(model,x){
  if(!validateModel(model,x.length))throw new Error('invalid neural model');
  const h1=model.w1.map((row,j)=>Math.tanh(row.reduce((s,w,i)=>s+w*x[i],model.b1[j])));
  const h2=model.w2.map((row,j)=>Math.tanh(row.reduce((s,w,i)=>s+w*h1[i],model.b2[j])));
  const z=model.w3.reduce((s,w,i)=>s+w*h2[i],model.b3);
  return{h1,h2,p:sigmoid(z)};
}
function trainOne(model,x,y,lr=.018){
  const f=forward(model,x),dz=f.p-y,oldW3=model.w3.slice();
  for(let i=0;i<model.w3.length;i++)model.w3[i]-=lr*dz*f.h2[i];
  model.b3-=lr*dz;
  const dh2=oldW3.map((w,i)=>dz*w*(1-f.h2[i]*f.h2[i])),oldW2=model.w2.map(r=>r.slice());
  for(let j=0;j<model.w2.length;j++){
    for(let i=0;i<model.w2[j].length;i++)model.w2[j][i]-=lr*dh2[j]*f.h1[i];
    model.b2[j]-=lr*dh2[j];
  }
  const dh1=f.h1.map((h,i)=>{
    let s=0;for(let j=0;j<oldW2.length;j++)s+=dh2[j]*oldW2[j][i];
    return s*(1-h*h);
  });
  for(let j=0;j<model.w1.length;j++){
    for(let i=0;i<model.w1[j].length;i++)model.w1[j][i]-=lr*dh1[j]*x[i];
    model.b1[j]-=lr*dh1[j];
  }
  return f.p;
}
function binaryCrossEntropy(p,y){
  p=Math.max(1e-6,Math.min(1-1e-6,Number(p)||0));
  return -(y*Math.log(p)+(1-y)*Math.log(1-p));
}
function train(model,rows,{epochs=12,lr=.018}={}){
  if(!rows.length)return{model,metrics:{loss:null,count:0}};
  let loss=0,count=0;
  for(let epoch=0;epoch<epochs;epoch++){
    for(const row of rows){
      const p=trainOne(model,row.features,row.label,lr);
      loss+=binaryCrossEntropy(p,row.label);count++;
    }
  }
  model.trainedLabels=rows.length;model.trainedAt=Date.now();
  return{model,metrics:{loss:count?loss/count:null,count:rows.length}};
}

module.exports={VERSION,MODEL_TYPE,sigmoid,createModel,validateModel,forward,trainOne,binaryCrossEntropy,train};
