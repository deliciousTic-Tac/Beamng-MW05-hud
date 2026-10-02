/*
 * MW05 Oil Pressure
 *
 * Visual copy of MW05 Forced Induction. The preferred source is
 * electrics.oilPressure, interpreted as BAR. Custom vehicle electrics and
 * engineThermalData variants are accepted only when a numeric oil-pressure
 * value is actually published.
 */
(function () {
  'use strict';

  var DEBUG = false;
  var CSS_URL = '/ui/modules/apps/MW05OilPressure/app.css';
  var BAR_PER_PSI = 0.0689475729;
  var INHG_PER_PSI = 2.0360206576;
  // Oil-pressure scale: 0..100 PSI, equivalent to 0..6.9 bar.
  var MIN_SCALE_BAR = 100 * BAR_PER_PSI;
  var SCALE_MIN_PSI = 0;
  var MIN_SCALE_MAX_PSI = MIN_SCALE_BAR / BAR_PER_PSI;
  var SCALE_START_ANGLE = -130;
  var SCALE_ZERO_ANGLE = SCALE_START_ANGLE;
  var SCALE_END_ANGLE = 130;
  var BASE_REDZONE_PSI = 6;
  var REDZONE_EXTENSION_BAR = 0.3;
  var MIN_REDZONE_PSI = BASE_REDZONE_PSI + REDZONE_EXTENSION_BAR / BAR_PER_PSI;

  function number(value, fallback) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function pressureUnitFromSettings(values) {
    if (!values) return 'PSI';
    if (values.uiUnitPressure === 'bar') return 'bar';
    if (values.uiUnitPressure === 'inHg') return 'inHg';
    return 'PSI';
  }

  function convertPressure(valuePsi, unit) {
    if (unit === 'bar') return valuePsi * BAR_PER_PSI;
    if (unit === 'inHg') return valuePsi * INHG_PER_PSI;
    return valuePsi;
  }

  function scaleMinPsi(unit) {
    return 0;
  }

  function formatPressure(valuePsi, unit) {
    var value = convertPressure(valuePsi, unit);
    return unit === 'bar' ? value.toFixed(1) : String(Math.round(value));
  }

  function formatScaleLabel(value, unit) {
    if (unit !== 'bar') return String(Math.round(value));
    return Math.abs(value - Math.round(value)) < 0.0001 ? String(Math.round(value)) : value.toFixed(1);
  }

  function digitalValueX(valueText, unit) {
    var length = String(valueText || '').length;
    var slots = unit === 'bar' ? 4 : 3;
    return 256 + Math.max(0, slots - Math.min(length, slots)) * 18;
  }

  function ghostTextForUnit(unit) {
    return unit === 'bar' ? '88.8' : '888';
  }

  function pressureRatio(valuePsi, minPsi, maxPsi) {
    return clamp((valuePsi - minPsi) / (maxPsi - minPsi), 0, 1);
  }

  function scaleAngle(valuePsi, minPsi, maxPsi) {
    if (valuePsi <= 0) {
      return SCALE_START_ANGLE + pressureRatio(valuePsi, minPsi, 0) * (SCALE_ZERO_ANGLE - SCALE_START_ANGLE);
    }
    return SCALE_ZERO_ANGLE + pressureRatio(valuePsi, 0, maxPsi) * (SCALE_END_ANGLE - SCALE_ZERO_ANGLE);
  }

  function redlineStartAngle(maxPsi, scalePsi, hasPressure, unit) {
    var startPsi = hasPressure ? Math.min(maxPsi, scalePsi - MIN_REDZONE_PSI) : scalePsi - MIN_REDZONE_PSI;
    return scaleAngle(startPsi, scaleMinPsi(unit), scalePsi);
  }

  function polarPoint(angleDeg, radius) {
    var angle = angleDeg * Math.PI / 180;
    return { x: 256 + Math.sin(angle) * radius, y: 256 - Math.cos(angle) * radius };
  }

  function arcPath(startDeg, endDeg, radius) {
    var start = polarPoint(startDeg, radius);
    var end = polarPoint(endDeg, radius);
    var largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    var sweep = endDeg >= startDeg ? 1 : 0;
    return 'M ' + start.x.toFixed(2) + ' ' + start.y.toFixed(2) +
      ' A ' + radius + ' ' + radius + ' 0 ' + largeArc + ' ' + sweep +
      ' ' + end.x.toFixed(2) + ' ' + end.y.toFixed(2);
  }

  function redlineBandPath(startDeg, endDeg, outerRadius, innerRadius) {
    var outerStart = polarPoint(startDeg, outerRadius);
    var outerEnd = polarPoint(endDeg, outerRadius);
    var innerEnd = polarPoint(endDeg, innerRadius);
    var innerStart = polarPoint(startDeg, innerRadius);
    var largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    var sweep = endDeg >= startDeg ? 1 : 0;
    return 'M ' + outerStart.x.toFixed(2) + ' ' + outerStart.y.toFixed(2) +
      ' A ' + outerRadius + ' ' + outerRadius + ' 0 ' + largeArc + ' ' + sweep +
      ' ' + outerEnd.x.toFixed(2) + ' ' + outerEnd.y.toFixed(2) +
      ' L ' + innerEnd.x.toFixed(2) + ' ' + innerEnd.y.toFixed(2) +
      ' A ' + innerRadius + ' ' + innerRadius + ' 0 ' + largeArc + ' ' + (sweep ? 0 : 1) +
      ' ' + innerStart.x.toFixed(2) + ' ' + innerStart.y.toFixed(2) + ' Z';
  }

  function makeTicks() {
    var ticks = [];
    for (var i = 0; i <= 30; i++) {
      ticks.push({ angle: -130 + (i / 30) * 260, major: i % 6 === 0 });
    }
    return ticks;
  }

  function makeLabels(maxPressure, unit) {
    var labels = [];
    var minPressure = scaleMinPsi(unit);
    var labelMaxPsi = Math.min(maxPressure, 100);
    var zeroPoint = polarPoint(SCALE_START_ANGLE, 154);
    labels.push({ x: zeroPoint.x, y: zeroPoint.y, value: formatScaleLabel(0, unit) });
    // Keep only the requested main graduations. Bar labels are converted from
    // the same PSI values: 20/40/60/80/100 PSI -> 1.4/2.8/4.1/5.5/6.9 bar.
    for (var valuePsi = 20; valuePsi <= labelMaxPsi + 0.0001; valuePsi += 20) {
      var angle = scaleAngle(valuePsi, minPressure, maxPressure);
      var point = polarPoint(angle, 154);
      labels.push({ x: point.x, y: point.y, value: formatScaleLabel(convertPressure(valuePsi, unit), unit) });
    }
    return labels;
  }

  function numericField(source, keys) {
    source = source || {};
    for (var i = 0; i < keys.length; i++) {
      if (typeof source[keys[i]] === 'number' && isFinite(source[keys[i]])) {
        return { key: keys[i], value: source[keys[i]], unit: /psi/i.test(keys[i]) ? 'psi' : 'bar' };
      }
    }
    return null;
  }

  function nestedOilPressure(source, depth, context) {
    if (!source || typeof source !== 'object' || depth > 3) return null;
    context = context || '';
    var keys = Object.keys(source);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var value = source[key];
      var path = context ? context + '.' + key : key;
      if ((/oil.*pressure|pressure.*oil/i.test(path) || (/oil/i.test(context) && /pressure/i.test(key))) && typeof value === 'number' && isFinite(value)) {
        return { key: key, value: value, unit: /psi/i.test(key) ? 'psi' : 'bar' };
      }
    }
    for (var j = 0; j < keys.length; j++) {
      if (source[keys[j]] && typeof source[keys[j]] === 'object') {
        var nextContext = context ? context + '.' + keys[j] : keys[j];
        var nested = nestedOilPressure(source[keys[j]], depth + 1, nextContext);
        if (nested) return nested;
      }
    }
    return null;
  }

  function engineRunning(values, engineInfo) {
    engineInfo = engineInfo || [];
    // Prefer the live electrics RPM. engineInfo can retain its last value
    // briefly while the engine is shutting down.
    var rpm = number(values && values.rpm, null);
    if (rpm === null) rpm = number(values && values.rpmTacho, null);
    if (rpm === null) rpm = number(engineInfo[4], null);
    if (rpm !== null) return rpm > 0;
    return null;
  }

  function readOilPressure(values, thermalData, luaData, engineInfo) {
    var sources = [values || {}, thermalData || {}, luaData || {}];
    var pressureKeys = ['oilPressureBar', 'oil_pressure_bar', 'oilPressure', 'oilpressure', 'oil_pressure', 'oilPress', 'oilpress', 'engineOilPressure', 'engine_oil_pressure', 'oilPressurePsi', 'oil_pressure_psi'];
    var maxKeys = ['oilPressureMaxBar', 'oil_pressure_max_bar', 'oilPressureMax', 'oilpressureMax', 'oil_pressure_max', 'maxOilPressure', 'max_oil_pressure', 'oilPressureMaxPsi', 'oil_pressure_max_psi'];
    var pressure = null;
    var max = null;
    for (var sourceIndex = 0; sourceIndex < sources.length && !pressure; sourceIndex++) {
      pressure = numericField(sources[sourceIndex], pressureKeys) || nestedOilPressure(sources[sourceIndex], 0);
    }
    for (var maxSourceIndex = 0; maxSourceIndex < sources.length && !max; maxSourceIndex++) {
      max = numericField(sources[maxSourceIndex], maxKeys);
    }
    // Clear a retained/live oil-pressure value as soon as the engine stops.
    // Some vehicles keep their last oil pressure in the stream for a short
    // time after shutdown, but the gauge must immediately return to zero.
    if (pressure && engineRunning(values, engineInfo) === false) {
      return { value: 0, max: max ? (max.unit === 'psi' ? max.value : max.value / BAR_PER_PSI) : MIN_SCALE_MAX_PSI, simulated: false, source: 'engine off', keys: Object.keys(values || {}) };
    }
    if (!pressure) {
      // BeamNG does not expose oil pressure on standard vehicles. Keep the
      // gauge useful with a clearly marked RPM-based fallback; a real
      // oilPressure value always takes precedence above this branch.
      engineInfo = engineInfo || [];
      var rpm = number(values && values.rpm, null);
      if (rpm === null) rpm = number(values && values.rpmTacho, null);
      if (rpm === null) rpm = number(engineInfo[4], 0);
      var maxRpm = number(engineInfo[1], 0);
      var running = engineRunning(values, engineInfo);
      if (running === null) running = rpm > 0;
      if (!running || rpm <= 0) return { value: 0, max: MIN_SCALE_MAX_PSI, simulated: true, source: 'RPM fallback', keys: Object.keys(values || {}) };
      var rpmRatio = maxRpm > 0 ? clamp(rpm / maxRpm, 0, 1) : clamp(rpm / 7000, 0, 1);
      var oilTemperature = number(thermalData && (thermalData.oilTemperature || thermalData.oiltemp), 90);
      var temperatureFactor = oilTemperature < 70 ? 1.12 : (oilTemperature > 115 ? 0.92 : 1);
      var estimatedPsi = clamp((10 + rpmRatio * 80) * temperatureFactor, 0, 100);
      return { value: estimatedPsi, max: MIN_SCALE_MAX_PSI, simulated: true, source: 'RPM fallback', keys: Object.keys(values || {}) };
    }
    var valuePsi = pressure.unit === 'psi' ? pressure.value : pressure.value / BAR_PER_PSI;
    var maxPsi = max ? (max.unit === 'psi' ? max.value : max.value / BAR_PER_PSI) : MIN_SCALE_MAX_PSI;
    maxPsi = Math.max(maxPsi, valuePsi, 1);
    return { value: valuePsi, max: maxPsi, simulated: false, keys: Object.keys(values || {}), source: pressure.key };
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

  angular.module('beamng.apps').directive('mw05OilPressure', [function () {
    return {
      template:
        '<div class="mw05-oil-pressure">' +
          '<svg class="mw05-oil-svg" viewBox="0 0 512 512" preserveAspectRatio="xMidYMid meet" aria-label="MW05 oil pressure gauge">' +
            '<defs><filter id="mw05OilGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="mw05OilNeedleGlow" x="-15%" y="-15%" width="130%" height="130%"><feGaussianBlur stdDeviation="1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
            '<circle class="mw05-oil-shadow" cx="256" cy="256" r="225"/>' +
            '<circle class="mw05-oil-face" cx="256" cy="256" r="216"/>' +
            '<path class="mw05-oil-redline" ng-attr-d="{{display.redlinePath}}"/>' +
            '<path class="mw05-oil-track" ng-attr-d="{{display.trackPath}}"/>' +
            '<g class="mw05-oil-ticks"><line ng-repeat="tick in ticks" ng-class="{\'mw05-oil-major-tick\': tick.major}" x1="256" y1="52" x2="256" ng-attr-y2="{{tick.major ? 80 : 70}}" ng-attr-transform="rotate({{tick.angle}} 256 256)"/></g>' +
            '<g class="mw05-oil-numbers"><text ng-repeat="label in labels" ng-attr-x="{{label.x}}" ng-attr-y="{{label.y}}">{{label.value}}</text></g>' +
            '<g class="mw05-oil-needle" ng-style="{\'transform\': \'rotate(\' + display.needleAngle + \'deg)\'}"><rect x="0" y="0" width="512" height="512" fill="transparent" pointer-events="none"/><path d="M256 256 L250 256 L256 47 L262 256 Z"/><circle cx="256" cy="256" r="15"/><circle class="mw05-oil-pivot" cx="256" cy="256" r="7"/></g>' +
            '<image class="mw05-oil-icon" href="/ui/ui-vue/src/assets/fonts/bngIcons/svg/oilPressureIndicator.svg" x="232" y="274" width="48" height="48" preserveAspectRatio="xMidYMid meet" aria-label="Oil pressure icon"/>' +
            '<g class="mw05-oil-readout" transform="translate(0 30)"><g class="mw05-oil-panel"><rect x="191" y="315" width="130" height="67" rx="11"/><text class="mw05-oil-ghost" x="256" y="358.5">{{display.ghostText}}</text><text class="mw05-oil-value" ng-attr-x="{{display.valueX}}" y="358.5">{{display.valueText}}</text></g><text class="mw05-oil-unit" x="256" y="409" ng-click="toggleUnit()" title="Cliquer pour changer d’unité">{{display.unit}}</text></g>' +
          '</svg>' +
          '<div class="mw05-oil-debug" ng-if="debug">Oil pressure: {{data.value | number:1}} PSI<br>Max: {{data.max | number:1}} PSI<br>Source: {{data.source}}<br>Mode: {{data.simulated ? \'SIM\' : \'LIVE\'}}<br>Keys: {{data.keys.join(\', \')}}</div>' +
        '</div>',
      replace: true,
      restrict: 'EA',
      link: function (scope) {
        // BeamNG exposes bngApi as a UI global, not as an Angular service and
        // not consistently as a window property in every CEF build.
        var api = typeof bngApi !== 'undefined' ? bngApi :
          (typeof window !== 'undefined' && window.bngApi ? window.bngApi : null);
        var stylesheet = addStylesheet(CSS_URL);
        var streamsList = ['electrics', 'engineInfo', 'engineThermalData'];
        StreamsManager.add(streamsList);
        scope.ticks = makeTicks();
        scope.labels = makeLabels(MIN_SCALE_MAX_PSI, 'PSI');
        scope.debug = DEBUG;
        var latestElectrics = {};
        var latestThermalData = {};
        var latestEngineInfo = [];
        var latestLuaData = {};
        var pressurePollTimer = null;
        var oilPressureLuaQuery = '(function() local e=powertrain.getDevice("mainEngine") local t=e and e.thermals local d=t and t.debugData and t.debugData.engineThermalData return {oilPressure=t and (t.oilPressure or t.oilpressure), oilPressureMax=t and (t.oilPressureMax or t.oilpressureMax), debugOilPressure=d and (d.oilPressure or d.oilpressure), debugOilPressureMax=d and (d.oilPressureMax or d.oilpressureMax)} end)()';
        scope.data = readOilPressure({}, {}, {}, []);
        scope.display = {
          needleAngle: SCALE_ZERO_ANGLE,
          redlinePath: redlineBandPath(redlineStartAngle(MIN_SCALE_MAX_PSI, MIN_SCALE_MAX_PSI, false, 'PSI'), SCALE_END_ANGLE, 215, 187),
          trackPath: arcPath(SCALE_START_ANGLE, SCALE_END_ANGLE, 207),
          valueText: '--.-',
          valueX: digitalValueX('--.-', 'PSI'),
          ghostText: '888',
          maxDisplay: MIN_SCALE_MAX_PSI,
          unit: 'PSI'
        };
        var live = true;
        var lastGamePressureUnit = null;

        function setPressureUnit(unit) {
          unit = unit === 'bar' || unit === 'inHg' ? unit : 'PSI';
          if (scope.display.unit === unit) return;
          scope.display.unit = unit;
          scope.display.maxDisplay = null;
          scope.display.ghostText = ghostTextForUnit(unit);
        }

        scope.toggleUnit = function () {
          setPressureUnit(scope.display.unit === 'PSI' ? 'bar' : 'PSI');
        };

        function updateDisplay() {
          if (!live) return;
          var hasPressure = scope.data.value !== null && scope.data.max !== null;
          var configuredMaxPsi = hasPressure ? scope.data.max : MIN_SCALE_MAX_PSI;
          var scaleMaxPsi = Math.max(MIN_SCALE_MAX_PSI, configuredMaxPsi);
          var minPsi = scaleMinPsi(scope.display.unit);
          var maxDisplay = convertPressure(scaleMaxPsi, scope.display.unit);
          var scaleChanged = scope.display.maxDisplay !== maxDisplay;
          scope.display.maxDisplay = maxDisplay;
          // Keep the data-to-angle mapping direct; the CSS transition below
          // provides the smoothing without delaying or blocking new values.
          scope.display.needleAngle = hasPressure ? scaleAngle(scope.data.value, minPsi, scaleMaxPsi) : SCALE_ZERO_ANGLE;
          scope.display.redlinePath = redlineBandPath(redlineStartAngle(configuredMaxPsi, scaleMaxPsi, hasPressure, scope.display.unit), SCALE_END_ANGLE, 215, 187);
          scope.display.trackPath = arcPath(SCALE_START_ANGLE, SCALE_END_ANGLE, 207);
          scope.display.valueText = hasPressure ? formatPressure(scope.data.value, scope.display.unit) : '--.-';
          scope.display.valueX = digitalValueX(scope.display.valueText, scope.display.unit);
          scope.display.ghostText = ghostTextForUnit(scope.display.unit);
          if (scaleChanged) { scope.ticks = makeTicks(); scope.labels = makeLabels(scaleMaxPsi, scope.display.unit); }
          scope.$evalAsync();
          requestAnimationFrame(updateDisplay);
        }

        function pollOilPressure() {
          if (!live) return;
          if (api && typeof api.activeObjectLua === 'function') {
            api.activeObjectLua(oilPressureLuaQuery, function (data) {
              latestLuaData = data || {};
              scope.data = readOilPressure(latestElectrics, latestThermalData, latestLuaData, latestEngineInfo);
            });
          }
          pressurePollTimer = setTimeout(pollOilPressure, 250);
        }

        scope.$on('streamsUpdate', function (event, streams) {
          latestElectrics = streams && streams.electrics || {};
          latestThermalData = streams && streams.engineThermalData || {};
          latestEngineInfo = streams && streams.engineInfo || [];
          scope.data = readOilPressure(latestElectrics, latestThermalData, latestLuaData, latestEngineInfo);
        });

        scope.$on('SettingsChanged', function (event, data) {
          if (!data || !data.values || typeof data.values.uiUnitPressure !== 'string') return;
          var gameUnit = pressureUnitFromSettings(data.values);
          if (lastGamePressureUnit !== gameUnit) setPressureUnit(gameUnit);
          lastGamePressureUnit = gameUnit;
        });

        scope.$on('$destroy', function () {
          live = false;
          if (pressurePollTimer) clearTimeout(pressurePollTimer);
          StreamsManager.remove(streamsList);
          if (stylesheet && stylesheet.parentNode) stylesheet.parentNode.removeChild(stylesheet);
        });
        pollOilPressure();
        if (api && typeof api.engineLua === 'function') api.engineLua('settings.notifyUI()');
        updateDisplay();
      }
    };
  }]);
})();
