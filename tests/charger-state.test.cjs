const {test}=require('node:test');
const assert=require('node:assert/strict');
const charger=require('../src/pkjs/charger-state');
const phase=state=>charger.phase({current:'LIVE',currentState:state,isSuspended:false});

test('provider smart-control states distinguish scheduled, ready and unplugged/away',()=>{
 assert.equal(phase('SMART_CONTROL_IN_PROGRESS').id,1);
 assert.equal(phase('SMART_CONTROL_CAPABLE').id,2);
 assert.equal(phase('SMART_CONTROL_NOT_AVAILABLE').id,3);
});

test('lost device connection is not presented as an unplugged car',()=>{
 assert.equal(phase('LOST_CONNECTION').id,5);
 assert.equal(phase('LOST_CONNECTION').label,'Sin conexión V2C');
 assert.notEqual(phase('LOST_CONNECTION').id,phase('SMART_CONTROL_NOT_AVAILABLE').id);
});

test('suspension and retirement take precedence over an outdated smart-control state',()=>{
 assert.equal(charger.phase({currentState:'SMART_CONTROL_IN_PROGRESS',isSuspended:true}).id,4);
 assert.equal(charger.phase({current:'RETIRED',isSuspended:true}).id,8);
});

test('setup, test and authorization problems do not masquerade as completed sessions',()=>{
 for(const state of ['AUTHENTICATION_PENDING','AUTHENTICATION_COMPLETE','TEST_CHARGE_IN_PROGRESS','TEST_CHARGE_NOT_AVAILABLE','SETUP_COMPLETE']) assert.equal(phase(state).id,7);
 for(const state of ['AUTHENTICATION_FAILED','TEST_CHARGE_FAILED','RETIRED']) assert.equal(phase(state).id,8);
 assert.equal(phase('BOOSTING').id,6);assert.equal(phase('SMART_CONTROL_OFF').id,4);
});

test('unknown and missing status remain unknown instead of assuming readiness or disconnection',()=>{
 for(const value of [undefined,null,{}, {current:'LIVE'}, {currentState:'FUTURE_STATE'}]) assert.equal(charger.phase(value).id,0);
});

test('ready status does not discard an explicitly returned upcoming plan',()=>{
 const state=phase('SMART_CONTROL_CAPABLE');
 assert.equal(charger.planText(state,'09/11 04:00–05:00',null),'09/11 04:00–05:00');
 assert.equal(charger.planText(state,'',null),'Control listo\nSin carga programada');
 assert.equal(charger.planText(state,'',{kind:'network'}),'Plan no disponible');
});
