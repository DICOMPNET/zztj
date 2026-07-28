/* 公共工具：數據獲取、格式化、顏色、DOM 助手 */
window.ZZTJ = window.ZZTJ || {};

(function (Z) {
  "use strict";

  /* ---------- JSON 緩存 ---------- */
  var _cache = {};
  Z.fetchJSON = function (url) {
    if (!_cache[url]) {
      _cache[url] = fetch(url).then(function (r) {
        if (!r.ok) throw new Error(url + " -> " + r.status);
        return r.json();
      });
      _cache[url].catch(function () { delete _cache[url]; });
    }
    return _cache[url];
  };

  Z.juanURL = function (j) {
    return "data/juan/" + String(j).padStart(3, "0") + ".json";
  };

  /* ---------- 格式化 ---------- */
  Z.fmtYear = function (y) {
    if (y === null || y === undefined) return "";
    return y < 0 ? "前" + (-y) : String(y);
  };
  Z.fmtYearFull = function (y) {
    if (y === null || y === undefined) return "年份不詳";
    return y < 0 ? "西元前" + (-y) + "年" : "西元" + y + "年";
  };
  Z.fmtNum = function (n) {
    if (n === null || n === undefined) return "—";
    return Number(n).toLocaleString("en-US");
  };
  Z.esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };
  Z.highlight = function (text, terms) {
    var html = Z.esc(text);
    (terms || []).forEach(function (t) {
      if (!t) return;
      html = html.split(Z.esc(t)).join("<mark>" + Z.esc(t) + "</mark>");
    });
    return html;
  };

  /* ---------- 朝代顏色（沉穩礦物色） ---------- */
  var DYNASTY_COLORS = {
    "周": "#8a7a55", "秦": "#55504a", "漢": "#9e2b25", "魏": "#4f6d7a",
    "晉": "#6b5b73", "宋": "#5d7a5d", "齊": "#8a6d3b", "梁": "#7a4f5d",
    "陳": "#5d6d7a", "隋": "#6d5a3b", "唐": "#a2633a", "後梁": "#6a5a4a",
    "後唐": "#7a5a52", "後晉": "#4a5a6a", "後漢": "#5a4a5a", "後周": "#6a6a4a"
  };
  var FALLBACK_COLORS = ["#7a6a55", "#5d6d5d", "#6d5a6d", "#4f5d7a", "#7a5d4f"];
  var _fbIdx = {};
  Z.colorFor = function (name) {
    if (!name) return "#a89c82";
    if (DYNASTY_COLORS[name]) return DYNASTY_COLORS[name];
    if (!(name in _fbIdx)) _fbIdx[name] = Object.keys(_fbIdx).length % FALLBACK_COLORS.length;
    return FALLBACK_COLORS[_fbIdx[name]];
  };

  /* ---------- 紀名提取（周紀/秦紀/漢紀…） ---------- */
  var JI_RE = /(後梁|後唐|後晉|後漢|後周|周|秦|漢|魏|晉|宋|齊|梁|陳|隋|唐)紀/;
  Z.jiOf = function (label, dynasty) {
    var m = JI_RE.exec(label || "");
    if (m) return m[1] + "紀";
    if (dynasty) return dynasty + "紀";
    return "未標紀";
  };

  /* ---------- 朝代區間（由 timeline 連續段推導，空前向填充） ---------- */
  Z.dynastyBands = function (timeline) {
    var bands = [], cur = null, lastD = "";
    timeline.forEach(function (t) {
      var d = t.d || lastD;
      if (t.d) lastD = t.d;
      if (cur && cur.d === d) { cur.ymax = t.y; }
      else { cur = { d: d, ymin: t.y, ymax: t.y }; bands.push(cur); }
    });
    return bands;
  };

  /* ---------- 帝王在位區間（空前向填充） ---------- */
  Z.kingBands = function (timeline) {
    var bands = [], cur = null, lastK = "";
    timeline.forEach(function (t) {
      var k = t.k || lastK;
      if (t.k) lastK = t.k;
      if (cur && cur.k === k) { cur.ymax = t.y; }
      else { cur = { k: k, ymin: t.y, ymax: t.y }; bands.push(cur); }
    });
    return bands;
  };

  /* ---------- DOM 助手 ---------- */
  Z.el = function (tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };
  Z.loading = function (msg) {
    return Z.el("div", "loading", Z.esc(msg || "載入中…"));
  };
  Z.empty = function (msg) {
    return Z.el("div", "empty", Z.esc(msg || "暫無數據"));
  };
  Z.errorBox = function (msg) {
    return Z.el("div", "error-box", Z.esc(msg || "載入失敗，請稍後重試"));
  };

  /* 視圖通用頭部 */
  Z.viewHead = function (title, desc) {
    var frag = document.createDocumentFragment();
    frag.appendChild(Z.el("h2", "view-title", Z.esc(title)));
    if (desc) frag.appendChild(Z.el("p", "view-desc", desc));
    return frag;
  };
})(window.ZZTJ);
