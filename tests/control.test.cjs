const {test}=require('node:test');
const assert=require('node:assert/strict');
const create=require('../src/pkjs/control');
function harness(){
 let now=Date.parse('2026-11-08T17:00:00Z');
 const values=new Map(),packets=[],reads=[],writes=[],boostWrites=[];
 const data={epoch:1,kiaState:1,octopusState:1,kia:{soc:62,reported:now,acLimit:100},octopus:{
  account:'fixture-account',deviceId:'fixture-device',phase:{id:1},lifecycle:'LIVE',suspended:false,boostSupported:true,cancelBoostSupported:true,limits:{min:'10',max:'100',step:'1'},
  preferences:{mode:'CHARGE',unit:'PERCENTAGE',targetType:'RELATIVE_STATE_OF_CHARGE',schedules:[
   ...['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'].map(day=>({dayOfWeek:day,time:'11:00:00',max:20,min:null})),
   ...['SATURDAY','SUNDAY'].map(day=>({dayOfWeek:day,time:'11:00:00',max:20,min:null}))
   ]}}};
 const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const options={storage,now:()=>now,publish:p=>packets.push(p),read:cb=>reads.push(cb),write:(input,cb)=>writes.push({input,cb}),writeBoost:(input,cb)=>boostWrites.push({input,cb})};
 let controller=create(options);
 return {data,options,storage,packets,reads,writes,boostWrites,get c(){return controller;},
  restart(){controller=create(options);},advance(ms){now+=ms;},last:()=>packets.at(-1),read(err=null){assert.ok(reads.length);reads.shift()(err,structuredClone(data));},
  prepare(target=80){controller.prepare(target);this.read();return this.last().OFFER_ID;},
  apply(){data.octopus.preferences.schedules=structuredClone(writes.at(-1).input.schedules);}};
}

test('selecting a target prepares an exact proposal without a write; No cancels it',()=>{
 const h=harness(),id=h.prepare();assert.equal(h.writes.length,0);assert.equal(h.last().CONTROL_STATE,2);
 assert.equal(h.last().OFFER_EXTRA,'+18%');assert.equal(h.last().OFFER_READY,'11:00');assert.equal(h.last().OFFER_SOC,'62%');
 h.c.cancel();h.c.confirm(id);assert.equal(h.writes.length,0);assert.equal(h.last().CONTROL_STATE,5);
});

test('Yes rechecks, submits one daily schedule in weekday order, then verifies by reading back',()=>{
 for(const target of [80,100]){
  const h=harness(),id=h.prepare(target);h.c.confirm(id);assert.equal(h.writes.length,0);h.read();
  assert.equal(h.writes.length,1);const req=h.writes[0];
  assert.equal(req.input.deviceId,'fixture-device');assert.equal(req.input.schedules.length,7);
  assert.deepEqual(req.input.schedules.map(s=>s.dayOfWeek),['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']);
  for(const row of req.input.schedules)assert.deepEqual(row,{dayOfWeek:row.dayOfWeek,time:'11:00',max:target-62,min:null});
  assert.ok(h.storage.getItem('ov2c.control.pending'));
  h.c.confirm(id);assert.equal(h.writes.length,1);h.apply();req.cb(null);assert.equal(h.last().CONTROL_STATE,3);h.read();
  assert.equal(h.last().CONTROL_STATE,4);assert.equal(h.storage.getItem('ov2c.control.pending'),null);
  h.c.confirm(id);assert.equal(h.writes.length,1);
 }
});

test('changed battery, ready-by, limits, identity, unrelated schedule or settings generation requires a new Yes',()=>{
 for(const change of [h=>h.data.kia.soc=63,h=>h.data.octopus.preferences.schedules.forEach(s=>s.time='10:00'),
  h=>h.data.octopus.limits.max='99',h=>h.data.octopus.deviceId='other-fixture',h=>h.data.epoch++,
  h=>h.data.octopus.preferences.schedules.filter(s=>['SATURDAY','SUNDAY'].includes(s.dayOfWeek)).forEach(s=>s.max=40)]){
  const h=harness(),id=h.prepare();change(h);h.c.confirm(id);h.read();
  assert.equal(h.writes.length,0);assert.equal(h.last().CONTROL_STATE,2);assert.notEqual(h.last().OFFER_ID,id);
 }
});

