// Product floor flags for the BMAD Accelerator preview. Copied into every generated app as
// public/bacc-floor.js and loaded on every page. It does nothing on its own: only when the
// accelerator's preview asks (window.postMessage) does it mark each element that carries a
// data-floor="F12" attribute with a small chip, so the client can keep, change or remove
// the features that were assumed for them. Safe to leave in a real deployment.
(function () {
  if (window.top === window) return;
  var on = false;
  var items = {};
  var layer = null;
  var obs = null;

  function clear() {
    if (layer) layer.remove();
    layer = null;
    if (obs) obs.takeRecords();
  }

  function draw() {
    clear();
    if (!on) return;
    layer = document.createElement("div");
    layer.setAttribute("data-bacc-floor-layer", "");
    layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;z-index:2147483646;pointer-events:none";
    document.body.appendChild(layer);
    var seen = {};
    document.querySelectorAll("[data-floor]").forEach(function (el) {
      var ids = String(el.getAttribute("data-floor")).toUpperCase().split(/[\s,]+/).filter(Boolean);
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      ids.forEach(function (id, n) {
        var it = items[id];
        if (!it || it.state !== "assumed" || seen[id]) return;
        seen[id] = true;
        var box = document.createElement("div");
        box.style.cssText =
          "position:absolute;pointer-events:none;border:2px dashed #7c3aed;border-radius:8px;background:rgba(124,58,237,.06);" +
          "left:" + (r.left + scrollX) + "px;top:" + (r.top + scrollY) + "px;width:" + r.width + "px;height:" + r.height + "px";
        var chip = document.createElement("button");
        chip.type = "button";
        chip.textContent = id + " assumed \u00b7 keep, change or remove";
        chip.title = it.text;
        chip.style.cssText =
          "all:unset;box-sizing:border-box;white-space:nowrap;position:absolute;pointer-events:auto;cursor:pointer;left:" + (r.left + scrollX + 4) + "px;top:" + (r.top + scrollY + 4 + n * 26) + "px;" +
          "font:600 12px/1 system-ui,sans-serif;color:#fff;background:#7c3aed;border:0;border-radius:999px;padding:6px 10px;box-shadow:0 2px 8px rgba(0,0,0,.2)";
        chip.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          parent.postMessage({ type: "bacc-floor-pick", id: id }, "*");
        });
        layer.appendChild(box);
        layer.appendChild(chip);
        // Keep the chip on screen when the feature sits at the right edge.
        var over = r.left + 4 + chip.offsetWidth - (document.documentElement.clientWidth - 4);
        if (over > 0) chip.style.left = Math.max(4, r.left + scrollX + 4 - over) + "px";
      });
    });
    if (obs) obs.takeRecords();
    var found = Object.keys(seen).length;
    parent.postMessage({ type: "bacc-floor-count", count: found, path: location.pathname }, "*");
  }

  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (d.type !== "bacc-floor-show") return;
    on = !!d.on;
    items = d.items || {};
    draw();
  });
  var t;
  function later() {
    clearTimeout(t);
    t = setTimeout(draw, 150);
  }
  window.addEventListener("resize", later);
  obs = new MutationObserver(function (m) {
    if (on && m.some(function (x) { return !layer || (x.target !== layer.parentNode && !layer.contains(x.target)); })) later();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  parent.postMessage({ type: "bacc-floor-ready", path: location.pathname }, "*");
})();
