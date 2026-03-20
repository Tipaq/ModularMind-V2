/**
 * ModularMind Mini-App SDK
 * Injected into iframe sandboxes. Communicates with parent via postMessage.
 */
(function () {
  "use strict";

  const APP_ID = window.__MM_APP_ID__ || "";
  const API_BASE = window.__MM_API_BASE__ || "";

  let _ready = false;
  let _metadata = {};
  const _listeners = {};
  const _pendingDialogs = {};
  let _dialogId = 0;

  function emit(type, data) {
    window.parent.postMessage({ source: "modularmind-sdk", type, data }, "*");
  }

  function on(type, callback) {
    if (!_listeners[type]) _listeners[type] = [];
    _listeners[type].push(callback);
  }

  function dispatch(type, data) {
    const handlers = _listeners[type] || [];
    handlers.forEach(function (h) { h(data); });
  }

  window.addEventListener("message", function (event) {
    if (!event.data || event.data.source !== "modularmind-parent") return;
    const { type, data } = event.data;

    if (type === "initialized") {
      _metadata = data || {};
      _ready = true;
      dispatch("ready", _metadata);
    } else if (type === "dialog-response") {
      const cb = _pendingDialogs[data.callbackId];
      if (cb) {
        cb(data.value);
        delete _pendingDialogs[data.callbackId];
      }
    } else if (type === "theme-changed") {
      dispatch("theme-changed", data);
    } else {
      dispatch(type, data);
    }
  });

  async function apiCall(method, path, body) {
    const url = API_BASE + path;
    const opts = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error("API " + res.status + ": " + (await res.text()));
    return res.json();
  }

  window.ModularMind = {
    get appId() { return APP_ID; },
    get user() { return _metadata.user || null; },
    get app() { return _metadata.app || null; },
    get theme() { return _metadata.theme || "light"; },

    ready: function () {
      emit("ready", { appId: APP_ID });
    },

    on: on,

    storage: {
      get: function (key) {
        return apiCall("GET", "/storage/" + encodeURIComponent(key)).then(function (r) { return r.value; });
      },
      set: function (key, value) {
        return apiCall("PUT", "/storage/" + encodeURIComponent(key), { value: value });
      },
      delete: function (key) {
        return apiCall("DELETE", "/storage/" + encodeURIComponent(key));
      },
      list: function () {
        return apiCall("GET", "/storage").then(function (r) { return r.map(function (e) { return e.key; }); });
      },
    },

    chat: {
      send: function (message) {
        emit("chat-send", { message: message });
      },
    },

    toast: function (message, level) {
      emit("toast", { message: message, level: level || "info" });
    },

    confirm: function (title, message) {
      return new Promise(function (resolve) {
        var id = ++_dialogId;
        _pendingDialogs[id] = resolve;
        emit("dialog", { callbackId: id, type: "confirm", title: title, message: message });
      });
    },

    prompt: function (title, message, defaultValue) {
      return new Promise(function (resolve) {
        var id = ++_dialogId;
        _pendingDialogs[id] = resolve;
        emit("dialog", { callbackId: id, type: "prompt", title: title, message: message, defaultValue: defaultValue });
      });
    },

    setTitle: function (title) {
      emit("set-title", { title: title });
    },

    download: function (filename, base64Data) {
      emit("download", { filename: filename, data: base64Data });
    },
  };
})();