test('expired confirmation requires reconfirmation even when readings did not change',()=>{
 const h=harness(),id=h.prepare();h.advance(61000);h.c.confirm(id);h.read();
 assert.equal(h.writes.length,0);assert.equal(h.last().CONTROL_STATE,2);
});

test('missing, sub-minimum, zero and incompatible-step readings never submit',()=>{
 for(const change of [h=>h.data.kia.reported=0,h=>h.data.kiaState=2,h=>h.data.octopusState=2,
  h=>h.data.kia.soc=76,h=>h.data.kia.soc=80,h=>h.data.kia.soc=90,
  h=>h.data.octopus.limits.step=5,h=>h.data.octopus.limits=null,
  h=>h.data.octopus.preferences.unit='KWH']){
  const h=harness();change(h);h.prepare();assert.equal(h.last().CONTROL_STATE,5);assert.equal(h.writes.length,0);
 }
});

test('unplugged car can save either target with cached SOC and verify while still unplugged',()=>{
 for(const target of [80,100]){
  const h=harness();h.data.octopus.phase.id=3;h.data.kia.reported-=8*3600000;
  const id=h.prepare(target);assert.equal(h.last().CONTROL_STATE,2);
  assert.equal(h.writes.length,0);h.c.confirm(id);h.read();
  assert.equal(h.writes.length,1);
  for(const row of h.writes[0].input.schedules){assert.equal(row.max,target-62);assert.equal(row.time,'11:00');}
  h.apply();h.writes[0].cb(null);h.read();assert.equal(h.last().CONTROL_STATE,4);
 }
});

test('plugging or unplugging between confirmation and sending does not invalidate saved preferences',()=>{
 for(const [before,after] of [[1,3],[3,1],[2,3],[3,2]]){
  const h=harness();h.data.octopus.phase.id=before;const id=h.prepare();
  h.data.octopus.phase.id=after;h.c.confirm(id);h.read();assert.equal(h.writes.length,1);
 }
});

test('paused, offline, boost, setup, error and unknown states still block before or after confirmation',()=>{
 for(const phase of [0,4,5,6,7,8]){
  const h=harness();h.data.octopus.phase.id=phase;h.prepare();
  assert.equal(h.last().CONTROL_STATE,5);assert.equal(h.writes.length,0);
  h.data.octopus.phase.id=3;const id=h.prepare();
  h.data.octopus.phase.id=phase;h.c.confirm(id);h.read();
  assert.equal(h.last().CONTROL_STATE,5);assert.equal(h.writes.length,0);
 }
});

test('cached parked-car SOC from hours ago can be confirmed and submitted',()=>{
 const h=harness();h.data.kia.reported-=8*3600000;
 const id=h.prepare();assert.equal(h.last().CONTROL_STATE,2);assert.equal(h.last().OFFER_EXTRA,'+18%');
 h.c.confirm(id);h.read();assert.equal(h.writes.length,1);
});

test('future-dated reports are still rejected',()=>{
 const h=harness();h.data.kia.reported+=3600000;h.prepare();
 assert.equal(h.last().CONTROL_STATE,5);assert.equal(h.writes.length,0);
});

test('network timeout never resubmits and remains uncertain when read-back fails or differs',()=>{
 const h=harness(),id=h.prepare();h.c.confirm(id);h.read();h.writes[0].cb({kind:'timeout'});h.read();
 assert.equal(h.last().CONTROL_STATE,6);h.c.confirm(id);assert.equal(h.writes.length,1);
 h.c.prepare(100);h.read();assert.equal(h.last().CONTROL_STATE,6);assert.equal(h.writes.length,1);
});

test('an acknowledged mutation without matching read-back is never called success',()=>{
 const h=harness(),id=h.prepare();h.c.confirm(id);h.read();h.writes[0].cb(null);h.read({kind:'network'});
 assert.equal(h.last().CONTROL_STATE,6);
});

test('a lost mutation response followed by matching read-back verifies preferences without resubmitting',()=>{
 const h=harness(),id=h.prepare();h.c.confirm(id);h.read();h.apply();h.writes[0].cb({kind:'timeout'});h.read();
 assert.equal(h.last().CONTROL_STATE,4);assert.equal(h.writes.length,1);
});

