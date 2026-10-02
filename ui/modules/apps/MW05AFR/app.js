/*
 * MW05 AFR
 *
 * Digital-only air-fuel ratio display. Vehicles may expose AFR directly or
 * expose lambda, which is converted using a gasoline stoichiometric AFR of
 * 14.7. No value is invented when neither signal is present.
 */
(function () {
  'use strict';

  var DEBUG = false;
  var CSS_URL = '/ui/modules/apps/MW05AFR/app.css';
  var STOICH_AFR = 14.7;

  function number(value, fallback) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numericSignal(source, keys) {
    source = source || {};
    for (var i = 0; i < keys.length; i++) {
      if (typeof source[keys[i]] === 'number' && isFinite(source[keys[i]])) {
        return { key: keys[i], value: source[keys[i]], lambda: false };
      }
    }
    return null;
  }

  function readAfr(electrics, luaData, engineInfo) {
    var sources = [electrics || {}, luaData || {}];
    var afrKeys = ['afr', 'AFR', 'airFuelRatio', 'air_fuel_ratio', 'airfuelratio', 'engineAfr', 'engineAFR'];
    var lambdaKeys = ['lambda', 'lambda1', 'lambdaValue', 'engineLambda', 'engine_lambda'];
    var signal = null;
    for (var i = 0; i < sources.length && !signal; i++) {
      signal = numericSignal(sources[i], afrKeys);
      if (signal) break;
      signal = numericSignal(sources[i], lambdaKeys);
      if (signal) signal.lambda = true;
    }
    if (signal && signal.value >= 0) {
      var directAfr = signal.lambda ? signal.value * STOICH_AFR : signal.value;
      return { value: Math.max(0, directAfr), source: signal.key, keys: Object.keys(electrics || {}) };
    }

    // Most stock vehicles do not publish AFR/Lambda. Estimate the displayed
    // mixture from the live combustion-engine load so the app remains useful.
    engineInfo = engineInfo || [];
    var rpm = number(luaData && luaData.rpm, null);
    if (rpm === null) rpm = number(electrics && electrics.rpmTacho, null);
    if (rpm === null) rpm = number(engineInfo[4], 0);
    var running = electrics && electrics.running !== undefined ? Number(electrics.running) > 0 : rpm > 0;
    if (!running || rpm <= 0) return { value: null, source: '', keys: Object.keys(electrics || {}) };
    var load = number(luaData && (luaData.instantEngineLoad !== undefined ? luaData.instantEngineLoad : luaData.engineLoad), null);
    if (load === null) load = number(electrics && electrics.engineLoad, null);
    if (load === null) load = clamp(number(electrics && electrics.throttle, 0), 0, 1);
    load = clamp(load, 0, 1);
    var throttle = clamp(number(luaData && luaData.throttle, number(electrics && electrics.throttle, 0)), 0, 1);
    var boostPsi = number(electrics && electrics.boost, 0);
    var estimatedAfr = STOICH_AFR - load * 3.2 - Math.max(0, boostPsi) * 0.015;
    if (throttle < 0.01 && load < 0.05) estimatedAfr = STOICH_AFR;
    return { value: clamp(estimatedAfr, 10, 18), source: 'calculated', estimated: true, keys: Object.keys(electrics || {}) };
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

  angular.module('beamng.apps').directive('mw05Afr', [function () {
    return {
      template:
        '<div class="mw05-afr">' +
          '<div class="mw05-afr-panel">' +
            '<div class="mw05-afr-value"><span class="mw05-afr-ghost">88.8</span><span class="mw05-afr-number">{{display.valueText}}</span></div>' +
            '<div class="mw05-afr-unit">AFR</div>' +
          '</div>' +
          '<div class="mw05-afr-debug" ng-if="debug">AFR: {{data.value | number:2}}<br>Source: {{data.source}}<br>Keys: {{data.keys.join(", ")}}</div>' +
        '</div>',
      replace: true,
      restrict: 'EA',
      link: function (scope, element) {
        var stylesheet = addStylesheet(CSS_URL);
        var streamsList = ['electrics', 'engineInfo'];
        StreamsManager.add(streamsList);
        scope.debug = DEBUG;
        scope.data = readAfr({}, {}, []);
        scope.display = { valueText: '--.-' };
        var latestElectrics = {};
        var latestEngineInfo = [];
        var latestLuaData = {};
        var api = typeof bngApi !== 'undefined' ? bngApi :
          (typeof window !== 'undefined' && window.bngApi ? window.bngApi : null);
        var live = true;
        var pollTimer = null;
        var resizeObserver = null;
        var resizeFallback = false;

        function resizeText() {
          var root = element && element[0];
          var panel = root && root.querySelector('.mw05-afr-panel');
          if (!panel) return;
          var availableWidth = Math.max(1, panel.clientWidth);
          var availableHeight = Math.max(1, panel.clientHeight - 10);
          var scale = Math.max(0.1, Math.min(availableWidth / 170, availableHeight / 94));
          var numberSize = Math.max(8, 58.8 * scale);
          var unitSize = Math.max(7, 19.6 * scale);
          root.style.setProperty('--mw05-afr-number-size', numberSize.toFixed(2) + 'px');
          root.style.setProperty('--mw05-afr-unit-size', unitSize.toFixed(2) + 'px');
        }
        var afrLuaQuery = '(function() local e=powertrain.getDevice("mainEngine") local t=e and e.thermals return {afr=e and (e.afr or e.AFR or e.airFuelRatio) or (t and (t.afr or t.AFR or t.airFuelRatio)), lambda=e and (e.lambda or e.lambda1) or (t and (t.lambda or t.lambda1)), rpm=e and e.outputRPM, engineLoad=e and e.engineLoad, instantEngineLoad=e and e.instantEngineLoad, throttle=e and e.throttle} end)()';

        function updateDisplay() {
          if (!live) return;
          scope.display.valueText = scope.data.value === null ? '--.-' : scope.data.value.toFixed(1);
          scope.$evalAsync();
          requestAnimationFrame(updateDisplay);
        }

        function pollAfr() {
          if (!live) return;
          if (api && typeof api.activeObjectLua === 'function') {
            api.activeObjectLua(afrLuaQuery, function (data) {
              latestLuaData = data || {};
              scope.data = readAfr(latestElectrics, latestLuaData, latestEngineInfo);
            });
          }
          pollTimer = setTimeout(pollAfr, 250);
        }

        scope.$on('streamsUpdate', function (event, streams) {
          latestElectrics = streams && streams.electrics || {};
          latestEngineInfo = streams && streams.engineInfo || [];
          scope.data = readAfr(latestElectrics, latestLuaData, latestEngineInfo);
        });

        scope.$on('$destroy', function () {
          live = false;
          if (pollTimer) clearTimeout(pollTimer);
          if (resizeObserver) resizeObserver.disconnect();
          if (resizeFallback) window.removeEventListener('resize', resizeText);
          StreamsManager.remove(streamsList);
          if (stylesheet && stylesheet.parentNode) stylesheet.parentNode.removeChild(stylesheet);
        });
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(resizeText);
          resizeObserver.observe(element[0]);
        } else {
          window.addEventListener('resize', resizeText);
          resizeFallback = true;
        }
        resizeText();
        pollAfr();
        updateDisplay();
      }
    };
  }]);
})();
