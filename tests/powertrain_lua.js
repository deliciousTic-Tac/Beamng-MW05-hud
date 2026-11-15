'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const cp = require('child_process'), assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const python = process.env.MW05_LUA_PYTHON || 'python';
function load(fixture, specialName) {
  let factory, snapshot;
  const source=fs.readFileSync(path.join(root,'ui/modules/apps/MW05PowertrainDial/app.js'),'utf8');
  const query=/var deviceQuery = `([\s\S]*?)`;/.exec(source)[1];
  const commands=[], handlers={}, timers=new Map(); let timerId=0;
  function run(wire) {
    snapshot=JSON.parse(cp.execFileSync(python,[path.join(__dirname,'powertrain_lua_fixture.py')],{
      input:JSON.stringify({fixture,query,commands,wire,specialName}),encoding:'utf8'}));
    return snapshot;
  }
  const context={
    console,Map,document:{createElement(){return {setAttribute(){}};},head:{appendChild(){}}},window:{},
    angular:{module(){return {directive(name,providers){factory=providers.at(-1)();}};}},
    StreamsManager:{add(){},remove(){}},
    setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);},
    bngApi:{activeObjectLua(code,callback){
      assert.equal(callback,undefined,'Native bridge callback table must remain unused');
      if(code.includes('local requestId=')){
        if(!code.includes('local result={available=false'))commands.push(code);
        const reply=run(code.includes('local result={available=false')?code:undefined).response;
        assert(reply&&reply.ok,'Generated Lua request must execute successfully');
        handlers.MW05LuaResponse(null,reply);
      }
    }}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root,'lib/runtime.js'),'utf8')+'\n'+
    source,context);
  const scope={$on(name,fn){handlers[name]=fn;},$evalAsync(){}};
  factory.link(scope);
  return {scope,commands,get snapshot(){return snapshot;},
    refresh(){const timer=[...timers.values()].find(t=>t.delay===50)||[...timers.values()].find(t=>t.delay===500);timers.clear();timer.fn();},
    stream(values){handlers.streamsUpdate(null,{electrics:values});},
    shortcut(code){commands.push(code);run();this.refresh();}
  };
}
const perch=load('percheron');
assert.equal(perch.scope.display.rangeMode,'HI');
assert.equal(perch.scope.display.lockAvailable,false,'Front-drive controller must not create a duplicate transfercase dial');
assert.equal(perch.scope.display.outputShafts.length,1);
assert.equal(perch.snapshot.state.rangeController,'rangeboxControl');
assert.equal(perch.scope.display.outputShafts[0].controller,'transfercaseControl');
for(const expected of ['LO','HI','LO','HI']){
  perch.scope.cycleSplit('range');perch.refresh();perch.stream(perch.snapshot.electrics);
  assert.equal(perch.scope.display.rangeMode,expected,'Percheron rangebox must complete both directions');
  assert.equal(perch.snapshot.electrics.rangebox_state,expected==='LO'?1:0,'Rangebox controller must update electrics');
}
for(const active of [false,true,false,true]){
  perch.scope.activateOutputShaft('front');perch.refresh();perch.stream(perch.snapshot.electrics);
  assert.equal(perch.scope.display.outputShafts[0].active,active);
  assert.equal(perch.snapshot.electrics.transfercase_lock,active?1:0,'Mouse commands must keep front-drive electrics in sync');
}
perch.shortcut('(function() controller.getController("transfercaseControl").setDriveMode("unlocked") return true end)()');
assert.equal(perch.scope.display.outputShafts[0].active,false,'A native shortcut must update the same dial');
perch.scope.activateOutputShaft('front');perch.refresh();
assert.equal(perch.scope.display.outputShafts[0].active,true,'Mouse must reconnect after a native shortcut');
const shafts=load('direct-shafts');
assert.equal(shafts.scope.display.outputShafts.length,2,'Tom/Bomber style duplicate front shaft must stay suppressed');
shafts.scope.activateOutputShaft('front');shafts.refresh();
assert.equal(shafts.scope.display.outputShafts[0].active,false);
assert.equal(shafts.scope.display.outputShafts[1].active,true,'Rear shaft must be independent');
shafts.scope.activateOutputShaft('front');shafts.refresh();
assert.equal(shafts.scope.display.outputShafts[0].active,true);
const split=load('direct-split');
split.scope.cycleSplit('range');split.refresh();split.stream({rangebox_state:0,transfercase_lock:0});
assert.equal(split.scope.display.rangeMode,'LO','Stale generic electrics must not override actual device state');
split.scope.cycleSplit('range');split.refresh();assert.equal(split.scope.display.rangeMode,'HI');
split.scope.cycleSplit('lock');split.refresh();assert.equal(split.scope.display.lockMode,'LOCKED');
split.scope.cycleSplit('lock');split.refresh();assert.equal(split.scope.display.lockMode,'OPEN');
const only=load('controller-only');
only.scope.cycleSplit('lock');only.refresh();assert.equal(only.scope.display.lockMode,'OPEN','Actual open/locked controller keys must be respected');
only.scope.cycleSplit('lock');only.refresh();assert.equal(only.scope.display.lockMode,'LOCKED');
const three=load('three-way');
for(const expected of ['H4','L4','H2']){
  three.scope.cycleThreeWay();three.refresh();three.stream(three.snapshot.electrics);
  assert.equal(three.scope.display.mode,expected,'Three-way transfer controller must keep cycling correctly');
}
const specialName='contrôle_"🛻\\\n\t\u00007"); electrics.values.hacked=1 --';
for(const fixture of ['special-controller','special-device']){
  const app=load(fixture,specialName);
  for(const expected of ['LO','HI']){
    app.scope.cycleSplit('range');app.refresh();
    assert.equal(app.scope.display.rangeMode,expected,'Lua names must round-trip without JSON escape errors');
    assert.equal(app.snapshot.electrics.hacked,undefined,'A device/controller name must remain data');
  }
}
const envelopeEvents={},envelopeTimers=new Map();let envelopeTimer=0,reply,delivered='unchanged';
const envelopeContext={window:{},Map,setTimeout(fn){const id=++envelopeTimer;envelopeTimers.set(id,fn);return id;},clearTimeout(id){envelopeTimers.delete(id);}};
vm.runInNewContext(fs.readFileSync(path.join(root,'lib/runtime.js'),'utf8'),envelopeContext);
const envelopeClient=envelopeContext.window.MW05Runtime.luaClient({$on(name,fn){envelopeEvents[name]=fn;}},{activeObjectLua(wire){
  reply=JSON.parse(cp.execFileSync(python,[path.join(__dirname,'powertrain_lua_fixture.py')],{input:JSON.stringify({fixture:'direct-split',query:'{}',commands:[],wire}),encoding:'utf8'})).response;
  envelopeEvents.MW05LuaResponse(null,reply);
}});
envelopeClient.request('false-result','false',value=>{delivered=value;});
assert.equal(reply.ok,true);assert.equal(delivered,false,'A false Lua result must remain false, not disappear');
delivered='unchanged';
envelopeClient.request('error-result','(function() error("simulated failure") end)()',value=>{delivered=value;});
assert.equal(reply.ok,false);assert.equal(delivered,'unchanged','A caught Lua error must not be presented as valid telemetry');
assert.equal(envelopeTimers.size,0,'Replies, including Lua errors, must release timeout resources');
console.log('PASS LuaJIT: Percheron High/Low; front-drive mouse/shortcut sync; independent shafts; 2H/4H/4L; response envelopes; quoted Unicode/control characters remain data.');