test('restart retains uncertain fence and can recover by read-back, without a write',()=>{
 const h=harness(),id=h.prepare();h.c.confirm(id);h.read();h.restart();h.c.status();assert.equal(h.last().CONTROL_STATE,6);
 h.c.prepare(100);h.read();assert.equal(h.last().CONTROL_STATE,6);assert.equal(h.writes.length,1);
 h.apply();h.c.prepare(100);h.read();assert.equal(h.last().CONTROL_STATE,4);assert.equal(h.writes.length,1);
 assert.equal(h.storage.getItem('ov2c.control.pending'),null);
 const next=h.prepare(100);h.c.cancel();h.c.confirm(next);assert.equal(h.writes.length,1);
});

test('unknown or duplicate offer IDs and invalid targets never write',()=>{
 const h=harness();h.c.confirm(123);h.c.prepare(90);assert.equal(h.writes.length,0);assert.equal(h.reads.length,0);
 h.prepare();h.c.confirm(1);assert.equal(h.writes.length,0);
});

test('Back during preparation discards delayed proposals',()=>{
 const h=harness();h.c.prepare(80);h.c.cancel();h.read();assert.equal(h.last().CONTROL_STATE,0);assert.equal(h.writes.length,0);
});

test('failed preflight or changing credentials cancels the pending operation before dispatch',()=>{
 for(const fail of [false,true]){
  const h=harness(),id=h.prepare();h.c.confirm(id);
  if(fail){h.read({kind:'network'});assert.equal(h.last().CONTROL_STATE,5);}
  else {h.c.invalidate();h.read();assert.equal(h.last().CONTROL_STATE,0);}
  assert.equal(h.writes.length,0);
 }
});

test('non-whole-minute and duplicate weekday schedules are rejected without dropping preferences',()=>{
 for(const change of [h=>h.data.octopus.preferences.schedules[0].time='11:00:15',
  h=>h.data.octopus.preferences.schedules.push({...h.data.octopus.preferences.schedules[0]})]){
  const h=harness();change(h);h.prepare();assert.equal(h.last().CONTROL_STATE,5);assert.equal(h.writes.length,0);
 }
});

test('pending fence and watch packets contain no credential or account/device identifiers',()=>{
 const h=harness(),id=h.prepare();h.c.confirm(id);h.read();
 const output=JSON.stringify([h.packets,h.storage.getItem('ov2c.control.pending')]);
 for(const secret of ['fixture-account','fixture-device'])assert.ok(!output.includes(secret));
});


test('a definitive rejection is reported without retrying the mutation',()=>{
 const h=harness(),id=h.prepare();h.c.confirm(id);h.read();h.writes[0].cb({kind:'rejected'});h.read();
 assert.equal(h.last().CONTROL_STATE,7);assert.equal(h.writes.length,1);assert.equal(h.storage.getItem('ov2c.control.pending'),null);
});


test('weekend target also updates the provider-supported uniform daily schedule',()=>{
 const h=harness();h.advance(5*86400000);h.data.kia.reported+=5*86400000;
 const id=h.prepare();assert.equal(h.last().OFFER_DAY,'Todos los días');
 h.c.confirm(id);h.read();assert.equal(h.writes.length,1);
 for(const row of h.writes[0].input.schedules){assert.equal(row.max,18);}
});


test('different daily ready times are blocked rather than overwritten to fit the provider',()=>{
 const h=harness();h.data.octopus.preferences.schedules[5].time='10:30';h.prepare();
 assert.equal(h.last().CONTROL_STATE,5);assert.equal(h.writes.length,0);
});


test('100% is blocked by AC limits of 80 or 90; 80% is allowed when the limit permits it',()=>{
 for(const limit of [80,90]){
  const h=harness();h.data.kia.acLimit=limit;h.prepare(100);
  assert.equal(h.last().CONTROL_STATE,5);assert.ok(h.last().CONTROL_TEXT.includes('Límite AC Kia: '+limit+'%'));
  assert.equal(h.writes.length,0);
  h.prepare(80);assert.equal(h.last().CONTROL_STATE,2);
 }
 const h=harness();h.data.kia.acLimit=100;h.prepare(100);assert.equal(h.last().CONTROL_STATE,2);
});

test('missing and invalid AC limits are not treated as permission to charge to 100%',()=>{
 for(const limit of [undefined,null,NaN,-1,101,'100',90.5]){
  const h=harness();h.data.kia.acLimit=limit;h.prepare(100);
  assert.equal(h.last().CONTROL_STATE,5);assert.equal(h.writes.length,0);
 }
});

