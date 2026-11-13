// Phone-side reads plus a single-shot preference write used by the confirmation controller.
var createToken = require('./token');
var calendar = require('./madrid');
var planning = require('./planning');
var charger = require('./charger-state');
var KRAKEN = 'https://api.oees-kraken.energy/v1/graphql/';
var PLEOS = 'https://api.pleos.ai';
var AUTH = 'mutation($input:ObtainJSONWebTokenInput!){obtainKrakenToken(input:$input){token}}';
var ACCOUNTS = 'query{viewer{accounts{number}}}';
var DEVICES = 'query($account:String!){devices(accountNumber:$account){id name status{current currentState isSuspended} capabilities{__typename ...on FlexCancelBoostChargeCapability{capabilitySupport{supportType}} ...on FlexTriggerBoostChargeCapability{capabilitySupport{supportType}}} preferences{targetType unit mode schedules{dayOfWeek time max min}} preferenceSetting{scheduleSettings{min max step}} ...on SmartFlexChargePoint{make model}}}';
var PLAN = 'query($device:String!){flexPlannedDispatches(deviceId:$device){start end type}}';

function failure(kind, status) { return {kind:kind,status:status || 0}; }
function vehicleModel(vehicle) {
  // sellname is the model; name may be a private user-chosen vehicle nickname.
  var value=typeof vehicle.sellname==='string' ? vehicle.sellname.replace(/^\s+|\s+$/g,'').replace(/\s+/g,' ') : '';
  return value && value.length<=24 && /^[A-Za-z0-9][A-Za-z0-9 .+()\/-]*$/.test(value) ? value : 'Kia';
}
function http(options, cb) {
  var xhr = new XMLHttpRequest();
  xhr.open(options.method || 'POST', options.url, true);
  xhr.timeout = 20000;
  Object.keys(options.headers || {}).forEach(function (key) { xhr.setRequestHeader(key, options.headers[key]); });
  if (options.body) xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.onload = function () {
    var json;
    try { json = JSON.parse(xhr.responseText); } catch (e) { cb(failure('response',xhr.status)); return; }
    var gql = json.errors && json.errors[0];
    var code = json.error && Number(json.error.code);
    var auth = xhr.status === 401 || xhr.status === 403 ||
      [401,403,4011,40002,40003,40004].indexOf(code) >= 0 ||
      (gql && /^(AUTHORIZATION|UNAUTHENTICATED)$/.test((gql.extensions || {}).errorType));
    if (auth) cb(failure('auth',xhr.status));
    else if (gql && json.errors.every(function(e){return ['KT-CT-4321','KT-CT-4357','KT-CT-4356','KT-CT-4354'].indexOf((e.extensions || {}).errorCode)>=0;})) cb(failure('rejected',xhr.status));
    else if (xhr.status < 200 || xhr.status >= 300 || json.error || gql || !json.data) cb(failure('response',xhr.status));
    else cb(null,json.data);
  };
  xhr.onerror = function () { cb(failure('network')); };
  xhr.ontimeout = function () { cb(failure('timeout')); };
  xhr.send(options.body ? JSON.stringify(options.body) : null);
}

