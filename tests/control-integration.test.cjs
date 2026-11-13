const {test}=require('node:test');
const assert=require('node:assert/strict');
const createLive=require('../src/pkjs/live');
const createControl=require('../src/pkjs/control');
const createSimulation=require('../src/pkjs/simulation');

for(const disconnected of [false,true])test('offline provider adapter drives confirmation and read-back for both targets, disconnected='+disconnected,async()=>{
 const fixture=createSimulation(),values=new Map(),packets=[],requests=[];
 const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const api=createLive({storage,readConfig:()=>fixture.config,publish:p=>packets.push(p),request:(r,cb)=>{
  requests.push(r);fixture.request(r,(err,data)=>{
   if(disconnected && data?.devices)data.devices[0].status.currentState='SMART_CONTROL_NOT_AVAILABLE';
   if(disconnected && data?.flexPlannedDispatches)data.flexPlannedDispatches=[];
   cb(err,data);
  });
 }});
 let resolveState;
 const controller=createControl({storage,read:api.refresh,write:api.writePreferences,publish:p=>{packets.push(p);if(resolveState)resolveState(p);}});
 async function until(state,action){
  let timer;
  try {
   return await new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(new Error('Control state did not arrive: '+state)),5000);
    resolveState=p=>{if(p.CONTROL_STATE===state)resolve(p);};action();
   });
  }finally{clearTimeout(timer);resolveState=null;}
 }
 const cancelled=await until(2,()=>controller.prepare(80));
 controller.cancel();controller.confirm(cancelled.OFFER_ID);
 assert.equal(requests.filter(r=>r.body?.query?.includes('setDevicePreferences')).length,0);
 for(const [target,extra] of [[80,'+18%'],[100,'+38%']]){
  const offer=await until(2,()=>controller.prepare(target));assert.equal(offer.OFFER_EXTRA,extra);
  await until(4,()=>controller.confirm(offer.OFFER_ID));
  assert.equal(packets.filter(p=>p.ADD_TEXT).at(-1).ADD_TEXT,extra);
  assert.equal(packets.filter(p=>p.ADD_TEXT).at(-1).VEHICLE_MODEL,'EV6');
  if(disconnected){
   const summary=packets.filter(p=>p.ADD_TEXT).at(-1);
   assert.equal(summary.CHARGER_PHASE,3);assert.equal(summary.SCHEDULE_UNTIL,0);
  }
 }
 const writes=requests.filter(r=>r.body?.query?.includes('setDevicePreferences'));
 assert.equal(writes.length,2);
 for(const r of writes){assert.equal(r.body.variables.input.schedules.length,7);assert.equal(r.body.variables.input.mode,'CHARGE');}
 const output=JSON.stringify(packets);
 for(const secret of [...Object.values(fixture.config),'fixture-account','fixture-device','fixture-vin'])assert.ok(!output.includes(secret));
});
