/* Shared source bundled into each app.js by build.ps1. No external loader. */
var MW05Runtime = (function (host) {
  'use strict';
  if (host.MW05Runtime && host.MW05Runtime.version === 2) {
    host.MW05Runtime.differentialIcon = differentialIcon;
    return host.MW05Runtime;
  }
  var styles = Object.create(null);
  var instanceSequence = 0;
  var sessionId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  var pendingLua = Object.create(null);
  var pendingLuaCount = 0;
  var LUA_TIMEOUT_MS = 2000;
  var LUA_QUERY_BUDGET = 8;
  var LUA_TOTAL_BUDGET = 10; // Keep two slots for commands while queries wait.

  function uniqueId() { return 'mw05-' + sessionId + '-' + (++instanceSequence); }

  // Lua 5.1 literals, not JSON escape sequences. Three decimal digits prevent
  // control-character escapes from swallowing a following digit in an ID.
  function luaLiteral(value) {
    if (value === null || value === undefined) return 'nil';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
      if (!isFinite(value)) throw new TypeError('Non-finite Lua number');
      return String(value);
    }
    if (typeof value !== 'string') throw new TypeError('Unsupported Lua literal');
    var result = '"';
    for (var i = 0; i < value.length; i++) {
      var code = value.charCodeAt(i), character = value.charAt(i);
      if (code >= 0xD800 && code <= 0xDBFF) {
        var next = value.charCodeAt(i + 1);
        if (!(next >= 0xDC00 && next <= 0xDFFF)) throw new TypeError('Unpaired UTF-16 surrogate');
        result += character + value.charAt(++i);
      } else if (code >= 0xDC00 && code <= 0xDFFF) {
        throw new TypeError('Unpaired UTF-16 surrogate');
      } else if (character === '"' || character === '\\') {
        result += '\\' + character;
      } else if (code < 32 || code === 127) {
        result += '\\' + ('00' + code).slice(-3);
      } else {
        result += character;
      }
    }
    return result + '"';
  }

  // Scope every SVG definition and its references to the compiled instance.
  // Stylesheets consume the inherited --<original-id> custom properties.
  function svgTemplate(markup) {
    return function () {
      var prefix = uniqueId(), ids = Object.create(null), variables = [];
      var result = markup.replace(/\bid="([A-Za-z][\w:-]*)"/g, function (match, id) {
        if (!ids[id]) { ids[id] = prefix + '-' + id; variables.push('--' + id + ':url(#' + ids[id] + ')'); }
        return 'id="' + ids[id] + '"';
      });
      result = result.replace(/url\(#([A-Za-z][\w:-]*)\)/g, function (match, id) {
        return ids[id] ? 'url(#' + ids[id] + ')' : match;
      });
      result = result.replace(/((?:xlink:)?href=")#([A-Za-z][\w:-]*)(")/g, function (match, start, id, end) {
        return ids[id] ? start + '#' + ids[id] + end : match;
      });
      return variables.length ? result.replace(/^(\s*<[\w:-]+)/, '$1 style="' + variables.join(';') + '"') : result;
    };
  }

  // Use a bounded MW05 response channel instead of bngApi's persistent callback
  // table: a missing vehicle/Lua reply cannot leak callbacks inside BeamNG.
  function luaClient(scope, api) {
    var clientId = uniqueId(), topics = Object.create(null), live = true;
    function release(entry) {
      if (pendingLua[entry.id] !== entry) return false;
      clearTimeout(entry.timer);
      delete pendingLua[entry.id];
      pendingLuaCount--;
      entry.topic.pending = null;
      return true;
    }
    function failed(entry) {
      if (!release(entry)) return;
      entry.topic.failures = Math.min(entry.topic.failures + 1, 6);
      entry.topic.nextAt = Date.now() + Math.min(8000, 250 * Math.pow(2, entry.topic.failures - 1));
    }
    function reset() {
      Object.keys(topics).forEach(function (key) {
        if (topics[key].pending) release(topics[key].pending);
      });
      topics = Object.create(null);
    }
    scope.$on('MW05LuaResponse', function (event, reply) {
      var entry = reply && pendingLua[reply.id];
      if (!live || !entry || entry.clientId !== clientId) return;
      if (reply.ok !== true) { failed(entry); return; }
      release(entry);
      entry.topic.failures = 0;
      entry.topic.nextAt = 0;
      entry.callback(reply.value);
    });
    scope.$on('VehicleChange', reset);
    scope.$on('VehicleFocusChanged', reset);
    scope.$on('$destroy', function () { live = false; reset(); });
    return { request: function (topicName, expression, callback, command) {
      if (!live || !api || typeof api.activeObjectLua !== 'function') return false;
      if (typeof expression !== 'string' || typeof callback !== 'function') return false;
      var topic = topics[topicName] || (topics[topicName] = {pending:null, failures:0, nextAt:0});
      if (topic.pending || Date.now() < topic.nextAt || pendingLuaCount >= (command ? LUA_TOTAL_BUDGET : LUA_QUERY_BUDGET)) return false;
      var entry = {id:uniqueId(), clientId:clientId, topic:topic, callback:callback, timer:null};
      topic.pending = entry;
      pendingLua[entry.id] = entry;
      pendingLuaCount++;
      entry.timer = setTimeout(function () { failed(entry); }, LUA_TIMEOUT_MS);
      var script = '(function()\nlocal requestId=' + luaLiteral(entry.id) + '\n' +
        'local ok,value=pcall(function()\nreturn (\n' + expression + '\n)\nend)\n' +
        'if not ok then value=nil end\n' +
        'guihooks.trigger("MW05LuaResponse",{id=requestId,ok=ok,value=value})\nend)()';
      try { api.activeObjectLua(script); } catch (error) { failed(entry); return false; }
      return true;
    } };
  }

  function addStylesheet(path) {
    var entry = styles[path];
    if (!entry) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = path;
      link.setAttribute('data-mw05-css', path);
      document.head.appendChild(link);
      entry = styles[path] = { link: link, references: 0 };
    }
    entry.references++;
    var released = false;
    return { release: function () {
      if (released) return;
      released = true;
      if (--entry.references === 0) {
        if (entry.link.parentNode) entry.link.parentNode.removeChild(entry.link);
        delete styles[path];
      }
    } };
  }

  // Coalesce input updates into one frame and cancel work on app removal.
  function renderer(scope, update) {
    var frame = null;
    var live = true;
    scope.$on('$destroy', function () {
      live = false;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    });
    return function () {
      if (!live || frame !== null) return;
      frame = requestAnimationFrame(function (time) {
        frame = null;
        if (live) update(time);
      });
    };
  }

  // Avoid Angular work when every displayed property is unchanged.
  function publisher(scope) {
    var previous = Object.create(null);
    return function () {
      var changed = !!scope.debug;
      Object.keys(scope.display).forEach(function (key) {
        if (previous[key] !== scope.display[key]) changed = true;
        previous[key] = scope.display[key];
      });
      if (changed) scope.$evalAsync();
    };
  }

  // Reject callbacks from old vehicles, removed apps, or out-of-order replies.
  function vehicleState(scope, reset) {
    var live = true, generation = 0, sequence = 0, applied = 0;
    function invalidate() { generation++; reset(); }
    scope.$on('VehicleChange', invalidate);
    scope.$on('VehicleFocusChanged', invalidate);
    scope.$on('$destroy', function () { live = false; generation++; });
    return { guard: function () {
      var current = generation;
      return function () { return live && current === generation; };
    }, capture: function () {
      var current = generation, id = ++sequence;
      return function () {
        if (!live || current !== generation || id < applied) return false;
        applied = id;
        return true;
      };
    } };
  }

  function memoize(fn, limit) {
    var cache = new Map();
    return function () {
      var key = Array.prototype.join.call(arguments, '|');
      if (cache.has(key)) return cache.get(key);
      var value = fn.apply(null, arguments);
      if (cache.size >= limit) cache.delete(cache.keys().next().value);
      cache.set(key, value);
      return value;
    };
  }

  // Drive-mode controllers and direct device controls publish different stock
  // artwork for the same locker. Change only the artwork, never its command.
  function differentialIcon(button) {
    var icon = String(button && button.icon || '');
    var generic = /^powertrain_differential_(open|closed)$/.exec(icon);
    if (!generic) return icon;
    var label = (String(button.id || '') + ' ' + String(button.tooltip || '')).toLowerCase();
    var axle = null;
    if (/front|diff(?:erential)?[_-]f(?:$|[\s_-]|\d)/.test(label)) axle = 'front';
    else if (/rear|diff(?:erential)?[_-]r(?:$|[\s_-]|\d)/.test(label)) axle = 'rear';
    else if (/middle|cent(?:er|re)|inter[ _-]?axle/.test(label)) axle = 'middle';
    // Keep generic artwork if the axle cannot be identified, and retain
    // distinct LSD/torque-vectoring symbols rather than labelling them lockers.
    return axle ? 'powertrain_differential_' + axle + (generic[1] === 'closed' ? '_locked' : '_default') : icon;
  }

  host.MW05Runtime = {version:2, addStylesheet:addStylesheet, renderer:renderer,
    publisher:publisher, vehicleState:vehicleState, memoize:memoize,
    differentialIcon:differentialIcon, luaLiteral:luaLiteral,
    svgTemplate:svgTemplate, luaClient:luaClient};
  return host.MW05Runtime;
})(typeof window !== 'undefined' ? window : globalThis);
