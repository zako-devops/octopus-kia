// Offline emulator adapter. No XMLHttpRequest or real credentials are used here.
module.exports=function(){
  var days=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
  var config={kiaClientId:'fixture-id',kiaClientSecret:'fixture-secret',octopusUser:'fixture@example.invalid',octopusPassword:'fixture-password'};
  var prefs={mode:'CHARGE',unit:'PERCENTAGE',targetType:'RELATIVE_STATE_OF_CHARGE',
    schedules:days.map(function(day){return {dayOfWeek:day,time:'11:00',max:20,min:null};})};
  var boosting=false;
  return {config:config,request:function(r,cb){
    setTimeout(function(){
      var q=r.body && r.body.query || '',data;
      // Fixed future expiry is sufficient for synthetic tokens; no server validates these.
      var token='fixture.eyJleHAiOjQxMDI0NDQ4MDB9.fixture';
      if(r.url.indexOf('personal-token')>=0)data={accessToken:token};
      else if(r.url.indexOf('/consent')>=0)data={vehicles:[{vin:'fixture-vin',sellname:'EV6'}]};
      else if(r.url.indexOf('/batteries')>=0)data={charge:{stateOfCharge:62,targetStateOfCharge:{standard:100,quick:100}},timestamp:new Date().toISOString()};
      else if(q.indexOf('obtainKrakenToken')>=0)data={obtainKrakenToken:{token:token}};
      else if(q.indexOf('setDevicePreferences')>=0){prefs.schedules=r.body.variables.input.schedules;data={setDevicePreferences:{id:'fixture-device'}};}
      else if(q.indexOf('updateBoostCharge')>=0){boosting=r.body.variables.input.action==='BOOST';data={updateBoostCharge:{id:'fixture-device'}};}
      else if(q.indexOf('viewer')>=0)data={viewer:{accounts:[{number:'fixture-account'}]}};
      else if(q.indexOf('devices(')>=0)data={devices:[{id:'fixture-device',make:'V2C',model:'V2C Trydan',
        status:{current:'LIVE',currentState:boosting?'BOOSTING':'SMART_CONTROL_IN_PROGRESS',isSuspended:false},preferences:prefs,
        capabilities:[{__typename:'FlexCancelBoostChargeCapability',capabilitySupport:{supportType:'FLEX_SERVICE'}},{__typename:'FlexTriggerBoostChargeCapability',capabilitySupport:{supportType:'FLEX_SERVICE'}}],
        preferenceSetting:{scheduleSettings:[{min:'10',max:'100',step:'1'}]}}]};
      else data={flexPlannedDispatches:[{start:new Date(Date.now()+3600000).toISOString(),end:new Date(Date.now()+7200000).toISOString(),type:'SMART'}]};
      cb(null,data);
    },200);
  }};
};
