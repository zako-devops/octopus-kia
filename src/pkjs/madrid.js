// Europe/Madrid: EU summer time begins/ends at 01:00 UTC on the last Sunday
// of March/October. Keep display/weekday selection independent of phone timezone.
var DAYS=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
function boundary(year,month) { var last=new Date(Date.UTC(year,month+1,0));return Date.UTC(year,month,last.getUTCDate()-last.getUTCDay(),1); }
function local(ms) {
  var year=new Date(ms).getUTCFullYear();
  var summer=ms>=boundary(year,2) && ms<boundary(year,9);
  return new Date(ms+(summer?2:1)*3600000);
}
function pad(n){return (n<10?'0':'')+n;}
function clock(date){return pad(date.getUTCHours())+':'+pad(date.getUTCMinutes());}
function short(ms){var d=local(ms);return pad(d.getUTCDate())+'/'+pad(d.getUTCMonth()+1)+' '+clock(d);}
function nextSchedule(schedules,ms) {
  var today=local(ms), best=null;
  schedules.forEach(function(schedule){
    if(!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(schedule.time || '')) return;
    var day=DAYS.indexOf(schedule.dayOfWeek);if(day<0)return;
    var days=(day-today.getUTCDay()+7)%7;
    var minutes=Number(schedule.time.slice(0,2))*60+Number(schedule.time.slice(3,5));
    if(!days && minutes<=today.getUTCHours()*60+today.getUTCMinutes()) days=7;
    var rank=days*1440+minutes;
    if(!best || rank<best.rank) best={schedule:schedule,rank:rank};
  });
  return best;
}
function plan(dispatches,ms){
  var upcoming=dispatches.filter(function(d){return isFinite(Date.parse(d.start)) && Date.parse(d.end)>ms && Date.parse(d.end)>Date.parse(d.start);})
    .sort(function(a,b){return Date.parse(a.start)-Date.parse(b.start);});
  var lines=upcoming.slice(0,8).map(function(d){
      var start=short(Date.parse(d.start)),end=short(Date.parse(d.end));
      return start+'–'+(start.slice(0,5)===end.slice(0,5)?end.slice(6):'\n'+end);
    });
  if(upcoming.length>8) lines.push('Más en app Octopus');
  return lines.join('\n') || 'Sin tramos previstos';
}
module.exports={local:local,short:short,nextSchedule:nextSchedule,plan:plan};
