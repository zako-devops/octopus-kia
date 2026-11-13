function number(value) { return value!==null && value!==undefined && value!=='' && isFinite(Number(value)) ? Number(value) : null; }
function percent(value) { return String(Math.round(value*100)/100)+'%'; }
function preview(soc,target,limits) {
  if(typeof soc!=='number' || !isFinite(soc) || soc<0 || soc>100) return {amount:null,reason:'Falta batería Kia'};
  var amount=Math.max(0,Math.round((target-soc)*100)/100);
  if(!amount) return {amount:0,reason:'Objetivo alcanzado'};
  var min=limits && number(limits.min), max=limits && number(limits.max), step=limits && number(limits.step);
  if(min===null || max===null || step===null || !limits || min<0 || max<min || step<=0) return {amount:amount,reason:'Límites no disponibles'};
  if(amount<min) return {amount:amount,reason:'Mínimo '+percent(min)};
  if(amount>max) return {amount:amount,reason:'Máximo '+percent(max)};
  var steps=(amount-min)/step;
  if(Math.abs(steps-Math.round(steps))>0.00001) return {amount:amount,reason:'Paso de '+percent(step)};
  return {amount:amount,reason:''};
}
function acReason(limit,target) {
  if(typeof limit!=='number' || !isFinite(limit) || Math.floor(limit)!==limit || limit<0 || limit>100) return 'Límite AC no disponible';
  return target>limit ? 'Límite AC Kia: '+percent(limit) : '';
}
module.exports={preview:preview,percent:percent,acReason:acReason};
