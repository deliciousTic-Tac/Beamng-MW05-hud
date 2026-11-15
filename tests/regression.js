'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const apps = path.join(root, 'ui/modules/apps');
const runtime = fs.readFileSync(path.join(root, 'lib/runtime.js'), 'utf8');
const bundles = process.argv.includes('--bundle') ? JSON.parse(fs.readFileSync(0, 'utf8')) : null;

function load(name) {
  let factory, nextId = 0, digests = 0, now = 0;
  const frames = new Map(), timers = new Map(), events = {}, calls = [], links = [], wireCalls = [];
  const head = {appendChild(node) { links.push(node); node.parentNode = head; },
    removeChild(node) { links.splice(links.indexOf(node), 1); node.parentNode = null; }};
  const node = {style: {setProperty() {}}, querySelector() { return null; },
    getBoundingClientRect() { return {left:0, top:0, width:300, height:300}; }};
  const context = {
    console, Map, Date: class extends Date { static now() { return now; } }, document: {head, querySelector() { return null; },
      createElement() { return {setAttribute() {}}; }},
    angular: {module() { return {directive(name, providers) { factory = providers.at(-1)(); }}; }},
    StreamsManager: {add() {}, remove() {}},
    bngApi: {activeObjectLua(command, callback) {
      wireCalls.push({command, callback});
      assert.equal(callback, undefined, 'MW05 must not register callbacks in BeamNG');
      const rpc = /local requestId="([^"]+)"\nlocal ok,value=pcall\(function\(\)\nreturn \(\n([\s\S]*)\n\)\nend\)/.exec(command);
      calls.push(rpc ? {command:rpc[2], wire:command, callback(value) {
        for (const handler of events.MW05LuaResponse || []) handler(null, {id:rpc[1], ok:true, value});
      }} : {command});
    }, engineLua() {}},
    requestAnimationFrame(callback) { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, {callback, delay, at:now+delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
    window: {innerWidth:1920, innerHeight:1080, addEventListener() {}, removeEventListener() {}},
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(apps, name, 'app.js'), 'utf8');
  vm.runInContext(bundles ? bundles[name] : runtime + '\n' + source, context, {filename:name});
  const scope = {$on(name, callback) { (events[name] ||= []).push(callback); }, $evalAsync() { digests++; }};
  factory.link(scope, {0:node});
  return {scope, frames, timers, events, calls, links, context, wireCalls,
    get digests() { return digests; },
    emit(name, data) { for (const callback of events[name] || []) callback(null, data); },
    frame() { now += 16; const pending = [...frames.values()]; frames.clear(); pending.forEach(f => f(now)); },
    query() { return calls.findLast(c => typeof c.callback === 'function'); },
    advance(ms) {
      const until=now+ms;let steps=0;
      while(true){const next=[...timers].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
        if(++steps>10000)throw Error('Unbounded timer work');now=next[1].at;timers.delete(next[0]);next[1].callback();}
      now=until;
    },
  };
}

for (const name of fs.readdirSync(apps)) {
  const source = path.join(apps, name, 'app.js');
  if (!fs.existsSync(source)) continue;
  cp.execFileSync(process.execPath, ['--check', source]);
  JSON.parse(fs.readFileSync(path.join(apps, name, 'app.json'), 'utf8'));
  const app = load(name);
  app.frame();
  app.emit('$destroy');
  assert.equal(app.frames.size, 0, name + ': pending animation after removal');
  assert.equal(app.timers.size, 0, name + ': polling after removal');
}

for (const name of ['MW05OilPressure', 'MW05OilTemperature', 'MW05BatteryVoltage']) {
  const app = load(name);
  app.scope.data = {value:0, max:100}; app.frame();
  assert(Number.isFinite(app.scope.display.needleAngle), name + ': zero must have a finite angle');
  assert.equal(app.frames.size, 0, name + ': stable data must not animate forever');
  app.scope.data = {value:100, max:100};
  app.emit('SettingsChanged', {values:{uiUnitPressure:'bar', uiUnitTemperature:'f'}});
  app.frame();
  assert(Number.isFinite(app.scope.display.needleAngle));
}

for (const name of ['MW05OilPressure','MW05OilTemperature','MW05BatteryVoltage','MW05AFR']) {
  const app = load(name), oldQuery = app.query();
  app.emit('VehicleChange');
  const fresh = JSON.stringify(app.scope.data);
  oldQuery.callback({oilPressure:6, oilTemperature:140, voltage:16, afr:12});
  assert.equal(JSON.stringify(app.scope.data), fresh, name + ': stale vehicle response');
  app.emit('$destroy');
  oldQuery.callback({oilPressure:6, oilTemperature:140, voltage:16, afr:12});
  assert.equal(JSON.stringify(app.scope.data), fresh, name + ': response after removal');
}

const oil = load('MW05OilTemperature');
oil.query().callback({oilTemperature:123}); oil.frame();
assert.equal(oil.scope.data.value, 123);
const stableDigests = oil.digests;
oil.emit('streamsUpdate', {electrics:{}, engineThermalData:{}}); oil.frame();
assert.equal(oil.digests, stableDigests, 'Unchanged readout must not request another Angular update');

