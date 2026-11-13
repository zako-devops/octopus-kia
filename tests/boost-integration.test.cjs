const {test}=require('node:test');
const assert=require('node:assert/strict');
const live=require('../src/pkjs/live');
const control=require('../src/pkjs/control');
const simulation=require('../src/pkjs/simulation');

for(const disconnected of [false,true])test('offline boost adapter round-trip, disconnected='+disconnected,async()=>{
 const fixture=simulation(),values=new Map(),packets=[],requests=[];
 const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const api=live({storage,readConfig:()=>fixture.config,publish:p=>packets.push(p),request:(r,cb)=>{
  requests.push(r);fixture.request(r,(err,data)=>{
   if(disconnected && data?.devices)data.devices[0].status.currentState='SMART_CONTROL_NOT_AVAILABLE';
   cb(err,data);
  });
 }});
 let listener;
 const c=control({storage,read:api.refresh,write:api.writePreferences,writeBoost:api.writeBoost,publish:p=>listener?.(p)});
 async function until(action){
  let timer;
  try{return await new Promise((resolve,reject)=>{
   timer=setTimeout(()=>reject(new Error('Boost result timeout')),5000);
   listener=p=>{if(p.CONTROL_STATE===2||p.CONTROL_STATE>=4)resolve(p);};action();
  });}finally{clearTimeout(timer);listener=null;}
 }
 let offer=await until(()=>c.prepare(0));
 if(disconnected){assert.equal(offer.CONTROL_STATE,5);assert.match(offer.CONTROL_TEXT,/Conecta/);}
 else{
  assert.equal(offer.CONTROL_STATE,2);c.cancel();c.confirm(offer.OFFER_ID);
  assert.equal(requests.filter(r=>r.body?.query?.includes('updateBoostCharge')).length,0);
  offer=await until(()=>c.prepare(0));
  const result=await until(()=>c.confirm(offer.OFFER_ID));assert.equal(result.CONTROL_STATE,4);
  const writes=requests.filter(r=>r.body?.query?.includes('updateBoostCharge'));
  assert.equal(writes.length,1);assert.deepEqual(writes[0].body.variables.input,{deviceId:'fixture-device',action:'BOOST'});
  const summary=packets.at(-1);assert.equal(summary.CHARGER_PHASE,6);assert.equal(summary.SCHEDULE_UNTIL,0);
  assert.equal(summary.ADD_TEXT,'+20%');assert.equal(summary.READY,'11:00');
  let stop=await until(()=>c.prepare(-1));assert.equal(stop.CONTROL_STATE,2);
  c.cancel();c.confirm(stop.OFFER_ID);
  assert.equal(requests.filter(r=>r.body?.variables?.input?.action==='CANCEL').length,0);
  stop=await until(()=>c.prepare(-1));assert.equal(stop.OFFER_TARGET,-1);
  const stopped=await until(()=>c.confirm(stop.OFFER_ID));assert.equal(stopped.CONTROL_STATE,4);
  const cancellations=requests.filter(r=>r.body?.variables?.input?.action==='CANCEL');
  assert.equal(cancellations.length,1);assert.deepEqual(cancellations[0].body.variables.input,{deviceId:'fixture-device',action:'CANCEL'});
  assert.equal(packets.at(-1).CHARGER_PHASE,1);assert.equal(packets.at(-1).ADD_TEXT,'+20%');assert.equal(packets.at(-1).READY,'11:00');

 }
 assert.equal(requests.filter(r=>r.body?.query?.includes('setDevicePreferences')).length,0);
 for(const secret of [...Object.values(fixture.config),'fixture-device','fixture-account','fixture-vin'])assert.ok(!JSON.stringify(packets).includes(secret));
});
