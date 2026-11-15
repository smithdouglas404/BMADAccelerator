// Working Backwards Studio bridge. Load it on every page of a Studio-built pilot:
//   <script src="/studio-bridge.js" defer></script>
// It does nothing on its own. Inside the Studio's Vibe review, it tells the Studio which page the owner
// is looking at and how far they scrolled, so a click, a circled region or a capture lands on the right
// place. It sends no data anywhere else and reads nothing from the page.
(function () {
  if (window.parent === window) return;
  var last = "";
  function send() {
    var msg = { type: "studio-location", path: location.pathname + location.search + location.hash, scrollY: Math.round(window.scrollY || 0) };
    var key = msg.path + "|" + msg.scrollY;
    if (key === last) return;
    last = key;
    try { window.parent.postMessage(msg, "*"); } catch (e) {}
  }
  ["pushState", "replaceState"].forEach(function (k) {
    var orig = history[k];
    history[k] = function () { var r = orig.apply(this, arguments); setTimeout(send, 0); return r; };
  });
  window.addEventListener("popstate", send);
  window.addEventListener("hashchange", send);
  var t = null;
  window.addEventListener("scroll", function () { if (t) return; t = setTimeout(function () { t = null; send(); }, 200); }, { passive: true });
  window.addEventListener("load", send);
  send();
})();
