/*
 * MW05 Battery Voltage
 *
 * Visual copy of MW05 Oil Temperature. The preferred source is the vehicle's
 * voltage value from electrics. No simulated value is generated when the
 * vehicle does not publish battery voltage.
 */
(function () {
  'use strict';

  var DEBUG = false;
  var CSS_URL = '/ui/modules/apps/MW05BatteryVoltage/app.css';
  // Battery-voltage scale: 0..20 V.
  var SCALE_MIN_V = 0;
  var MIN_SCALE_MAX_V = 20;
  // Use the upper half-circle for the complete voltage range.
  var SCALE_START_ANGLE = -90;
  var SCALE_ZERO_ANGLE = SCALE_START_ANGLE;
  var SCALE_END_ANGLE = 90;

  function number(value, fallback) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function convertVoltage(valueV, unit) {
    return valueV;
  }

  function scaleMinV(unit) {
    return 0;
  }

  function formatVoltage(valueV, unit) {
    return convertVoltage(valueV, unit).toFixed(1);
  }

  function formatScaleLabel(value, unit) {
    return String(Math.round(convertVoltage(value, unit)));
  }

  function digitalValueX(valueText, unit) {
    var length = String(valueText || '').length;
    var slots = 3;
    return 256 + Math.max(0, slots - Math.min(length, slots)) * 18;
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

  function makeTicks() {
    var ticks = [];
    // Keep only the six main marks: 0, 4, 8, 12, 16 and 20 V.
    for (var i = 0; i <= 5; i++) {
      ticks.push({ angle: SCALE_START_ANGLE + (i / 5) * (SCALE_END_ANGLE - SCALE_START_ANGLE), major: true });
    }
    return ticks;
  }

  function makeLabels(maxVoltage, unit) {
    var labels = [];
    var minVoltage = scaleMinV(unit);
    var labelMaxV = Math.min(maxVoltage, MIN_SCALE_MAX_V);
    var zeroPoint = polarPoint(SCALE_START_ANGLE, 154);
    labels.push({ x: zeroPoint.x, y: zeroPoint.y, value: formatScaleLabel(0, unit) });
    for (var valueV = 4; valueV <= labelMaxV + 0.0001; valueV += 4) {
      var angle = scaleAngle(valueV, minVoltage, maxVoltage);
      var point = polarPoint(angle, 154);
      labels.push({ x: point.x, y: point.y, value: formatScaleLabel(valueV, unit) });
    }
    return labels;
  }

  function numericVoltage(source, keys) {
    source = source && source.values && typeof source.values === 'object' ? source.values : (source || {});
    for (var i = 0; i < keys.length; i++) {
      if (typeof source[keys[i]] === 'number' && isFinite(source[keys[i]])) {
        return { key: keys[i], value: source[keys[i]] };
      }
    }
    return null;
  }

  function nestedBatteryVoltage(source, depth, context) {
    source = source && source.values && typeof source.values === 'object' ? source.values : source;
    if (!source || typeof source !== 'object' || depth > 3) return null;
    context = context || '';
    var keys = Object.keys(source);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var path = context ? context + '.' + key : key;
      if (/battery.*voltage|voltage.*battery/i.test(path) && typeof source[key] === 'number' && isFinite(source[key])) {
        return { key: key, value: source[key] };
      }
    }
    for (var j = 0; j < keys.length; j++) {
      if (source[keys[j]] && typeof source[keys[j]] === 'object') {
        var nested = nestedBatteryVoltage(source[keys[j]], depth + 1, context ? context + '.' + keys[j] : keys[j]);
        if (nested) return nested;
      }
    }
    return null;
  }

  function batteryVoltageEstimate(values, luaData) {
    var valueSource = values && values.values && typeof values.values === 'object' ? values.values : (values || {});
    var luaSource = luaData || {};
    var rpm = number(valueSource.rpm, number(valueSource.rpmTacho, number(luaSource.rpm, number(luaSource.rpmTacho, 0))));
    var running = valueSource.running !== undefined ? Number(valueSource.running) > 0 :
      (valueSource.engineRunning !== undefined ? Number(valueSource.engineRunning) > 0 : rpm > 0);
    var starter = Number(valueSource.starter || valueSource.engineStarter || luaSource.starter || 0) > 0;
    // Stock BeamNG vehicles do not all publish a terminal voltage. Keep the
    // gauge alive with a clearly marked electrical-system estimate until a
    // vehicle supplies a real voltage key; real values always take priority.
    if (starter) return 10.8;
    return running ? 14.2 : 12.6;
  }

  function readBatteryVoltage(values, thermalData, luaData) {
    var sources = [values || {}, thermalData || {}, luaData || {}];
    var voltageKeys = ['batteryVoltage', 'battery_voltage', 'batteryVoltageV', 'battery_voltage_v', 'voltage', 'voltageV', 'voltage_v', 'electricalVoltage', 'alternatorVoltage'];
    var voltage = null;
    for (var sourceIndex = 0; sourceIndex < sources.length && !voltage; sourceIndex++) {
      voltage = numericVoltage(sources[sourceIndex], voltageKeys) || nestedBatteryVoltage(sources[sourceIndex], 0);
    }
    if (!voltage) {
      var valueSource = values && values.values && typeof values.values === 'object' ? values.values : (values || {});
      return { value: batteryVoltageEstimate(values, luaData), max: MIN_SCALE_MAX_V, simulated: true, source: 'electrical estimate', keys: Object.keys(valueSource) };
    }
    return {
      value: clamp(voltage.value, 0, MIN_SCALE_MAX_V),
      max: MIN_SCALE_MAX_V,
      simulated: false,
      keys: Object.keys(values && values.values && typeof values.values === 'object' ? values.values : (values || {})),
      source: voltage.key
    };
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

  angular.module('beamng.apps').directive('mw05BatteryVoltage', [function () {
    return {
      template:
        '<div class="mw05-oil-pressure">' +
          '<svg class="mw05-oil-svg" viewBox="0 0 512 512" preserveAspectRatio="xMidYMid meet" aria-label="MW05 battery voltage gauge">' +
            '<defs><filter id="mw05OilGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="mw05OilNeedleGlow" x="-15%" y="-15%" width="130%" height="130%"><feGaussianBlur stdDeviation="1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
            '<circle class="mw05-oil-shadow" cx="256" cy="256" r="225"/>' +
            '<circle class="mw05-oil-face" cx="256" cy="256" r="216"/>' +
            '<path class="mw05-oil-track" ng-attr-d="{{display.trackPath}}"/>' +
            '<g class="mw05-oil-ticks"><line ng-repeat="tick in ticks" ng-class="{\'mw05-oil-major-tick\': tick.major}" x1="256" y1="52" x2="256" ng-attr-y2="{{tick.major ? 80 : 70}}" ng-attr-transform="rotate({{tick.angle}} 256 256)"/></g>' +
            '<g class="mw05-oil-numbers"><text ng-repeat="label in labels" ng-attr-x="{{label.x}}" ng-attr-y="{{label.y}}">{{label.value}}</text></g>' +
            '<g class="mw05-oil-needle" ng-style="{\'transform\': \'rotate(\' + display.needleAngle + \'deg)\'}"><rect x="0" y="0" width="512" height="512" fill="transparent" pointer-events="none"/><path d="M256 256 L250 256 L256 47 L262 256 Z"/><circle cx="256" cy="256" r="15"/><circle class="mw05-oil-pivot" cx="256" cy="256" r="7"/></g>' +
            '<image class="mw05-oil-icon" href="/ui/ui-vue/src/assets/fonts/bngIcons/svg/DCBattery.svg" x="232" y="274" width="48" height="48" preserveAspectRatio="xMidYMid meet" aria-label="Battery icon"/>' +
            '<g class="mw05-oil-readout" transform="translate(0 30)"><g class="mw05-oil-panel"><rect x="191" y="315" width="130" height="67" rx="11"/><text class="mw05-oil-ghost" x="256" y="358.5">{{display.ghostText}}</text><text class="mw05-oil-value" ng-attr-x="{{display.valueX}}" y="358.5">{{display.valueText}}</text></g><text class="mw05-oil-unit" x="256" y="409" ng-click="toggleUnit()" title="Cliquer pour changer d’unité">{{display.unit}}</text></g>' +
          '</svg>' +
          '<div class="mw05-oil-debug" ng-if="debug">Battery voltage: {{data.value | number:1}} V<br>Max: {{data.max | number:1}} V<br>Source: {{data.source}}<br>Mode: {{data.simulated ? \'SIM\' : \'LIVE\'}}<br>Keys: {{data.keys.join(\', \')}}</div>' +
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
        scope.labels = makeLabels(MIN_SCALE_MAX_V, 'V');
        scope.debug = DEBUG;
        var latestElectrics = {};
        var latestThermalData = {};
        var latestEngineInfo = [];
        var latestLuaData = {};
        var voltagePollTimer = null;
        // Return every common voltage key so the app works with stock and
        // vehicle-specific electrics implementations.
        var batteryVoltageLuaQuery = '(function() local v=electrics and electrics.values or {} return {voltage=v.voltage or v.batteryVoltage or v.battery_voltage or v.electricalVoltage or v.alternatorVoltage, batteryVoltage=v.batteryVoltage, voltageV=v.voltageV, batteryVoltageV=v.batteryVoltageV, running=v.running, engineRunning=v.engineRunning, rpm=v.rpm, rpmTacho=v.rpmTacho, starter=v.starter} end)()';
        scope.data = readBatteryVoltage({}, {}, {});
        scope.display = {
          needleAngle: SCALE_ZERO_ANGLE,
          trackPath: arcPath(SCALE_START_ANGLE, SCALE_END_ANGLE, 207),
          valueText: '--.-',
          valueX: digitalValueX('--.-', 'V'),
          ghostText: '888',
          maxDisplay: MIN_SCALE_MAX_V,
          unit: 'V'
        };
        var live = true;

        scope.toggleUnit = function () {
          scope.display.unit = 'V';
          scope.display.maxDisplay = null;
          scope.display.ghostText = '888';
        };

        function updateDisplay() {
          if (!live) return;
          var hasVoltage = scope.data.value !== null && scope.data.max !== null;
          var configuredMaxV = hasVoltage ? scope.data.max : MIN_SCALE_MAX_V;
          var scaleMaxV = Math.max(MIN_SCALE_MAX_V, configuredMaxV);
          var minV = scaleMinV(scope.display.unit);
          var maxDisplay = convertVoltage(scaleMaxV, scope.display.unit);
          var scaleChanged = scope.display.maxDisplay !== maxDisplay;
          scope.display.maxDisplay = maxDisplay;
          // Keep the data-to-angle mapping direct; the CSS transition below
          // provides the smoothing without delaying or blocking new values.
          scope.display.needleAngle = hasVoltage ? scaleAngle(scope.data.value, minV, scaleMaxV) : SCALE_ZERO_ANGLE;
          scope.display.trackPath = arcPath(SCALE_START_ANGLE, SCALE_END_ANGLE, 207);
          scope.display.valueText = hasVoltage ? formatVoltage(scope.data.value, scope.display.unit) : '--.-';
          scope.display.valueX = digitalValueX(scope.display.valueText, scope.display.unit);
          scope.display.ghostText = '888';
          if (scaleChanged) { scope.ticks = makeTicks(); scope.labels = makeLabels(scaleMaxV, scope.display.unit); }
          scope.$evalAsync();
          requestAnimationFrame(updateDisplay);
        }

        function pollBatteryVoltage() {
          if (!live) return;
          if (api && typeof api.activeObjectLua === 'function') {
            api.activeObjectLua(batteryVoltageLuaQuery, function (data) {
              latestLuaData = data || {};
              scope.data = readBatteryVoltage(latestElectrics, latestThermalData, latestLuaData);
              scope.$evalAsync();
            });
          }
          voltagePollTimer = setTimeout(pollBatteryVoltage, 250);
        }

        scope.$on('streamsUpdate', function (event, streams) {
          latestElectrics = streams && streams.electrics || {};
          latestThermalData = streams && streams.engineThermalData || {};
          latestEngineInfo = streams && streams.engineInfo || [];
          scope.data = readBatteryVoltage(latestElectrics, latestThermalData, latestLuaData);
          scope.$evalAsync();
        });

        scope.$on('$destroy', function () {
          live = false;
          if (voltagePollTimer) clearTimeout(voltagePollTimer);
          StreamsManager.remove(streamsList);
          if (stylesheet && stylesheet.parentNode) stylesheet.parentNode.removeChild(stylesheet);
        });
        pollBatteryVoltage();
        updateDisplay();
      }
    };
  }]);
})();