test('lowering the car AC limit after confirmation blocks the write; changing DC is irrelevant',()=>{
 const h=harness(),id=h.prepare(100);h.data.kia.acLimit=80;h.c.confirm(id);h.read();
 assert.equal(h.writes.length,0);assert.equal(h.last().CONTROL_STATE,5);
});

test('boost prepares a distinct confirmation; No and Back never start charging',()=>{
 const h=harness(),id=h.prepare(0);assert.equal(h.last().CONTROL_STATE,2);
 assert.equal(h.last().CONTROL_TEXT,'¿Estás seguro?');assert.equal(h.last().OFFER_TARGET,0);
 h.c.cancel();h.c.confirm(id);assert.equal(h.boostWrites.length,0);assert.equal(h.writes.length,0);
});

test('boost requires live, unsuspended, connected control with supported Octopus capability',()=>{
 const changes=[h=>h.data.octopusState=2,h=>h.data.octopus.lifecycle='RETIRED',h=>h.data.octopus.lifecycle=null,
  h=>h.data.octopus.suspended=true,h=>h.data.octopus.suspended=null,h=>h.data.octopus.boostSupported=false,
  ...[0,3,4,5,6,7,8].map(id=>h=>h.data.octopus.phase.id=id)];
 for(const change of changes){
  const h=harness();change(h);h.prepare(0);assert.equal(h.last().CONTROL_STATE,5);assert.equal(h.boostWrites.length,0);
  const second=harness(),id=second.prepare(0);change(second);second.c.confirm(id);second.read();
  assert.equal(second.last().CONTROL_STATE,5);assert.equal(second.boostWrites.length,0);
 }
});

test('boost sends once after Yes and only succeeds after matching BOOSTING read-back',()=>{
 for(const phase of [1,2]){
  const h=harness();h.data.octopus.phase.id=phase;const id=h.prepare(0);
  h.c.confirm(id);assert.equal(h.boostWrites.length,0);h.read();assert.equal(h.boostWrites.length,1);
  assert.deepEqual(h.boostWrites[0].input,{deviceId:'fixture-device',action:'BOOST'});
  assert.equal(h.writes.length,0);h.c.confirm(id);assert.equal(h.boostWrites.length,1);
  const before=structuredClone(h.data.octopus.preferences);
  h.data.octopus.phase.id=6;h.boostWrites[0].cb(null);h.read();
  assert.equal(h.last().CONTROL_STATE,4);assert.match(h.last().CONTROL_TEXT,/Carga inmediata activa/);
  assert.deepEqual(h.data.octopus.preferences,before);assert.equal(h.storage.getItem('ov2c.control.pending'),null);
 }
});

test('boost uncertain outcome survives restart and blocks both actions until BOOSTING is read',()=>{
 const h=harness(),id=h.prepare(0);h.c.confirm(id);h.read();h.boostWrites[0].cb({kind:'timeout'});h.read();
 assert.equal(h.last().CONTROL_STATE,6);assert.deepEqual(JSON.parse(h.storage.getItem('ov2c.control.pending')),{kind:'boost'});
 h.restart();h.c.prepare(80);h.read();assert.equal(h.last().CONTROL_STATE,6);assert.equal(h.writes.length,0);
 h.data.octopus.phase.id=6;h.c.prepare(0);h.read();assert.equal(h.last().CONTROL_STATE,4);
 assert.match(h.last().CONTROL_TEXT,/Carga inmediata activa/);assert.equal(h.boostWrites.length,1);
});

test('boost acknowledgment with no BOOSTING read-back remains uncertain; rejection permits a new confirmation',()=>{
 for(const rejection of [false,true]){
  const h=harness(),id=h.prepare(0);h.c.confirm(id);h.read();h.boostWrites[0].cb(rejection?{kind:'rejected'}:null);h.read();
  assert.equal(h.last().CONTROL_STATE,rejection?7:6);assert.equal(h.boostWrites.length,1);
  assert.equal(!!h.storage.getItem('ov2c.control.pending'),!rejection);
 }
});

