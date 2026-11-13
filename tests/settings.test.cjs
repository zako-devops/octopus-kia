const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const settings = require('../src/pkjs/settings');
const form = require('../src/pkjs/config');
const index = fs.readFileSync(path.join(__dirname, '../src/pkjs/index.js'), 'utf8');
const sample = { kiaClientId: 'test-kia-id', kiaClientSecret: 'test-kia-secret', octopusUser: 'person@example.invalid', octopusPassword: 'test-password' };
function storage() {
 const map = new Map();
 return { getItem: k => map.get(k) || null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k) };
}
function response(values = sample) { return encodeURIComponent(JSON.stringify(Object.fromEntries(Object.entries(values).map(([k,v])=>[k,{value:v}])))); }
function app(store = storage(), url = 'data:text/html;charset=utf-8,phone-page') {
 const events = {}, messages = [], logs = [], opened = [];
 let displayed;
 function Clay(config, fn, options) {
  this.meta = {};
  assert.equal(options.autoHandleEvents, false);
  this.setSettings = values => { displayed = values; };
  this.generateUrl = () => url;
 }
 const context = vm.createContext({
  require: name => name === '@rebble/clay' ? Clay : name === './settings' ? settings : name === './control' ? () => ({status(){},invalidate(){},prepare(){},confirm(){},cancel(){}}) : name === './runtime-mode' ? {simulation:false} : name === './live' ? () => ({refresh(){},invalidate(){}}) : form,
  setInterval() {}, setTimeout() {},
  localStorage: store,
  console: { log: line => logs.push(line) },
  Pebble: { addEventListener: (event,callback) => { events[event] = callback; },
   sendAppMessage: (message,ok) => { messages.push(message); ok(); }, openURL: value => opened.push(value) }
 });
 vm.runInContext(index, context);
 return { events, messages, logs, opened, store, displayed:()=>displayed };
}

test('Android form exposes all four credential fields and masks both secrets', () => {
 const fields = form.flatMap(item => item.items || [item]).filter(item => item.messageKey);
 assert.deepEqual(fields.map(f => f.messageKey), Object.keys(sample));
 for (const key of ['kiaClientSecret','octopusPassword']) assert.equal(fields.find(f=>f.messageKey===key).attributes.type,'password');
 assert.equal(fields.find(f=>f.messageKey==='octopusUser').attributes.type,'email');
});

test('save persists both providers and reopening restores the same phone-side values', () => {
 const first = app(); first.events.webviewclosed({response:response()});
 const reopened = app(first.store); reopened.events.ready(); reopened.events.showConfiguration();
 assert.deepEqual(reopened.displayed(), sample);
 assert.equal(reopened.opened.length, 1);
});

test('cancelling the Android configuration leaves saved credentials unchanged', () => {
 const instance = app(); instance.events.webviewclosed({response:response()});
 instance.events.webviewclosed({response:''}); instance.events.webviewclosed({});
 assert.deepEqual(settings.load(instance.store),sample);
 assert.equal(instance.messages.length,1);
});

test('secret whitespace is preserved while user and Client ID are trimmed', () => {
 const store = storage();
 settings.save(store,response({kiaClientId:'  id  ',kiaClientSecret:' secret ',octopusUser:' person@example.invalid ',octopusPassword:' password '}));
 assert.deepEqual(settings.load(store),{kiaClientId:'id',kiaClientSecret:' secret ',octopusUser:'person@example.invalid',octopusPassword:' password '});
});

test('malformed or incorrectly typed settings do not overwrite the saved configuration', () => {
 const store = storage(); settings.save(store,response());
 for (const invalid of ['%not-json','[]','null',JSON.stringify({kiaClientId:'new',octopusPassword:{value:7}})]) {
  assert.throws(()=>settings.save(store,invalid)); assert.deepEqual(settings.load(store),sample);
 }
});

test('missing fields preserve prior values and unknown fields never enter storage', () => {
 const store = storage(); settings.save(store,response());
 settings.save(store,response({octopusUser:'updated@example.invalid',unrelatedSecret:'not-stored'}));
 assert.deepEqual(settings.load(store),{...sample,octopusUser:'updated@example.invalid'});
 assert.ok(!store.getItem('ov2c.settings').includes('not-stored'));
});

test('unchanged settings preserve cached tokens; changed credentials clear only the affected provider', () => {
 const store = storage(); settings.save(store,response());
 const kia=['ov2c.kia.token','ov2c.kia.vehicles'];
 const octopus=['ov2c.octopus.token','ov2c.octopus.accounts','ov2c.octopus.devices'];
 [...kia,...octopus].forEach(key=>store.setItem(key,'cached'));
 settings.save(store,response());
 [...kia,...octopus].forEach(key=>assert.equal(store.getItem(key),'cached'));
 settings.save(store,response({kiaClientSecret:'changed'}));
 kia.forEach(key=>assert.equal(store.getItem(key),null));
 octopus.forEach(key=>assert.equal(store.getItem(key),'cached'));
 settings.save(store,response({octopusPassword:'changed'}));
 octopus.forEach(key=>assert.equal(store.getItem(key),null));
});

test('explicitly clearing fields removes configured status', () => {
 const store=storage(); settings.save(store,response());
 const config=settings.save(store,response({kiaClientSecret:'',octopusPassword:''}));
 assert.deepEqual(settings.status(config,1),{SETTINGS_SAVED:1,KIA_CONFIGURED:0,OCTOPUS_CONFIGURED:0});
});

test('only boolean status flags reach the watch; logs contain no credentials', () => {
 const instance=app(); instance.events.webviewclosed({response:response()});
 assert.deepEqual(JSON.parse(JSON.stringify(instance.messages)),[{SETTINGS_SAVED:1,KIA_CONFIGURED:1,OCTOPUS_CONFIGURED:1}]);
 const output=JSON.stringify([instance.messages,instance.logs]);
 for (const secret of Object.values(sample)) assert.ok(!output.includes(secret));
});

test('invalid submission reports failure without leaking the payload or changing credentials', () => {
 const instance=app(); instance.events.webviewclosed({response:response()});
 instance.events.webviewclosed({response:'bad-'+sample.octopusPassword});
 assert.deepEqual(settings.load(instance.store),sample);
 assert.equal(instance.messages.at(-1).SETTINGS_SAVED,-1);
 assert.ok(!instance.logs.join().includes(sample.octopusPassword));
});

test('emulator form stays local and its return URL is resolved at runtime', () => {
 const html='<script>var destination="$$$RETURN_TO$$$";</script>';
 const instance=app(storage(),'http://clay.pebble.com.s3-website-us-west-2.amazonaws.com/#'+encodeURIComponent(html));
 instance.events.showConfiguration();
 assert.ok(instance.opened[0].startsWith('data:text/html'));
 const page=decodeURIComponent(instance.opened[0].split(',')[1]);
 assert.ok(!page.includes('$$$RETURN_TO$$$'));
 const script=page.match(/<script>(.*)<\/script>/)[1];
 const context=vm.createContext({location:{search:'?return_to='+encodeURIComponent('http://localhost:1234/close?')}});
 vm.runInContext(script,context);
 assert.equal(context.destination,'http://localhost:1234/close?');
});
