/* MW05 Ignition: uses stock electrics levels (0 OFF, 1 ACC, 2 ON, 3 START). */
(function () {
  'use strict';

  // Revision suffix bypasses BeamNG UI's cached stylesheet when the app is
  // reloaded with Ctrl+L after a visual update.
  var CSS_URL = '/ui/modules/apps/MW05Ignition/app.css?v=metal-esc-8';

  function number(value, fallback) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : fallback;
  }

  function readState(values) {
    values = values || {};
    var ignitionLevel = number(values.ignitionLevel, 0);
    var starter = number(values.starter !== undefined ? values.starter : values.engineStarter, 0) > 0;
    var engineRunning = number(values.engineRunning !== undefined ? values.engineRunning : values.running, 0) > 0 ||
      number(values.rpmTacho !== undefined ? values.rpmTacho : values.rpm, 0) > 100;
    // The starter input is the source of truth for START.  Do not drop the
    // key back to ON merely because the engine has already fired: a held
    // keyboard shortcut or mouse button must keep its physical START pose.
    if (ignitionLevel >= 3 || starter) return { mode:'START', angle:36, caption:'DÉMARRAGE', engineRunning:engineRunning };
    if (ignitionLevel >= 2 || engineRunning) return { mode:'ON', angle:2, caption: engineRunning ? 'MOTEUR EN MARCHE' : 'CONTACT', engineRunning:engineRunning };
    if (ignitionLevel === 1) return { mode:'ACC', angle:-28, caption:'ACCESSOIRE UNIQUEMENT', engineRunning:false };
    return { mode:'OFF', angle:-58, caption:'CONTACT COUPÉ', engineRunning:false };
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

  angular.module('beamng.apps').directive('mw05Ignition', [function () {
    return {
      template: `
        <div class="mw05-ignition">
          <svg class="mw05-ignition-svg" viewBox="0 0 512 512" preserveAspectRatio="xMidYMid meet" aria-label="Contact moteur" role="button" ng-mousedown="beginStart($event)">
            <defs>
              <filter id="mw05IgnitionGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              <radialGradient id="mw05IgnitionMetal" cx="33%" cy="24%" r="82%">
                <stop offset="0%" stop-color="#f0f2f3"/>
                <stop offset="16%" stop-color="#aeb4b9"/>
                <stop offset="37%" stop-color="#596168"/>
                <stop offset="58%" stop-color="#c7cbce"/>
                <stop offset="78%" stop-color="#6c7379"/>
                <stop offset="100%" stop-color="#30363b"/>
              </radialGradient>
            </defs>
            <circle class="mw05-ignition-shadow" cx="256" cy="270" r="218"/>
            <circle class="mw05-ignition-backplate" cx="256" cy="256" r="205"/>
            <circle class="mw05-ignition-ring" cx="256" cy="256" r="176"/>
            <circle class="mw05-ignition-inner" cx="256" cy="270" r="132"/>
            <circle class="mw05-ignition-brushed" cx="256" cy="270" r="122"/>
            <path class="mw05-ignition-scale" d="M145 178 A145 145 0 0 1 367 178"/>
            <text class="mw05-ignition-mark" ng-class="{'is-active': display.mode === 'OFF'}" x="125" y="174">OFF</text>
            <text class="mw05-ignition-mark mw05-ignition-mark-acc" ng-class="{'is-active': display.mode === 'ACC'}" x="183" y="119">ACC</text>
            <text class="mw05-ignition-mark" ng-class="{'is-active': display.mode === 'ON'}" x="261" y="101">ON</text>
            <text class="mw05-ignition-mark" ng-class="{'is-active': display.mode === 'START'}" x="358" y="160">START</text>
            <g class="mw05-key" ng-style="{'transform':'rotate(' + display.angle + 'deg)'}">
              <rect class="mw05-key-shaft" x="214" y="130" width="84" height="252" rx="42"/>
              <path class="mw05-key-facet" d="M256 133 Q294 141 294 172 L294 340 Q294 371 256 379Z"/>
              <path class="mw05-key-head" d="M230 153 Q256 137 282 153 L282 177 Q256 164 230 177Z"/>
              <rect class="mw05-key-slot" x="242" y="158" width="28" height="12" rx="6"/>
              <path class="mw05-key-shine" d="M229 193 Q256 180 283 193 L283 204 Q256 193 229 204Z"/>
            </g>
            <circle class="mw05-key-pivot" cx="256" cy="270" r="13"/>
          </svg>
          <button type="button" class="mw05-ignition-esc" ng-if="escButton" ng-mousedown="$event.stopPropagation()" ng-click="activateEsc()" ng-attr-aria-label="{{escButton.tooltip}}">
            <svg viewBox="0 0 36 36" aria-hidden="true">
              <circle r="18" cx="18" cy="18" fill="#FFFFFF"/>
              <path class="mw05-ignition-esc-light" d="M2,18.5 a1,1 0 0,0 30,0" ng-attr-fill="#{{escButton.color}}"/>
              <use fill="#343434" width="36" height="36" ng-attr-href="{{escButton.href}}"/>
            </svg>
          </button>
        </div>`,
      replace: true,
      restrict: 'EA',
      link: function (scope) {
        var api = typeof bngApi !== 'undefined' ? bngApi :
          (typeof window !== 'undefined' && window.bngApi ? window.bngApi : null);
        var stylesheet = addStylesheet(CSS_URL);
        var streamsList = ['electrics'];
        var holdingMouseStart = false;
        var requestedEscButton = false;
        var driveAssistButtons = {};
        StreamsManager.add(streamsList);
        scope.display = readState({});
        scope.escButton = null;

        function driveAssistPriority(button) {
          var label = [button.id, button.tooltip, button.name].filter(Boolean).join(' ').toLowerCase();
          // DSE and named drive-mode controllers must take the shared native
          // ESC spot when a vehicle exposes both them and a conventional ESC.
          if (/\bdse\b|drive[\s_-]?modes?/.test(label)) return 3;
          return String(button.id || '').toLowerCase() === 'esc' ? 1 : 2;
        }

        function syncDriveAssistButton() {
          var selected = null;
          Object.keys(driveAssistButtons).forEach(function (id) {
            var candidate = driveAssistButtons[id];
            if (!selected || driveAssistPriority(candidate) > driveAssistPriority(selected)) selected = candidate;
          });
          scope.escButton = selected;
        }

        function setIgnitionLevel(level) {
          if (api && typeof api.activeObjectLua === 'function') {
            api.activeObjectLua('electrics.setIgnitionLevel(' + level + ')');
          }
        }

        scope.beginStart = function (event) {
          if (event.button !== 0 || scope.display.mode === 'START' || scope.display.engineRunning) return;
          if (scope.display.mode === 'OFF') {
            // Ignition level 1 is the stock BeamNG accessory state: powered
            // accessories without engine ignition or starter.
            setIgnitionLevel(1);
            return;
          }
          holdingMouseStart = true;
          setIgnitionLevel(3);
          event.preventDefault();
        };

        scope.endStart = function () {
          if (!holdingMouseStart) return;
          holdingMouseStart = false;
          // Releasing the on-screen key releases only the starter.  Hardware
          // start shortcuts are left entirely to BeamNG's own input handling.
          setIgnitionLevel(2);
        };
        window.addEventListener('mouseup', scope.endStart);

        scope.activateEsc = function () {
          if (scope.escButton && api && typeof api.activeObjectLua === 'function' && scope.escButton.onClick) {
            api.activeObjectLua(scope.escButton.onClick);
          }
        };

        scope.$on('streamsUpdate', function (event, streams) {
          scope.display = readState(streams && streams.electrics);
          scope.$evalAsync();
        });

        scope.$on('ChangePowerTrainButtons', function (event, button) {
          // DriveModes uses the same native ESC icon for DSE (Vivace) and
          // other vehicle-specific mode selectors.  Preserve BeamNG's own
          // onClick callback so the button cycles the real selected mode.
          if (!button || button.icon !== 'powertrain_esc') return;
          var id = String(button.id || button.tooltip || 'esc');
          if (button.remove) {
            delete driveAssistButtons[id];
          } else {
            driveAssistButtons[id] = {
              id: id,
              color: String(button.color || 'FF6600').replace('#', ''),
              tooltip: button.tooltip || 'ESC',
              onClick: button.onClick || (id.toLowerCase() === 'esc' ? "controller.getControllerSafe('esc').toggleESCMode()" : ''),
              href: '/ui/assets/Sprites/svg-symbols.svg#powertrain_esc'
            };
          }
          syncDriveAssistButton();
          scope.$evalAsync();
        });

        function requestEscButton() {
          if (api && typeof api.activeObjectLua === 'function' && !requestedEscButton) {
            requestedEscButton = true;
            api.activeObjectLua('extensions.ui_simplePowertrainControl.updateButtons()');
          }
        }
        scope.$on('VehicleChange', function () { driveAssistButtons = {}; scope.escButton = null; requestedEscButton = false; requestEscButton(); });
        scope.$on('VehicleFocusChanged', function () { driveAssistButtons = {}; scope.escButton = null; requestedEscButton = false; requestEscButton(); });
        requestEscButton();

        scope.$on('$destroy', function () {
          window.removeEventListener('mouseup', scope.endStart);
          StreamsManager.remove(streamsList);
          if (stylesheet && stylesheet.parentNode) stylesheet.parentNode.removeChild(stylesheet);
        });
      }
    };
  }]);
})();
