/*
 * MW05 Powertrain
 *
 * Modern driveModes controllers publish transfercase_state:
 *   1 = 2HI, 0.33 = 4HI, -1 = 4LO
 * Older 4wd controllers publish two electrics values:
 *   mode4WD      0 = H2, 1 = H4
 *   modeRangeBox 0 = high, 1 = low
 * Both formats map directly to H2, H4 and L4.
 */
(function () {
  'use strict';

  var CSS_URL = '/ui/modules/apps/MW05Powertrain/app.css?v=dark-amber-4';
  var rememberedThreeWayMode = null;

  function has(object, key) {
    return object && Object.prototype.hasOwnProperty.call(object, key);
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value === true) return 1;
    if (value === false) return 0;
    var result = Number(value);
    return isFinite(result) ? result : null;
  }

  function modeNumber(value, positiveWords, negativeWords) {
    var numeric = numberOrNull(value);
    if (numeric !== null) return numeric;
    if (typeof value !== 'string') return null;
    var text = value.toLowerCase();
    if (positiveWords.indexOf(text) >= 0) return 1;
    if (negativeWords.indexOf(text) >= 0) return 0;
    return null;
  }

  function firstValue(values, keys) {
    for (var i = 0; i < keys.length; i++) {
      if (has(values, keys[i])) return values[keys[i]];
    }
    return null;
  }

  function readTransferCase(values) {
    values = values || {};
    var transfercaseState = numberOrNull(firstValue(values, ['transfercase_state', 'transferCaseState']));
    if (transfercaseState !== null) {
      var driveMode = transfercaseState <= -0.5 ? 'L4' : (transfercaseState > 0.66 ? 'H2' : 'H4');
      return { available: true, mode: driveMode, source: 'transfercase_state' };
    }

    var fourWdRaw = firstValue(values, ['mode4WD', 'mode4wd', 'mode4Wd']);
    var rangeRaw = firstValue(values, ['modeRangeBox', 'modeRangebox', 'modeRange']);
    var fourWd = numberOrNull(fourWdRaw);
    var range = numberOrNull(rangeRaw);

    if (fourWd === null || range === null) {
      return { available: false, mode: null, fourWd: fourWd, range: range };
    }

    var mode = range >= .5 ? 'L4' : (fourWd >= .5 ? 'H4' : 'H2');
    return { available: true, mode: mode, source: 'mode4WD/modeRangeBox', fourWd: fourWd, range: range };
  }

  // Some vehicles expose a single three-position transfer case, while others
  // have two independent controls: a Hi/Lo rangebox and a locked/unlocked
  // transfer case.  Keep those controls separate instead of inventing H2/H4/L4
  // states that the vehicle does not actually provide.
  function readPowertrain(values) {
    values = values || {};
    var modern = numberOrNull(firstValue(values, ['transfercase_state', 'transferCaseState']));
    if (modern !== null) {
      return { available: true, layout: 'three-way', mode: modern <= -0.5 ? 'L4' : (modern > 0.66 ? 'H2' : 'H4') };
    }

    // DriveModes-equipped vehicles (including the Stambecco Rally) publish
    // these named electrics. They are more precise than the legacy mode4WD
    // fallback, which can remain at zero when a controller owns the shaft.
    var range = modeNumber(firstValue(values, ['rangebox_state', 'rangeBoxState', 'modeRangeBox', 'modeRangebox', 'modeRange']), ['low', 'lo'], ['high', 'hi']);
    var lock = modeNumber(firstValue(values, ['transfercase_lock', 'transfercaseLock', 'transfercase_locked', 'transferCaseLocked', 'mode4WD', 'mode4wd', 'mode4Wd']), ['connected', 'locked', 'lock'], ['disconnected', 'unlocked', 'unlock', 'open']);
    var hasRange = range !== null;
    var hasLock = lock !== null;
    return {
      available: hasRange || hasLock,
      layout: 'vertical',
      rangeAvailable: hasRange,
      lockAvailable: hasLock,
      rangeFromElectrics: hasRange,
      lockFromElectrics: hasLock,
      rangeMode: hasRange ? (range >= .5 ? 'LO' : 'HI') : null,
      lockMode: hasLock ? (lock >= .5 ? 'LOCKED' : 'UNLOCKED') : null
    };
  }

  function readExplicitPowertrainButton(button) {
    if (!button) return null;
    var icon = [button.icon, button.id, button.name, button.tooltip].filter(Boolean).join(' ').toLowerCase();
    if (icon.indexOf('transfercase') < 0) return null;
    if (icon.indexOf('high-2') >= 0 || icon.indexOf('high2') >= 0) return 'H2';
    if (icon.indexOf('high-4') >= 0 || icon.indexOf('high4') >= 0) return 'H4';
    if (icon.indexOf('low-4') >= 0 || icon.indexOf('low4') >= 0) return 'L4';
    return null;
  }

  function readVerticalPowertrainButton(button) {
    if (!button) return null;
    var icon = [button.icon, button.id, button.name, button.tooltip].filter(Boolean).join(' ').toLowerCase();
    if (icon.indexOf('rangebox') >= 0) {
      if (icon.indexOf('_low') >= 0 || icon.indexOf('_lo') >= 0) return { kind: 'range', mode: 'LO' };
      if (icon.indexOf('_high') >= 0 || icon.indexOf('_hi') >= 0) return { kind: 'range', mode: 'HI' };
    }
    if (icon.indexOf('transfercase') >= 0) {
      if (icon.indexOf('unlocked') >= 0 || icon.indexOf('disconnected') >= 0 || icon.indexOf('_open') >= 0) return { kind: 'lock', mode: 'UNLOCKED' };
      if (icon.indexOf('locked') >= 0 || icon.indexOf('connected') >= 0 || icon.indexOf('_closed') >= 0 || icon.indexOf('differential_closed') >= 0) return { kind: 'lock', mode: 'LOCKED' };
    }
    return null;
  }

  function isInteraxlePowertrainButton(button) {
    if (!button) return false;
    var label = [button.id, button.icon, button.name, button.tooltip].filter(Boolean).join(' ').toLowerCase();
    // The T-Series calls the physical device "transfercase", although its
    // native control is explicitly named interDiff / Interaxle Differential.
    return /inter[\s_-]?axle/.test(label) || label.indexOf('interdiff') >= 0;
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

  angular.module('beamng.apps').directive('mw05Powertrain', [function () {
    return {
      template: `
        <div class="mw05-powertrain" ng-class="{'has-system-buttons': display.systemButtons.length}">
          <svg ng-if="display.transferAvailable && display.layout === 'three-way'" class="mw05-transfer-case-svg" viewBox="0 0 300 380" preserveAspectRatio="xMidYMid meet" aria-label="Transfer case">
            <rect class="mw05-gate-backplate" x="119" y="143" width="139" height="189" rx="20"/>
            <g class="mw05-gate">
              <path class="mw05-gate-side" d="M229 176 L205 176 L199 230 L214 281 L169 304 M199 230 L139 226" transform="translate(0 10)"/>
              <path class="mw05-gate-rim" d="M229 176 L205 176 L199 230 L214 281 L169 304 M199 230 L139 226"/>
              <path class="mw05-gate-slot" d="M229 176 L205 176 L199 230 L214 281 L169 304 M199 230 L139 226"/>
              <circle class="mw05-detent" ng-class="{'is-engaged': display.mode === 'H2'}" cx="229" cy="176" r="6"/>
              <circle class="mw05-detent" ng-class="{'is-engaged': display.mode === 'H4'}" cx="139" cy="226" r="6"/>
              <circle class="mw05-detent" ng-class="{'is-engaged': display.mode === 'L4'}" cx="169" cy="304" r="6"/>
            </g>
            <g class="mw05-moving-lever" ng-mousedown="startLeverDrag($event)" ng-attr-transform="{{display.leverTransform}}">
              <ellipse class="mw05-lever-foot" cx="0" cy="0" rx="10" ry="5"/>
              <path class="mw05-lever-stem" d="M-9 0 L-7 -110 L7 -110 L9 0 Q0 8 -9 0Z"/>
              <path class="mw05-lever-facet" d="M2 3 L3 -110 L7 -110 L9 0Z"/>
              <path class="mw05-lever-knob" d="M-18 -116 Q-17 -131 0 -134 Q17 -131 18 -116 L15 -108 Q0 -98 -15 -108Z"/>
              <ellipse class="mw05-lever-cap-rim" cx="0" cy="-129" rx="11" ry="6"/>
              <ellipse class="mw05-lever-cap" cx="0" cy="-130" rx="8" ry="4"/>
              <path fill="transparent" d="M-23 12 L-25 -142 L25 -142 L23 12Z"/>
            </g>
            <g class="mw05-slot-label" ng-class="{'is-engaged': display.mode === 'H2'}" ng-click="selectMode('H2')" role="button" aria-label="2Hi: two-wheel drive, high range">
              <path class="mw05-label-leader" d="M111 171 L174 154 L229 176"/>
              <rect x="16" y="149" width="95" height="44" rx="7"/>
              <text x="28" y="170">2Hi</text><text class="mw05-mode-detail" x="28" y="185">2WD · High</text>
            </g>
            <g class="mw05-slot-label" ng-class="{'is-engaged': display.mode === 'H4'}" ng-click="selectMode('H4')" role="button" aria-label="4Hi: four-wheel drive, high range">
              <path class="mw05-label-leader" d="M111 232 L139 226"/>
              <rect x="16" y="210" width="95" height="44" rx="7"/>
              <text x="28" y="231">4Hi</text><text class="mw05-mode-detail" x="28" y="246">4WD · High</text>
            </g>
            <g class="mw05-slot-label" ng-class="{'is-engaged': display.mode === 'L4'}" ng-click="selectMode('L4')" role="button" aria-label="4Lo: four-wheel drive, low range">
              <path class="mw05-label-leader" d="M111 299 L169 304"/>
              <rect x="16" y="277" width="95" height="44" rx="7"/>
              <text x="28" y="298">4Lo</text><text class="mw05-mode-detail" x="28" y="313">4WD · Low</text>
            </g>
            <rect class="mw05-status-panel" x="45" y="342" width="210" height="29" rx="8"/>
            <text class="mw05-shifter-status" x="150" y="361">ENGAGED : {{display.modeLabel}}</text>
          </svg>
          <svg ng-if="display.transferAvailable && display.layout === 'vertical'" class="mw05-transfer-case-svg" viewBox="0 0 300 380" preserveAspectRatio="xMidYMid meet" aria-label="Commandes de transmission">
            <g ng-if="display.rangeAvailable" class="mw05-vertical-control mw05-range-control">
              <rect class="mw05-gate-backplate" x="33" y="125" width="94" height="208" rx="20"/>
              <text class="mw05-vertical-title" x="112" y="231" transform="rotate(90 112 231)">RANGEBOX</text>
              <g class="mw05-gate">
                <path class="mw05-gate-side" d="M80 162 L80 300" transform="translate(0 10)"/>
                <path class="mw05-gate-rim" d="M80 162 L80 300"/>
                <path class="mw05-gate-slot" d="M80 172 L80 290"/>
              </g>
              <circle class="mw05-detent" ng-class="{'is-engaged': display.rangeMode === 'HI'}" cx="80" cy="178" r="6"/>
              <circle class="mw05-detent" ng-class="{'is-engaged': display.rangeMode === 'LO'}" cx="80" cy="284" r="6"/>
              <g class="mw05-vertical-label mw05-vertical-label-bottom" ng-class="{'is-engaged': display.rangeMode === 'LO'}" ng-click="selectVerticalMode('range', 'LO')"><text x="80" y="323">Lo</text></g>
              <g class="mw05-moving-lever" ng-mousedown="startVerticalDrag($event, 'range')" ng-attr-transform="{{display.rangeLeverTransform}}">
                <ellipse class="mw05-lever-foot" cx="0" cy="0" rx="10" ry="5"/><path class="mw05-lever-stem" d="M-9 0 L-7 -92 L7 -92 L9 0 Q0 8 -9 0Z"/><path class="mw05-lever-facet" d="M2 3 L3 -92 L7 -92 L9 0Z"/><path class="mw05-lever-knob" d="M-18 -98 Q-17 -113 0 -116 Q17 -113 18 -98 L15 -90 Q0 -80 -15 -90Z"/><ellipse class="mw05-lever-cap-rim" cx="0" cy="-111" rx="11" ry="6"/><ellipse class="mw05-lever-cap" cx="0" cy="-112" rx="8" ry="4"/><path fill="transparent" d="M-24 12 L-25 -124 L25 -124 L24 12Z"/>
              </g>
              <g class="mw05-vertical-label mw05-vertical-label-top" ng-class="{'is-engaged': display.rangeMode === 'HI'}" ng-click="selectVerticalMode('range', 'HI')"><text x="80" y="153">Hi</text></g>
            </g>
            <g ng-if="display.lockAvailable" class="mw05-vertical-control mw05-lock-control">
              <rect class="mw05-gate-backplate" x="173" y="125" width="94" height="208" rx="20"/>
              <text class="mw05-vertical-title" x="252" y="231" transform="rotate(90 252 231)">TRANSFERCASE</text>
              <g class="mw05-gate">
                <path class="mw05-gate-side" d="M220 162 L220 300" transform="translate(0 10)"/>
                <path class="mw05-gate-rim" d="M220 162 L220 300"/>
                <path class="mw05-gate-slot" d="M220 172 L220 290"/>
              </g>
              <circle class="mw05-detent" ng-class="{'is-engaged': display.lockMode === 'UNLOCKED'}" cx="220" cy="178" r="6"/>
              <circle class="mw05-detent" ng-class="{'is-engaged': display.lockMode === 'LOCKED'}" cx="220" cy="284" r="6"/>
              <g class="mw05-vertical-label mw05-vertical-label-bottom" ng-class="{'is-engaged': display.lockMode === 'LOCKED'}" ng-click="selectVerticalMode('lock', 'LOCKED')"><text x="220" y="323">Lock</text></g>
              <g class="mw05-moving-lever" ng-mousedown="startVerticalDrag($event, 'lock')" ng-attr-transform="{{display.lockLeverTransform}}">
                <ellipse class="mw05-lever-foot" cx="0" cy="0" rx="10" ry="5"/><path class="mw05-lever-stem" d="M-9 0 L-7 -92 L7 -92 L9 0 Q0 8 -9 0Z"/><path class="mw05-lever-facet" d="M2 3 L3 -92 L7 -92 L9 0Z"/><path class="mw05-lever-knob" d="M-18 -98 Q-17 -113 0 -116 Q17 -113 18 -98 L15 -90 Q0 -80 -15 -90Z"/><ellipse class="mw05-lever-cap-rim" cx="0" cy="-111" rx="11" ry="6"/><ellipse class="mw05-lever-cap" cx="0" cy="-112" rx="8" ry="4"/><path fill="transparent" d="M-24 12 L-25 -124 L25 -124 L24 12Z"/>
              </g>
              <g class="mw05-vertical-label mw05-vertical-label-top" ng-class="{'is-engaged': display.lockMode === 'UNLOCKED'}" ng-click="selectVerticalMode('lock', 'UNLOCKED')"><text x="220" y="153">Open</text></g>
            </g>
            <rect class="mw05-status-panel" x="12" y="340" width="276" height="34" rx="8"/>
            <text class="mw05-shifter-status mw05-vertical-status" x="150" y="362">{{display.verticalStatus}}</text>
          </svg>
          <div class="mw05-system-controls" ng-if="display.systemButtons.length" aria-label="Commandes de transmission et ESC">
            <button type="button" class="mw05-stock-system-button" ng-class="{'mw05-stock-driveline-button': button.icon !== 'powertrain_esc'}" ng-repeat="button in display.systemButtons track by button.id" ng-click="activateSystemButton(button)" ng-attr-aria-label="{{button.tooltip}}">
              <svg ng-if="button.icon === 'powertrain_esc'" viewBox="0 0 36 36" aria-hidden="true">
                <circle r="18" cx="18" cy="18" fill="#FFFFFF"/>
                <path class="mw05-stock-esc-light" d="M2,18.5 a1,1 0 0,0 30,0" ng-attr-fill="#{{button.color}}"/>
                <use fill="#343434" width="36" height="36" ng-attr-href="{{button.href}}"/>
              </svg>
              <svg ng-if="button.icon !== 'powertrain_esc'" viewBox="0 0 36 36" aria-hidden="true">
                <circle r="17.5" cx="17.5" cy="17.5" fill="#343434"/>
                <use fill="#FFFFFF" width="36" height="36" ng-attr-href="{{button.href}}"/>
              </svg>
              <span class="mw05-system-tooltip">{{button.tooltip}}</span>
            </button>
          </div>
        </div>`,
      replace: true,
      restrict: 'EA',
      link: function (scope, element) {
        var stylesheet = addStylesheet(CSS_URL);
        var streamsList = ['electrics'];
        var live = true;
        var api = typeof bngApi !== 'undefined' ? bngApi :
          (typeof window !== 'undefined' && window.bngApi ? window.bngApi : null);
        var capabilityPollTimer = null;
        var capabilityKnown = false;
        var hasTransferCase = false;
        var deviceState = null;
        var transferButtonDevice = '';
        var hasInteraxleControl = false;
        var systemButtons = {};
        var requestedSystemButtons = false;
        var deviceQuery = `(function()
          local result = {available=false, layout="vertical", rangeAvailable=false, lockAvailable=false, rangeFromDevice=false, lockFromDevice=false, rangeFromDriveMode=false, lockFromDriveMode=false, lockFromNamedElectric=false, hasInteraxle=false}
          local devices = powertrain.getDevices()
          -- Do not let pairs() order decide whether a real transfercase is
          -- visible. A Stambecco Rally can expose both an interaxle diff and a
          -- transfercase; the old one-pass lookup alternated between them.
          for name,d in pairs(devices) do
            local modes = {}
            for _,m in ipairs(d.availableModes or {}) do modes[m]=true end
            local dtype = string.lower(d.type or "")
            local label = string.lower(name .. " " .. (d.uiName or "") .. " " .. (d.type or ""))
            -- An "Inter Axle Driveshaft" is only a shaft. It is not the
            -- truck's interaxle *differential* and must not hide a lever.
            local isInteraxle = dtype == "differential" and (string.find(label, "interaxle", 1, true) or string.find(label, "inter axle", 1, true) or string.find(label, "inter-axle", 1, true))
            if isInteraxle then result.hasInteraxle=true end
            if dtype == "rangebox" and modes.high and modes.low then
              result.rangeAvailable=true result.rangeFromDevice=true result.rangeDevice=name
              result.rangeMode=d.mode == "low" and "LO" or "HI"
            end
          end
          -- Choose one non-interaxle transfer device deterministically. The
          -- native shortcut device is preferred; otherwise use the most
          -- explicit name, with a lexical tie-breaker for stable polling.
          local best, bestName, bestScore, bestUnlocked, bestLocked = nil, nil, -1, nil, nil
          for name,d in pairs(devices) do
            local modes = {}
            for _,m in ipairs(d.availableModes or {}) do modes[m]=true end
            local dtype = string.lower(d.type or "")
            local label = string.lower(name .. " " .. (d.uiName or "") .. " " .. (d.type or ""))
            local isInteraxle = dtype == "differential" and (string.find(label, "interaxle", 1, true) or string.find(label, "inter axle", 1, true) or string.find(label, "inter-axle", 1, true))
            local unlocked = modes.unlocked and "unlocked" or (modes.open and "open" or (modes.disconnected and "disconnected" or (modes.lsd and "lsd" or (modes.viscous and "viscous" or nil))))
            local locked = modes.locked and "locked" or (modes.connected and "connected" or nil)
            local isTransferCandidate = name == __TRANSFER_BUTTON_DEVICE__ or string.find(label, "transfer", 1, true) or string.find(label, "center", 1, true) or string.find(label, "centre", 1, true)
            if not isInteraxle and isTransferCandidate and unlocked and locked then
              local score = 0
              if name == __TRANSFER_BUTTON_DEVICE__ then score=4
              elseif string.find(label, "transfercase", 1, true) then score=3
              elseif string.find(label, "transfer", 1, true) then score=2
              elseif string.find(label, "center", 1, true) or string.find(label, "centre", 1, true) then score=1 end
              if score > bestScore or (score == bestScore and (not bestName or name < bestName)) then
                best, bestName, bestScore = d, name, score
                bestUnlocked, bestLocked = unlocked, locked
              end
            end
          end
          if best then
            result.lockAvailable=true result.lockFromDevice=true result.lockDevice=bestName
            result.unlockedValue=bestUnlocked result.lockedValue=bestLocked
            result.lockMode=best.mode == bestLocked and "LOCKED" or "UNLOCKED"
          end
          local e=electrics.values
          -- BeamNG DriveModes is the authoritative API for the Stambecco
          -- Rally: it owns the front intershaft and publishes the selected
          -- transfercase mode itself. Read it directly instead of guessing
          -- from the generic 4wd controller.
          for _,c in pairs(controller.getControllersByType("driveModes") or {}) do
            local label=string.lower((c.name or "") .. " " .. (c.uiName or ""))
            local key=c.getCurrentDriveModeKey and c.getCurrentDriveModeKey() or nil
            if not result.lockAvailable and string.find(label, "transfer", 1, true) and (key == "unlocked" or key == "open" or key == "locked" or key == "connected") then
              result.lockAvailable=true result.lockFromDriveMode=true result.lockController=c.name
              result.lockMode=(key == "locked" or key == "connected") and "LOCKED" or "UNLOCKED"
            end
            if not result.rangeAvailable and (string.find(label, "range", 1, true) or string.find(label, "hi/lo", 1, true)) and (key == "high" or key == "hi" or key == "low" or key == "lo") then
              result.rangeAvailable=true result.rangeFromDriveMode=true result.rangeController=c.name
              result.rangeMode=(key == "low" or key == "lo") and "LO" or "HI"
            end
          end
          local transferLock=e.transfercase_lock
          if transferLock == nil then transferLock=e.transfercaseLock end
          if not result.lockAvailable and transferLock ~= nil then
            result.lockAvailable=true result.lockFromNamedElectric=true
            result.lockMode=transferLock >= 0.5 and "LOCKED" or "UNLOCKED"
          end
          local rangeState=e.rangebox_state
          if rangeState == nil then rangeState=e.rangeBoxState end
          if not result.rangeAvailable and rangeState ~= nil then
            result.rangeAvailable=true result.rangeFromNamedElectric=true
            result.rangeMode=rangeState >= 0.5 and "LO" or "HI"
          end
          -- The stock 4wd controller publishes this signal even when the
          -- shaft has a vehicle-specific name which is not "transfercase".
          -- It remains a fallback for older vehicles only.
          if not result.lockAvailable and not result.hasInteraxle and e.mode4WD ~= nil then
            result.lockAvailable=true result.lockMode=e.mode4WD >= 0.5 and "LOCKED" or "UNLOCKED"
          end
          if not result.rangeAvailable and e.modeRangeBox ~= nil then
            result.rangeAvailable=true result.rangeMode=e.modeRangeBox >= 0.5 and "LO" or "HI"
          end
          result.available=result.rangeAvailable or result.lockAvailable
          if e.transfercase_state ~= nil then
            result.layout="three-way" result.available=true
            result.mode=e.transfercase_state <= -0.5 and "L4" or (e.transfercase_state > 0.66 and "H2" or "H4")
          end
          return result
        end)()`;
        var transferCaseCapabilityQuery = '(function() local e=electrics and electrics.values or {} local has4wd=false local hasRangebox=false local hasInteraxle=false if powertrain and powertrain.getDevices then for name,d in pairs(powertrain.getDevices()) do local label=string.lower(name .. " " .. (d.uiName or "") .. " " .. (d.type or "")) if string.find(label,"interaxle",1,true) or string.find(label,"inter axle",1,true) or string.find(label,"inter-axle",1,true) then hasInteraxle=true break end end end if controller and controller.getControllersByType then local c=controller.getControllersByType("4wd") has4wd=c and next(c)~=nil or false local r=controller.getControllersByType("rangebox") hasRangebox=r and next(r)~=nil or false end local hasModern=e.transfercase_state~=nil local hasRange=e.modeRangeBox~=nil or e.modeRangebox~=nil or e.modeRange~=nil local hasLock=not hasInteraxle and (e.mode4WD~=nil or e.transfercase_locked~=nil or e.transferCaseLocked~=nil) return {hasTransferCase=hasModern or hasRange or hasRangebox or (not hasInteraxle and (has4wd or hasLock))} end)()';
        // The same graph defines the slot, mouse constraints and keyboard animation.
        var nodes = [
          {x:229,y:176}, {x:205,y:176}, {x:199,y:230},
          {x:139,y:226}, {x:214,y:281}, {x:169,y:304}
        ];
        var edges = [[0,1],[1,2],[2,3],[2,4],[4,5]];
        var points = {H2:nodes[0], H4:nodes[3], L4:nodes[5]};
        var destinations = {H2:0,H4:3,L4:5};
        var rememberedPoint = rememberedThreeWayMode && points[rememberedThreeWayMode];
        var position = rememberedPoint ? {x:rememberedPoint.x,y:rememberedPoint.y} : {x:229,y:176};
        var currentEdge = 0;
        var dragging = false;
        var verticalDragging = null;
        var verticalPositions = {range:{x:80,y:178}, lock:{x:220,y:178}};
        var verticalAnimation = {range:null, lock:null};
        var verticalTargets = {range:null, lock:null};
        var verticalGrabY = 0;
        var svg = null;
        var grabOffset = null;
        var animation = null;
        var latestMode = null;
        var labels = {H2:'2Hi',H4:'4Hi',L4:'4Lo'};
        StreamsManager.add(streamsList);
        scope.display = {available:false, transferAvailable:false, systemButtons:[], layout:null, mode:null, modeLabel:'', leverTransform:'', rangeAvailable:false, lockAvailable:false, rangeMode:null, lockMode:null, rangeLeverTransform:'', lockLeverTransform:'', verticalStatus:''};

        function renderLever() {
          // A rigid assembly: its length never collapses at a middle position.
          var tilt = (position.x - 199) * .35;
          scope.display.leverTransform = 'translate(' + position.x + ' ' + position.y + ') rotate(' + tilt + ')';
          scope.$evalAsync();
        }
        function stopAnimation() {
          if (animation !== null) cancelAnimationFrame(animation);
          animation = null;
        }
        function renderVerticalLever(kind) {
          var p = verticalPositions[kind];
          scope.display[kind + 'LeverTransform'] = 'translate(' + p.x + ' ' + p.y + ')';
          scope.$evalAsync();
        }
        function stopVerticalAnimation(kind) {
          if (verticalAnimation[kind] !== null) cancelAnimationFrame(verticalAnimation[kind]);
          verticalAnimation[kind] = null;
        }
        function animateVertical(kind, mode) {
          if (!mode) return;
          var targetY = mode === 'HI' || mode === 'UNLOCKED' ? 178 : 284;
          if (verticalTargets[kind] === targetY && (verticalAnimation[kind] !== null || verticalPositions[kind].y === targetY)) return;
          stopVerticalAnimation(kind);
          verticalTargets[kind] = targetY;
          function step() {
            if (!live || verticalDragging === kind) return;
            var p = verticalPositions[kind], delta = targetY - p.y;
            if (Math.abs(delta) < 1) { p.y = targetY; renderVerticalLever(kind); verticalAnimation[kind] = null; return; }
            p.y += delta * .25;
            renderVerticalLever(kind);
            verticalAnimation[kind] = requestAnimationFrame(step);
          }
          verticalAnimation[kind] = requestAnimationFrame(step);
        }
        function graphRoute(from,to,visited) {
          if (from === to) return [to];
          visited = (visited || []).concat(from);
          for (var i=0;i<edges.length;i++) {
            var e=edges[i], next=e[0]===from?e[1]:(e[1]===from?e[0]:-1);
            if (next<0 || visited.indexOf(next)>=0) continue;
            var route=graphRoute(next,to,visited);
            if (route) return [from].concat(route);
          }
          return null;
        }
        function distance(p,q) { return Math.hypot(p.x-q.x,p.y-q.y); }
        function animateTo(mode) {
          if (!points[mode]) return;
          stopAnimation();
          var edge=edges[currentEdge], target=destinations[mode];
          var routes=edge.map(function(start) {
            var ids=graphRoute(start,target), length=distance(position,nodes[start]);
            for(var i=1;i<ids.length;i++) length+=distance(nodes[ids[i-1]],nodes[ids[i]]);
            return {ids:ids,length:length};
          });
          var route=routes[0].length<=routes[1].length?routes[0]:routes[1];
          var waypoints=route.ids.map(function(id){return nodes[id];}), lastTime=null;
          function step(time) {
            if (!live || dragging) return;
            var budget=Math.min(lastTime===null?16:time-lastTime,40)*.42;
            lastTime=time;
            while(waypoints.length && budget>0) {
              var goal=waypoints[0], d=distance(position,goal);
              if(d<=budget) {position={x:goal.x,y:goal.y};waypoints.shift();budget-=d;}
              else {position.x+=(goal.x-position.x)*budget/d;position.y+=(goal.y-position.y)*budget/d;budget=0;}
            }
            currentEdge=project(position).edge;
            renderLever();
            animation=waypoints.length?requestAnimationFrame(step):null;
          }
          animation=requestAnimationFrame(step);
        }
        function modeLua(mode) {
          var key=mode==='H2'?'2hi':mode==='H4'?'4hi':'4lo';
          var range=mode==='L4'?'low':'high', fourWd=mode==='H2'?'disconnected':'connected';
          return '(function() local c=controller.getController("transfercaseControl") if c and c.setDriveMode then c.setDriveMode("' + key + '") return true end local cs=controller.getControllersByType("4wd") or {} for _,v in pairs(cs) do if v.setRangeMode and v.set4WDMode then v.setRangeMode("' + range + '") v.set4WDMode("' + fourWd + '") return true end end return false end)()';
        }
        function requestMode(mode) {
          if (!scope.display.available || !points[mode]) return;
          animateTo(mode);
          if(api && api.activeObjectLua) api.activeObjectLua(modeLua(mode),function(){
            if(!live) return;
            // Confirm from vehicle telemetry; never claim the mouse target is engaged.
            setTimeout(function(){if(live && !dragging && latestMode) animateTo(latestMode);},400);
          });
        }
        scope.selectMode=requestMode;
        function pointer(event) {
          if(!svg || !svg.getScreenCTM()) return null;
          var p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;
          return p.matrixTransform(svg.getScreenCTM().inverse());
        }
        function project(p,allowed) {
          var best={distance:Infinity};
          edges.forEach(function(e,index){
            if(allowed && allowed.indexOf(index)<0) return;
            var a=nodes[e[0]], b=nodes[e[1]], dx=b.x-a.x, dy=b.y-a.y;
            var t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));
            var q={x:a.x+t*dx,y:a.y+t*dy}, d=distance(p,q);
            if(d<best.distance) best={point:q,distance:d,edge:index};
          });
          return best;
        }
        function dragMove(event) {
          if(!dragging) return;
          var p=pointer(event);if(!p) return;
          p={x:p.x-grabOffset.x,y:p.y-grabOffset.y};
          // Substeps ensure a fast mouse move still passes through each junction.
          var steps=Math.max(1,Math.ceil(distance(position,p)/3));
          steps=Math.min(steps,200);
          for(var i=0;i<steps;i++){
            var aim={x:position.x+(p.x-position.x)/(steps-i),y:position.y+(p.y-position.y)/(steps-i)};
            var allowed=[currentEdge], edge=edges[currentEdge];
            edge.forEach(function(id){
              if(distance(position,nodes[id])<5) edges.forEach(function(e,j){if(e.indexOf(id)>=0) allowed.push(j);});
            });
            var result=project(aim,allowed);
            position=result.point;currentEdge=result.edge;
          }
          renderLever();event.preventDefault();
        }
        function detachDrag() {
          dragging=false;
          window.removeEventListener('mousemove',dragMove);
          window.removeEventListener('mouseup',dragEnd);
          window.removeEventListener('blur',cancelDrag);
        }
        function cancelDrag() {detachDrag();if(latestMode) animateTo(latestMode);}
        function dragEnd(event) {
          if(!dragging) return;
          if(event) dragMove(event);
          detachDrag();
          var mode=null;
          Object.keys(points).forEach(function(key){if(distance(position,points[key])<16) mode=key;});
          if(mode) requestMode(mode);
          else if(latestMode) animateTo(latestMode);
        }
        scope.startLeverDrag=function(event) {
          if(!scope.display.available || event.button!==0) return;
          svg=element[0].querySelector('svg');
          var p=pointer(event);if(!p) return;
          stopAnimation();dragging=true;
          grabOffset={x:p.x-position.x,y:p.y-position.y};
          event.preventDefault();event.stopPropagation();
          window.addEventListener('mousemove',dragMove);
          window.addEventListener('mouseup',dragEnd);
          window.addEventListener('blur',cancelDrag);
        };
        function verticalLua(kind, mode) {
          if (deviceState && deviceState[kind + 'Controller']) {
            var controllerMode = kind === 'range' ? (mode === 'LO' ? 'low' : 'high') : (mode === 'LOCKED' ? 'locked' : 'unlocked');
            return 'controller.getControllerSafe(' + JSON.stringify(deviceState[kind + 'Controller']) + ').setDriveMode(' + JSON.stringify(controllerMode) + ')';
          }
          if (deviceState && deviceState[kind + 'Device']) {
            var deviceMode = kind === 'range' ? (mode === 'LO' ? 'low' : 'high') : (mode === 'LOCKED' ? deviceState.lockedValue : deviceState.unlockedValue);
            return 'powertrain.setDeviceMode(' + JSON.stringify(deviceState[kind + 'Device']) + ', ' + JSON.stringify(deviceMode) + ')';
          }
          var value = kind === 'range' ? (mode === 'LO' ? 'low' : 'high') : (mode === 'LOCKED' ? 'connected' : 'disconnected');
          var method = kind === 'range' ? 'setRangeMode' : 'set4WDMode';
          return '(function() local types={"4wd","rangebox"} for _,t in ipairs(types) do local cs=controller.getControllersByType(t) or {} for _,v in pairs(cs) do if v.' + method + ' then v.' + method + '("' + value + '") return true end end end return false end)()';
        }
        function requestVerticalMode(kind, mode) {
          if (!scope.display.available || !scope.display[kind + 'Available']) return;
          animateVertical(kind, mode);
          if (api && api.activeObjectLua) api.activeObjectLua(verticalLua(kind, mode), function () {
            if (!live || verticalDragging) return;
            setTimeout(function () {
              var confirmed = kind === 'range' ? scope.display.rangeMode : scope.display.lockMode;
              if (live && confirmed) animateVertical(kind, confirmed);
            }, 400);
          });
        }
        scope.selectVerticalMode = requestVerticalMode;
        function isStockSystemButton(button) {
          if (!button || !button.icon) return false;
          var id = String(button.id || '').toLowerCase();
          // BeamNG's differential controller publishes the generic native
          // open/closed/LSD icons.  The transfer-case lever also uses two of
          // those icons, so exclude only the transfer-case device here.
          var isLocker = /^powertrain_differential_(closed|open|lsd|lsd_active|torque_vectoring|(front|middle|center|rear)_(default|locked))$/.test(button.icon);
          var isWheelAxle = /^powertrain_wheel_(connected|disconnected)$/.test(button.icon);
          return (isLocker && id.indexOf('transfercase') < 0) || isWheelAxle;
        }
        function syncSystemButtons() {
          scope.display.systemButtons = Object.keys(systemButtons).sort().map(function (id) { return systemButtons[id]; });
        }
        scope.activateSystemButton = function (button) {
          if (!button || !api || typeof api.activeObjectLua !== 'function') return;
          // `onClick` is emitted by BeamNG's own Simple Powertrain Control.
          // Executing it preserves vehicle-specific ESC and locker behavior.
          var command = button.onClick || (button.icon === 'powertrain_esc' ? "controller.getControllerSafe('esc').toggleESCMode()" : '');
          if (command) api.activeObjectLua(command);
        };
        function verticalDragMove(event) {
          if (!verticalDragging) return;
          var p = pointer(event); if (!p) return;
          var current = verticalPositions[verticalDragging];
          current.y = Math.max(178, Math.min(284, p.y - verticalGrabY));
          renderVerticalLever(verticalDragging);
          event.preventDefault();
        }
        function detachVerticalDrag() {
          verticalDragging = null;
          window.removeEventListener('mousemove', verticalDragMove);
          window.removeEventListener('mouseup', verticalDragEnd);
          window.removeEventListener('blur', cancelVerticalDrag);
        }
        function cancelVerticalDrag() {
          var kind = verticalDragging;
          detachVerticalDrag();
          if (kind) animateVertical(kind, kind === 'range' ? scope.display.rangeMode : scope.display.lockMode);
        }
        function verticalDragEnd(event) {
          if (!verticalDragging) return;
          if (event) verticalDragMove(event);
          var kind = verticalDragging, y = verticalPositions[kind].y;
          detachVerticalDrag();
          requestVerticalMode(kind, y < 231 ? (kind === 'range' ? 'HI' : 'UNLOCKED') : (kind === 'range' ? 'LO' : 'LOCKED'));
        }
        scope.startVerticalDrag = function (event, kind) {
          if (!scope.display.available || event.button !== 0 || !scope.display[kind + 'Available']) return;
          svg = element[0].querySelector('svg');
          var grab = pointer(event); if (!grab) return;
          verticalGrabY = grab.y - verticalPositions[kind].y;
          stopVerticalAnimation(kind);
          verticalDragging = kind;
          event.preventDefault(); event.stopPropagation();
          window.addEventListener('mousemove', verticalDragMove);
          window.addEventListener('mouseup', verticalDragEnd);
          window.addEventListener('blur', cancelVerticalDrag);
        };
        renderLever();
        renderVerticalLever('range');
        renderVerticalLever('lock');

        function applyState(state) {
          var canShow = capabilityKnown && hasTransferCase;
          scope.display.available = canShow && !!(state && state.available);
          scope.display.layout = scope.display.available ? state.layout : null;
          scope.display.transferAvailable = scope.display.available && !!(state && (state.layout === 'three-way' || state.rangeAvailable || state.lockAvailable));
          if (scope.display.layout === 'three-way') {
            scope.display.mode = state.mode;
            scope.display.modeLabel = labels[scope.display.mode] || '';
            scope.display.rangeAvailable = false;
            scope.display.lockAvailable = false;
            var changed = latestMode !== scope.display.mode;
            var firstThreeWayState = latestMode === null;
            latestMode = scope.display.mode;
            rememberedThreeWayMode = scope.display.mode;
            if (!dragging && changed) {
              if (firstThreeWayState) {
                position = {x:points[latestMode].x, y:points[latestMode].y};
                currentEdge = project(position).edge;
                stopAnimation();
                renderLever();
              } else {
                animateTo(latestMode);
              }
            }
          } else if (scope.display.layout === 'vertical') {
            scope.display.mode = null;
            scope.display.modeLabel = '';
            scope.display.rangeAvailable = !!state.rangeAvailable;
            scope.display.lockAvailable = !!state.lockAvailable;
            scope.display.rangeMode = state.rangeMode;
            scope.display.lockMode = state.lockMode;
            scope.display.verticalStatus = (state.rangeAvailable ? 'RANGE : ' + (state.rangeMode === 'LO' ? 'Lo' : 'Hi') : '') + (state.rangeAvailable && state.lockAvailable ? '  ·  ' : '') + (state.lockAvailable ? 'TRANSFER : ' + (state.lockMode === 'LOCKED' ? 'Locked' : 'Unlocked') : '');
            if (state.rangeAvailable && verticalDragging !== 'range') animateVertical('range', state.rangeMode);
            if (state.lockAvailable && verticalDragging !== 'lock') animateVertical('lock', state.lockMode);
          } else {
            scope.display.mode = null;
            scope.display.modeLabel = '';
            scope.display.rangeAvailable = false;
            scope.display.lockAvailable = false;
          }
          if (!scope.display.available) {
            scope.display.transferAvailable = false;
            detachDrag(); detachVerticalDrag(); stopAnimation(); stopVerticalAnimation('range'); stopVerticalAnimation('lock');
          }
          // StreamsManager callbacks are not guaranteed to run inside an
          // Angular digest. Explicitly schedule a digest so ng-attr-cx/cy
          // moves the luminous point or removes the button as soon as the
          // vehicle capability changes.
          scope.$evalAsync();
        }

        scope.$on('streamsUpdate', function (event, streams) {
          var state = readPowertrain(streams && streams.electrics);
          // Keep the device names discovered through Lua for commands, but
          // always use the newest electrics values for the visible detent.
          // This makes the lever react immediately when the stock 4wd
          // controller changes from connected to disconnected.
          if (hasInteraxleControl && !(deviceState && (deviceState.lockFromDevice || deviceState.lockFromDriveMode || deviceState.lockFromNamedElectric))) {
            // The native Interaxle button is authoritative.  Suppress only
            // the fake transfercase lock produced by mode4WD, while leaving a
            // genuine Hi/Lo rangebox available to this app.
            state.lockAvailable = false;
            state.lockMode = null;
            state.available = !!state.rangeAvailable;
          }
          if (deviceState && deviceState.hasInteraxle && !deviceState.available) {
            // Heavy trucks can publish mode4WD for an interaxle differential.
            // It is not a transfer case and must never create a lever.
            state = deviceState;
          } else if (deviceState && state && state.available && state.layout === 'vertical') {
            state.rangeDevice = deviceState.rangeDevice;
            state.lockDevice = deviceState.lockDevice;
            state.rangeController = deviceState.rangeController;
            state.lockController = deviceState.lockController;
            state.lockedValue = deviceState.lockedValue;
            state.unlockedValue = deviceState.unlockedValue;
            if (deviceState.rangeFromDevice) {
              state.rangeAvailable = true;
              state.rangeFromDevice = true;
              state.rangeMode = deviceState.rangeMode;
            }
            // A vehicle may expose an Interaxle locker *and* a real transfer
            // case.  The Interaxle button hides only the generic mode4WD
            // fallback; it must not prevent a discovered transfercase device
            // from moving its own lever.
            if (deviceState.lockFromDevice || deviceState.lockFromDriveMode || deviceState.lockFromNamedElectric) {
              state.lockAvailable = true;
              state.lockFromDevice = true;
              state.lockMode = deviceState.lockMode;
            }
          } else if (deviceState) {
            state = deviceState;
          }
          applyState(state);
        });

        // New driveModes vehicles also announce an explicit transfer-case
        // icon. It is only a fallback for vehicles without transfercase_state;
        // generic rangebox icons are deliberately ignored because they do not
        // distinguish H2 from H4.
        scope.$on('ChangePowerTrainButtons', function (event, button) {
          if (isInteraxlePowertrainButton(button)) {
            // Native UI refreshes can remove/re-add this button repeatedly.
            // Keep detection latched for the current vehicle rather than
            // letting those housekeeping events alter the visible shifter.
            hasInteraxleControl = hasInteraxleControl || !button.remove;
          }
          if (isStockSystemButton(button)) {
            var systemId = String(button.id || button.icon);
            if (button.remove) {
              delete systemButtons[systemId];
            } else {
              systemButtons[systemId] = {
                id: systemId,
                icon: button.icon,
                color: String(button.color || 'FF6600').replace('#', ''),
                tooltip: button.tooltip || (button.icon === 'powertrain_esc' ? 'ESC' : 'Differential'),
                onClick: button.onClick || '',
                href: '/ui/assets/Sprites/svg-symbols.svg#' + button.icon
              };
            }
            syncSystemButtons();
            scope.$evalAsync();
            return;
          }
          // An Interaxle event must never fall through to either shifter.
          if (isInteraxlePowertrainButton(button)) return;
          if (button && button.remove) {
            var removedId = String(button.icon || button.id || '').toLowerCase();
            if (removedId.indexOf('transfercase') >= 0) transferButtonDevice = '';
            // A removal event is only cleanup. Do not feed its old icon back
            // into the visible state or the lever can alternate every frame.
            return;
          }
          if (button && /transfercase.*(locked|unlocked)/i.test(button.icon || '')) {
            var id = String(button.id || '');
            if (id.indexOf('powertrain_device_mode_shortcut_') === 0) {
              transferButtonDevice = button.remove ? '' : id.slice('powertrain_device_mode_shortcut_'.length);
            }
          }
          var verticalButton = readVerticalPowertrainButton(button);
          if (verticalButton) {
            hasTransferCase = true;
            capabilityKnown = true;
            // These native events expose an action (for example “Lock”), not
            // the engaged state. Stambecco Rally repeatedly swaps them, so
            // using them for the visual position creates a permanent blink.
            // The display is updated only by electrics or deviceQuery.
            return;
          }
          var mode = readExplicitPowertrainButton(button);
          if (!mode) return;
          hasTransferCase = true;
          capabilityKnown = true;
          applyState({ available: true, layout: 'three-way', mode: mode, source: 'powertrain_button' });
        });

        function pollTransferCaseCapability() {
          if (!live) return;
          if (api && typeof api.activeObjectLua === 'function') {
            api.activeObjectLua(deviceQuery
              .replace('__TRANSFER_BUTTON_DEVICE__', JSON.stringify(transferButtonDevice))
              .replace('__INTERAXLE_CONTROL__', hasInteraxleControl ? 'true' : 'false'), function (data) {
              if (!live || !data) return;
              if (data.hasInteraxle && !data.available) {
                deviceState = data;
                capabilityKnown = true;
                hasTransferCase = false;
                applyState(data);
                return;
              }
              if (data.available) {
                deviceState = data;
                capabilityKnown = true;
                hasTransferCase = true;
                applyState(data);
              }
            });
            api.activeObjectLua(transferCaseCapabilityQuery, function (data) {
              if (!live || deviceState) return;
              capabilityKnown = true;
              hasTransferCase = !!(data && data.hasTransferCase);
              if (!hasTransferCase) {
                applyState({ available: false });
              }
            });
            // Same refresh hook as BeamNG's native Simple Powertrain Control:
            // it emits the installed ESC and differential buttons for us.
            if (!requestedSystemButtons) {
              requestedSystemButtons = true;
              api.activeObjectLua('extensions.ui_simplePowertrainControl.updateButtons()');
            }
          }
          capabilityPollTimer = setTimeout(pollTransferCaseCapability, 150);
        }

        function resetVehicleControls() {
          systemButtons = {};
          syncSystemButtons();
          deviceState = null;
          transferButtonDevice = '';
          hasInteraxleControl = false;
          capabilityKnown = false;
          hasTransferCase = false;
          latestMode = null;
          requestedSystemButtons = false;
          applyState({available:false});
        }
        scope.$on('VehicleChange', resetVehicleControls);
        scope.$on('VehicleFocusChanged', resetVehicleControls);

        scope.$on('$destroy', function () {
          live = false;
          detachDrag();
          detachVerticalDrag();
          stopAnimation();
          stopVerticalAnimation('range');
          stopVerticalAnimation('lock');
          if (capabilityPollTimer) clearTimeout(capabilityPollTimer);
          StreamsManager.remove(streamsList);
          if (stylesheet && stylesheet.parentNode) stylesheet.parentNode.removeChild(stylesheet);
        });

        pollTransferCaseCapability();
      }
    };
  }]);
})();