test('boost identity or credential changes require reconfirmation; unavailable Kia does not prevent Octopus boost',()=>{
 for(const change of [h=>h.data.octopus.deviceId='other-fixture',h=>h.data.octopus.account='other-account',h=>h.data.epoch++]){
  const h=harness(),id=h.prepare(0);change(h);h.c.confirm(id);h.read();assert.equal(h.last().CONTROL_STATE,2);assert.equal(h.boostWrites.length,0);
 }
 const h=harness();h.data.kiaState=2;h.data.kia=null;const id=h.prepare(0);h.c.confirm(id);h.read();assert.equal(h.boostWrites.length,1);
});

test('a pending preference write blocks boost, preserving the shared uncertainty fence',()=>{
 const h=harness(),id=h.prepare();h.c.confirm(id);h.read();h.writes[0].cb({kind:'timeout'});h.read();
 h.c.prepare(0);h.read();assert.equal(h.last().CONTROL_STATE,6);assert.equal(h.boostWrites.length,0);
});


test('stop force-charge requires active boost and a supported cancellation capability',()=>{
 for(const change of [h=>h.data.octopusState=2,h=>h.data.octopus.cancelBoostSupported=false,h=>h.data.octopus.suspended=true,
  h=>h.data.octopus.lifecycle='RETIRED',...[0,1,2,3,4,5,7,8].map(id=>h=>h.data.octopus.phase.id=id)]){
  const h=harness();h.data.octopus.phase.id=6;change(h);h.prepare(-1);
  assert.equal(h.last().CONTROL_STATE,5);assert.equal(h.boostWrites.length,0);
 }
});

test('stop default No cancels without writing; Yes issues one CANCEL and verifies smart control',()=>{
 for(const restored of [1,2]){
  const h=harness();h.data.octopus.phase.id=6;
  const cancelled=h.prepare(-1);assert.equal(h.last().CONTROL_TEXT,'¿Detener carga?');
  h.c.cancel();h.c.confirm(cancelled);assert.equal(h.boostWrites.length,0);
  const id=h.prepare(-1);h.c.confirm(id);h.read();assert.equal(h.boostWrites.length,1);
  assert.deepEqual(h.boostWrites[0].input,{deviceId:'fixture-device',action:'CANCEL'});
  h.c.confirm(id);assert.equal(h.boostWrites.length,1);
  h.data.octopus.phase.id=restored;h.boostWrites[0].cb(null);h.read();
  assert.equal(h.last().CONTROL_STATE,4);assert.match(h.last().CONTROL_TEXT,/Carga forzada detenida/);
  assert.equal(h.writes.length,0);assert.equal(h.storage.getItem('ov2c.control.pending'),null);
 }
});

test('stop rechecks active status after Yes, including a car unplugged while confirming',()=>{
 for(const phase of [1,2,3,4,5,7,8]){
  const h=harness();h.data.octopus.phase.id=6;const id=h.prepare(-1);
  h.data.octopus.phase.id=phase;h.c.confirm(id);h.read();
  assert.equal(h.last().CONTROL_STATE,5);assert.equal(h.boostWrites.length,0);
 }
});

test('unconfirmed stop persists across restart and never retries cancellation',()=>{
 const h=harness();h.data.octopus.phase.id=6;const id=h.prepare(-1);
 h.c.confirm(id);h.read();h.boostWrites[0].cb({kind:'timeout'});h.read();assert.equal(h.last().CONTROL_STATE,6);
 assert.deepEqual(JSON.parse(h.storage.getItem('ov2c.control.pending')),{kind:'stop'});
 h.restart();h.c.prepare(80);h.read();assert.equal(h.last().CONTROL_STATE,6);assert.equal(h.writes.length,0);
 h.data.octopus.phase.id=2;h.c.prepare(-1);h.read();assert.equal(h.last().CONTROL_STATE,4);
 assert.match(h.last().CONTROL_TEXT,/Carga forzada detenida/);assert.equal(h.boostWrites.length,1);
});

test('stop verifies the same account/device and never calls unknown or disconnected state success',()=>{
 for(const change of [h=>h.data.octopus.deviceId='other-device',h=>h.data.octopus.account='other-account',
  h=>h.data.octopus.phase.id=3,h=>h.data.octopus.phase.id=0]){
  const h=harness();h.data.octopus.phase.id=6;const id=h.prepare(-1);h.c.confirm(id);h.read();
  h.data.octopus.phase.id=2;change(h);h.boostWrites[0].cb(null);h.read();assert.equal(h.last().CONTROL_STATE,6);
 }
});