const hud = load('MW05VehicleHUD');
hud.emit('ChangePowerTrainButtons', {icon:'powertrain_n2o', ringValue:0.5});
hud.frame(); assert.equal(hud.scope.data.nos, 0.5);
const nosHalfTank = [hud.scope.display.nosLeftPath, hud.scope.display.nosRightPath];
for (const [color, state] of [
  ['#FFFFFF','disarmed'], ['#98fb00','armed'], ['3096F1','active'],
  ['FFFFFF','disarmed']
]) {
  hud.emit('ChangePowerTrainButtons', {icon:'powertrain_n2o', color});
  hud.emit('streamsUpdate', {electrics:{}, engineInfo:[]}); hud.frame();
  assert.equal(hud.scope.display.nosState, state);
  assert.equal(hud.scope.data.nos, 0.5, 'A NOS state-only event must preserve tank quantity');
  assert.deepEqual([hud.scope.display.nosLeftPath,hud.scope.display.nosRightPath], nosHalfTank,
    'Changing NOS operating state must not change the level geometry');
}
hud.emit('VehicleChange');
hud.emit('streamsUpdate', {electrics:{}, engineInfo:[]}); hud.frame();
assert.equal(hud.scope.data.nos, null, 'NOS must not carry into another vehicle');
assert.equal(hud.scope.display.nosState, null, 'NOS operating state must reset with the vehicle');
hud.emit('streamsUpdate', {electrics:{nitrousOxideArm:1,nitrousOxideActive:0,nitrousOxideOverride:1}}); hud.frame();
assert.equal(hud.scope.display.hasNos, false, 'NOS flags must never be mistaken for tank quantity');
hud.emit('streamsUpdate', {electrics:{nosLevel:0.25,nitrousOxideArm:1,nitrousOxideActive:0}}); hud.frame();
assert.equal(hud.scope.display.nosState, 'armed');
hud.emit('streamsUpdate', {electrics:{nosLevel:0.25,nitrousOxideArm:0,nitrousOxideActive:1}}); hud.frame();
assert.equal(hud.scope.display.nosState, 'active', 'Confirmed injection takes precedence over the arm flag');
hud.emit('ChangePowerTrainButtons', {icon:'powertrain_n2o',color:'#FFFFFF',ringValue:0}); hud.frame();
assert.equal(hud.scope.display.hasNos, true, 'An empty installed tank is still present');
assert.equal(hud.scope.data.nos, 0);
hud.scope.data.rpm = 4000; hud.scope.data.maxRpm = 8000;
hud.emit('SettingsChanged', {values:{uiUnitLength:'imperial'}}); hud.frame();
for (let i=0; i<200 && hud.frames.size; i++) hud.frame();
assert.equal(hud.frames.size, 0, 'Needle must finish smoothing at rest');
assert(Number.isFinite(hud.scope.display.needleAngle));

const turbo = load('MW05ForcedInduction');
turbo.emit('streamsUpdate', {electrics:{boost:0, boostMax:0}}); turbo.frame();
assert.equal(turbo.scope.display.available, false);
assert.equal(turbo.frames.size, 0, 'Hidden turbo must have no continuous animation');
turbo.emit('streamsUpdate', {electrics:{boost:0, boostMax:20}}); turbo.frame();
assert.equal(turbo.scope.display.available, true);
turbo.scope.toggleUnit(); turbo.frame();
assert.equal(turbo.scope.display.unit, 'bar');

const dial = load('MW05PowertrainDial');
dial.query().callback({threeWay:false,rangeAvailable:true,rangeMode:'HI',rangeDevice:'rangebox',
  lockAvailable:false,outputShafts:{front:{id:'transfercase_F',side:'front',active:true,tooltip:'Front Output Shaft'},
    rear:{id:'transfercase_R',side:'rear',active:false,tooltip:'Rear Output Shaft'}}});
assert.equal(dial.scope.display.outputShafts.length, 2);
dial.scope.activateOutputShaft('front');
assert.equal(dial.calls.at(-1).command, '(function()\npowertrain.toggleDeviceMode("transfercase_F")\nreturn true\nend)()');
dial.scope.activateOutputShaft('rear');
assert.equal(dial.calls.at(-1).command, '(function()\npowertrain.toggleDeviceMode("transfercase_R")\nreturn true\nend)()');
assert.equal(dial.scope.display.lockAvailable, false);
const legacy = load('MW05Powertrain');
legacy.query().callback({hasTransferCase:false});
assert([...legacy.timers.values()].every(t => t.delay >= 500));
legacy.calls[0].callback({available:true, layout:'vertical', rangeAvailable:true, rangeMode:'HI', lockAvailable:false});
legacy.scope.selectVerticalMode('range', 'LO');
legacy.query().callback();
assert([...legacy.timers.values()].some(t => t.delay === 50), 'Lever commands must request a fast confirmation');
legacy.emit('$destroy');
for (const timer of legacy.timers.values()) timer.callback();
assert.equal(legacy.frames.size, 0, 'Delayed confirmation must not animate a removed app');

