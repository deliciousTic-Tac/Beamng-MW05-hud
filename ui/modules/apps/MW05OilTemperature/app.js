/*
 * MW05 Oil Temperature
 *
 * Visual copy of MW05 Oil Pressure. The preferred source is the vehicle's
 * oilTemperature value from engineThermalData/electrics. No simulated value
 * is generated when the vehicle does not publish oil temperature.
 */
(function () {
  'use strict';

  var DEBUG = false;
  var CSS_URL = '/ui/modules/apps/MW05OilTemperature/app.css';
  // Oil-temperature scale: 0..150 °C.
  var SCALE_MIN_C = 0;
  var MIN_SCALE_MAX_C = 150;
  var SCALE_START_ANGLE = -130;
  var SCALE_ZERO_ANGLE = SCALE_START_ANGLE;
  var SCALE_END_ANGLE = 130;
  var MIN_REDZONE_C = 120;

  function number(value, fallback) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function temperatureUnitFromSettings(values) {
    return values && values.uiUnitTemperature === 'f' ? '°F' : '°C';
  }

  function convertTemperature(valueC, unit) {
    return unit === '°F' ? valueC * 9 / 5 + 32 : valueC;
  }

  function scaleMinC(unit) {
    return 0;
  }

  function formatTemperature(valueC, unit) {
    return String(Math.round(convertTemperature(valueC, unit)));
  }

  function formatScaleLabel(value, unit) {
    return String(Math.round(convertTemperature(value, unit)));
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

  function redlineStartAngle(maxC, scaleMaxC, hasTemperature, unit) {
    var startC = hasTemperature ? Math.min(maxC, MIN_REDZONE_C) : MIN_REDZONE_C;
    return scaleAngle(startC, scaleMinC(unit), scaleMaxC);
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

  function makeLabels(maxTemperature, unit) {
    var labels = [];
    var minTemperature = scaleMinC(unit);
    var labelMaxC = Math.min(maxTemperature, MIN_SCALE_MAX_C);
    var zeroPoint = polarPoint(SCALE_START_ANGLE, 154);
    labels.push({ x: zeroPoint.x, y: zeroPoint.y, value: formatScaleLabel(0, unit) });
    for (var valueC = 30; valueC <= labelMaxC + 0.0001; valueC += 30) {
      var angle = scaleAngle(valueC, minTemperature, maxTemperature);
      var point = polarPoint(angle, 154);
      labels.push({ x: point.x, y: point.y, value: formatScaleLabel(valueC, unit) });
    }
    return labels;
  }

  function numericTemperature(source, keys) {
    source = source || {};
    for (var i = 0; i < keys.length; i++) {
      if (typeof source[keys[i]] === 'number' && isFinite(source[keys[i]])) {
        return { key: keys[i], value: source[keys[i]], unit: /fahrenheit|temp_f|_f$/i.test(keys[i]) ? 'F' : 'C' };
      }
    }
    return null;
  }

  function nestedOilTemperature(source, depth, context) {
    if (!source || typeof source !== 'object' || depth > 3) return null;
    context = context || '';
    var keys = Object.keys(source);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var path = context ? context + '.' + key : key;
      if (/oil.*temp|temp.*oil/i.test(path) && typeof source[key] === 'number' && isFinite(source[key])) {
        return { key: key, value: source[key], unit: /fahrenheit|temp_f|_f$/i.test(key) ? 'F' : 'C' };
      }
    }
    for (var j = 0; j < keys.length; j++) {
      if (source[keys[j]] && typeof source[keys[j]] === 'object') {
        var nested = nestedOilTemperature(source[keys[j]], depth + 1, context ? context + '.' + keys[j] : keys[j]);
        if (nested) return nested;
      }
    }
    return null;
  }

  function toCelsius(value, unit) {
    return unit === 'F' ? (value - 32) * 5 / 9 : value;
  }

  function readOilTemperature(values, thermalData, luaData) {
    var sources = [values || {}, thermalData || {}, luaData || {}];
    var temperatureKeys = ['oilTemperature', 'oiltemperature', 'oilTemp', 'oiltemp', 'engineOilTemperature', 'engine_oil_temperature', 'oilTemperatureC', 'oil_temp_c', 'oilTemperatureF', 'oil_temp_f'];
    var temperature = null;
    for (var sourceIndex = 0; sourceIndex < sources.length && !temperature; sourceIndex++) {
      temperature = numericTemperature(sources[sourceIndex], temperatureKeys) || nestedOilTemperature(sources[sourceIndex], 0);
    }
    if (!temperature) {
      return { value: null, max: null, simulated: false, source: 'unavailable', keys: Object.keys(values || {}) };
    }
    return {
      value: clamp(toCelsius(temperature.value, temperature.unit), 0, MIN_SCALE_MAX_C),
      max: MIN_SCALE_MAX_C,
      simulated: false,
      keys: Object.keys(values || {}),
      source: temperature.key
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

  angular.module('beamng.apps').directive('mw05OilTemperature', [function () {
    return {
      template:
        '<div class="mw05-oil-pressure">' +
          '<svg class="mw05-oil-svg" viewBox="0 0 512 512" preserveAspectRatio="xMidYMid meet" aria-label="MW05 engine oil temperature gauge">' +
            '<defs><filter id="mw05OilGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="mw05OilNeedleGlow" x="-15%" y="-15%" width="130%" height="130%"><feGaussianBlur stdDeviation="1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
            '<circle class="mw05-oil-shadow" cx="256" cy="256" r="225"/>' +
            '<circle class="mw05-oil-face" cx="256" cy="256" r="216"/>' +
            '<path class="mw05-oil-redline" ng-attr-d="{{display.redlinePath}}"/>' +
            '<path class="mw05-oil-track" ng-attr-d="{{display.trackPath}}"/>' +
            '<g class="mw05-oil-ticks"><line ng-repeat="tick in ticks" ng-class="{\'mw05-oil-major-tick\': tick.major}" x1="256" y1="52" x2="256" ng-attr-y2="{{tick.major ? 80 : 70}}" ng-attr-transform="rotate({{tick.angle}} 256 256)"/></g>' +
            '<g class="mw05-oil-numbers"><text ng-repeat="label in labels" ng-attr-x="{{label.x}}" ng-attr-y="{{label.y}}">{{label.value}}</text></g>' +
            '<g class="mw05-oil-needle" ng-style="{\'transform\': \'rotate(\' + display.needleAngle + \'deg)\'}"><rect x="0" y="0" width="512" height="512" fill="transparent" pointer-events="none"/><path d="M256 256 L250 256 L256 47 L262 256 Z"/><circle cx="256" cy="256" r="15"/><circle class="mw05-oil-pivot" cx="256" cy="256" r="7"/></g>' +
            '<image class="mw05-oil-icon" href="/ui/ui-vue/src/assets/fonts/bngIcons/svg/oilPressureIndicator.svg" x="232" y="274" width="48" height="48" preserveAspectRatio="xMidYMid meet" aria-label="Oil temperature icon"/>' +
            '<g class="mw05-oil-readout" transform="translate(0 30)"><g class="mw05-oil-panel"><rect x="191" y="315" width="130" height="67" rx="11"/><text class="mw05-oil-ghost" x="256" y="358.5">{{display.ghostText}}</text><text class="mw05-oil-value" ng-attr-x="{{display.valueX}}" y="358.5">{{display.valueText}}</text></g><text class="mw05-oil-unit" x="256" y="409" ng-click="toggleUnit()" title="Cliquer pour changer d’unité">{{display.unit}}</text></g>' +
          '</svg>' +
          '<div class="mw05-oil-debug" ng-if="debug">Oil temperature: {{data.value | number:1}} °C<br>Max: {{data.max | number:1}} °C<br>Source: {{data.source}}<br>Mode: {{data.simulated ? \'SIM\' : \'LIVE\'}}<br>Keys: {{data.keys.join(\', \')}}</div>' +
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
        scope.labels = makeLabels(MIN_SCALE_MAX_C, '°C');
        scope.debug = DEBUG;
        var latestElectrics = {};
        var latestThermalData = {};
        var latestEngineInfo = [];
        var latestLuaData = {};
        var temperaturePollTimer = null;
        var oilTemperatureLuaQuery = '(function() local e=powertrain.getDevice("mainEngine") local t=e and e.thermals local d=t and t.debugData and t.debugData.engineThermalData return {oilTemperature=t and (t.oilTemperature or t.oiltemp), debugOilTemperature=d and (d.oilTemperature or d.oiltemp)} end)()';
        scope.data = readOilTemperature({}, {}, {});
        scope.display = {
          needleAngle: SCALE_ZERO_ANGLE,
          redlinePath: redlineBandPath(redlineStartAngle(MIN_SCALE_MAX_C, MIN_SCALE_MAX_C, false, '°C'), SCALE_END_ANGLE, 215, 187),
          trackPath: arcPath(SCALE_START_ANGLE, SCALE_END_ANGLE, 207),
          valueText: '--.-',
          valueX: digitalValueX('--', '°C'),
          ghostText: '888',
          maxDisplay: MIN_SCALE_MAX_C,
          unit: '°C'
        };
        var live = true;
        var lastGameTemperatureUnit = null;

        function setTemperatureUnit(unit) {
          unit = unit === '°F' ? '°F' : '°C';
          if (scope.display.unit === unit) return;
          scope.display.unit = unit;
          scope.display.maxDisplay = null;
          scope.display.ghostText = '888';
        }

        scope.toggleUnit = function () {
          setTemperatureUnit(scope.display.unit === '°C' ? '°F' : '°C');
        };

        function updateDisplay() {
          if (!live) return;
          var hasTemperature = scope.data.value !== null && scope.data.max !== null;
          var configuredMaxC = hasTemperature ? scope.data.max : MIN_SCALE_MAX_C;
          var scaleMaxC = Math.max(MIN_SCALE_MAX_C, configuredMaxC);
          var minC = scaleMinC(scope.display.unit);
          var maxDisplay = convertTemperature(scaleMaxC, scope.display.unit);
          var scaleChanged = scope.display.maxDisplay !== maxDisplay;
          scope.display.maxDisplay = maxDisplay;
          // Keep the data-to-angle mapping direct; the CSS transition below
          // provides the smoothing without delaying or blocking new values.
          scope.display.needleAngle = hasTemperature ? scaleAngle(scope.data.value, minC, scaleMaxC) : SCALE_ZERO_ANGLE;
          scope.display.redlinePath = redlineBandPath(redlineStartAngle(configuredMaxC, scaleMaxC, hasTemperature, scope.display.unit), SCALE_END_ANGLE, 215, 187);
          scope.display.trackPath = arcPath(SCALE_START_ANGLE, SCALE_END_ANGLE, 207);
          scope.display.valueText = hasTemperature ? formatTemperature(scope.data.value, scope.display.unit) : '--';
          scope.display.valueX = digitalValueX(scope.display.valueText, scope.display.unit);
          scope.display.ghostText = '888';
          if (scaleChanged) { scope.ticks = makeTicks(); scope.labels = makeLabels(scaleMaxC, scope.display.unit); }
          scope.$evalAsync();
          requestAnimationFrame(updateDisplay);
        }

        function pollOilTemperature() {
          if (!live) return;
          if (api && typeof api.activeObjectLua === 'function') {
            api.activeObjectLua(oilTemperatureLuaQuery, function (data) {
              latestLuaData = data || {};
              scope.data = readOilTemperature(latestElectrics, latestThermalData, latestLuaData);
            });
          }
          temperaturePollTimer = setTimeout(pollOilTemperature, 250);
        }

        scope.$on('streamsUpdate', function (event, streams) {
          latestElectrics = streams && streams.electrics || {};
          latestThermalData = streams && streams.engineThermalData || {};
          latestEngineInfo = streams && streams.engineInfo || [];
          scope.data = readOilTemperature(latestElectrics, latestThermalData, latestLuaData);
        });

        scope.$on('SettingsChanged', function (event, data) {
          if (!data || !data.values || typeof data.values.uiUnitTemperature !== 'string') return;
          var gameUnit = temperatureUnitFromSettings(data.values);
          if (lastGameTemperatureUnit !== gameUnit) setTemperatureUnit(gameUnit);
          lastGameTemperatureUnit = gameUnit;
        });

        scope.$on('$destroy', function () {
          live = false;
          if (temperaturePollTimer) clearTimeout(temperaturePollTimer);
          StreamsManager.remove(streamsList);
          if (stylesheet && stylesheet.parentNode) stylesheet.parentNode.removeChild(stylesheet);
        });
        pollOilTemperature();
        if (api && typeof api.engineLua === 'function') api.engineLua('settings.notifyUI()');
        updateDisplay();
      }
    };
  }]);
})();
