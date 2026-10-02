/*
 * MW05 Powertrain Dial
 *
 * Compact companion to the full MW05 Powertrain app. The rotary selector
 * only visualises confirmed vehicle modes; stock differential and wheel-axle
 * buttons retain BeamNG's own icon and onClick command.
 */
(function () {
  'use strict';

  var CSS_URL = '/ui/modules/apps/MW05PowertrainDial/app.css?v=0.1.6';
  var POLL_INTERVAL_MS = 200;
  // Native powertrain buttons are also changed by vehicle shortcuts. Refreshing
  // their exported state a few times per second keeps the app in sync without
  // issuing a Lua request for every electrics frame.
  var NATIVE_BUTTON_SYNC_INTERVAL_MS = 350;

  function has(object, key) {
    return object && Object.prototype.hasOwnProperty.call(object, key);
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value === true) return 1;
    if (value === false) return 0;
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : null;
  }

  function firstValue(values, keys) {
    for (var i = 0; i < keys.length; i++) {
      if (has(values, keys[i])) return values[keys[i]];
    }
    return null;
  }

  function binaryMode(value, onWords, offWords) {
    var numeric = numberOrNull(value);
    if (numeric !== null) return numeric >= .5 ? 1 : 0;
    if (typeof value !== 'string') return null;
    var text = value.toLowerCase();
    if (onWords.indexOf(text) >= 0) return 1;
    if (offWords.indexOf(text) >= 0) return 0;
    return null;
  }

  function threeWayMode(value) {
    var numeric = numberOrNull(value);
    if (numeric !== null) return numeric <= -.5 ? 'L4' : (numeric > .66 ? 'H2' : 'H4');
    if (typeof value !== 'string') return null;
    var text = value.toLowerCase().replace(/[ _-]/g, '');
    if (text === '2h' || text === '2hi' || text === 'high2') return 'H2';
    if (text === '4h' || text === '4hi' || text === 'high4') return 'H4';
    if (text === '4l' || text === '4lo' || text === 'low4') return 'L4';
    return null;
  }

  function readElectrics(values) {
    values = values || {};
    var directMode = threeWayMode(firstValue(values, ['transfercase_state', 'transferCaseState']));
    if (directMode) return { available: true, threeWay: true, mode: directMode, threeWayTooltip: 'Transfer case' };

    var namedRange = binaryMode(firstValue(values, ['rangebox_state', 'rangeBoxState']), ['low', 'lo'], ['high', 'hi']);
    var namedLock = binaryMode(firstValue(values, ['transfercase_lock', 'transfercaseLock', 'transfercase_locked', 'transferCaseLocked']), ['locked', 'lock', 'connected'], ['unlocked', 'unlock', 'open', 'disconnected']);
    var legacyRange = binaryMode(firstValue(values, ['modeRangeBox', 'modeRangebox', 'modeRange']), ['low', 'lo'], ['high', 'hi']);
    var legacyLock = binaryMode(firstValue(values, ['mode4WD', 'mode4wd', 'mode4Wd']), ['locked', 'lock', 'connected'], ['unlocked', 'unlock', 'open', 'disconnected']);
    var range = namedRange !== null ? namedRange : legacyRange;
    var lock = namedLock !== null ? namedLock : legacyLock;
    return {
      available: range !== null || lock !== null,
      threeWay: false,
      rangeAvailable: range !== null,
      lockAvailable: lock !== null,
      rangeMode: range === null ? null : (range ? 'LO' : 'HI'),
      lockMode: lock === null ? null : (lock ? 'LOCKED' : 'OPEN'),
      rangeTooltip: 'Rangebox',
      lockTooltip: 'Transfer case',
      rangeNamed: namedRange !== null,
      lockNamed: namedLock !== null
    };
  }

  function isDrivelineButton(button) {
    if (!button || !button.icon) return false;
    var id = String(button.id || '').toLowerCase();
    var label = (id + ' ' + String(button.tooltip || '')).toLowerCase();
    var isNonTransferDifferential = /(?:inter[ _-]?axle|cent(?:er|re)[ _-]?(?:diff|differential)|(?:front|rear)[ _-]?(?:diff|differential))/.test(label);
    var isDisconnectableShaft = isDisconnectableOutputShaft(button);
    // A transfercase's own shortcut belongs to the rotary selector. A separate
    // front/rear output shaft is a native toggle, even when its internal ID
    // happens to contain the word "transfercase".
    if (id.indexOf('transfercase') >= 0 && !isNonTransferDifferential && !isDisconnectableShaft) return false;
    return /^powertrain_differential_/.test(button.icon) || /^powertrain_wheel_(connected|disconnected)$/.test(button.icon) || isDisconnectableShaft;
  }

  function isDisconnectableOutputShaft(button) {
    return !!button && /^powertrain_shaft_(connected|disconnected)$/.test(String(button.icon || ''));
  }

  function buttonIsActive(button) {
    var icon = String(button && button.icon || '').toLowerCase();
    // "disconnected" contains "connected": always handle inactive native
    // icon names first, otherwise an output shaft points to the wrong state.
    if (/(?:open|unlocked|disconnected)/.test(icon)) return false;
    return /(?:closed|locked|connected|lsd_active|torque_vectoring)/.test(icon);
  }

  function addStylesheet(path) {
    var link = document.querySelector('link[data-mw05-css="' + path + '"]');
    if (link) return null;
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = path;
    link.setAttribute('data-mw05-css', path);
    document.head.appendChild(link);
    return link;
  }

  angular.module('beamng.apps').directive('mw05PowertrainDial', [function () {
    return {
      template: `
        <div class="mw05-powertrain-dial" ng-if="display.hasControls">
          <section class="mw05-dial-selector" ng-if="display.threeWay" aria-label="Transfer case selector" ng-mouseenter="showSelectorTooltip('threeway', display.threeWayTooltip)" ng-mouseleave="hideSelectorTooltip('threeway')">
            <span class="mw05-selector-tooltip-panel" ng-if="display.hoveredSelector === 'threeway'">{{display.hoveredSelectorTooltip}}</span>
            <button type="button" class="mw05-mode-position mw05-mode-h2" ng-class="{'is-active': display.mode === 'H2'}" ng-click="selectThreeWay('H2')" ng-attr-title="{{display.threeWayTooltip}}"><span class="mw05-mode-label">2H</span></button>
            <button type="button" class="mw05-mode-position mw05-mode-h4" ng-class="{'is-active': display.mode === 'H4'}" ng-click="selectThreeWay('H4')" ng-attr-title="{{display.threeWayTooltip}}"><span class="mw05-mode-label">4H</span></button>
            <button type="button" class="mw05-mode-position mw05-mode-l4" ng-class="{'is-active': display.mode === 'L4'}" ng-click="selectThreeWay('L4')" ng-attr-title="{{display.threeWayTooltip}}"><span class="mw05-mode-label">4L</span></button>
            <button type="button" class="mw05-rotary-knob" ng-style="{'transform': 'rotate(' + display.knobAngle + 'deg)'}" ng-click="cycleThreeWay()" ng-attr-aria-label="Mode {{display.mode}}" ng-attr-title="{{display.threeWayTooltip}}"><span class="mw05-rotary-notch"></span></button>
          </section>
          <section class="mw05-split-selectors" ng-if="!display.threeWay && (display.rangeAvailable || display.lockAvailable || display.outputShafts.length)" aria-label="Rangebox, transfer case and output shaft controls">
            <div class="mw05-mini-selector" ng-if="display.rangeAvailable" ng-mouseenter="showSelectorTooltip('range', display.rangeTooltip)" ng-mouseleave="hideSelectorTooltip('range')">
              <span class="mw05-selector-tooltip-panel" ng-if="display.hoveredSelector === 'range'">{{display.hoveredSelectorTooltip}}</span>
              <button type="button" class="mw05-mini-choice mw05-mini-first" ng-class="{'is-active': display.rangeMode === 'HI'}" ng-click="selectSplit('range', 'HI')" ng-attr-title="{{display.rangeTooltip}}"><span class="mw05-mini-label">H</span></button>
              <button type="button" class="mw05-mini-choice mw05-mini-last" ng-class="{'is-active': display.rangeMode === 'LO'}" ng-click="selectSplit('range', 'LO')" ng-attr-title="{{display.rangeTooltip}}"><span class="mw05-mini-label">L</span></button>
              <button type="button" class="mw05-mini-knob" ng-style="{'transform': 'rotate(' + display.rangeAngle + 'deg)'}" ng-click="cycleSplit('range')" ng-attr-aria-label="Rangebox {{display.rangeMode}}" ng-attr-title="{{display.rangeTooltip}}"><span class="mw05-mini-notch"></span></button>
            </div>
            <div class="mw05-mini-selector" ng-if="display.lockAvailable" ng-mouseenter="showSelectorTooltip('lock', display.lockTooltip)" ng-mouseleave="hideSelectorTooltip('lock')">
              <span class="mw05-selector-tooltip-panel" ng-if="display.hoveredSelector === 'lock'">{{display.hoveredSelectorTooltip}}</span>
              <button type="button" class="mw05-mini-choice mw05-mini-lock-choice mw05-mini-first" ng-class="{'is-active': display.lockMode === 'OPEN'}" ng-click="selectSplit('lock', 'OPEN')" aria-label="Transfer case unlocked" ng-attr-title="{{display.lockTooltip}}"><span class="mw05-mini-label"><svg class="mw05-lock-state-icon" viewBox="0 0 32 32" aria-hidden="true"><rect x="7" y="14" width="18" height="13" rx="2"/><path d="M12 14v-4a5 5 0 0 1 9-3"/><path d="M16 19v4"/></svg></span></button>
              <button type="button" class="mw05-mini-choice mw05-mini-lock-choice mw05-mini-last" ng-class="{'is-active': display.lockMode === 'LOCKED'}" ng-click="selectSplit('lock', 'LOCKED')" aria-label="Transfer case locked" ng-attr-title="{{display.lockTooltip}}"><span class="mw05-mini-label"><svg class="mw05-lock-state-icon" viewBox="0 0 32 32" aria-hidden="true"><rect x="7" y="14" width="18" height="13" rx="2"/><path d="M11 14v-4a5 5 0 0 1 10 0v4"/><path d="M16 19v4"/></svg></span></button>
              <button type="button" class="mw05-mini-knob" ng-style="{'transform': 'rotate(' + display.lockAngle + 'deg)'}" ng-click="cycleSplit('lock')" ng-attr-aria-label="Transfer case {{display.lockMode}}" ng-attr-title="{{display.lockTooltip}}"><span class="mw05-mini-notch"></span></button>
            </div>
            <div class="mw05-mini-selector mw05-output-shaft-selector" ng-repeat="shaft in display.outputShafts track by shaft.side" ng-mouseenter="showSelectorTooltip('shaft-' + shaft.side, shaft.tooltip)" ng-mouseleave="hideSelectorTooltip('shaft-' + shaft.side)">
              <span class="mw05-selector-tooltip-panel" ng-if="display.hoveredSelector === 'shaft-' + shaft.side">{{display.hoveredSelectorTooltip}}</span>
              <span class="mw05-output-shaft-state mw05-output-shaft-open" ng-class="{'is-active': !shaft.active}" aria-hidden="true"><svg class="mw05-lock-state-icon" viewBox="0 0 32 32"><rect x="7" y="14" width="18" height="13" rx="2"/><path d="M12 14v-4a5 5 0 0 1 9-3"/><path d="M16 19v4"/></svg></span>
              <span class="mw05-output-shaft-state mw05-output-shaft-locked" ng-class="{'is-active': shaft.active}" aria-hidden="true"><svg class="mw05-lock-state-icon" viewBox="0 0 32 32"><rect x="7" y="14" width="18" height="13" rx="2"/><path d="M11 14v-4a5 5 0 0 1 10 0v4"/><path d="M16 19v4"/></svg></span>
              <button type="button" class="mw05-mini-knob mw05-output-shaft-knob" ng-style="{'transform': 'rotate(' + shaft.angle + 'deg)'}" ng-click="activateOutputShaft(shaft.side)" ng-attr-aria-label="{{shaft.tooltip}}" ng-attr-title="{{shaft.tooltip}}"><span class="mw05-mini-notch"></span></button>
            </div>
          </section>
          <section class="mw05-native-controls" ng-if="display.systemButtons.length" ng-class="{'mw05-native-controls--dense': display.systemButtons.length > 5, 'mw05-native-controls--compact': display.systemButtons.length > 8}" aria-label="Native differential and wheel axle controls">
            <span class="mw05-native-tooltip-panel" ng-if="display.hoveredTooltip">{{display.hoveredTooltip}}</span>
            <button type="button" class="mw05-native-button" ng-repeat="button in display.systemButtons track by button.id" ng-class="{'is-active': button.active}" ng-click="activateSystemButton(button)" ng-mouseenter="showNativeTooltip(button.tooltip)" ng-mouseleave="hideNativeTooltip()" ng-attr-aria-label="{{button.tooltip}}" ng-attr-title="{{button.tooltip}}">
              <svg viewBox="0 0 36 36" aria-hidden="true"><use width="36" height="36" ng-attr-href="{{button.href}}"/></svg>
            </button>
          </section>
        </div>`,
      replace: true,
      restrict: 'EA',
      link: function (scope) {
        var stylesheet = addStylesheet(CSS_URL);
        var streamsList = ['electrics'];
        var api = typeof bngApi !== 'undefined' ? bngApi : (typeof window !== 'undefined' ? window.bngApi : null);
        var live = true;
        var pollTimer = null;
        var latestElectrics = {};
        var discoveredState = null;
        var systemButtons = {};
        var outputShafts = {};
        var nextNativeButtonSyncAt = 0;
        var vehicleGeneration = 0;
        var deviceQuerySequence = 0;
        var appliedDeviceQuerySequence = 0;
        var deviceQuery = `(function()
          local result={available=false,threeWay=false,mode=nil,threeWayTooltip=nil,rangeAvailable=false,lockAvailable=false,rangeMode=nil,lockMode=nil,rangeTooltip=nil,lockTooltip=nil,rangeDevice=nil,lockDevice=nil,lockedValue=nil,unlockedValue=nil,hasInteraxle=false,hasNonTransferDifferential=false,outputShafts={}}
          local function lower(v) return string.lower(tostring(v or "")) end
          local function three(key)
            local numeric=tonumber(key)
            if numeric then return numeric<=-0.5 and "L4" or (numeric>0.66 and "H2" or "H4") end
            local text=lower(key):gsub("[ _-]", "")
            if text=="2h" or text=="2hi" or text=="high2" then return "H2" end
            if text=="4h" or text=="4hi" or text=="high4" then return "H4" end
            if text=="4l" or text=="4lo" or text=="low4" then return "L4" end
            return nil
          end
          local e=electrics and electrics.values or {}
          local direct=three(e.transfercase_state)
          local bestLockScore=-1
          local shaftCandidates={front={},rear={}}
          local function shaftPriority(name,side)
            local id=lower(name)
            local compact=id:gsub("[^%w]","")
            if (side=="front" and id=="transfercase_f") or (side=="rear" and id=="transfercase_r") then return 0 end
            if compact==side.."outputshaft" then return 1 end
            if compact:find(side,1,true) and compact:find("output",1,true) and compact:find("shaft",1,true) then return 2 end
            return 100
          end
          for name,d in pairs(powertrain.getDevices() or {}) do
            local modes={} for _,mode in ipairs(d.availableModes or {}) do modes[mode]=true end
            local label=lower(name .. " " .. (d.uiName or "") .. " " .. (d.type or ""))
            local deviceName=lower(name)
            local deviceUiName=lower(d.uiName)
            local dtype=lower(d.type)
            local isOutputShaft=dtype=="shaft" and (deviceUiName=="front output shaft" or deviceUiName=="rear output shaft")
            if isOutputShaft and #((d.availableModes) or {})>1 then
              local side=deviceUiName=="front output shaft" and "front" or "rear"
              table.insert(shaftCandidates[side],{id=name,side=side,priority=shaftPriority(name,side),tooltip=tostring(d.uiName),active=d.mode=="connected"})
            end
            local interaxle=deviceName:find("interaxle",1,true) or deviceName:find("inter axle",1,true) or deviceName:find("inter-axle",1,true) or deviceUiName:find("interaxle",1,true) or deviceUiName:find("inter axle",1,true) or deviceUiName:find("inter-axle",1,true)
            local differential=(dtype=="differential" or deviceUiName:find("differential",1,true) or deviceName:find("differential",1,true))
            -- On the TC83s, the internal device name is "transfercase" but the
            -- actual device exposed to the player is "Center Differential".
            -- The UI name/type therefore takes precedence over that internal name.
            local nonTransferDifferential=differential and (deviceUiName:find("differential",1,true) or interaxle or deviceName:find("differential",1,true))
            if interaxle then result.hasInteraxle=true end
            if nonTransferDifferential then result.hasNonTransferDifferential=true end
            local mode=three(d.mode)
            if not nonTransferDifferential and mode and modes["2hi"] and modes["4hi"] and modes["4lo"] then result.available=true result.threeWay=true result.mode=mode result.threeWayDevice=name result.threeWayTooltip=(d.uiName and tostring(d.uiName)~="" and tostring(d.uiName)) or "Transfer case" return result end
            if dtype=="rangebox" and modes.high and modes.low and (not result.rangeDevice or name<result.rangeDevice) then
              result.rangeAvailable=true result.rangeDevice=name result.rangeMode=d.mode=="low" and "LO" or "HI" result.rangeTooltip=(d.uiName and tostring(d.uiName)~="" and tostring(d.uiName)) or "Rangebox"
            end
            local unlocked=modes.unlocked and "unlocked" or (modes.open and "open" or (modes.disconnected and "disconnected" or nil))
            local locked=modes.locked and "locked" or (modes.connected and "connected" or nil)
            -- Output shafts may be named transfercase_F/transfercase_R. They
            -- have their own selectors and must never become a third lock dial.
            if not isOutputShaft and not nonTransferDifferential and unlocked and locked and label:find("transfer",1,true) then
              local score=label:find("transfercase",1,true) and 2 or 1
              if score>bestLockScore or (score==bestLockScore and (not result.lockDevice or name<result.lockDevice)) then
                bestLockScore=score result.lockAvailable=true result.lockDevice=name result.unlockedValue=unlocked result.lockedValue=locked result.lockMode=d.mode==locked and "LOCKED" or "OPEN" result.lockTooltip=(d.uiName and tostring(d.uiName)~="" and tostring(d.uiName)) or "Transfer case"
              end
            end
          end
          for _,side in ipairs({"front","rear"}) do
            local candidates=shaftCandidates[side]
            table.sort(candidates,function(a,b) if a.priority~=b.priority then return a.priority<b.priority end return a.id<b.id end)
            local shaft=candidates[1]
            if shaft then
              result.outputShafts[side]=shaft
            end
          end
          if direct and not result.hasNonTransferDifferential then result.available=true result.threeWay=true result.mode=direct result.threeWayTooltip="Transfer case" return result end
          for _,controllerName in ipairs({"transfercaseControl"}) do
            local controller=controller.getController(controllerName)
            local mode=controller and controller.getCurrentDriveModeKey and three(controller.getCurrentDriveModeKey()) or nil
            if mode then result.available=true result.threeWay=true result.mode=mode result.threeWayController=controllerName result.threeWayTooltip=(controller.uiName and tostring(controller.uiName)~="" and tostring(controller.uiName)) or "Transfer case" return result end
          end
          for _,controller in pairs(controller.getControllersByType("driveModes") or {}) do
            local label=lower((controller.name or "") .. " " .. (controller.uiName or ""))
            local key=controller.getCurrentDriveModeKey and controller.getCurrentDriveModeKey() or nil
            local interaxle=label:find("interaxle",1,true) or label:find("inter axle",1,true) or label:find("inter-axle",1,true)
            local nonTransferDifferential=(label:find("differential",1,true) or label:find("diff",1,true)) and not label:find("transfer",1,true)
            if interaxle then result.hasInteraxle=true end
            if nonTransferDifferential then result.hasNonTransferDifferential=true end
            if not result.rangeAvailable and (label:find("range",1,true) or label:find("hi/lo",1,true)) and (key=="high" or key=="hi" or key=="low" or key=="lo") then
              result.rangeAvailable=true result.rangeController=controller.name result.rangeMode=(key=="low" or key=="lo") and "LO" or "HI" result.rangeTooltip=(controller.uiName and tostring(controller.uiName)~="" and tostring(controller.uiName)) or "Rangebox"
            end
            if not nonTransferDifferential and not result.lockAvailable and label:find("transfer",1,true) and (key=="open" or key=="unlocked" or key=="locked" or key=="connected") then
              result.lockAvailable=true result.lockController=controller.name result.lockMode=(key=="locked" or key=="connected") and "LOCKED" or "OPEN" result.lockTooltip=(controller.uiName and tostring(controller.uiName)~="" and tostring(controller.uiName)) or "Transfer case"
            end
          end
          result.available=result.rangeAvailable or result.lockAvailable
          return result
        end)()`;

        StreamsManager.add(streamsList);
        scope.display = {hasControls:false,threeWay:false,mode:'H2',knobAngle:-68,threeWayTooltip:'Transfer case',rangeAvailable:false,lockAvailable:false,rangeMode:'HI',lockMode:'OPEN',rangeTooltip:'Rangebox',lockTooltip:'Transfer case',rangeAngle:-42,lockAngle:-42,systemButtons:[],outputShafts:[],hoveredTooltip:'',hoveredSelector:'',hoveredSelectorTooltip:''};

        function updateAngles() {
          scope.display.knobAngle = scope.display.mode === 'H2' ? -120 : (scope.display.mode === 'H4' ? -180 : -240);
          scope.display.rangeAngle = scope.display.rangeMode === 'HI' ? -120 : -240;
          scope.display.lockAngle = scope.display.lockMode === 'OPEN' ? -120 : -240;
        }

        function mergeState() {
          var fromElectrics = readElectrics(latestElectrics);
          // Electrics values alone do not identify the controllable device.
          // Wait for discovery so a shaft cannot briefly appear as a lock dial.
          if (!discoveredState) return {available:false, threeWay:false, rangeAvailable:false, lockAvailable:false};
          var state = discoveredState ? {
            available: discoveredState.available,
            threeWay: discoveredState.threeWay,
            mode: discoveredState.mode,
            threeWayTooltip: discoveredState.threeWayTooltip,
            rangeAvailable: discoveredState.rangeAvailable,
            lockAvailable: discoveredState.lockAvailable,
            rangeMode: discoveredState.rangeMode,
            lockMode: discoveredState.lockMode,
            rangeTooltip: discoveredState.rangeTooltip,
            lockTooltip: discoveredState.lockTooltip,
            rangeDevice: discoveredState.rangeDevice,
            lockDevice: discoveredState.lockDevice,
            rangeController: discoveredState.rangeController,
            lockController: discoveredState.lockController,
            lockedValue: discoveredState.lockedValue,
            unlockedValue: discoveredState.unlockedValue,
            threeWayController: discoveredState.threeWayController,
            hasInteraxle: discoveredState.hasInteraxle,
            hasNonTransferDifferential: discoveredState.hasNonTransferDifferential
          } : fromElectrics;
          if (state.threeWay) {
            if (fromElectrics.threeWay) state.mode=fromElectrics.mode;
            return state;
          }
          // Electrics remain useful for live position updates, but never create
          // a rangebox or transfercase selector without a discovered control.
          if (state.rangeAvailable && fromElectrics.rangeAvailable) state.rangeMode=fromElectrics.rangeMode;
          if (state.lockAvailable && fromElectrics.lockAvailable) state.lockMode=fromElectrics.lockMode;
          state.available=!!(state.rangeAvailable || state.lockAvailable);
          return state;
        }

        function applyState() {
          var state = mergeState();
          scope.display.threeWay = !!state.threeWay;
          if (state.threeWay && state.mode) scope.display.mode=state.mode;
          if (state.threeWayTooltip) scope.display.threeWayTooltip=state.threeWayTooltip;
          scope.display.rangeAvailable = !state.threeWay && !!state.rangeAvailable;
          scope.display.lockAvailable = !state.threeWay && !!state.lockAvailable;
          if (state.rangeMode) scope.display.rangeMode=state.rangeMode;
          if (state.lockMode) scope.display.lockMode=state.lockMode;
          if (state.rangeTooltip) scope.display.rangeTooltip=state.rangeTooltip;
          if (state.lockTooltip) scope.display.lockTooltip=state.lockTooltip;
          updateAngles();
          scope.display.hasControls = scope.display.threeWay || scope.display.rangeAvailable || scope.display.lockAvailable || scope.display.outputShafts.length > 0 || scope.display.systemButtons.length > 0;
          scope.$evalAsync();
        }

        function syncSystemButtons() {
          scope.display.systemButtons = Object.keys(systemButtons).sort().map(function (id) { return systemButtons[id]; });
          scope.display.outputShafts = ['front', 'rear'].filter(function (side) { return !!outputShafts[side]; }).map(function (side) { return outputShafts[side]; });
          scope.display.hasControls = scope.display.threeWay || scope.display.rangeAvailable || scope.display.lockAvailable || scope.display.outputShafts.length > 0 || scope.display.systemButtons.length > 0;
        }

        function syncDiscoveredOutputShafts(devices) {
          outputShafts = {};
          if (!devices || typeof devices !== 'object') { syncSystemButtons(); return; }
          var shaftList = Array.isArray(devices) ? devices : Object.keys(devices).map(function (key) { return devices[key]; });
          shaftList.forEach(function (shaft) {
            if (!shaft || !shaft.id || !shaft.tooltip) return;
            var tooltip = String(shaft.tooltip).trim();
            var side = String(shaft.side || '').toLowerCase();
            if (side !== 'front' && side !== 'rear') {
              if (/^front output shaft$/i.test(tooltip)) side = 'front';
              else if (/^rear output shaft$/i.test(tooltip)) side = 'rear';
              else return;
            }
            var id = String(shaft.id);
            var compactId = id.toLowerCase().replace(/[^a-z0-9]/g, '');
            var rank = compactId === 'transfercase' + (side === 'front' ? 'f' : 'r') ? 0 : (compactId === side + 'outputshaft' ? 1 : 2);
            var existing = outputShafts[side];
            var existingId = existing && String(existing.id);
            var existingCompactId = existingId && existingId.toLowerCase().replace(/[^a-z0-9]/g, '');
            var existingRank = !existing ? Infinity : (existingCompactId === 'transfercase' + (side === 'front' ? 'f' : 'r') ? 0 : (existingCompactId === side + 'outputshaft' ? 1 : 2));
            if (existing && (existingRank < rank || (existingRank === rank && existingId.localeCompare(id) <= 0))) return;
            outputShafts[side] = {
              id: shaft.id,
              side: side,
              active: !!shaft.active,
              angle: shaft.active ? -240 : -120,
              tooltip: tooltip
            };
          });
          syncSystemButtons();
        }

        function threeWayLua(mode) {
          var driveMode = mode === 'H2' ? '2hi' : (mode === 'H4' ? '4hi' : '4lo');
          var range = mode === 'L4' ? 'low' : 'high';
          var fourWheel = mode === 'H2' ? 'disconnected' : 'connected';
          return '(function() local c=controller.getController("transfercaseControl") if c and c.setDriveMode then c.setDriveMode("' + driveMode + '") return true end for _,v in pairs(controller.getControllersByType("4wd") or {}) do if v.setRangeMode and v.set4WDMode then v.setRangeMode("' + range + '") v.set4WDMode("' + fourWheel + '") return true end end return false end)()';
        }

        function splitLua(kind, mode) {
          var state = discoveredState || {};
          var controllerName = state[kind + 'Controller'];
          if (controllerName) return 'local c=controller.getControllerSafe(' + JSON.stringify(controllerName) + ') if c and c.setDriveMode then c.setDriveMode(' + JSON.stringify(kind === 'range' ? (mode === 'LO' ? 'low' : 'high') : (mode === 'LOCKED' ? 'locked' : 'unlocked')) + ') end';
          if (state[kind + 'Device']) {
            var deviceMode = kind === 'range' ? (mode === 'LO' ? 'low' : 'high') : (mode === 'LOCKED' ? state.lockedValue : state.unlockedValue);
            return 'powertrain.setDeviceMode(' + JSON.stringify(state[kind + 'Device']) + ', ' + JSON.stringify(deviceMode) + ')';
          }
          var method = kind === 'range' ? 'setRangeMode' : 'set4WDMode';
          var fallback = kind === 'range' ? (mode === 'LO' ? 'low' : 'high') : (mode === 'LOCKED' ? 'connected' : 'disconnected');
          return '(function() for _,v in pairs(controller.getControllersByType("4wd") or {}) do if v.' + method + ' then v.' + method + '("' + fallback + '") return true end end return false end)()';
        }

        function request(command) {
          if (!api || typeof api.activeObjectLua !== 'function') return;
          api.activeObjectLua(command, function () { if (live) setTimeout(applyState, 250); });
        }

        scope.selectThreeWay = function (mode) {
          if (!scope.display.threeWay || ['H2','H4','L4'].indexOf(mode) < 0) return;
          request(threeWayLua(mode));
        };
        scope.cycleThreeWay = function () {
          var modes=['H2','H4','L4'];
          scope.selectThreeWay(modes[(modes.indexOf(scope.display.mode)+1)%modes.length]);
        };
        scope.selectSplit = function (kind, mode) {
          if (kind === 'range' && !scope.display.rangeAvailable) return;
          if (kind === 'lock' && !scope.display.lockAvailable) return;
          request(splitLua(kind, mode));
        };
        scope.cycleSplit = function (kind) {
          scope.selectSplit(kind, kind === 'range' ? (scope.display.rangeMode === 'HI' ? 'LO' : 'HI') : (scope.display.lockMode === 'OPEN' ? 'LOCKED' : 'OPEN'));
        };
        scope.activateSystemButton = function (button) {
          if (button && button.onClick) request(button.onClick);
        };
        scope.activateOutputShaft = function (side) {
          var shaft = outputShafts[side];
          if (shaft) request('powertrain.toggleDeviceMode(' + JSON.stringify(shaft.id) + ')');
        };
        scope.showNativeTooltip = function (tooltip) {
          scope.display.hoveredTooltip = tooltip || '';
        };
        scope.hideNativeTooltip = function () {
          scope.display.hoveredTooltip = '';
        };
        scope.showSelectorTooltip = function (selector, tooltip) {
          scope.display.hoveredSelector = selector;
          scope.display.hoveredSelectorTooltip = tooltip || '';
        };
        scope.hideSelectorTooltip = function (selector) {
          if (scope.display.hoveredSelector !== selector) return;
          scope.display.hoveredSelector = '';
          scope.display.hoveredSelectorTooltip = '';
        };

        scope.$on('streamsUpdate', function (event, streams) {
          latestElectrics = streams && streams.electrics || {};
          applyState();
        });
        scope.$on('ChangePowerTrainButtons', function (event, button) {
          var id=String(button && (button.id || button.icon) || '');
          if (!id) return;
          // Removal messages may deliberately omit the old icon, so process
          // them before filtering a newly-added native control.
          if (button.remove) {
            delete systemButtons[id];
            var removedDeviceId = id.replace(/^powertrain_device_mode_shortcut_/, '');
            ['front', 'rear'].forEach(function (side) {
              if (outputShafts[side] && String(outputShafts[side].id) === removedDeviceId) delete outputShafts[side];
            });
          }
          // The device snapshot is authoritative for shaft identity/action.
          // Native button events may keep stale entries after a part change.
          else if (isDisconnectableOutputShaft(button)) return;
          else if (!isDrivelineButton(button)) return;
          else systemButtons[id]={id:id,icon:button.icon,active:buttonIsActive(button),tooltip:button.tooltip || 'Differential',onClick:button.onClick || '',href:'/ui/assets/Sprites/svg-symbols.svg#' + button.icon};
          syncSystemButtons();
          scope.$evalAsync();
        });

        function refreshNativeButtons() {
          if (!api || typeof api.activeObjectLua !== 'function') return;
          var now = Date.now();
          if (now < nextNativeButtonSyncAt) return;
          nextNativeButtonSyncAt = now + NATIVE_BUTTON_SYNC_INTERVAL_MS;
          api.activeObjectLua('extensions.ui_simplePowertrainControl.updateButtons()');
        }

        function pollState() {
          if (!live) return;
          if (api && typeof api.activeObjectLua === 'function') {
            var queryGeneration = vehicleGeneration;
            var querySequence = ++deviceQuerySequence;
            api.activeObjectLua(deviceQuery, function (state) {
              if (!live || !state || queryGeneration !== vehicleGeneration || querySequence < appliedDeviceQuerySequence) return;
              appliedDeviceQuerySequence = querySequence;
              discoveredState=state;
              syncDiscoveredOutputShafts(state.outputShafts);
              applyState();
            });
            refreshNativeButtons();
          }
          pollTimer=setTimeout(pollState,POLL_INTERVAL_MS);
        }
        function resetVehicle() {
          vehicleGeneration++;
          latestElectrics={}; discoveredState=null; systemButtons={}; outputShafts={}; nextNativeButtonSyncAt=0; syncSystemButtons(); applyState();
        }
        scope.$on('VehicleChange', resetVehicle);
        scope.$on('VehicleFocusChanged', resetVehicle);
        scope.$on('$destroy', function () {
          live=false;
          if (pollTimer) clearTimeout(pollTimer);
          StreamsManager.remove(streamsList);
          if (stylesheet && stylesheet.parentNode) stylesheet.parentNode.removeChild(stylesheet);
        });
        pollState();
      }
    };
  }]);
})();
