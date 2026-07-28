/* 事件視圖：全文搜索（/api/search）+ 按紀/卷瀏覽 */
(function (Z) {
  "use strict";

  Z.views = Z.views || {};

  Z.views.events = function (container) {
    container.appendChild(Z.viewHead("事件",
      "全文檢索（空格分詞，AND 匹配，至多 50 條）；或按紀、卷瀏覽原文。"));

    /* 搜索欄 */
    var bar = Z.el("div", "search-bar");
    var input = Z.el("input");
    input.type = "search";
    input.placeholder = "輸入關鍵詞，如：智伯　或　荊軻 秦王";
    var btn = Z.el("button", "btn", "檢索");
    bar.appendChild(input);
    bar.appendChild(btn);
    container.appendChild(bar);

    var resultBox = Z.el("div");
    container.appendChild(resultBox);

    function doSearch() {
      var q = input.value.trim();
      if (!q) return;
      var terms = q.split(/\s+/);
      resultBox.innerHTML = "";
      resultBox.appendChild(Z.loading("檢索中…"));
      fetch("api/search?q=" + encodeURIComponent(q))
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        })
        .then(function (res) {
          resultBox.innerHTML = "";
          if (!res.results.length) {
            resultBox.appendChild(Z.empty("未檢得「" + q + "」相關條目"));
            return;
          }
          resultBox.appendChild(Z.el("p", "muted small",
            "檢得 " + res.count + " 條（上限 50）"));
          res.results.forEach(function (r) {
            var card = Z.el("article", "block" + (r.type === "commentary" ? " commentary" : ""));
            var head = Z.el("div", "block-head");
            head.appendChild(Z.el("span",
              "tag-type" + (r.type === "commentary" ? " comm" : ""),
              r.type === "commentary" ? "臣光曰" : "事件"));
            head.appendChild(Z.el("span", "search-result-meta",
              Z.esc(r.juan_label) + (r.label ? "　" + Z.esc(r.label) : "") +
              (r.king ? "　" + Z.esc(r.king) : "") +
              (r.has_notes ? "　有校記" : "")));
            card.appendChild(head);
            card.appendChild(Z.el("div", "btext", Z.highlight(r.snippet, terms)));
            card.style.cursor = "pointer";
            card.addEventListener("click", function () {
              var hash = "#/read/" + r.juan;
              if (r.year !== null && r.year !== undefined) hash += "?y=" + r.year;
              location.hash = hash;
            });
            resultBox.appendChild(card);
          });
        })
        .catch(function () {
          resultBox.innerHTML = "";
          resultBox.appendChild(Z.errorBox("檢索服務暫不可用"));
        });
    }
    btn.addEventListener("click", doSearch);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") doSearch(); });

    /* 按紀/卷瀏覽 */
    var browsePanel = Z.el("section", "panel");
    browsePanel.style.marginTop = "30px";
    browsePanel.appendChild(Z.el("h2", null, '按卷瀏覽 <span class="en">BROWSE</span>'));
    var selRow = Z.el("div", "search-bar");
    var juanSel = Z.el("select");
    juanSel.style.minWidth = "260px";
    selRow.appendChild(juanSel);
    browsePanel.appendChild(selRow);
    var juanBox = Z.el("div");
    browsePanel.appendChild(juanBox);
    container.appendChild(browsePanel);

    Z.fetchJSON("data/index.json").then(function (index) {
      if (!index.length) { juanBox.appendChild(Z.empty()); return; }
      // 按紀分組
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
            "　" + (j.blocks || 0) + " 條";
          og.appendChild(opt);
        });
        juanSel.appendChild(og);
      });
      juanSel.addEventListener("change", function () {
        loadJuan(juanBox, +juanSel.value);
      });
      loadJuan(juanBox, index[0].j);
    }).catch(function () {
      juanBox.innerHTML = "";
      juanBox.appendChild(Z.errorBox());
    });
  };

  function loadJuan(box, j) {
    box.innerHTML = "";
    box.appendChild(Z.loading());
    Z.fetchJSON(Z.juanURL(j)).then(function (data) {
      box.innerHTML = "";
      (data.sections || []).forEach(function (sec) {
        if (sec.king) box.appendChild(Z.el("div", "king-heading", Z.esc(sec.king)));
        (sec.years || []).forEach(function (y) {
          var h = Z.el("div", "year-heading",
            Z.esc(y.label || Z.fmtYearFull(y.year)) +
            (y.ganzhi ? '<span class="gz">' + Z.esc(y.ganzhi) + "</span>" : ""));
          box.appendChild(h);
          box.appendChild(Z.renderYearBlocks(y, {}));
        });
      });
      if (!(data.sections || []).length) box.appendChild(Z.empty("該卷內容尚未整理"));
    }).catch(function () {
      box.innerHTML = "";
      box.appendChild(Z.errorBox("卷 " + j + " 數據載入失敗"));
    });
  }
})(window.ZZTJ);
