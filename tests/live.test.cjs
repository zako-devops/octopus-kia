const {test}=require('node:test');
const assert=require('node:assert/strict');
const live=require('../src/pkjs/live');
const token=require('../src/pkjs/token');
const planning=require('../src/pkjs/planning');
const madrid=require('../src/pkjs/madrid');
const now=Date.parse('2026-11-06T19:00:00Z');
const jwt=exp=>'header.'+Buffer.from(JSON.stringify({exp})).toString('base64url')+'.signature';
const valid=jwt(now/1000+3600);
function storage(){const values=new Map();return{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
function harness(overrides={}){
 const cfg={kiaClientId:'fixture-id',kiaClientSecret:'fixture-secret',octopusUser:'fixture@example.invalid',octopusPassword:'fixture-password'};
 const packets=[],pending=[],calls=[],store=storage();
 const client=live({storage:store,readConfig:()=>cfg,now:()=>now,publish:p=>packets.push(p),request:(request,callback)=>{calls.push(request);pending.push({request,callback});}});
 const device={id:'fixture-device',make:'V2C',model:'V2C Trydan',status:{current:'LIVE',currentState:'SMART_CONTROL_IN_PROGRESS',isSuspended:false},preferences:{targetType:'RELATIVE_STATE_OF_CHARGE',unit:'PERCENTAGE',mode:'CHARGE',schedules:[{dayOfWeek:'FRIDAY',time:'11:00:00',max:10},{dayOfWeek:'SATURDAY',time:'11:00:00',max:20}]},preferenceSetting:{scheduleSettings:[{min:'10',max:'100',step:'1'}]}};
 function complete(){
  let limit=30;
  while(pending.length){
   assert.ok(--limit,'request loop');
   const {request:r,callback}=pending.shift();
   const key=r.url.includes('personal-token')?'kiaAuth':r.url.includes('/consent')?'vehicles':r.url.includes('/batteries')?'battery':r.body.query.includes('obtainKrakenToken')?'octopusAuth':r.body.query.includes('viewer')?'accounts':r.body.query.includes('devices(')?'devices':'plan';
   if(overrides[key]){overrides[key](callback,r);continue;}
   const data={kiaAuth:{accessToken:valid},vehicles:{vehicles:[{vin:'fixture-vin'}]},battery:{charge:{stateOfCharge:62,targetStateOfCharge:{standard:100,quick:100}},timestamp:new Date(now).toISOString()},octopusAuth:{obtainKrakenToken:{token:valid}},accounts:{viewer:{accounts:[{number:'fixture-account'}]}},devices:{devices:[device]},plan:{flexPlannedDispatches:[{start:'2026-11-07T03:00:00Z',end:'2026-11-07T04:00:00Z',type:'SMART'}]}};
   callback(null,data[key]);
  }
 }
 return{client,cfg,store,packets,pending,calls,device,complete};
}

test('live refresh maps both providers into a credential-free watch summary',()=>{
 const h=harness();h.client.refresh();h.complete();const p=h.packets.at(-1);
 assert.equal(p.LOADING,0);assert.equal(p.KIA_STATE,1);assert.equal(p.OCTOPUS_STATE,1);
 assert.equal(p.SOC_TEXT,'62%');assert.equal(p.ADD_TEXT,'+20%');assert.equal(p.READY,'11:00');
 assert.equal(p.EXTRA_80,'+18%');assert.equal(p.EXTRA_100,'+38%');assert.equal(p.REASON_80,'');
 assert.equal(p.PLAN_TEXT,'07/11 04:00–05:00');
 const output=JSON.stringify(h.packets);
 for(const secret of [...Object.values(h.cfg),valid,'fixture-vin','fixture-account','fixture-device'])assert.ok(!output.includes(secret));
 assert.ok(h.calls.every(r=>!r.body || !/setDevicePreferences|setVehicleChargePreferences/.test(r.body.query||'')));
});

test('vehicle model comes from sellname, without sending a nickname or VIN',()=>{
 const h=harness({vehicles:cb=>cb(null,{vehicles:[{vin:'fixture-vin',sellname:'  EV6  ',name:'private-nickname'}]})});
 h.client.refresh();h.complete();assert.equal(h.packets.at(-1).VEHICLE_MODEL,'EV6');
 const output=JSON.stringify(h.packets);
 for(const secret of ['fixture-vin','private-nickname'])assert.ok(!output.includes(secret));
});

test('missing, malformed or oversized vehicle models fall back to Kia',()=>{
 for(const sellname of [undefined,null,42,{},'', '   ','x'.repeat(25),'EV6\u0000','<EV6>']){
  const h=harness({vehicles:cb=>cb(null,{vehicles:[{vin:'fixture-vin',sellname,name:'private-nickname'}]})});
  h.client.refresh();h.complete();assert.equal(h.packets.at(-1).VEHICLE_MODEL,'Kia');
 }
});

test('vehicle model survives a transient read failure and resets when settings change',()=>{
 const overrides={vehicles:cb=>cb(null,{vehicles:[{vin:'fixture-vin',sellname:'EV6'}]})};
 const h=harness(overrides);h.client.refresh();h.complete();
 overrides.battery=cb=>cb({kind:'network'});h.client.refresh();h.complete();
 assert.equal(h.packets.at(-1).VEHICLE_MODEL,'EV6');assert.equal(h.packets.at(-1).KIA_STATE,2);
 h.client.invalidate();assert.equal(h.client.payload(false).VEHICLE_MODEL,'Kia');
});

test('overlapping refreshes coalesce and cached unexpired tokens survive subsequent refreshes',()=>{
 const h=harness();h.client.refresh();h.client.refresh();h.complete();
 const auth=()=>h.calls.filter(r=>r.url.includes('personal-token')||r.body?.query.includes('obtainKrakenToken')).length;
 assert.equal(auth(),2);h.client.refresh();h.complete();assert.equal(auth(),2);
});

test('missing configuration returns placeholders without making requests',()=>{
 const h=harness();Object.keys(h.cfg).forEach(k=>h.cfg[k]='');h.client.refresh();
 assert.equal(h.calls.length,0);assert.equal(h.packets.at(-1).SOC_TEXT,'--');assert.equal(h.packets.at(-1).LOADING,0);
});

test('one provider failing leaves the other provider visible',()=>{
 const h=harness({battery:cb=>cb({kind:'network'})});h.client.refresh();h.complete();
 const p=h.packets.at(-1);assert.equal(p.KIA_STATE,2);assert.equal(p.OCTOPUS_STATE,1);assert.equal(p.ADD_TEXT,'+20%');assert.equal(p.SOC_TEXT,'--');assert.ok(p.REASON_80);
});

test('transient errors retain prior battery data and mark the source as failed',()=>{
 const overrides={};const h=harness(overrides);h.client.refresh();h.complete();
 overrides.battery=cb=>cb({kind:'network'});h.client.refresh();h.complete();
 assert.equal(h.packets.at(-1).SOC_TEXT,'62%');assert.equal(h.packets.at(-1).KIA_STATE,2);assert.ok(h.packets.at(-1).REASON_80);
});

test('old car timestamps remain visible without blocking use of the latest reported SOC',()=>{
 const h=harness({battery:cb=>cb(null,{charge:{stateOfCharge:62,targetStateOfCharge:{standard:100,quick:100}},timestamp:new Date(now-3600000).toISOString()})});
 h.client.refresh();h.complete();assert.equal(h.packets.at(-1).NOTE,'Última lectura Kia');assert.equal(h.packets.at(-1).REASON_80,'');assert.equal(h.packets.at(-1).KIA_FRESH,0);
});

test('account or vehicle ambiguity is rejected rather than silently selecting the first',()=>{
 for(const overrides of [{vehicles:cb=>cb(null,{vehicles:[{vin:'one'},{vin:'two'}]})},{accounts:cb=>cb(null,{viewer:{accounts:[{number:'one'},{number:'two'}]}})}]){
  const h=harness(overrides);h.client.refresh();h.complete();assert.ok(h.packets.at(-1).KIA_STATE===2||h.packets.at(-1).OCTOPUS_STATE===2);
 }
});

test('optional plan failure preserves charging preferences',()=>{
 const h=harness({plan:cb=>cb({kind:'network'})});h.client.refresh();h.complete();
 assert.equal(h.packets.at(-1).OCTOPUS_STATE,1);assert.equal(h.packets.at(-1).PLAN_TEXT,'Plan no disponible');
});

test('unsupported absolute-target mode is refused',()=>{
 const h=harness();h.device.preferences.targetType='STATE_OF_CHARGE';h.client.refresh();h.complete();assert.equal(h.packets.at(-1).OCTOPUS_STATE,2);
});

test('settings changes discard old authentication responses and clear the previous UI data',()=>{
 const h=harness();h.client.refresh();h.cfg.kiaClientSecret='changed';h.client.invalidate();h.complete();
 assert.equal(h.store.getItem('ov2c.kia.token'),null);assert.equal(h.client.payload(false).SOC_TEXT,'--');
});

test('expired and near-expiry tokens renew before a resource request',()=>{
 for(const expiry of [now/1000-1,now/1000+60]){
  const h=harness();h.store.setItem('ov2c.kia.token',JSON.stringify(jwt(expiry)));h.client.refresh();h.complete();
  assert.ok(h.calls[0].url.endsWith('personal-token'));assert.equal(h.packets.at(-1).SOC_TEXT,'62%');
 }
});

test('a rejected token is renewed and retried once',()=>{
 let attempts=0;const h=harness({vehicles:cb=>{if(++attempts<=1)cb({kind:'auth'});else cb(null,{vehicles:[{vin:'fixture-vin'}]});}});
 h.client.refresh();h.complete();assert.equal(attempts,2);assert.equal(h.calls.filter(r=>r.url.includes('personal-token')).length,2);assert.equal(h.packets.at(-1).KIA_STATE,1);
});

test('persistent authorization rejection does not loop',()=>{
 let attempts=0;const h=harness({vehicles:cb=>{attempts++;cb({kind:'auth'});}});
 h.client.refresh();h.complete();assert.equal(attempts,2);assert.equal(h.packets.at(-1).KIA_STATE,2);
});

test('parallel token users share renewal and cancelled generations do not persist credentials',()=>{
 const store=storage();let issue,issued=0,callbacks=0,current=true;
 const manager=token({storage:store,key:'token',now:()=>now,current:()=>current,issue:cb=>{issued++;issue=cb;}});
 manager.get(null,e=>{assert.ifError(e);callbacks++;});manager.get(null,e=>{assert.ifError(e);callbacks++;});
 assert.equal(issued,1);issue(null,valid);assert.equal(callbacks,2);
 store.removeItem('token');manager.get(null,e=>assert.equal(e.kind,'cancelled'));current=false;issue(null,valid);assert.equal(store.getItem('token'),null);
});

test('charge calculation honors current step and minimum without rounding upward',()=>{
 const limits={min:'10',max:'100',step:'1'};
 assert.deepEqual(planning.preview(62,80,limits),{amount:18,reason:''});
 assert.deepEqual(planning.preview(62,100,limits),{amount:38,reason:''});
 assert.equal(planning.preview(76,80,limits).reason,'Mínimo 10%');
 assert.equal(planning.preview(62,80,{...limits,step:5}).reason,'Paso de 5%');
 assert.equal(planning.preview(85,80,limits).reason,'Objetivo alcanzado');
 assert.ok(planning.preview(undefined,80,limits).reason);assert.ok(planning.preview(62,80,null).reason);
});

test('Madrid follows winter/summer time and DST transition boundaries',()=>{
 assert.equal(madrid.short(Date.parse('2026-01-01T10:00:00Z')),'01/01 11:00');
 assert.equal(madrid.short(Date.parse('2026-07-01T10:00:00Z')),'01/07 12:00');
 assert.equal(madrid.short(Date.parse('2026-03-29T00:59:00Z')),'29/03 01:59');
 assert.equal(madrid.short(Date.parse('2026-03-29T01:00:00Z')),'29/03 03:00');
 assert.equal(madrid.short(Date.parse('2026-10-25T01:00:00Z')),'25/10 02:00');
});

test('next ready-by selection respects weekday and skips deadlines already passed',()=>{
 const schedules=[{dayOfWeek:'FRIDAY',time:'11:00:00',max:15},{dayOfWeek:'SATURDAY',time:'11:00:00',max:20}];
 assert.equal(madrid.nextSchedule(schedules,Date.parse('2026-11-06T09:00:00Z')).schedule.max,15);
 assert.equal(madrid.nextSchedule(schedules,Date.parse('2026-11-06T10:00:00Z')).schedule.max,20);
 assert.equal(madrid.nextSchedule([{time:'bad',dayOfWeek:'SUNDAY'}],now),null);
});

test('dispatches retain dates across midnight and expose truncation explicitly',()=>{
 assert.equal(madrid.plan([{start:'2026-11-06T22:30:00Z',end:'2026-11-07T00:00:00Z'}],now),'06/11 23:30–\n07/11 01:00');
 const windows=Array.from({length:10},(_,i)=>({start:new Date(now+(i+1)*3600000).toISOString(),end:new Date(now+(i+2)*3600000).toISOString()}));
 assert.ok(madrid.plan(windows,now).endsWith('Más en app Octopus'));
});

test('completed-session ready phase preserves configured addition and ready-by time',()=>{
 const h=harness({plan:cb=>cb(null,{flexPlannedDispatches:[]})});
 h.device.status.currentState='SMART_CONTROL_CAPABLE';h.client.refresh();h.complete();const p=h.packets.at(-1);
 assert.equal(p.CHARGER_PHASE,2);assert.equal(p.CHARGER_TEXT,'Control listo');
 assert.equal(p.ADD_TEXT,'+20%');assert.equal(p.READY,'11:00');assert.equal(p.SOC_TEXT,'62%');
 assert.equal(p.PLAN_TEXT,'Control listo\nSin carga programada');
 assert.ok(!JSON.stringify(p).includes('completada'));
});

test('disconnected phase keeps preferences and replaces stale dispatches with connection guidance',()=>{
 const h=harness();h.device.status.currentState='SMART_CONTROL_NOT_AVAILABLE';h.client.refresh();h.complete();const p=h.packets.at(-1);
 assert.equal(p.CHARGER_PHASE,3);assert.equal(p.CHARGER_TEXT,'No conectado en casa');
 assert.equal(p.ADD_TEXT,'+20%');assert.equal(p.READY,'11:00');assert.equal(p.OCTOPUS_STATE,1);
 assert.ok(p.PLAN_TEXT.includes('Conecta el coche'));assert.ok(!p.PLAN_TEXT.includes('04:00'));
});

test('empty or failed dispatches do not imply completed or disconnected charging',()=>{
 for(const error of [false,true]){
  const h=harness({plan:cb=>error?cb({kind:'network'}):cb(null,{flexPlannedDispatches:[]})});
  h.client.refresh();h.complete();const p=h.packets.at(-1);
  assert.equal(p.CHARGER_PHASE,1);assert.equal(p.CHARGER_TEXT,'Carga inteligente');
  assert.equal(p.PLAN_TEXT,error?'Plan no disponible':'Carga inteligente\nSin tramos publicados');
 }
});

test('phase transitions follow new snapshots and API failures do not advertise cached phase as current',()=>{
 const overrides={},h=harness(overrides);
 h.device.status.currentState='SMART_CONTROL_CAPABLE';h.client.refresh();h.complete();assert.equal(h.packets.at(-1).CHARGER_PHASE,2);
 h.device.status.currentState='SMART_CONTROL_NOT_AVAILABLE';h.client.refresh();h.complete();assert.equal(h.packets.at(-1).CHARGER_PHASE,3);
 h.device.status.currentState='SMART_CONTROL_IN_PROGRESS';h.client.refresh();h.complete();assert.equal(h.packets.at(-1).CHARGER_PHASE,1);
 overrides.devices=cb=>cb({kind:'network'});h.client.refresh();h.complete();
 assert.equal(h.packets.at(-1).CHARGER_PHASE,0);assert.equal(h.packets.at(-1).CHARGER_TEXT,'Estado sin actualizar');
 assert.equal(h.packets.at(-1).PLAN_TEXT,'Plan sin actualizar\nActualiza en inicio');
});


test('schedule badge confirms smart windows independently of Kia freshness',()=>{
 const h=harness({battery:cb=>cb({kind:'network'})});h.client.refresh();h.complete();
 assert.equal(h.packets.at(-1).SCHEDULE_UNTIL,now/1000+360);
});

test('schedule badge is absent for missing, failed, past, invalid or non-smart plans',()=>{
 const plans=[[],[{start:new Date(now-7200000).toISOString(),end:new Date(now-3600000).toISOString(),type:'SMART'}],
  [{start:'bad',end:new Date(now+3600000).toISOString(),type:'SMART'}],
  [{start:new Date(now+7200000).toISOString(),end:new Date(now+3600000).toISOString(),type:'SMART'}],
  [{start:new Date(now).toISOString(),end:new Date(now+3600000).toISOString(),type:'BOOST'}]];
 for(const windows of plans){const h=harness({plan:cb=>cb(null,{flexPlannedDispatches:windows})});h.client.refresh();h.complete();assert.equal(h.packets.at(-1).SCHEDULE_UNTIL,0);}
 const h=harness({plan:cb=>cb({kind:'network'})});h.client.refresh();h.complete();assert.equal(h.packets.at(-1).SCHEDULE_UNTIL,0);
});

test('schedule badge clears on device phase changes and provider errors',()=>{
 const overrides={},h=harness(overrides);
 h.client.refresh();h.complete();assert.ok(h.packets.at(-1).SCHEDULE_UNTIL>now/1000);
 for(const state of ['SMART_CONTROL_CAPABLE','SMART_CONTROL_NOT_AVAILABLE','SMART_CONTROL_OFF','LOST_CONNECTION','BOOSTING']){
  h.device.status.currentState=state;h.client.refresh();h.complete();assert.equal(h.packets.at(-1).SCHEDULE_UNTIL,0);
 }
 h.device.status.currentState='SMART_CONTROL_IN_PROGRESS';h.client.refresh();h.complete();
 overrides.devices=cb=>cb({kind:'network'});h.client.refresh();h.complete();assert.equal(h.packets.at(-1).SCHEDULE_UNTIL,0);
});

test('schedule badge expires at the final dispatch end when sooner than freshness limit',()=>{
 const h=harness({plan:cb=>cb(null,{flexPlannedDispatches:[{start:new Date(now-60000).toISOString(),end:new Date(now+120000).toISOString(),type:'SMART'}]})});
 h.client.refresh();h.complete();assert.equal(h.packets.at(-1).SCHEDULE_UNTIL,now/1000+120);
});


test('charging mutation uses the documented input and is never retried after rejection',()=>{
 const h=harness();h.client.refresh();h.complete();
 const sent=[];let errors=[];
 h.client.writePreferences({deviceId:'fixture-device',mode:'CHARGE',unit:'PERCENTAGE',schedules:[]},e=>errors.push(e));
 assert.equal(h.pending.length,1);
 const req=h.pending.shift();assert.ok(req.request.body.query.includes('SmartFlexDevicePreferencesInput!'));
 assert.ok(req.request.body.query.includes('setDevicePreferences'));
 req.callback({kind:'auth'});assert.equal(errors.length,1);assert.equal(h.pending.length,0);
});


test('charging wire input omits unconfigured minimums and preserves configured ones',()=>{
 const h=harness();h.client.refresh();h.complete();
 const input={deviceId:'fixture-device',mode:'CHARGE',unit:'PERCENTAGE',schedules:[
  {dayOfWeek:'MONDAY',time:'11:00',max:16,min:null},
  {dayOfWeek:'TUESDAY',time:'11:00',max:20,min:30}]};
 h.client.writePreferences(input,()=>{});
 const wire=h.pending.shift().request.body.variables.input;
 assert.ok(!Object.hasOwn(wire.schedules[0],'min'));assert.equal(wire.schedules[1].min,30);
 assert.equal(input.schedules[0].min,null);assert.equal(wire.schedules[0].max,16);
});


test('Pleos AC target is used separately from DC and never defaults an absent limit to 100',()=>{
 for(const [standard,reason] of [[80,'Límite AC Kia: 80%'],[90,'Límite AC Kia: 90%'],[100,''],[undefined,'Límite AC no disponible']]){
  const h=harness({battery:cb=>cb(null,{charge:{stateOfCharge:62,targetStateOfCharge:{standard,quick:100}},timestamp:new Date(now).toISOString()})});
  h.client.refresh();h.complete();assert.equal(h.packets.at(-1).REASON_100,reason);
 }
});
