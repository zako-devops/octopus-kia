// UI-only documentation packets sourced from the app's actual labels/validation.
const charger=require('../src/pkjs/charger-state');
const planning=require('../src/pkjs/planning');
const proposal=require('../src/pkjs/control').proposal;
const now=Date.now();
const days=['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];
const data={epoch:1,kiaState:1,octopusState:1,kia:{soc:62,reported:now-3600000,acLimit:100},octopus:{
 account:'fixture-account',deviceId:'fixture-device',phase:{id:1},limits:{min:'10',max:'100',step:'1'},
 preferences:{mode:'CHARGE',unit:'PERCENTAGE',targetType:'RELATIVE_STATE_OF_CHARGE',
 schedules:days.map(day=>({dayOfWeek:day,time:'11:00',max:20,min:null}))}}};
const base={VEHICLE_MODEL:'EV6',SIMULATION:1,LOADING:0,KIA_STATE:1,KIA_FRESH:1,OCTOPUS_STATE:1,SOC:62,
 SOC_TEXT:'62%',ADD_TEXT:'+20%',READY:'11:00',KIA_TIME:'Kia 08/11 18:23',NOTE:'Datos consultados',
 CHARGER_PHASE:1,CHARGER_TEXT:'Carga inteligente',SCHEDULE_UNTIL:Math.floor(now/1000)+7200,
 PLAN_TEXT:'09/11 02:00–03:00\n09/11 03:00–05:00',EXTRA_80:'+18%',EXTRA_100:'+38%',REASON_80:'',REASON_100:''};
const phases=[
 ['no-windows','SMART_CONTROL_IN_PROGRESS','Smart control without published windows','No ON badge until a valid planned window has been received.'],
 ['ready','SMART_CONTROL_CAPABLE','Control ready / after a session','Ready for smart control; this does not prove the target was delivered.'],
 ['disconnected','SMART_CONTROL_NOT_AVAILABLE','Car disconnected / away','Saved charge preferences remain visible.'],
 ['paused','SMART_CONTROL_OFF','Smart control paused','Smart control is disabled or suspended.'],
 ['offline','LOST_CONNECTION','Charger connection lost','Distinct from physical disconnection.'],
 ['boost','BOOSTING','Boost charging','Manual boost, outside the smart plan.'],
 ['setup','SETUP_COMPLETE','Preparing control','Setup or test charging is not yet ready.'],
 ['access-error','AUTHENTICATION_FAILED','Charger access error','Octopus reports a device authentication problem.'],
 ['unknown','UNRECOGNIZED_FIXTURE_STATE','Unknown charger state','An unrecognized provider state is not inferred from an empty plan.'],
 ['retired','RETIRED','Retired charger','The device is no longer active.']
].map(([slug,state,title,caption])=>{
 const phase=charger.phase({current:'LIVE',currentState:state,isSuspended:false});
 return {slug,title,caption,packet:{...base,CHARGER_PHASE:phase.id,CHARGER_TEXT:phase.label,SCHEDULE_UNTIL:0,
  PLAN_TEXT:charger.planText(phase,'Sin tramos previstos',false)}};
});
function blocked(slug,title,change){
 const context=structuredClone(data);change(context);
 const result=proposal(context,slug==='already-reached'||slug==='minimum'||slug==='step'?80:100,now);
 if(!result.error)throw new Error('Expected blocked fixture: '+slug);
 return {slug,title,text:result.error};
}
const warnings=[
 blocked('ac-80','AC limit 80%',d=>d.kia.acLimit=80),
 blocked('ac-90','AC limit 90%',d=>d.kia.acLimit=90),
 blocked('ac-unknown','AC limit unavailable',d=>d.kia.acLimit=null),
 blocked('already-reached','Target already reached',d=>d.kia.soc=85),
 blocked('minimum','Addition below the provider minimum',d=>d.kia.soc=76),
 blocked('step','Unsupported charge increment',d=>d.octopus.limits.step='5'),
 blocked('limits-unknown','Provider limits unavailable',d=>d.octopus.limits=null),
 blocked('invalid-date','Invalid Kia timestamp',d=>d.kia.reported=0),
 blocked('charger-offline','Charger connection lost',d=>d.octopus.phase.id=5),
 blocked('provider-error','Provider read failed',d=>d.kiaState=2)
];
console.log(JSON.stringify({base,phases,warnings}));
