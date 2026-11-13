// Confirmation owns an immutable proposal; reads may retry, charging writes never do.
var planning = require('./planning');
var calendar = require('./madrid');
var WEEKDAYS=['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'];
var WEEKEND=['SATURDAY','SUNDAY'];
var ORDER=WEEKDAYS.concat(WEEKEND);
var DAYS={MONDAY:'Lun',TUESDAY:'Mar',WEDNESDAY:'Mié',THURSDAY:'Jue',FRIDAY:'Vie',SATURDAY:'Sáb',SUNDAY:'Dom'};
function schedules(prefs) {
  return (prefs.schedules || []).map(function(s){
    return {dayOfWeek:s.dayOfWeek,time:/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(s.time || '') ? s.time.slice(0,5) : s.time,max:s.max,min:s.min == null ? null : s.min};
  }).sort(function(a,b){return ORDER.indexOf(a.dayOfWeek)-ORDER.indexOf(b.dayOfWeek) || a.time.localeCompare(b.time);});
}
function proposal(data,target,now) {
  if(target===0 || target===-1) {
    var stopping=target===-1;
    if(!data || data.octopusState!==1 || !data.octopus) return {error:'Actualiza Octopus'};
    var device=data.octopus;
    if(stopping && device.phase.id!==6) return {error:'No hay carga forzada activa'};
    if(!stopping && device.phase.id===6) return {error:'Carga inmediata ya activa'};
    if(device.phase.id===3) return {error:'Conecta el coche\npara cargar ahora'};
    if(device.lifecycle!=='LIVE' || device.suspended!==false || (stopping ? device.phase.id!==6 : [1,2].indexOf(device.phase.id)<0)) return {error:'Revisa el estado V2C'};
    var supported=stopping ? device.cancelBoostSupported : device.boostSupported;
    if(supported!==true) return {error:'Carga inmediata\nno disponible'};
    return {kind:stopping?'stop':'boost',target:target,soc:'--',extra:stopping?'Volver al plan':'Límite del coche',ready:'',created:now,epoch:data.epoch,
      fingerprint:JSON.stringify([data.epoch,device.account,device.deviceId,device.lifecycle,device.suspended,supported,stopping]),
      input:{deviceId:device.deviceId,action:stopping?'CANCEL':'BOOST'}};
  }
  if (!data || data.kiaState!==1 || data.octopusState!==1) return {error:'Necesita datos recientes'};
  // A parked car's latest report may be hours old; age is informational.
  if (!data.kia.reported || !isFinite(data.kia.reported) || data.kia.reported-now>60000) return {error:'Fecha Kia no válida'};
  var oct=data.octopus, prefs=oct.preferences;
  if (!prefs || prefs.targetType!=='RELATIVE_STATE_OF_CHARGE' || prefs.mode!=='CHARGE' || prefs.unit!=='PERCENTAGE') return {error:'Modo no compatible'};
  // Preferences can be saved before plugging in; dispatch readiness is separate.
  if ([1,2,3].indexOf(oct.phase.id)<0) return {error:'Revisa el estado V2C'};
  var preview=planning.preview(data.kia.soc,target,oct.limits);
  if (preview.reason) return {error:preview.reason};
  var acReason=planning.acReason(data.kia.acLimit,target);
  if(acReason) return {error:acReason+'\nRevisa el límite en Kia'};
  var rows=schedules(prefs), next=calendar.nextSchedule(rows,now);
  if (!next || rows.some(function(s){return !DAYS[s.dayOfWeek] || !/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(s.time || '') ||
      typeof s.max!=='number' || !isFinite(s.max) || (s.min!==null && (typeof s.min!=='number' || !isFinite(s.min)));})) return {error:'Horario no compatible'};
  // An ambiguous weekday/time cannot safely identify the one schedule to change.
  if (rows.filter(function(s){return s.dayOfWeek===next.schedule.dayOfWeek;}).length!==1) return {error:'Horario ambiguo'};
  var original=JSON.stringify(rows), day=next.schedule.dayOfWeek;
  var group=ORDER;
  if(group.some(function(member){return rows.filter(function(s){return s.dayOfWeek===member;}).length!==1;})) return {error:'Faltan días del horario'};
  if(rows.some(function(s){return group.indexOf(s.dayOfWeek)>=0 &&
    (s.time!==next.schedule.time || s.min!==next.schedule.min);})) return {error:'Horario del grupo distinto'};
  rows.forEach(function(s){if(group.indexOf(s.dayOfWeek)>=0) s.max=preview.amount;});
  return {target:target,soc:planning.percent(data.kia.soc),extra:'+'+planning.percent(preview.amount),
    ready:next.schedule.time.slice(0,5),day:day,scope:'DAILY',created:now,epoch:data.epoch,
    // Include untouched schedules, mode, constraints and identity in the recheck.
    fingerprint:JSON.stringify([data.epoch,data.kia.soc,data.kia.acLimit,oct.account,oct.deviceId,prefs.targetType,prefs.mode,prefs.unit,original,oct.limits,day]),
    input:{deviceId:oct.deviceId,mode:prefs.mode,unit:prefs.unit,schedules:rows}};
}
function stopComplete(device) {
  return device.lifecycle==='LIVE' && device.suspended===false && [1,2].indexOf(device.phase.id)>=0;
}
function matches(data,p) {
  if(p.kind==='boost' || p.kind==='stop') return data && data.octopusState===1 && data.octopus.deviceId===p.input.deviceId &&
    data.octopus.account===p.account && (p.kind==='boost' ? data.octopus.phase.id===6 : stopComplete(data.octopus));
  return data && data.octopusState===1 && data.octopus.deviceId===p.input.deviceId &&
    data.octopus.account===p.account && data.octopus.preferences.mode===p.input.mode &&
    data.octopus.preferences.unit===p.input.unit && data.octopus.preferences.targetType==='RELATIVE_STATE_OF_CHARGE' &&
    JSON.stringify(schedules(data.octopus.preferences))===JSON.stringify(p.input.schedules);
}
module.exports=function(options){
  var now=options.now || Date.now, offer=null, busy=false, generation=0, unresolved=false, dispatched=false, pending=null;
  try { var saved=options.storage.getItem('ov2c.control.pending');unresolved=!!saved;pending=saved?JSON.parse(saved):null; } catch(e){unresolved=true;}
  function emit(state,message,p) {
    options.publish({CONTROL_STATE:state,CONTROL_TEXT:message,OFFER_ID:p?p.id:0,
      OFFER_DAY:p?'Todos los días':'',OFFER_TARGET:p?p.target:0,OFFER_SOC:p?p.soc:'--',OFFER_EXTRA:p?p.extra:'--',OFFER_READY:p?p.ready:'--:--'});
  }
  function nextId(){
    var seq=Number(options.storage.getItem('ov2c.control.sequence')) || Math.floor(now()/1000)%1000000000;
    seq=seq%2000000000+1;options.storage.setItem('ov2c.control.sequence',String(seq));return seq;
  }
  function make(data,target){var p=proposal(data,target,now());if(!p.error){p.id=nextId();p.account=data.octopus.account;}return p;}
  function prepare(target) {
    if (busy) return;
    if (unresolved) {
      busy=true;var recoveryGen=++generation;emit(1,'Verificando resultado...');
      options.read(function(err,data){
        if(recoveryGen!==generation)return;
        busy=false;
        if(!err && pending && data.octopusState===1 && (pending.kind==='boost' ? data.octopus.phase.id===6 : pending.kind==='stop' ? stopComplete(data.octopus) : data.octopus.preferences.mode===pending.mode &&
          data.octopus.preferences.unit===pending.unit && data.octopus.preferences.targetType==='RELATIVE_STATE_OF_CHARGE' && JSON.stringify(schedules(data.octopus.preferences))===JSON.stringify(pending.schedules))){
          var wasBoost=pending.kind==='boost', wasStop=pending.kind==='stop';
          options.storage.removeItem('ov2c.control.pending');unresolved=false;pending=null;dispatched=false;
          emit(4,wasBoost ? 'Carga inmediata activa' : wasStop ? 'Carga forzada detenida' : 'Configuración verificada');
        }else emit(6,'Resultado pendiente.\nRevisa Octopus');
      });return;
    }
    if (target!==-1 && target!==0 && target!==80 && target!==100) {emit(5,'Objetivo no válido');return;}
    offer=null;busy=true;var gen=++generation;
    emit(1,'Consultando datos...');
    options.read(function(err,data){
      if(gen!==generation)return;
      busy=false;
      var p=err?{error:'No se pudo actualizar'}:make(data,target);
      if(p.error){emit(5,p.error);return;}
      offer=p;emit(2,p.kind==='stop' ? '¿Detener carga?' : p.kind==='boost' ? '¿Estás seguro?' : '¿Quieres enviar la nueva configuración?',p);
    });
  }
  function confirm(id) {
    if(busy)return;
    if(unresolved){emit(6,'Resultado pendiente.\nRevisa Octopus');return;}
    if(!offer || id!==offer.id){emit(5,'Vuelve a elegir objetivo');return;}
    var accepted=offer,gen=++generation;offer=null;busy=true;
    emit(3,'Comprobando datos...',accepted);
    options.read(function(err,data){
      if(gen!==generation)return;
      if(err){busy=false;emit(5,'No se pudo actualizar');return;}
      var p=make(data,accepted.target);
      if(p.error){busy=false;emit(5,p.error);return;}
      if(p.fingerprint!==accepted.fingerprint || now()-accepted.created>60000){
        busy=false;offer=p;emit(2,'Datos actualizados.\nConfirma de nuevo',p);return;
      }
      // Persist a fence before dispatch: restarts must not turn an uncertain write into a retry.
      try {pending=accepted.kind==='boost' || accepted.kind==='stop' ? {kind:accepted.kind} : {mode:accepted.input.mode,unit:accepted.input.unit,schedules:accepted.input.schedules};options.storage.setItem('ov2c.control.pending',JSON.stringify(pending));} catch(e){busy=false;emit(5,'No se pudo guardar');return;}
      unresolved=true;dispatched=true;
      emit(3,'Enviando a Octopus...',accepted);
      var write=accepted.kind==='boost' || accepted.kind==='stop' ? options.writeBoost : options.write;
      write(accepted.input,function(writeError){
        if(gen!==generation)return;
        options.read(function(readError,verified){
          if(gen!==generation)return;
          busy=false;dispatched=false;
          if(!readError && matches(verified,accepted)){
            // Read-back proves the desired preferences, including all unchanged days/times.
            try {options.storage.removeItem('ov2c.control.pending');} catch(e){}
            unresolved=false;emit(4,accepted.kind==='boost' ? 'Carga inmediata activa\nConfirmada por Octopus' : accepted.kind==='stop' ? 'Carga forzada detenida\nControl inteligente listo' : 'Configuración verificada',accepted);
          } else if(writeError && writeError.kind==='rejected') {
            options.storage.removeItem('ov2c.control.pending');unresolved=false;
            emit(7,'Octopus rechazó el cambio');
          } else {emit(6,'No se pudo confirmar.\nRevisa Octopus');}
        });
      });
    });
  }
  return {prepare:prepare,confirm:confirm,cancel:function(){if(dispatched)return;offer=null;generation++;busy=false;emit(0,'');},
    invalidate:function(){generation++;offer=null;busy=false;if(unresolved)emit(6,'Resultado pendiente.\nRevisa Octopus');else emit(0,'');},
    isBusy:function(){return busy;},
    status:function(){if(unresolved)emit(6,'Resultado pendiente.\nRevisa Octopus');}};
};
module.exports.proposal=proposal;