const styleApp = load('MW05Ignition');
const shared = styleApp.context.window.MW05Runtime;
const a = shared.addStylesheet('/shared-test.css'), b = shared.addStylesheet('/shared-test.css');
const count = styleApp.links.length;
a.release(); assert.equal(styleApp.links.length, count);
b.release(); assert.equal(styleApp.links.length, count-1);
b.release(); assert.equal(styleApp.links.length, count-1);

const afr = load('MW05AFR');
afr.emit('streamsUpdate', {electrics:{afr:12}}); afr.frame();
assert.equal(afr.scope.data.value, 12);
afr.emit('streamsUpdate', {electrics:{lambda:0.9}}); afr.frame();
assert.equal(afr.scope.data.value, 0.9 * 14.7);
const battery = load('MW05BatteryVoltage');
battery.emit('streamsUpdate', {electrics:{batteryVoltage:12.4}}); battery.frame();
assert.equal(battery.scope.data.value, 12.4);
assert.equal(battery.scope.data.simulated, false);

const missing = load('MW05BatteryVoltage');
const late = missing.query();
missing.advance(2000);
assert.equal(missing.calls.filter(c=>c.callback).length,1,'No overlapping requests before timeout/backoff');
missing.advance(249);
assert.equal(missing.calls.filter(c=>c.callback).length,1);
missing.advance(1);
assert.equal(missing.calls.filter(c=>c.callback).length,2,'Retry after first timeout/backoff');
late.callback({voltage:99});missing.frame();
assert.notEqual(missing.scope.data.value,99,'A timed-out response must be ignored');
missing.advance(2000);
assert.equal(missing.calls.filter(c=>c.callback).length,2);
missing.advance(500);
assert.equal(missing.calls.filter(c=>c.callback).length,3,'Repeated failure must increase backoff');
missing.advance(60000);
assert(missing.calls.filter(c=>c.callback).length<15,'Missing responses must not generate an unbounded request rate');
assert(missing.timers.size<=2,'Only the polling timer and one in-flight timeout may remain');
missing.emit('$destroy');assert.equal(missing.timers.size,0);

const failed = load('MW05OilTemperature');
const failedId=/local requestId="([^"]+)"/.exec(failed.query().wire)[1];
failed.emit('MW05LuaResponse',{id:failedId,ok:false});
failed.advance(250);failed.query().callback({oilTemperature:117});failed.frame();
assert.equal(failed.scope.data.value,117,'A caught Lua error must allow a later successful retry');
failed.emit('$destroy');

const budget=load('MW05AFR'), runtimeApi=budget.context.window.MW05Runtime;
const extraScopes=Array.from({length:12},()=>({$on(name,fn){(budget.events[name]||=[]).push(fn);}}));
const clients=extraScopes.map(scope=>runtimeApi.luaClient(scope,budget.context.bngApi));
let admitted=0;
clients.forEach(client=>{if(client.request('read','1',()=>{}))admitted++;});
assert.equal(admitted,7,'Eight shared query slots include the already pending AFR request');
assert.equal(clients[0].request('read','2',()=>{}),false,'One in-flight request per topic');
assert.equal(clients[9].request('command','true',()=>{},true),true);
assert.equal(clients[10].request('command','true',()=>{},true),true);
assert.equal(clients[11].request('command','true',()=>{},true),false,'Shared budget remains bounded, including reserved command slots');
budget.emit('$destroy');assert.equal(budget.timers.size,0,'Every pending timeout must be released');
assert.throws(()=>runtimeApi.luaLiteral(Infinity),/Non-finite/);
assert.throws(()=>runtimeApi.luaLiteral({}),/Unsupported/);
assert.throws(()=>runtimeApi.luaLiteral('\uD800'),/surrogate/);
assert.throws(()=>runtimeApi.luaLiteral('\uDC00'),/surrogate/);
assert.equal(runtimeApi.luaLiteral('\u00007'),'"\\0007"');
assert.equal(runtimeApi.luaLiteral(false),'false');
const spelling=load('MW05Powertrain');
spelling.calls[0].callback({available:false});spelling.calls[1].callback({hasTransferCase:false});
const deviceName='transfercase_$&_$`_$\'_é_"\\\n';
spelling.emit('ChangePowerTrainButtons',{id:'powertrain_device_mode_shortcut_'+deviceName,icon:'powertrain_transfercase_locked'});
spelling.advance(500);
const discovery=spelling.calls.findLast(c=>c.command.includes('local isTransferCandidate'));
assert(!discovery.command.includes('__TRANSFER_BUTTON_DEVICE__'),'Every device placeholder must be replaced');
assert.equal(discovery.command.split(runtimeApi.luaLiteral(deviceName)).length-1,2,'Replacement metacharacters must remain literal in both device-name positions');
spelling.emit('$destroy');
console.log('PASS: 10 apps; telemetry; NOS; lifecycle; units; bounded Lua requests; timeout/backoff; late/error replies; shared budget; literal validation.');