module.exports = function (options) {
  var storage = options.storage, now = options.now || Date.now;
  var request = options.request || http;
  var epoch = 0, busy = false, latest = {}, kiaToken, octopusToken;
  function credentials() { return JSON.stringify(options.readConfig()); }
  function snapshot() {
    var cfg = options.readConfig(), identity = credentials(), generation = epoch;
    return {cfg:cfg,current:function(){return generation === epoch && identity === credentials();}};
  }
  function tokenService(name, snap, issue) {
    return createToken({storage:storage,key:'ov2c.'+name+'.token',now:now,current:snap.current,issue:issue});
  }
  function authorized(manager, make, cb) {
    manager.get(null,function(err,token){
      if(err){cb(err);return;}
      request(make(token),function(err,data){
        if(!err || err.kind !== 'auth'){cb(err,data);return;}
        manager.get(token,function(err,fresh){
          if(err){cb(err);return;}
          request(make(fresh),cb); // One server-rejection retry, never a loop.
        });
      });
    });
  }
  function payload(loading) {
    var result = {LOADING:loading?1:0,KIA_STATE:latest.kiaState || 0,OCTOPUS_STATE:latest.octopusState || 0,
      SOC_TEXT:latest.kia ? planning.percent(latest.kia.soc) : '--',
      SOC:latest.kia ? Math.round(latest.kia.soc) : -1,
      VEHICLE_MODEL:latest.kia ? latest.kia.model : 'Kia',
      ADD_TEXT:latest.octopus ? '+'+planning.percent(latest.octopus.add) : '--',
      READY:latest.octopus ? latest.octopus.ready : '--:--',
      PLAN_TEXT:latest.octopusState === 2 ? 'Plan sin actualizar\nActualiza en inicio' :
        latest.octopus ? latest.octopus.plan : 'Configura Octopus',
      KIA_TIME:latest.kia && latest.kia.reported ? 'Kia '+calendar.short(latest.kia.reported) : 'Kia sin fecha',
      NOTE:loading?'Actualizando...':latest.note || 'Datos consultados',
      SCHEDULE_UNTIL:latest.octopusState === 1 && latest.octopus ?
        Math.floor(Math.min(latest.octopus.scheduleEnd,latest.octopus.checked+6*60000)/1000) : 0,
      CHARGER_PHASE:latest.octopusState === 1 && latest.octopus ? latest.octopus.phase.id : 0,
      CHARGER_TEXT:latest.octopusState === 1 && latest.octopus ? latest.octopus.phase.label :
        latest.octopusState === 2 ? 'Estado sin actualizar' : 'Esperando a Octopus'};
    var age = latest.kia ? now()-latest.kia.reported : Infinity;
    var fresh = latest.kiaState === 1 && age >= -60000 && age <= 15*60000;
    result.KIA_FRESH = fresh ? 1 : 0;
    var valid = latest.kiaState === 1 && latest.octopusState === 1;
    [80,100].forEach(function(target){
      var preview = planning.preview(latest.kia && latest.kia.soc,target,latest.octopus && latest.octopus.limits);
      result['EXTRA_'+target] = preview.amount === null ? '--' : '+'+planning.percent(preview.amount);
      result['REASON_'+target] = !valid ? 'Necesita datos disponibles' : preview.reason || planning.acReason(latest.kia.acLimit,target);
    });
    if(latest.kiaState === 1 && !loading && (age > 15*60000 || age < -60000)) result.NOTE='Última lectura Kia';
    return result;
  }
  function publish(loading) { options.publish(payload(loading)); }
  function context(){return {epoch:epoch,kiaState:latest.kiaState,octopusState:latest.octopusState,kia:latest.kia,octopus:latest.octopus};}
  function refresh(callback) {
    if(busy) {if(callback) callback(failure('busy'));return;}
    var snap = snapshot(), cfg = snap.cfg, remaining = 2;
    busy = true;
    latest.note = '';
    publish(true);
    function done(provider,err,value) {
      if(!snap.current()) return;
      latest[provider+'State'] = err ? (err.kind === 'missing'?0:2) : 1;
      if(!err) latest[provider] = value;
      else latest.note = err.kind==='missing' ? 'Configura '+(provider==='kia'?'Kia':'Octopus') : 'Error '+(provider==='kia'?'Kia':'Octopus');
      remaining--;
      if(!remaining) busy=false;
      publish(remaining>0);
      if(!remaining && callback) callback(null,context());
    }
    if(!cfg.kiaClientId || !cfg.kiaClientSecret) done('kia',failure('missing'));
    else {
      kiaToken = tokenService('kia',snap,function(cb){
        request({url:PLEOS+'/v1/auth/personal-token',headers:{Brand:'kia'},body:{clientId:cfg.kiaClientId,clientSecret:cfg.kiaClientSecret}},function(e,d){cb(e,d && d.accessToken);});
      });
      function kiaGet(path,cb) {
        authorized(kiaToken,function(token){return {url:PLEOS+path,method:'GET',headers:{Brand:'kia',Authorization:'Bearer '+token}};},cb);
      }
      kiaGet('/v1/vehicles/consent',function(err,data){
        if(err){done('kia',err);return;}
        var vehicles=(data.vehicles || []).filter(function(v){return v && v.vin;});
        if(vehicles.length!==1){done('kia',failure('selection'));return;}
        kiaGet('/v1/vehicles/'+encodeURIComponent(vehicles[0].vin)+'/batteries',function(err,battery){
          if(err){done('kia',err);return;}
          var soc=battery.charge && battery.charge.stateOfCharge;
          if(typeof soc!=='number' || !isFinite(soc) || soc<0 || soc>100){done('kia',failure('response'));return;}
          var acLimit=(battery.charge.targetStateOfCharge || {}).standard;
          done('kia',null,{soc:soc,reported:Date.parse(battery.timestamp) || 0,acLimit:acLimit,model:vehicleModel(vehicles[0])});
        });
      });
    }
    if(!cfg.octopusUser || !cfg.octopusPassword) done('octopus',failure('missing'));
    else {
      octopusToken=tokenService('octopus',snap,function(cb){
        request({url:KRAKEN,body:{query:AUTH,variables:{input:{email:cfg.octopusUser,password:cfg.octopusPassword}}}},function(e,d){cb(e,d && d.obtainKrakenToken && d.obtainKrakenToken.token);});
      });
      function graph(query,variables,cb) {
        authorized(octopusToken,function(token){return {url:KRAKEN,headers:{Authorization:token},body:{query:query,variables:variables || {}}};},cb);
      }
      graph(ACCOUNTS,{},function(err,data){
        if(err){done('octopus',err);return;}
        var accounts=data.viewer && data.viewer.accounts || [];
        if(accounts.length!==1){done('octopus',failure('selection'));return;}
        graph(DEVICES,{account:accounts[0].number},function(err,data){
          if(err){done('octopus',err);return;}
          var devices=(data.devices || []).filter(function(d){return d.make==='V2C' && /Trydan/i.test(d.model || '');});
          if(devices.length!==1){done('octopus',failure('selection'));return;}
          var device=devices[0], prefs=device.preferences || {};
          var phase=charger.phase(device.status);
          if(prefs.targetType!=='RELATIVE_STATE_OF_CHARGE' || prefs.unit!=='PERCENTAGE' || prefs.mode!=='CHARGE') {done('octopus',failure('unsupported'));return;}
          var next=calendar.nextSchedule(prefs.schedules || [],now());
          if(!next || typeof next.schedule.max!=='number' || next.schedule.max<0 || next.schedule.max>100) {done('octopus',failure('response'));return;}
          var limits=(device.preferenceSetting || {}).scheduleSettings || [];
          graph(PLAN,{device:device.id},function(err,data){
            // Preference reads can remain useful when the optional plan fails.
            var dispatches=err?[]:data.flexPlannedDispatches || [];
            var checked=now(), scheduleEnd=0;
            if (!err && phase.id===1) dispatches.forEach(function(d){
              var start=Date.parse(d.start), end=Date.parse(d.end);
              if(d.type==='SMART' && isFinite(start) && isFinite(end) && end>start && end>checked) {
                scheduleEnd=Math.max(scheduleEnd,end);
              }
            });
            done('octopus',null,{add:next.schedule.max,ready:next.schedule.time.slice(0,5),
              account:accounts[0].number,deviceId:device.id,preferences:prefs,
              lifecycle:(device.status || {}).current,suspended:(device.status || {}).isSuspended,
              cancelBoostSupported:(device.capabilities || []).some(function(c){return c.__typename==='FlexCancelBoostChargeCapability' && c.capabilitySupport && c.capabilitySupport.supportType==='FLEX_SERVICE';}),
              boostSupported:(device.capabilities || []).some(function(c){return c.__typename==='FlexTriggerBoostChargeCapability' && c.capabilitySupport && c.capabilitySupport.supportType==='FLEX_SERVICE';}),
              phase:phase,scheduleEnd:scheduleEnd,checked:checked,
              limits:limits.length===1?limits[0]:null,
              plan:charger.planText(phase,calendar.plan(dispatches,now()),err)});
          });
        });
      });
    }
  }
  function writePreferences(input,callback) {
    if(!octopusToken){callback(failure('rejected'));return;}
    var snap=snapshot();
    // Kraken accepts an absent optional minimum but rejects an explicit null.
    // Keep non-null minimums untouched and canonical nulls only for comparisons.
    var wireInput={deviceId:input.deviceId,mode:input.mode,unit:input.unit,
      schedules:input.schedules.map(function(s){
        var row={dayOfWeek:s.dayOfWeek,time:s.time,max:s.max};
        if(s.min!==null && s.min!==undefined) row.min=s.min;
        return row;
      })};
    octopusToken.get(null,function(err,token){
      if(err || !snap.current()){callback(failure('rejected'));return;}
      request({url:KRAKEN,headers:{Authorization:token},body:{
        query:'mutation($input:SmartFlexDevicePreferencesInput!){setDevicePreferences(input:$input){id}}',
        variables:{input:wireInput}}},function(err,data){
          // Never use authorized() here: a mutation must never be blindly retried.
          callback(err && err.kind==='auth' ? failure('rejected') :
            err || (!data || !data.setDevicePreferences ? failure('response') : null));
        });
    });
  }
  function writeBoost(input,callback) {
    if(!octopusToken || ['BOOST','CANCEL'].indexOf(input.action)<0){callback(failure('rejected'));return;}
    var snap=snapshot();
    octopusToken.get(null,function(err,token){
      if(err || !snap.current()){callback(failure('rejected'));return;}
      request({url:KRAKEN,headers:{Authorization:token},body:{
        query:'mutation($input:UpdateBoostChargeInput){updateBoostCharge(input:$input){id}}',
        variables:{input:{deviceId:input.deviceId,action:input.action}}}},function(err,data){
        // Immediate charging is also a single-shot mutation, never an auth retry.
        callback(err && err.kind==='auth' ? failure('rejected') : err || (!data || !data.updateBoostCharge ? failure('response') : null));
      });
    });
  }
  return {refresh:refresh,writePreferences:writePreferences,writeBoost:writeBoost,invalidate:function(){epoch++;busy=false;latest={};},payload:payload};
};
