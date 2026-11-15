/*
 * MW05 Minimap
 *
 * The map, roads, vehicle position and orientation are rendered by BeamNG's
 * native ui_apps_minimap_minimap extension. This app only forwards its
 * resizable screen rectangle to that renderer, so camera movement cannot
 * alter the vehicle position on the map.
 */
(function () {
  'use strict';

  var CSS_URL = '/ui/modules/apps/MW05Minimap/app.css';

  var addStylesheet = MW05Runtime.addStylesheet;

  angular.module('beamng.apps').directive('mw05Minimap', [function () {
    return {
      // The native BeamNG renderer supplies the map itself. The host only adds
      // the requested decorative circles around it.
      template: [
        '<div class="mw05-minimap-app" aria-label="MW05 native minimap">',
          '<div class="mw05-minimap-frame" aria-hidden="true"></div>',
        '</div>'
      ].join(''),
      replace: true,
      restrict: 'EA',
      link: function (scope, element) {
        var stylesheet = addStylesheet(CSS_URL);
        var root = element[0];
        var frameId = null;
        var live = true;
        var lastTransform = '';
        var lastSize = null;

        // Load the same renderer used by BeamNG's Navigation app.
        bngApi.engineLua('extensions.load("ui_apps_minimap_minimap")');

        function sendDrawTransform() {
          if (!live || !root) return;
          var rect = root.getBoundingClientRect();
          var screenWidth = window.innerWidth;
          var screenHeight = window.innerHeight;
          if (!screenWidth || !screenHeight || rect.width <= 0 || rect.height <= 0) return;

          // Keep the native renderer square, like BeamNG's circular Navigation app,
          // even when the user places the app in a rectangular layout slot.
          var size = Math.min(rect.width, rect.height);
          if (size !== lastSize) {
            root.style.setProperty('--mw05-map-size', size + 'px');
            lastSize = size;
          }
          var x = (rect.left + (rect.width - size) / 2) / screenWidth;
          var y = (rect.top + (rect.height - size) / 2) / screenHeight;
          var width = size / screenWidth;
          var height = size / screenHeight;
          if (x < 0 || y < 0 || x + width > 1 || y + height > 1) return;

          var transform = [x, y, width, height].map(function (value) {
            return value.toFixed(6);
          }).join(',');
          if (transform === lastTransform) return;
          lastTransform = transform;
          bngApi.engineLua('if ui_apps_minimap_minimap then ui_apps_minimap_minimap.setDrawTransform(' + transform + ') end');
        }

        function frame() {
          if (!live) return;
          sendDrawTransform();
          frameId = requestAnimationFrame(frame);
        }

        scope.$on('$destroy', function () {
          live = false;
          if (frameId) cancelAnimationFrame(frameId);
          bngApi.engineLua('if ui_apps_minimap_minimap then ui_apps_minimap_minimap.hide() end');
          if (stylesheet) stylesheet.release();
        });

        frame();
      }
    };
  }]);
})();
