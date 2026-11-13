var Clay = require('@rebble/clay');
var settings = require('./settings');
var clay = new Clay(require('./config'), null, { autoHandleEvents: false });
var pending = {}, sending = false, failures = 0;
function send(payload) {
  Object.keys(payload).forEach(function(key){pending[key]=payload[key];});
  pump();
}
function pump() {
  if(sending || !Object.keys(pending).length) return;
  var message=pending;pending={};sending=true;
  Pebble.sendAppMessage(message,function(){sending=false;failures=0;pump();},function(){
    sending=false;
    // Keep the most recent values when a newer update arrived during delivery.
    Object.keys(message).forEach(function(key){if(!Object.prototype.hasOwnProperty.call(pending,key))pending[key]=message[key];});
    if(++failures<=2) setTimeout(pump,1000);
    else {pending={};failures=0;console.log('Watch update unavailable.');}
  });
}
var simulation = require('./runtime-mode').simulation;
var fixture = simulation ? require('./simulation')() : null;
// Fixture data/tokens use an isolated in-memory store, never the user's phone settings.
var fixtureValues={};
var runtimeStorage=simulation ? {getItem:function(k){return fixtureValues[k] || null;},
  setItem:function(k,v){fixtureValues[k]=v;},removeItem:function(k){delete fixtureValues[k];}} : localStorage;
var live = require('./live')({storage:runtimeStorage,
  readConfig:function(){return simulation ? fixture.config : settings.load(localStorage);},
  request:fixture ? fixture.request : undefined,publish:send});
var control = require('./control')({storage:runtimeStorage,read:live.refresh,write:live.writePreferences,writeBoost:live.writeBoost,publish:send});

function notify(config, saved) {
  send(settings.status(config, saved));
}

function configurationUrl() {
  // This form does not use account/watch identifiers.
  clay.meta.accountToken = '';
  clay.meta.watchToken = '';
  var url = clay.generateUrl();
  var proxy = 'http://clay.pebble.com.s3-website-us-west-2.amazonaws.com/#';
  if (url.indexOf(proxy) !== 0) return url;
  // The emulator's configuration callback is appended by pebble-tool. Keep the
  // complete page local instead of routing credentials through an HTTP proxy.
  var html = decodeURIComponent(url.slice(proxy.length));
  html = html.replace(/(["'])\$\$\$RETURN_TO\$\$\$\1/g,
    '(function(){var m=/[?&]return_to=([^&]*)/.exec(location.search);' +
    'return m?decodeURIComponent(m[1]):"pebblejs://close#";})()');
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

Pebble.addEventListener('ready', function () {
  var config = simulation ? fixture.config : settings.load(localStorage);
  clay.setSettings(config);
  notify(config, 0);
  send({SIMULATION:simulation?1:0});
  control.status();
  live.refresh();
  setInterval(function(){if(!control.isBusy()) live.refresh();},5*60000);
});

Pebble.addEventListener('appmessage',function(event){
  var p=event && event.payload || {};
  if(p.CANCEL_OFFER) control.cancel();
  else if(p.PREPARE_STOP_BOOST) control.prepare(-1);
  else if(p.PREPARE_BOOST) control.prepare(0);
  else if(p.PREPARE_TARGET) control.prepare(p.PREPARE_TARGET);
  else if(p.CONFIRM_OFFER) control.confirm(p.CONFIRM_OFFER);
  else if(p.REFRESH) live.refresh();
});

Pebble.addEventListener('showConfiguration', function () {
  clay.setSettings(simulation ? fixture.config : settings.load(localStorage));
  Pebble.openURL(configurationUrl());
});

Pebble.addEventListener('webviewclosed', function (event) {
  if (simulation || !event || !event.response) return;
  try {
    var config = settings.save(localStorage, event.response);
    clay.setSettings(config);
    notify(config, 1);
    live.invalidate();
    control.invalidate();
    live.refresh();
    console.log('Phone settings saved.');
  } catch (e) {
    // Never log the response, form URL, exception details or credential values.
    console.log('Settings could not be saved.');
    notify(settings.load(localStorage), -1);
  }
});
