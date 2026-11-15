"""Execute generated UI queries/commands in LuaJIT, including BeamNG's callback wrapper.

Local test dependency: lupa (MW05_LUA_MODULES can point to an isolated installation).
Nothing from this fixture is included in the distributed mod.
"""
import json
import os
from pathlib import Path
import sys

sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.environ.get('MW05_LUA_MODULES', str(Path(__file__).resolve().parents[2] / 'diagnostics/lua-test-runtime')))
from lupa.luajit21 import LuaRuntime

request = json.load(sys.stdin)
lua = LuaRuntime(unpack_returned_tuples=True)
lua.globals().fixtureName = request['fixture']
lua.globals().specialName = request.get('specialName', '')
lua.execute('''
local devices={}
electrics={values={}}
local controllers={}
local function device(name,dtype,label,mode,modes)
  devices[name]={name=name,type=dtype,uiName=label,mode=mode,availableModes=modes}
end
powertrain={getDevices=function() return devices end,getDevice=function(name) return devices[name] end}
powertrain.setDeviceMode=function(name,mode)
  local d=assert(devices[name],name)
  for _,valid in ipairs(d.availableModes) do if valid==mode then d.mode=mode return end end
  error("Invalid device mode: "..name.."/"..tostring(mode))
end
powertrain.toggleDeviceMode=function(name)
  local d=assert(devices[name],name)
  for i,mode in ipairs(d.availableModes) do if mode==d.mode then powertrain.setDeviceMode(name,d.availableModes[i % #d.availableModes+1]) return end end
end
local function mode(deviceName,deviceMode,signal,value)
  local settings={}
  if deviceName then settings[deviceName]={type="powertrainDeviceMode",deviceName=deviceName,mode=deviceMode} end
  if signal then settings[signal]={type="electricsValue",electricsName=signal,value=value} end
  return {settings=settings}
end
local function control(name,label,modes,key)
  local c={name=name,uiName=label}
  c.getCurrentDriveModeKey=function() return key end
  c.getDriveModeData=function(k) return modes[k] end
  c.setDriveMode=function(k)
    local data=assert(modes[k],"Invalid controller mode: "..name.."/"..tostring(k))
    key=k
    for _,setting in pairs(data.settings) do
      if setting.type=="powertrainDeviceMode" then powertrain.setDeviceMode(setting.deviceName,setting.mode) end
      if setting.type=="electricsValue" then electrics.values[setting.electricsName]=setting.value end
    end
  end
  controllers[name]=c c.setDriveMode(key)
  return c
end
controller={getController=function(name) return controllers[name] end,getControllerSafe=function(name) return controllers[name] end,
  getControllersByType=function(kind) return kind=="driveModes" and controllers or {} end}
if fixtureName=="percheron" then
  -- Device names, modes and controller mappings from the stock Percheron JBeam.
  device("tCaseRangebox","rangeBox","Rangebox","high",{"high","low"})
  device("transfercase","differential","Transfer Case","locked",{"locked"})
  device("transfercase_F","shaft","Front Output Shaft","connected",{"connected","disconnected"})
  device("transfercase_FF","differential","Front Inter Axle Differential","open",{"open","locked"})
  device("transfercase_R","differential","Rear Inter Axle Differential","open",{"open","locked"})
  control("rangeboxControl","Rangebox",{high=mode("tCaseRangebox","high","rangebox_state",0),low=mode("tCaseRangebox","low","rangebox_state",1)},"high")
  control("transfercaseControl","Front drive",{unlocked=mode("transfercase_F","disconnected","transfercase_lock",0),locked=mode("transfercase_F","connected","transfercase_lock",1)},"locked")
elseif fixtureName=="direct-shafts" then
  device("transfercase_F","shaft","Front Output Shaft","connected",{"connected","disconnected"})
  device("transfercase_R","shaft","Rear Output Shaft","connected",{"connected","disconnected"})
  device("transfercase","shaft","Front Output Shaft","connected",{"connected","disconnected"})
elseif fixtureName=="direct-split" then
  device("rangebox","rangeBox","Rangebox","high",{"high","low"})
  device("transfercase","differential","Transfer Case","open",{"open","locked"})
  electrics.values.rangebox_state=0 electrics.values.transfercase_lock=0
elseif fixtureName=="controller-only" then
  control("customTransfercaseControl","Transfer case",{open=mode(),locked=mode()},"locked")
elseif fixtureName=="special-controller" then
  device("rangebox","rangeBox","Rangebox","high",{"high","low"})
  control(specialName,"Rangebox",{high=mode("rangebox","high","rangebox_state",0),low=mode("rangebox","low","rangebox_state",1)},"high")
elseif fixtureName=="special-device" then
  device(specialName,"rangeBox","Rangebox","high",{"high","low"})
elseif fixtureName=="three-way" then
  device("rangebox","rangeBox","Rangebox","high",{"high","low"})
  device("transfercase_F","shaft","Front Output Shaft","disconnected",{"connected","disconnected"})
  local function transferMode(range,front,value)
    local data=mode("rangebox",range,"transfercase_state",value)
    data.settings.front={type="powertrainDeviceMode",deviceName="transfercase_F",mode=front}
    return data
  end
  control("transfercaseControl","Transfer case",{
    ["2hi"]=transferMode("high","disconnected",1),["4hi"]=transferMode("high","connected",0.33),["4lo"]=transferMode("low","connected",-1)
  },"2hi")
else error("Unknown fixture") end
guihooks={trigger=function(event,reply) if event=="MW05LuaResponse" then lastResponse=reply end end}
''')

for command in request.get('commands', []):
    lua.execute(command)
if request.get('wire'):
    lua.execute(request['wire'])
state = lua.execute('return ' + request['query'])

def plain(value):
    if hasattr(value, 'items'):
        return {str(key): plain(item) for key, item in value.items()}
    return value

json.dump({'state': plain(state), 'electrics': plain(lua.globals().electrics['values']),
           'response': plain(lua.globals().lastResponse)}, sys.stdout)
