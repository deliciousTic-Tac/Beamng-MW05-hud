/*
 * MW05 Forced Induction
 *
 * Uses BeamNG's electrics.boost and electrics.boostMax values. Both are
 * expressed in PSI by BeamNG; the app never invents a boost value when the
 * vehicle does not publish forced-induction data.
 */
(function () {
  'use strict';

  var DEBUG = false;
  var CSS_URL = '/ui/modules/apps/MW05ForcedInduction/app.css?v=0.1.1';
  var BAR_PER_PSI = 0.0689475729;
  var INHG_PER_PSI = 2.0360206576;
  var MIN_SCALE_BAR = 3;
  var SCALE_MIN_PSI = -15;
  var MIN_SCALE_MAX_PSI = MIN_SCALE_BAR / BAR_PER_PSI;
  var SCALE_START_ANGLE = -130;
  var SCALE_ZERO_ANGLE = -90;
  var SCALE_END_ANGLE = 130;
  var BASE_REDZONE_PSI = 6;
  var REDZONE_EXTENSION_BAR = 0.3;
  var MIN_REDZONE_PSI = BASE_REDZONE_PSI + REDZONE_EXTENSION_BAR / BAR_PER_PSI;

  function number(value, fallback) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return fallback;
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
    if (unit === 'bar') return -1 / BAR_PER_PSI;
    if (unit === 'inHg') return -15 / INHG_PER_PSI;
    return SCALE_MIN_PSI;
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

  function redlineStartAngle(maxPsi, scalePsi, hasBoost, unit) {
    var startPsi = hasBoost ? Math.min(maxPsi, scalePsi - MIN_REDZONE_PSI) : scalePsi - MIN_REDZONE_PSI;
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

  function makeTicks(maxBoost, unit) {
    var ticks = [];
    var minBoost = scaleMinPsi(unit || 'PSI');
    var tickStepPsi = unit === 'bar' ? 0.1 / BAR_PER_PSI : (unit === 'inHg' ? 2 / INHG_PER_PSI : 2);
    // Align the minor-tick grid on zero so the 0/10/20/30/40 PSI majors
    // remain exact even when the negative range starts at -15 PSI.
    var firstGridPsi = Math.ceil((minBoost - 0.0001) / tickStepPsi) * tickStepPsi;
    for (var valuePsi = firstGridPsi; valuePsi <= maxBoost + 0.0001; valuePsi += tickStepPsi) {
      var displayValue = convertPressure(valuePsi, unit);
      var isMajor = unit === 'bar'
        ? displayValue >= -0.0001 && Math.abs(displayValue - Math.round(displayValue)) < 0.0001
        : (unit === 'inHg'
          ? displayValue >= -0.0001 && Math.abs(displayValue / 10 - Math.round(displayValue / 10)) < 0.0001
          : valuePsi >= -0.0001 && Math.abs(valuePsi / 10 - Math.round(valuePsi / 10)) < 0.0001);
      ticks.push({
        angle: scaleAngle(valuePsi, minBoost, maxBoost),
        major: isMajor
      });
    }
    return ticks;
  }

  function makeLabels(maxBoost, unit) {
    unit = unit || 'PSI';
    var labels = [];
    var minBoost = scaleMinPsi(unit);
    var minDisplay = convertPressure(minBoost, unit);
    var maxDisplay = convertPressure(maxBoost, unit);
    var stepDisplay = unit === 'bar' ? 0.5 : (unit === 'inHg' ? 10 : 5);
    var negativePoint = polarPoint(SCALE_START_ANGLE, 154);
    labels.push({ x: negativePoint.x, y: negativePoint.y, value: formatScaleLabel(minDisplay, unit) });
    var zeroPoint = polarPoint(SCALE_ZERO_ANGLE, 154);
    labels.push({ x: zeroPoint.x, y: zeroPoint.y, value: formatScaleLabel(0, unit) });
    for (var displayValue = stepDisplay; displayValue <= maxDisplay + 0.0001; displayValue += stepDisplay) {
      var valuePsi = unit === 'bar' ? displayValue / BAR_PER_PSI : displayValue;
      var angle = scaleAngle(valuePsi, minBoost, maxBoost);
      var point = polarPoint(angle, 154);
      labels.push({ x: point.x, y: point.y, value: formatScaleLabel(displayValue, unit) });
    }
    return labels;
  }

  function readBoost(values) {
    values = values || {};
    var boost = number(values.boost, null);
    var boostMax = number(values.boostMax, null);
    // BeamNG also publishes boost=0 on naturally aspirated vehicles. The
    // configured maximum identifies forced induction even at idle/engine off.
    var available = boostMax !== null && boostMax > 0;
    if (boost === null) return { available: available, value: null, max: null, keys: Object.keys(values) };
    if (boostMax === null || boostMax <= 0) {
      boostMax = Math.max(15, Math.ceil(Math.max(boost, 1) / 5) * 5);
    }
    boostMax = Math.max(boostMax, boost, 1);
    return { available: available, value: boost, max: boostMax, keys: Object.keys(values) };
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

  angular.module('beamng.apps').directive('mw05ForcedInduction', [function () {
    return {
      template:
        '<div class="mw05-forced-induction" ng-show="display.available">' +
          '<svg class="mw05-boost-svg" viewBox="0 0 512 512" preserveAspectRatio="xMidYMid meet" aria-label="MW05 forced induction gauge">' +
            '<defs>' +
              '<filter id="mw05BoostGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
              '<filter id="mw05BoostNeedleGlow" x="-15%" y="-15%" width="130%" height="130%"><feGaussianBlur stdDeviation="1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
            '</defs>' +
            '<circle class="mw05-boost-shadow" cx="256" cy="256" r="225"/>' +
            '<circle class="mw05-boost-face" cx="256" cy="256" r="216"/>' +
            '<path class="mw05-boost-redline" ng-attr-d="{{display.redlinePath}}"/>' +
            '<path class="mw05-boost-track" ng-attr-d="{{display.trackPath}}"/>' +
            '<g class="mw05-boost-ticks"><line ng-repeat="tick in ticks" ng-class="{\'mw05-boost-major-tick\': tick.major}" x1="256" y1="52" x2="256" ng-attr-y2="{{tick.major ? 80 : 70}}" ng-attr-transform="rotate({{tick.angle}} 256 256)"/></g>' +
            '<g class="mw05-boost-numbers"><text ng-repeat="label in labels" ng-attr-x="{{label.x}}" ng-attr-y="{{label.y}}">{{label.value}}</text></g>' +
            '<g class="mw05-boost-needle" ng-style="{\'transform\': \'rotate(\' + display.needleAngle + \'deg)\'}">' +
              '<rect x="0" y="0" width="512" height="512" fill="transparent" pointer-events="none"/>' +
              '<path d="M256 256 L250 256 L256 47 L262 256 Z"/>' +
              '<circle cx="256" cy="256" r="15"/>' +
              '<circle class="mw05-boost-pivot" cx="256" cy="256" r="7"/>' +
            '</g>' +
            '<path class="mw05-boost-turbo-icon" style="fill:none;stroke:#ffffff;stroke-width:2.8;stroke-linecap:round;stroke-linejoin:round;opacity:.95" transform="translate(256 300) scale(.78) translate(-209 -99)" d="m 232.94037,85.112059 0.004,-7.028769 c 0,0 -21.48949,-0.03267 -24.44226,-0.03267 -11.42263,0 -20.68251,9.259847 -20.68251,20.68249 0,11.42263 9.25988,20.68249 20.68251,20.68249 11.42261,0 20.68248,-9.25986 20.68248,-20.68249 0,-4.500927 -1.43773,-8.666059 -3.87896,-12.061196 l -10.87189,-0.09105 c 4.49334,2.197346 7.58795,6.813419 7.58795,12.152276 0,7.46666 -6.05293,13.5196 -13.51958,13.5196 -7.46668,0 -13.51959,-6.05294 -13.51959,-13.5196 0,-7.466678 6.05291,-13.519602 13.51959,-13.519602 z m -29.45365,16.056181 a 1.3809996,1.3809996 0 0 1 -1.38099,1.38103 1.3809996,1.3809996 0 0 1 -1.381,-1.38103 1.3809996,1.3809996 0 0 1 1.381,-1.38096 1.3809996,1.3809996 0 0 1 1.38099,1.38096 z m 3.60865,3.87272 a 1.3809996,1.3809996 0 0 1 -1.381,1.38099 1.3809996,1.3809996 0 0 1 -1.381,-1.38099 1.3809996,1.3809996 0 0 1 1.381,-1.381 1.3809996,1.3809996 0 0 1 1.381,1.381 z m 5.19293,0.14671 a 1.3809996,1.3809996 0 0 1 -1.38099,1.38099 1.3809996,1.3809996 0 0 1 -1.38099,-1.38099 1.3809996,1.3809996 0 0 1 1.38099,-1.38102 1.3809996,1.3809996 0 0 1 1.38099,1.38102 z m 3.84338,-3.49131 a 1.3809996,1.3809996 0 0 1 -1.381,1.381 1.3809996,1.3809996 0 0 1 -1.381,-1.381 1.3809996,1.3809996 0 0 1 1.381,-1.38101 1.3809996,1.3809996 0 0 1 1.381,1.38101 z m 0.20538,-5.251613 a 1.3809996,1.3809996 0 0 1 -1.38101,1.380983 1.3809996,1.3809996 0 0 1 -1.381,-1.380983 1.3809996,1.3809996 0 0 1 1.381,-1.381004 1.3809996,1.3809996 0 0 1 1.38101,1.381004 z m -3.52064,-3.902053 a 1.3809996,1.3809996 0 0 1 -1.38101,1.380995 1.3809996,1.3809996 0 0 1 -1.38099,-1.380995 1.3809996,1.3809996 0 0 1 1.38099,-1.380992 1.3809996,1.3809996 0 0 1 1.38101,1.380992 z m -5.28096,-0.17604 a 1.3809996,1.3809996 0 0 1 -1.38103,1.381009 1.3809996,1.3809996 0 0 1 -1.38099,-1.381009 1.3809996,1.3809996 0 0 1 1.38099,-1.380994 1.3809996,1.3809996 0 0 1 1.38103,1.380994 z m -3.7847,3.54999 a 1.3809996,1.3809996 0 0 1 -1.38101,1.380994 1.3809996,1.3809996 0 0 1 -1.38099,-1.380994 1.3809996,1.3809996 0 0 1 1.38099,-1.381003 1.3809996,1.3809996 0 0 1 1.38101,1.381003 z m 6.92401,2.816516 a 2.1732348,2.1732348 0 0 1 -2.17323,2.17323 2.1732348,2.1732348 0 0 1 -2.17323,-2.17323 2.1732348,2.1732348 0 0 1 2.17323,-2.173245 2.1732348,2.1732348 0 0 1 2.17323,2.173245 z m 9.4596,0 a 11.632817,11.632816 0 0 1 -11.63283,11.63281 11.632817,11.632816 0 0 1 -11.63281,-11.63281 11.632817,11.632816 0 0 1 11.63281,-11.63282 11.632817,11.632816 0 0 1 11.63283,11.63282 z" aria-label="Turbo pressure icon"/>' +
            '<g class="mw05-boost-readout" transform="translate(0 30)">' +
            '<g class="mw05-boost-panel">' +
              '<rect x="191" y="315" width="130" height="67" rx="11"/>' +
              '<text class="mw05-boost-ghost" x="256" y="358.5">{{display.ghostText}}</text>' +
              '<text class="mw05-boost-value" ng-attr-x="{{display.valueX}}" y="358.5">{{display.valueText}}</text>' +
            '</g>' +
            '<text class="mw05-boost-unit" x="256" y="409" ng-click="toggleUnit()" title="Cliquer pour changer d’unité">{{display.unit}}</text>' +
            '</g>' +
          '</svg>' +
          '<div class="mw05-boost-debug" ng-if="debug">Boost: {{data.value | number:1}} PSI<br>Max: {{data.max | number:1}} PSI<br>Keys: {{data.keys.join(\', \')}}</div>' +
        '</div>',
      replace: true,
      restrict: 'EA',
      link: function (scope) {
        var stylesheet = addStylesheet(CSS_URL);
        var streamsList = ['electrics'];
        StreamsManager.add(streamsList);
        scope.ticks = makeTicks(MIN_SCALE_MAX_PSI, 'PSI');
        scope.labels = makeLabels(MIN_SCALE_MAX_PSI, 'PSI');
        scope.debug = DEBUG;
        scope.data = readBoost({});
        scope.display = {
          available: false,
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
          scope.display.available = scope.data.available;
          var hasBoost = scope.data.value !== null && scope.data.max !== null;
          var configuredMaxPsi = hasBoost ? scope.data.max : MIN_SCALE_MAX_PSI;
          var scaleMaxPsi = Math.max(MIN_SCALE_MAX_PSI, configuredMaxPsi);
          var minPsi = scaleMinPsi(scope.display.unit);
          var maxDisplay = convertPressure(scaleMaxPsi, scope.display.unit);
          var scaleChanged = scope.display.maxDisplay !== maxDisplay;
          scope.display.maxDisplay = maxDisplay;
          scope.display.needleAngle = hasBoost ? scaleAngle(scope.data.value, minPsi, scaleMaxPsi) : SCALE_ZERO_ANGLE;
          scope.display.redlinePath = redlineBandPath(redlineStartAngle(configuredMaxPsi, scaleMaxPsi, hasBoost, scope.display.unit), SCALE_END_ANGLE, 215, 187);
          scope.display.trackPath = arcPath(SCALE_START_ANGLE, SCALE_END_ANGLE, 207);
          scope.display.valueText = hasBoost ? formatPressure(scope.data.value, scope.display.unit) : '--.-';
          scope.display.valueX = digitalValueX(scope.display.valueText, scope.display.unit);
          scope.display.ghostText = ghostTextForUnit(scope.display.unit);
          if (scaleChanged) {
            scope.ticks = makeTicks(scaleMaxPsi, scope.display.unit);
            scope.labels = makeLabels(scaleMaxPsi, scope.display.unit);
          }
          scope.$evalAsync();
          requestAnimationFrame(updateDisplay);
        }

        scope.$on('streamsUpdate', function (event, streams) {
          scope.data = readBoost(streams && streams.electrics);
        });

        function resetVehicle() {
          scope.data = readBoost({});
          scope.display.available = false;
          scope.$evalAsync();
        }
        scope.$on('VehicleChange', resetVehicle);
        scope.$on('VehicleFocusChanged', resetVehicle);

        scope.$on('SettingsChanged', function (event, data) {
          if (!data || !data.values || typeof data.values.uiUnitPressure !== 'string') return;
          var gameUnit = pressureUnitFromSettings(data.values);
          if (lastGamePressureUnit !== gameUnit) setPressureUnit(gameUnit);
          lastGamePressureUnit = gameUnit;
        });

        scope.$on('$destroy', function () {
          live = false;
          StreamsManager.remove(streamsList);
          if (stylesheet && stylesheet.parentNode) stylesheet.parentNode.removeChild(stylesheet);
        });

        if (typeof bngApi !== 'undefined' && bngApi && typeof bngApi.engineLua === 'function') {
          bngApi.engineLua('settings.notifyUI()');
        }
        updateDisplay();
      }
    };
  }]);
})();
