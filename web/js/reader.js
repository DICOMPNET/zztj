/* 閱讀視圖：卷選擇（按紀分組）+ 帝王/年號錨點導航 + 全文 */
(function (Z) {
  "use strict";

  Z.views = Z.views || {};

  Z.views.read = function (container, params) {
    container.appendChild(Z.viewHead("閱讀", "按卷通讀全文；側欄為帝王、年號錨點。評論以朱砂邊欄呈現，校記可點開。"));

    var selRow = Z.el("div", "search-bar");
    var sel = Z.el("select");
    sel.style.minWidth = "300px";
    selRow.appendChild(sel);
    container.appendChild(selRow);

    var layout = Z.el("div", "reader-layout");
    var toc = Z.el("nav", "reader-toc");
    var body = Z.el("div", "reader-body");
    layout.appendChild(toc);
    layout.appendChild(body);
    container.appendChild(layout);
    body.appendChild(Z.loading());

    Z.fetchJSON("data/index.json").then(function (index) {
      if (!index.length) {
        body.innerHTML = "";
        body.appendChild(Z.empty("尚無卷數據"));
        return;
      }
      var groups = {}, order = [];
      index.forEach(function (j) {
        var ji = Z.jiOf(j.label, j.d);
        if (!groups[ji]) { groups[ji] = []; order.push(ji); }
        groups[ji].push(j);
      });
      order.forEach(function (ji) {
        var og = document.createElement("optgroup");
        og.label = ji;
        groups[ji].forEach(function (j) {
          var opt = document.createElement("option");
          opt.value = j.j;
          opt.textContent = "卷" + j.j + "　" + (j.label || "（標題未標）") +
            (j.span ? "　" + j.span.slice(0, 18) : "");
          og.appendChild(opt);
        });
        sel.appendChild(og);
      });
      var target = params.juan && groups && index.some(function (j) { return j.j === +params.juan; })
        ? +params.juan : index[0].j;
      sel.value = target;
      sel.addEventListener("change", function () {
        location.hash = "#/read/" + sel.value;
      });
      // 附篇（御製序、進書表等）
      Z.fetchJSON("data/extra.json").then(function (extras) {
        if (!extras || !extras.length) return;
        var og = document.createElement("optgroup");
        og.label = "附篇";
        extras.forEach(function (x) {
          var opt = document.createElement("option");
          opt.value = "extra:" + x.slug;
          opt.textContent = x.title + (x.author ? "　" + x.author : "");
          og.appendChild(opt);
        });
        sel.appendChild(og);
        if (params.juan && String(params.juan).indexOf("extra:") === 0) {
          sel.value = params.juan;
          loadExtra(toc, body, extras, String(params.juan).slice(6));
          return;
        }
      }).catch(function () {});
      if (params.juan && String(params.juan).indexOf("extra:") === 0) return;
      loadJuan(toc, body, target, params.y);
    }).catch(function () {
      body.innerHTML = "";
      body.appendChild(Z.errorBox());
    });
  };

  function loadJuan(toc, body, j, scrollYear) {
    toc.innerHTML = "";
    body.innerHTML = "";
    body.appendChild(Z.loading());
    Z.fetchJSON(Z.juanURL(j)).then(function (data) {
      body.innerHTML = "";

      var head = Z.el("div", "reader-head");
      head.appendChild(Z.el("h3", null, Z.esc(data.juan_label || ("卷" + data.juan))));
      var meta = [];
      if (data.dynasty) meta.push(data.dynasty + "朝");
      if (data.span) meta.push(data.span);
      if (meta.length) head.appendChild(Z.el("div", "span", Z.esc(meta.join("　"))));
      body.appendChild(head);

      var anyContent = false;
      (data.sections || []).forEach(function (sec, si) {
        if (sec.king) {
          body.appendChild(Z.el("div", "king-heading", Z.esc(sec.king)));
          toc.appendChild(Z.el("div", "toc-king", Z.esc(sec.king)));
        }
        (sec.years || []).forEach(function (y, yi) {
          anyContent = true;
          var anchorId = "y-" + si + "-" + yi;
          var h = Z.el("div", "year-heading",
            Z.esc(y.label || Z.fmtYearFull(y.year)) +
            (y.ganzhi ? '<span class="gz">' + Z.esc(y.ganzhi) + "</span>" : ""));
          h.id = anchorId;
          h.classList.add("year-anchor");
          body.appendChild(h);
          body.appendChild(Z.renderYearBlocks(y, {}));

          var a = Z.el("a", null, Z.esc(y.label || Z.fmtYearFull(y.year)));
          a.href = "javascript:void(0)";
          a.addEventListener("click", function () {
            document.getElementById(anchorId).scrollIntoView({ behavior: "smooth", block: "start" });
          });
          toc.appendChild(a);
        });
      });
      if (!anyContent) {
        toc.innerHTML = "";
        body.appendChild(Z.empty("該卷內容尚未整理"));
        return;
      }
      if (!toc.children.length) toc.appendChild(Z.empty("無目錄"));

      // 定位到指定年份
      if (scrollYear !== undefined && scrollYear !== null && scrollYear !== "") {
        var targetEl = null;
        (data.sections || []).forEach(function (sec, si) {
          (sec.years || []).forEach(function (y, yi) {
            if (String(y.year) === String(scrollYear)) targetEl = document.getElementById("y-" + si + "-" + yi);
          });
        });
        if (targetEl) setTimeout(function () {
          targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      }
    }).catch(function () {
      body.innerHTML = "";
      body.appendChild(Z.errorBox("卷 " + j + " 數據載入失敗"));
    });
  }
  function loadExtra(toc, body, extras, slug) {
    toc.innerHTML = "";
    body.innerHTML = "";
    var x = extras.find(function (e) { return e.slug === slug; });
    if (!x) { body.appendChild(Z.empty("附篇不存在")); return; }
    var head = Z.el("div", "reader-head");
    head.appendChild(Z.el("h3", null, Z.esc(x.title)));
    if (x.author) head.appendChild(Z.el("div", "span", Z.esc(x.author)));
    body.appendChild(head);
    x.paragraphs.forEach(function (p) {
      var el = Z.el("div", "block event");
      el.appendChild(Z.el("div", "block-text", Z.esc(p)));
      body.appendChild(el);
    });
  }
})(window.ZZTJ);
