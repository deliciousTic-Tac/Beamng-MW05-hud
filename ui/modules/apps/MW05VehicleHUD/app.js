/*
 * MW05 Vehicle HUD
 *
 * Data boundary:
 *   BeamNG `electrics` + `engineInfo` + `engineThermalData` streams -> readElectrics() -> display mapping -> SVG
 *
 * Verified stream fields used here are documented BeamNG electrics values:
 *   wheelspeed (m/s), gear (string), gearIndex (number), fuel (0..1),
 *   and oil (0/1, oil temperature above 130 C).
 *
 * `engineInfo` follows the native BeamNG app layout:
 *   [0] idle RPM, [1] maximum RPM, [2] shift-up RPM,
 *   [3] shift-down RPM, [4] current RPM.
 *
 * Optional vehicle-defined values are discovered only when they are actually
 * present in the received electrics object. NOS, battery charge and numeric
 * engine temperature are never simulated when the vehicle does not expose them.
 */
(function () {
  'use strict';

  var DEBUG = false;
  var MAX_RPM_FALLBACK = 10000; // scale fallback only; never displayed as vehicle data
  var KPH_TO_MPH = 0.621371192237334;
  // Same coolant-temperature scale as BeamNG's native Tacho2 app.
  var TEMP_MIN_C = 50;
  var TEMP_MAX_C = 130;
  var NOS_ARC_RADIUS = 240;
  var NOS_ARC_END_GAP_PX = 5;
  var NOS_ARC_END_GAP_DEG = NOS_ARC_END_GAP_PX / NOS_ARC_RADIUS * 180 / Math.PI;
  var NOS_MAX_HALF_SPAN = 37.5 - NOS_ARC_END_GAP_DEG;
  // Keep the slim blue fill centered inside the 15px dark track.
  var NOS_ARC_OUTER_RADIUS = 243;
  var NOS_ARC_INNER_RADIUS = 237;
  // A short time constant removes idle-RPM jitter without noticeably delaying
  // the needle when accelerating or lifting off.
  var RPM_NEEDLE_SMOOTHING_MS = 55;
  var CSS_URL = '/ui/modules/apps/MW05VehicleHUD/app.css';

  function number(value, fallback) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function speedUnitFromSettings(values) {
    return values && values.uiUnitLength === 'imperial' ? 'MPH' : 'KM/H';
  }

  function convertSpeed(kph, unit) {
    return unit === 'MPH' ? kph * KPH_TO_MPH : kph;
  }

  function findOptionalValue(values, matcher) {
    var keys = Object.keys(values || {});
    for (var i = 0; i < keys.length; i++) {
      if (matcher.test(keys[i]) && typeof values[keys[i]] === 'number' && isFinite(values[keys[i]])) {
        return { key: keys[i], value: values[keys[i]] };
      }
    }
    return null;
  }

  function findTemperature(values, thermalData) {
    var electricsKeys = ['watertemp', 'waterTemp', 'waterTemperature', 'coolantTemperature', 'coolantTemp'];
    var thermalKeys = ['coolantTemperature', 'waterTemperature', 'coolantTemp', 'oilTemperature', 'oiltemp'];
    var sources = [values || {}, thermalData || {}];
    var keyLists = [electricsKeys, thermalKeys];
    for (var sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
      var source = sources[sourceIndex];
      var keys = keyLists[sourceIndex];
      for (var keyIndex = 0; keyIndex < keys.length; keyIndex++) {
        var key = keys[keyIndex];
        if (typeof source[key] === 'number' && isFinite(source[key])) {
          return { key: key, value: source[key] };
        }
      }
    }
    return findOptionalValue(values, /water.*temp|oil.*temp|engine.*temp|coolant.*temp/i);
  }

  function normalizePercent(value) {
    if (value === null || value === undefined || !isFinite(value)) return null;
    return clamp(value > 1 ? value / 100 : value, 0, 1);
  }

  function readElectrics(values, engineInfo, thermalData) {
    values = values || {};
    engineInfo = engineInfo || [];
    var speedKph = Math.abs(number(values.wheelspeed, 0)) * 3.6;
    // engineInfo[4] is the instantaneous engine-control RPM. BeamNG's
    // rpmTacho is intentionally smoothed by the game and would delay the
    // needle during the first part of an acceleration.
    var engineRpm = number(engineInfo[4], null);
    var tachoRpm = number(values.rpmTacho, null);
    var rpm = Math.max(0, engineRpm !== null ? engineRpm : (tachoRpm !== null ? tachoRpm : 0));
    var engineMaxRpm = number(engineInfo[1], null);
    var engineRedlineRpm = number(engineInfo[2], null);
    var gear = normalizeGear(values.gear, values.gearIndex);

    var maxRpmValue = findOptionalValue(values, /(?:max|limit|redline).*rpm|rpm.*(?:max|limit|redline)/i);
    var engineLimitRpm = engineMaxRpm > 0 ? engineMaxRpm : (maxRpmValue ? Math.max(1000, maxRpmValue.value) : MAX_RPM_FALLBACK);
    var maxRpm = engineMaxRpm > 0 ? engineMaxRpm + 1000 : engineLimitRpm;
    var redlineRpm = engineMaxRpm > 0 ? maxRpm - 1000 : (engineRedlineRpm > 0 ? engineRedlineRpm : maxRpm * 0.86);
    redlineRpm = clamp(redlineRpm, 0, maxRpm);
    // Use the vehicle shift-up threshold when it is available. Some current
    // vehicles do not expose it through engineInfo, so use 1000 RPM below the
    // engine maximum instead of waiting for the redline/rpm limiter.
    var fallbackShiftRpm = engineMaxRpm > 0 ? engineMaxRpm - 1000 : redlineRpm;
    var shiftRpm = engineRedlineRpm > 0 ? engineRedlineRpm : fallbackShiftRpm;
    shiftRpm = clamp(shiftRpm, 0, maxRpm);
    var fuel = typeof values.fuel === 'number' ? clamp(values.fuel, 0, 1) : null;
    var battery = findOptionalValue(values, /battery|charge|soc/i);
    var nos = findOptionalValue(values, /nos|nitrous/i);
    var temperature = findTemperature(values, thermalData);
    var tempC = temperature ? temperature.value : null;
    var hotOilFlag = values.oil === 1 || values.oil === true;

    // A vehicle-defined battery replaces fuel only when the real stream exposes it.
    if (fuel === null && battery) fuel = normalizePercent(battery.value);
    return {
      speedKph: speedKph,
      rpm: rpm,
      maxRpm: maxRpm,
      redlineRpm: redlineRpm,
      shiftRpm: shiftRpm,
      gear: String(gear),
      fuel: fuel,
      nos: nos ? normalizePercent(nos.value) : null,
      tempC: typeof tempC === 'number' ? tempC : null,
      hotOilFlag: hotOilFlag,
      abs: number(values.abs, 0),
      parkingBrake: number(values.parkingbrake, 0),
      lowBeam: number(values.lowbeam, 0),
      highBeam: number(values.highbeam, 0),
      signalL: number(values.signal_L !== undefined ? values.signal_L : (values.signalL !== undefined ? values.signalL : values.signalLeft), 0),
      signalR: number(values.signal_R !== undefined ? values.signal_R : (values.signalR !== undefined ? values.signalR : values.signalRight), 0),
      rawKeys: Object.keys(values)
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

  function makeTicks(maxRpm) {
    var ticks = [];
    maxRpm = Math.max(1000, number(maxRpm, MAX_RPM_FALLBACK));
    var tickCount = Math.max(8, Math.round(maxRpm / 250));
    for (var i = 0; i <= tickCount; i++) {
      var rpm = maxRpm * i / tickCount;
      ticks.push({
        angle: -130 + (rpm / maxRpm) * 260,
        major: i === 0 || i === tickCount || Math.abs(rpm / 1000 - Math.round(rpm / 1000)) < 0.01
      });
    }
    return ticks;
  }

  function makeLabels(maxRpm) {
    var labels = [];
    maxRpm = Math.max(1000, number(maxRpm, MAX_RPM_FALLBACK));
    var wholeThousands = Math.floor(maxRpm / 1000);
    for (var i = 0; i <= wholeThousands; i++) {
      var value = i * 1000;
      var angle = (-130 + (value / maxRpm) * 260) * Math.PI / 180;
      labels.push({
        value: String(i),
        x: 256 + Math.sin(angle) * 159,
        y: 256 - Math.cos(angle) * 159
      });
    }
    return labels;
  }

  function makeTemperatureTicks() {
    var ticks = [];
    for (var i = 0; i <= 5; i++) {
      ticks.push({
        angle: -130 + (i / 5) * 100,
        major: i === 0 || i === 5
      });
    }
    return ticks;
  }

  function makeFuelTicks() {
    var ticks = [];
    for (var i = 0; i <= 5; i++) {
      ticks.push({
        // Fuel uses the mirrored right-hand arc: full at the top, empty at
        // the lower-right end. Keep exactly the same five subdivisions as
        // the coolant gauge.
        angle: 130 - (i / 5) * 100,
        major: i === 0 || i === 5
      });
    }
    return ticks;
  }

  function arcPath(startAngle, endAngle, radius, sweep) {
    sweep = sweep === undefined ? 1 : sweep;
    var start = startAngle * Math.PI / 180;
    var end = endAngle * Math.PI / 180;
    var x1 = 256 + Math.sin(start) * radius;
    var y1 = 256 - Math.cos(start) * radius;
    var x2 = 256 + Math.sin(end) * radius;
    var y2 = 256 - Math.cos(end) * radius;
    var delta = sweep ? endAngle - startAngle : startAngle - endAngle;
    var largeArc = delta > 180 ? 1 : 0;
    return 'M' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' A' + radius + ' ' + radius + ' 0 ' + largeArc + ' ' + sweep + ' ' + x2.toFixed(2) + ' ' + y2.toFixed(2);
  }

  function redlineBandPath(startAngle, endAngle, outerRadius, innerRadius) {
    var points = [];
    var steps = 18;
    for (var i = 0; i <= steps; i++) {
      var outerAngle = (startAngle + (endAngle - startAngle) * i / steps) * Math.PI / 180;
      points.push({
        x: 256 + Math.sin(outerAngle) * outerRadius,
        y: 256 - Math.cos(outerAngle) * outerRadius
      });
    }
    for (var j = steps; j >= 0; j--) {
      var innerAngle = (startAngle + (endAngle - startAngle) * j / steps) * Math.PI / 180;
      points.push({
        x: 256 + Math.sin(innerAngle) * innerRadius,
        y: 256 - Math.cos(innerAngle) * innerRadius
      });
    }
    var path = 'M' + points[0].x.toFixed(2) + ' ' + points[0].y.toFixed(2);
    for (var k = 1; k < points.length; k++) {
      path += ' L' + points[k].x.toFixed(2) + ' ' + points[k].y.toFixed(2);
    }
    return path + ' Z';
  }

  function normalizeGear(value, gearIndex) {
    var text = value === undefined || value === null ? '' : String(value).trim();
    var index = number(gearIndex, null);
    if (text === '-1' || text.toLowerCase() === 'reverse' || index === -1) return 'R';
    if (text === '' || text === '0' || text.toLowerCase() === 'neutral' || index === 0) return 'N';
    return text;
  }

  // Current BeamNG legacy apps expose StreamsManager globally; injecting it
  // through Angular fails on the current app service (Unknown provider).
  angular.module('beamng.apps').directive('mw05VehicleHud', [function () {
    return {
      template: `
        <div class="mw05-vehicle-hud">
          <svg class="mw05-hud-svg" viewBox="0 0 512 512" preserveAspectRatio="xMidYMid meet" aria-label="MW05 vehicle HUD">
            <defs>
              <filter id="mw05HudGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="mw05HudNeedleGlow" x="-15%" y="-15%" width="130%" height="130%">
                <feGaussianBlur stdDeviation="1" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <linearGradient id="mw05DialGlass" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#151515" stop-opacity=".76"/><stop offset="1" stop-color="#050505" stop-opacity=".9"/>
              </linearGradient>
            </defs>
            <circle class="mw05-hud-shadow" cx="256" cy="256" r="225"/>
            <circle class="mw05-hud-face" cx="256" cy="256" r="216" fill="url(#mw05DialGlass)"/>
            <path class="mw05-redline" ng-attr-d="{{display.redlinePath}}"/>
            <g class="mw05-nos-arc" ng-if="display.hasNos">
              <path class="mw05-nos-arc-track" fill="none" ng-attr-d="{{display.nosTrackPath}}"/>
              <path class="mw05-nos-arc-fill" ng-attr-d="{{display.nosLeftPath}}"/>
              <path class="mw05-nos-arc-fill" ng-attr-d="{{display.nosRightPath}}"/>
            </g>
            <g class="mw05-ticks">
              <line ng-repeat="tick in ticks" ng-class="{'mw05-major-tick': tick.major}" x1="256" y1="52" x2="256" ng-attr-y2="{{tick.major ? 80 : 70}}" ng-attr-transform="rotate({{tick.angle}} 256 256)"/>
            </g>
            <g class="mw05-numbers">
              <text ng-repeat="label in labels" ng-attr-x="{{label.x}}" ng-attr-y="{{label.y}}">{{label.value}}</text>
            </g>
            <g class="mw05-gear-panel">
              <rect x="214" y="146" width="84" height="48" rx="9"/>
              <text class="mw05-gear-ghost" x="266" y="175" dominant-baseline="middle">8</text>
              <text class="mw05-gear-value" x="266" y="175" dominant-baseline="middle">{{display.gear}}</text>
              <path class="mw05-shift-indicator" ng-class="{'mw05-shift-hot': display.shiftHot}" d="M230 157.45 L220 180.55 L240 180.55 Z"/>
            </g>
            <g class="mw05-status-icons">
            <g class="mw05-status-icon mw05-status-abs" ng-class="{'mw05-status-active': display.absActive}" transform="translate(164.5 285)">
                <svg width="42" height="42" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet">
                  <path class="mw05-status-icon-shape" d="M 8.94,4.61 l 1.5,-0.46 1.56,-0.15 1.56,0.15 1.5,0.46 1.38,0.74 1.22,0.99 0.99,1.22 0.74,1.38 0.46,1.5 0.15,1.56 -0.15,1.56 -0.46,1.5 -0.74,1.38 -0.99,1.22 -1.22,0.99 -1.38,0.74 -1.5,0.46 -1.56,0.15 -1.56,-0.15 -1.5,-0.46 -1.38,-0.74 -1.22,-0.99 -0.99,-1.22 -0.74,-1.38 -0.46,-1.5 -0.15,-1.56 0.15,-1.56 0.46,-1.5 0.74,-1.38 0.99,-1.22 1.22,-0.99 1.38,-0.74 Z M 12,5.5 l -1.27,0.12 -1.22,0.37 -1.12,0.61 -0.99,0.8 -0.8,0.99 -0.61,1.12 -0.37,1.22 -0.12,1.27 0.12,1.27 0.37,1.22 0.61,1.12 0.8,0.99 0.99,0.8 1.12,0.61 1.22,0.37 1.27,0.12 1.27,-0.12 1.22,-0.37 1.12,-0.61 0.99,-0.8 0.8,-0.99 0.61,-1.12 0.37,-1.22 0.12,-1.27 -0.12,-1.27 -0.37,-1.22 -0.61,-1.12 -0.8,-0.99 -0.99,-0.8 -1.12,-0.61 -1.22,-0.37 -1.27,-0.12 Z M 18.36,5.64 l 0.71,-0.71 1.24,1.51 0.93,1.73 0.57,1.88 0.19,1.95 -0.19,1.95 -0.57,1.88 -0.93,1.73 -1.24,1.51 -0.71,-0.71 1.12,-1.36 0.83,-1.56 0.52,-1.68 0.17,-1.76 -0.17,-1.76 -0.52,-1.68 -0.83,-1.56 -1.12,-1.36 Z M 3.69,8.56 l -0.52,1.68 -0.17,1.76 0.17,1.76 0.52,1.68 0.83,1.56 1.12,1.36 -0.71,0.71 -1.24,-1.51 -0.93,-1.73 -0.57,-1.88 -0.19,-1.95 0.19,-1.95 0.57,-1.88 0.93,-1.73 1.24,-1.51 0.71,0.71 -1.12,1.36 -0.83,1.56 Z M 10.61,9.48 l 1.6,0 0.5,0.04 0.4,0.15 0.29,0.21 0.2,0.28 0.14,0.61 -0.16,0.6 -0.26,0.29 0.38,0.36 0.14,0.33 0.05,0.36 -0.08,0.49 -0.27,0.46 -0.5,0.33 -0.73,0.13 -1.7,0 0,-4.64 Z M 7.88,9.48 l 0.88,0 1.52,4.64 -1.07,0 -0.28,-0.97 -1.22,0 -0.29,0.97 -1.06,0 1.52,-4.64 Z M 16.06,9.4 l 0.49,0.07 0.43,0.22 0.32,0.33 0.2,0.41 0.03,0.11 -0.88,0.29 -0.05,-0.09 -0.23,-0.28 -0.36,-0.11 -0.32,0.09 -0.11,0.23 0.06,0.17 0.24,0.18 0.44,0.23 0.44,0.23 0.44,0.29 0.35,0.42 0.14,0.57 -0.06,0.42 -0.17,0.36 -0.26,0.28 -0.32,0.21 -0.77,0.16 -0.72,-0.15 -0.01,0 -0.58,-0.42 -0.37,-0.64 -0.04,-0.11 0.89,-0.34 0.05,0.11 0.36,0.44 0.48,0.16 0.38,-0.11 0.14,-0.33 -0.1,-0.23 0,-0.01 -0.3,-0.23 -0.43,-0.22 -0.44,-0.2 -0.41,-0.29 0,0 -0.31,-0.39 0,0 -0.12,-0.54 0.18,-0.65 0.52,-0.46 0.36,-0.14 0.42,-0.04 Z M 11.6,12.18 l 0,1 0.76,0 0.34,-0.07 0.15,-0.17 0,0 0.05,-0.23 -0.06,-0.26 0,0 0,0 -0.19,-0.18 0,0 0,-0.01 -0.19,-0.06 -0.28,-0.02 -0.58,0 Z M 11.6,10.41 l 0,0.84 0.51,0 0.31,-0.03 0.19,-0.09 0.14,-0.31 -0.04,-0.2 0,0 0,0 -0.13,-0.14 0,0 0,0 -0.35,-0.07 -0.63,0 Z M 8.32,11.11 l -0.33,1.12 0.66,0 -0.33,-1.12 Z" fill-rule="evenodd"/>
              </svg>
            </g>
            <g class="mw05-status-icon mw05-status-lights" ng-class="{'mw05-status-low-active': display.lowBeamActive, 'mw05-status-high-active': display.highBeamActive}" transform="translate(211.5 285)">
              <svg width="42" height="42" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet">
                <path class="mw05-status-icon-shape" ng-if="!display.highBeamActive" d="M 9.2,6.73 l 0,2.07 0.06,0.27 0.15,0.22 0.22,0.15 0.27,0.06 0.27,-0.06 0.22,-0.15 0.15,-0.22 0.06,-0.27 0,-3.1 0.06,-0.27 0.15,-0.22 0.22,-0.15 0.27,-0.06 0.27,0.06 0.22,0.15 0.15,0.22 0.06,0.27 0,10.3 -0.08,0.39 -0.21,0.32 -0.32,0.21 -0.39,0.08 -1.53,0 -0.5,-0.13 -3.47,-2 -0.63,-0.49 -0.47,-0.61 -0.3,-0.72 -0.1,-0.78 0,-2.54 0.1,-0.78 0.3,-0.72 0.47,-0.61 0.63,-0.49 2.2,-1.26 0.52,-0.14 0.48,0.14 0.36,0.35 0.14,0.51 Z M 20.24,11.05 l -6.5,-3.9 -0.18,-0.19 -0.06,-0.24 0,-0.39 0.07,-0.25 0.17,-0.18 0.24,-0.07 0.26,0.06 6.5,3.47 0.19,0.18 0.07,0.26 0,0.82 -0.07,0.26 -0.18,0.17 -0.25,0.07 -0.26,-0.07 Z M 20.24,19.05 l -6.5,-3.9 -0.18,-0.19 -0.06,-0.24 0,-0.39 0.07,-0.25 0.17,-0.18 0.24,-0.07 0.26,0.06 6.5,3.47 0.19,0.18 0.07,0.26 -0.07,0.26 -0.18,0.17 -0.25,0.07 -0.26,-0.07 Z M 20.24,15.05 l -6.5,-3.9 -0.18,-0.19 -0.06,-0.24 0,-0.39 0.07,-0.25 0.17,-0.18 0.24,-0.07 0.26,0.06 6.5,3.47 0.19,0.18 0.07,0.26 0,0.82 -0.07,0.26 -0.18,0.17 -0.25,0.07 -0.26,-0.07 Z" fill-rule="evenodd"/>
                <path class="mw05-status-icon-shape" ng-if="display.highBeamActive" d="M 9.2,7.73 l 0,2.07 0.06,0.27 0.15,0.22 0.22,0.15 0.27,0.06 0.27,-0.06 0.22,-0.15 0.15,-0.22 0.06,-0.27 0,-3.1 0.06,-0.27 0.15,-0.22 0.22,-0.15 0.27,-0.06 0.27,0.06 0.22,0.15 0.15,0.22 0.06,0.27 0,10.3 -0.08,0.39 -0.21,0.32 -0.32,0.21 -0.39,0.08 -1.53,0 -0.5,-0.13 -3.47,-2 -0.63,-0.49 -0.47,-0.61 -0.3,-0.72 -0.1,-0.78 0,-2.54 0.1,-0.78 0.3,-0.72 0.47,-0.61 0.63,-0.49 2.2,-1.26 0.52,-0.14 0.48,0.14 0.36,0.35 0.14,0.51 Z M 21.41,17.4 l -7.5,-1.33 -0.29,-0.17 -0.12,-0.32 0,-0.05 0.16,-0.36 0.37,-0.14 7.5,0.44 0.33,0.16 0.14,0.34 0,0.93 -0.05,0.22 -0.13,0.17 -0.19,0.1 -0.22,0.01 Z M 21.53,8.53 l -7.5,0.44 -0.37,-0.14 -0.16,-0.36 0,-0.05 0.12,-0.32 0.29,-0.17 7.5,-1.33 0.22,0.01 0.19,0.1 0.13,0.17 0.05,0.22 0,0.93 -0.14,0.34 -0.33,0.16 Z M 21.47,12.97 l -7.5,-0.44 -0.33,-0.16 -0.14,-0.34 0,-0.06 0.14,-0.34 0.33,-0.16 7.5,-0.44 0.37,0.14 0.16,0.36 0,0.94 -0.16,0.36 -0.37,0.14 Z" fill-rule="evenodd"/>
              </svg>
            </g>
            <g class="mw05-status-icon mw05-status-turn" ng-class="{'mw05-status-active': display.turnActive}" transform="translate(258.5 285)">
              <svg width="42" height="42" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet">
                <path class="mw05-status-icon-shape mw05-status-turn-shape" ng-class="{'mw05-status-turn-active': display.turnLeftActive}" d="M 7.6,6.3 L 7.6,8.5 L 10.8,8.5 L 10.8,12 L 10.8,15.5 L 7.6,15.5 L 7.6,17.7 L 0.5,12 Z"/>
                <path class="mw05-status-icon-shape mw05-status-turn-shape" ng-class="{'mw05-status-turn-active': display.turnRightActive}" d="M 16.4,6.3 L 16.4,8.5 L 13.2,8.5 L 13.2,12 L 13.2,15.5 L 16.4,15.5 L 16.4,17.7 L 23.5,12 Z"/>
              </svg>
            </g>
            <g class="mw05-status-icon mw05-status-parking" ng-class="{'mw05-status-active': display.parkingBrakeActive}" transform="translate(305.5 285)">
              <svg width="42" height="42" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet">
                <path class="mw05-status-icon-shape" d="M 12,4 l 1.56,0.15 1.5,0.46 1.38,0.74 1.22,0.99 0.99,1.22 0.74,1.38 0.46,1.5 0.15,1.56 -0.15,1.56 -0.46,1.5 -0.74,1.38 -0.99,1.22 -1.22,0.99 -1.38,0.74 -1.5,0.46 -1.56,0.15 -1.56,-0.15 -1.5,-0.46 -1.38,-0.74 -1.22,-0.99 -0.99,-1.22 -0.74,-1.38 -0.46,-1.5 -0.15,-1.56 0.15,-1.56 0.46,-1.5 0.74,-1.38 0.99,-1.22 1.22,-0.99 1.38,-0.74 1.5,-0.46 1.56,-0.15 Z M 9.51,5.99 l -1.12,0.61 -0.99,0.8 -0.8,0.99 -0.61,1.12 -0.37,1.22 -0.12,1.27 0.12,1.27 0.37,1.22 0.61,1.12 0.8,0.99 0.99,0.8 1.12,0.61 1.22,0.37 1.27,0.12 1.27,-0.12 1.22,-0.37 1.12,-0.61 0.99,-0.8 0.8,-0.99 0.61,-1.12 0.37,-1.22 0.12,-1.27 -0.12,-1.27 -0.37,-1.22 -0.61,-1.12 -0.8,-0.99 -0.99,-0.8 -1.12,-0.61 -1.22,-0.37 -1.27,-0.12 -1.27,0.12 -1.22,0.37 Z M 9.5,16 l 0,-8.5 3.25,0 0.55,0.06 0.52,0.16 0.47,0.25 0.4,0.34 0.34,0.4 0.25,0.47 0.16,0.52 0.06,0.55 -0.06,0.55 -0.16,0.52 -0.25,0.47 -0.34,0.4 -0.4,0.34 -0.47,0.25 -0.52,0.16 -0.55,0.06 -1.75,0 0,3 -1.5,0 Z M 20.31,8.56 l -0.83,-1.56 -1.12,-1.36 0.71,-0.71 1.24,1.51 0.93,1.73 0.57,1.88 0.19,1.95 -0.19,1.95 -0.57,1.88 -0.93,1.73 -1.24,1.51 -0.71,-0.71 1.12,-1.36 0.83,-1.56 0.52,-1.68 0.17,-1.76 -0.17,-1.76 -0.52,-1.68 Z M 5.64,5.64 l -1.12,1.36 -0.83,1.56 -0.52,1.68 -0.17,1.76 0.17,1.76 0.52,1.68 0.83,1.56 1.12,1.36 -0.71,0.71 -1.24,-1.51 -0.93,-1.73 -0.57,-1.88 -0.19,-1.95 0.19,-1.95 0.57,-1.88 0.93,-1.73 1.24,-1.51 0.71,0.71 Z M 11,11.5 l 1.75,0 0.49,-0.1 0.39,-0.27 0.27,-0.39 0.1,-0.49 -0.1,-0.49 -0.27,-0.39 -0.39,-0.27 -0.49,-0.1 -1.75,0 0,2.5 Z" fill-rule="evenodd"/>
              </svg>
            </g>
            <g class="mw05-needle" ng-style="{'transform': 'rotate(' + display.needleAngle + 'deg)'}">
              <rect class="mw05-needle-bounds" x="0" y="0" width="512" height="512" fill="transparent" pointer-events="none"/>
              <path d="M256 256 L250 256 L256 47 L262 256 Z"/>
              <circle cx="256" cy="256" r="15"/>
              <circle class="mw05-pivot" cx="256" cy="256" r="7"/>
            </g>
            <g class="mw05-speed-readout" transform="translate(0 30)">
              <g transform="translate(256 348.5)">
                <g transform="scale(.95)">
                  <g transform="translate(-256 -348.5)">
                    <g class="mw05-speed-panel">
                      <rect x="181" y="315" width="150" height="67" rx="11"/>
                      <text class="mw05-speed-ghost" x="256" y="358.5" dominant-baseline="middle">888</text>
                      <text class="mw05-speed-value" ng-attr-x="{{display.speedX}}" y="358.5" dominant-baseline="middle">{{display.speedText}}</text>
                    </g>
                    <text class="mw05-unit mw05-speed-unit" x="256" y="409" ng-click="toggleSpeedUnit()" title="Cliquer pour changer d’unité">{{display.speedUnit}}</text>
                  </g>
                </g>
              </g>
            </g>
            <g class="mw05-fuel-arc" ng-if="display.hasFuel">
              <g class="mw05-fuel-ticks">
                <line ng-repeat="tick in fuelTicks" ng-class="{'mw05-fuel-major-tick': tick.major}" x1="256" y1="8" x2="256" ng-attr-y2="{{tick.major ? 28 : 24}}" ng-attr-transform="rotate({{tick.angle}} 256 256)"/>
              </g>
              <path class="mw05-fuel-arc-fill" fill="none" ng-attr-d="{{display.fuelPath}}"/>
            </g>
            <g class="mw05-temp-arc" ng-if="display.tempState !== 'hidden'">
              <g class="mw05-temp-ticks">
                <line ng-repeat="tick in temperatureTicks" ng-class="{'mw05-temp-major-tick': tick.major}" x1="256" y1="8" x2="256" ng-attr-y2="{{tick.major ? 28 : 24}}" ng-attr-transform="rotate({{tick.angle}} 256 256)"/>
              </g>
              <path class="mw05-temp-arc-fill" fill="none" ng-attr-d="{{display.tempPath}}"/>
            </g>
            <g class="mw05-temp-icon" ng-if="display.tempState !== 'hidden'" ng-class="{'mw05-alert': display.tempState === 'HOT'}" transform="translate(40 425) scale(.85)">
              <svg x="0" y="0" width="48" height="48" viewBox="0 0 48 48" preserveAspectRatio="xMidYMid meet">
                <path class="mw05-temp-icon-shape" d="M 11,27.27 l 0,-20.27 0.06,-0.6 0.18,-0.57 0.27,-0.51 0.37,-0.44 0.44,-0.37 0.51,-0.27 0.57,-0.18 0.6,-0.06 4,0 0.6,0.06 0.57,0.18 0.51,0.27 0.44,0.37 0.37,0.44 0.27,0.51 0.18,0.57 0.06,0.6 21,0 0,4 -21,0 0,16.27 0.1,0.44 0.27,0.36 1.09,1.21 0.83,1.42 0.53,1.59 0.18,1.71 -0.16,1.61 -0.47,1.5 -0.74,1.36 -0.97,1.19 -1.19,0.97 -1.36,0.74 -1.5,0.47 -1.61,0.16 -1.61,-0.16 -1.5,-0.47 -1.36,-0.74 -1.19,-0.97 -0.97,-1.19 -0.74,-1.36 -0.47,-1.5 -0.16,-1.61 0.18,-1.71 0.53,-1.59 0.83,-1.42 1.09,-1.21 0.27,-0.36 0.1,-0.44 Z M 15,7 l -0.39,0.08 -0.32,0.21 -0.21,0.32 -0.08,0.39 0,20.76 -0.16,0.55 -0.42,0.41 -0.99,0.78 -0.76,1.01 -0.5,1.18 -0.17,1.31 0.1,1.01 0.29,0.94 0.46,0.85 0.61,0.74 0.74,0.61 0.85,0.46 0.94,0.29 1.01,0.1 1.01,-0.1 0.94,-0.29 0.85,-0.46 0.74,-0.61 0.61,-0.74 0.46,-0.85 0.29,-0.94 0.1,-1.01 -0.17,-1.31 -0.5,-1.18 -0.76,-1.01 -0.99,-0.78 -0.42,-0.41 -0.16,-0.55 0,-20.76 -0.08,-0.39 -0.21,-0.32 -0.32,-0.21 -0.39,-0.08 -2,0 Z M 15,15 l 2,0 0,16.17 0.8,0.43 0.64,0.65 0.41,0.81 0.15,0.94 -0.06,0.6 -0.18,0.57 -0.27,0.51 -0.37,0.44 -0.44,0.37 -0.51,0.27 -0.57,0.18 -0.6,0.06 -0.6,-0.06 -0.57,-0.18 -0.51,-0.27 -0.44,-0.37 -0.37,-0.44 -0.27,-0.51 -0.18,-0.57 -0.06,-0.6 0.15,-0.94 0.41,-0.81 0.64,-0.65 0.8,-0.43 0,-16.17 Z M 30,23 l 12,0 0,4 -12,0 0,-4 Z M 30,15 l 8,0 0,4 -8,0 0,-4 Z M 38,31 l 0,4 -8,0 0,-4 8,0 Z" fill-rule="evenodd"/>
              </svg>
            </g>
            <g class="mw05-fuel-icon" ng-if="display.hasFuel" ng-class="{'mw05-alert': display.fuelLow}" transform="translate(440 425) scale(.85)">
              <svg x="0" y="0" width="48" height="48" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet">
                <path class="mw05-fuel-icon-shape" d="M 5,11.5 l 0.15,-0.35 0.35,-0.15 7,0 0.35,0.15 0.15,0.35 0,0.5 0.56,0.05 0.52,0.15 0.93,0.54 0.68,0.83 0.22,0.5 0.14,0.54 0.41,2.71 0.17,0.51 0.32,0.43 0.44,0.3 0.52,0.15 0.7,-0.07 0.59,-0.34 0.4,-0.55 0.15,-0.69 0,-6.73 -2.75,-1.83 0.33,-1.64 -2.83,-2.36 0.5,-1 4.3,2.49 0.81,0.6 0.61,0.78 0.39,0.91 0.14,1 0,7.78 -0.07,0.69 -0.21,0.63 -0.34,0.56 -0.43,0.47 -0.52,0.38 -0.6,0.27 -0.65,0.14 -0.68,0 -1,-0.28 -0.84,-0.58 -0.61,-0.81 -0.32,-0.99 -0.42,-2.7 -0.18,-0.53 -0.35,-0.43 -0.47,-0.28 -0.56,-0.1 0,5.5 0.5,0 0.35,0.15 0.15,0.35 0,1 -0.15,0.35 -0.35,0.15 -9,0 -0.35,-0.15 -0.15,-0.35 0,-1 0.15,-0.35 0.35,-0.15 0.5,0 0,-7.5 Z M 6,3.5 l 6,0 0.39,0.08 0.32,0.21 0.21,0.32 0.08,0.39 0,4.5 -0.08,0.39 -0.21,0.32 -0.32,0.21 -0.39,0.08 -6,0 -0.39,-0.08 -0.32,-0.21 -0.21,-0.32 -0.08,-0.39 0,-4.5 0.08,-0.39 0.21,-0.32 0.32,-0.21 0.39,-0.08 Z M 7,5 l -0.39,0.08 -0.32,0.21 -0.21,0.32 -0.08,0.39 0,1 0.08,0.39 0.21,0.32 0.32,0.21 0.39,0.08 4,0 0.39,-0.08 0.32,-0.21 0.21,-0.32 0.08,-0.39 0,-1 -0.08,-0.39 -0.21,-0.32 -0.32,-0.21 -0.39,-0.08 -4,0 Z" fill-rule="evenodd"/>
              </svg>
            </g>
          </svg>
          <div class="mw05-debug" ng-if="debug">Speed: {{data.speedKph | number:1}} km/h<br>RPM: {{data.rpm | number:0}}<br>Gear: {{data.gear}}<br>Fuel: {{data.fuel | number:2}}<br>Temp: {{data.tempC | number:1}}<br>NOS: {{data.nos | number:2}}<br>Keys: {{data.rawKeys.join(', ')}}</div>
        </div>`,
      replace: true,
      restrict: 'EA',
      link: function (scope) {
        var stylesheet = addStylesheet(CSS_URL);
        var streamsList = ['electrics', 'engineInfo', 'engineThermalData'];
        StreamsManager.add(streamsList);
        scope.ticks = makeTicks(MAX_RPM_FALLBACK);
        scope.labels = makeLabels(MAX_RPM_FALLBACK);
        scope.temperatureTicks = makeTemperatureTicks();
        scope.fuelTicks = makeFuelTicks();
        scope.debug = DEBUG;
        scope.data = readElectrics({}, []);
        scope.display = {
          needleAngle: -130,
          redlinePath: redlineBandPath(Math.max(65, -130 + ((MAX_RPM_FALLBACK - 1000) / MAX_RPM_FALLBACK) * 260), 130, 215, 193),
          fuelPath: arcPath(130, 130, 242, 0),
          tempPath: arcPath(-130, -130, 242, 1),
          nosTrackPath: arcPath(142.5, 217.5, NOS_ARC_RADIUS, 1),
          nosLeftPath: redlineBandPath(180, 180, NOS_ARC_OUTER_RADIUS, NOS_ARC_INNER_RADIUS),
          nosRightPath: redlineBandPath(180, 180, NOS_ARC_OUTER_RADIUS, NOS_ARC_INNER_RADIUS),
          maxRpm: MAX_RPM_FALLBACK,
          speedText: '0',
          speedX: 292,
          speedUnit: 'KM/H',
          gear: 'N',
          hasNos: false,
          hasFuel: false,
          fuelLow: false,
          tempState: 'hidden',
          absActive: false,
          parkingBrakeActive: false,
          lowBeamActive: false,
          highBeamActive: false,
          turnActive: false,
          turnLeftActive: false,
          turnRightActive: false,
          shiftHot: false
        };
        var live = true;
        var nosLevelFromPowertrainButton;
        var smoothedNeedleAngle = -130;
        var lastNeedleFrameTime = null;
        var lastGameSpeedUnit = null;

        function setSpeedUnit(unit) {
          scope.display.speedUnit = unit === 'MPH' ? 'MPH' : 'KM/H';
        }

        scope.toggleSpeedUnit = function () {
          setSpeedUnit(scope.display.speedUnit === 'KM/H' ? 'MPH' : 'KM/H');
        };

        function updateDisplay(frameTime) {
          if (!live) return;
          var rpmRatio = clamp(scope.data.rpm / scope.data.maxRpm, 0, 1);
          var targetNeedleAngle = -130 + rpmRatio * 260;
          if (typeof frameTime !== 'number' || lastNeedleFrameTime === null) {
            smoothedNeedleAngle = targetNeedleAngle;
          } else {
            var elapsedMs = clamp(frameTime - lastNeedleFrameTime, 0, 100);
            var blend = 1 - Math.exp(-elapsedMs / RPM_NEEDLE_SMOOTHING_MS);
            smoothedNeedleAngle += (targetNeedleAngle - smoothedNeedleAngle) * blend;
          }
          if (typeof frameTime === 'number') lastNeedleFrameTime = frameTime;
          scope.display.needleAngle = smoothedNeedleAngle;
          if (scope.display.maxRpm !== scope.data.maxRpm) {
            scope.display.maxRpm = scope.data.maxRpm;
            scope.ticks = makeTicks(scope.data.maxRpm);
            scope.labels = makeLabels(scope.data.maxRpm);
          }
          var redlineRatio = clamp((scope.data.maxRpm - 1000) / scope.data.maxRpm, 0, 1);
          var redlineAngle = Math.max(65, -130 + redlineRatio * 260);
          scope.display.redlinePath = redlineBandPath(redlineAngle, 130, 215, 193);
          scope.display.speedText = String(Math.round(convertSpeed(scope.data.speedKph, scope.display.speedUnit)));
          scope.display.speedX = scope.display.speedText.length >= 3 ? 256 : (scope.display.speedText.length === 2 ? 274 : 292);
          scope.display.gear = scope.data.gear;
          scope.display.absActive = scope.data.abs > 0.5;
          scope.display.parkingBrakeActive = scope.data.parkingBrake > 0.5;
          scope.display.lowBeamActive = scope.data.lowBeam > 0.5;
          scope.display.highBeamActive = scope.data.highBeam > 0.5;
          scope.display.turnLeftActive = scope.data.signalL > 0.5;
          scope.display.turnRightActive = scope.data.signalR > 0.5;
          scope.display.turnActive = scope.display.turnLeftActive || scope.display.turnRightActive;
          scope.display.shiftHot = scope.data.rpm >= scope.data.shiftRpm;
          scope.display.hasNos = scope.data.nos !== null;
          scope.display.nosTrackPath = arcPath(142.5, 217.5, NOS_ARC_RADIUS, 1);
          var nosLevel = scope.data.nos === null ? 0 : clamp(scope.data.nos, 0, 1);
          var nosSpan = nosLevel * NOS_MAX_HALF_SPAN;
          // Use filled annular sectors instead of stroked short arcs. This keeps
          // the gauge thickness constant while the consumed length alone changes.
          scope.display.nosLeftPath = redlineBandPath(180 - nosSpan, 180, NOS_ARC_OUTER_RADIUS, NOS_ARC_INNER_RADIUS);
          scope.display.nosRightPath = redlineBandPath(180, 180 + nosSpan, NOS_ARC_OUTER_RADIUS, NOS_ARC_INNER_RADIUS);
          scope.display.hasFuel = scope.data.fuel !== null;
          scope.display.fuelLow = scope.data.fuel !== null && scope.data.fuel < 0.1;
          scope.display.fuelPath = arcPath(130, 130 - (scope.data.fuel === null ? 0 : scope.data.fuel * 100), 242, 0);
          if (scope.data.tempC !== null) {
            scope.display.tempState = scope.data.tempC >= TEMP_MAX_C ? 'HOT' : (scope.data.tempC >= 75 ? 'NORM' : 'COLD');
          } else if (scope.data.hotOilFlag) {
            scope.display.tempState = 'HOT';
          } else {
            scope.display.tempState = 'hidden';
          }
          var tempRatio = scope.data.tempC === null ? (scope.data.hotOilFlag ? 1 : 0) : clamp((scope.data.tempC - TEMP_MIN_C) / (TEMP_MAX_C - TEMP_MIN_C), 0, 1);
          scope.display.tempPath = arcPath(-130, -130 + tempRatio * 100, 242, 1);
          scope.$evalAsync();
          requestAnimationFrame(updateDisplay);
        }

        scope.$on('streamsUpdate', function (event, streams) {
          scope.data = readElectrics(streams && streams.electrics, streams && streams.engineInfo, streams && streams.engineThermalData);
          if (nosLevelFromPowertrainButton !== undefined) {
            scope.data.nos = nosLevelFromPowertrainButton;
          }
        });

        // Ask BeamNG to send the current settings once when the app is added,
        // then keep following changes made in the game's unit settings.
        scope.$on('SettingsChanged', function (event, data) {
          if (!data || !data.values || typeof data.values.uiUnitLength !== 'string') return;
          var gameUnit = speedUnitFromSettings(data.values);
          // Do not discard a local click when an unrelated game setting changes.
          // A true speed-unit change remains authoritative and updates the HUD.
          if (lastGameSpeedUnit !== gameUnit) setSpeedUnit(gameUnit);
          lastGameSpeedUnit = gameUnit;
        });

        // BeamNG exposes the real nitrous tank level through the native
        // powertrain button event, not through the electrics stream.
        scope.$on('ChangePowerTrainButtons', function (event, button) {
          if (!button || button.icon !== 'powertrain_n2o') return;
          // Removing the native button is a UI-state event, not proof that
          // the tank is empty. Keep the last real level until a new value is received.
          if (button.remove) return;
          var nextNosLevel = normalizePercent(button.ringValue);
          if (nextNosLevel === null) return;
          nosLevelFromPowertrainButton = nextNosLevel;
          scope.data.nos = nextNosLevel;
        });

        scope.$on('$destroy', function () {
          live = false;
          StreamsManager.remove(streamsList);
          if (stylesheet && stylesheet.parentNode) stylesheet.parentNode.removeChild(stylesheet);
        });
        if (typeof bngApi !== 'undefined' && bngApi && typeof bngApi.engineLua === 'function') {
          bngApi.engineLua('settings.notifyUI()');
        }
        requestAnimationFrame(updateDisplay);
      }
    };
  }]);
})();
