/* 路由與導航（hash router） */
(function (Z) {
  "use strict";

  var NAV = {
    overview: "overview",
    chronicle: "chronicle",
    persons: "persons",
    events: "events",
    graph: "graph",
    read: "read"
  };

  function parseHash() {
    var raw = location.hash.replace(/^#\/?/, "");
    var qIdx = raw.indexOf("?");
    var query = {};
    if (qIdx >= 0) {
      raw.slice(qIdx + 1).split("&").forEach(function (kv) {
        var p = kv.split("=");
        if (p[0]) query[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");
      });
      raw = raw.slice(0, qIdx);
    }
    var parts = raw.split("/").filter(Boolean);
    var view = parts[0] || "overview";
    if (!NAV[view]) view = "overview";
    var params = query;
    if (view === "persons" && parts[1]) params.name = decodeURIComponent(parts[1]);
    if (view === "read" && parts[1]) params.juan = decodeURIComponent(parts[1]);
    return { view: view, params: params };
  }

  function route() {
    var r = parseHash();
    var container = document.getElementById("view");
    container.innerHTML = "";
    Array.prototype.forEach.call(
      document.querySelectorAll("#main-nav a"),
      function (a) { a.classList.toggle("active", a.dataset.view === r.view); }
    );
    window.scrollTo(0, 0);
    var fn = Z.views[r.view];
    if (fn) fn(container, r.params);
    else container.appendChild(Z.empty("視圖不存在"));
  }

  window.addEventListener("hashchange", route);
  document.addEventListener("DOMContentLoaded", route);
})(window.ZZTJ);
