/* 人物視圖：人物榜 + 人物詳情（活躍時間軸、關聯人物、原文段落） */
(function (Z) {
  "use strict";

  Z.views = Z.views || {};

  Z.views.persons = function (container, params) {
    if (params.name) return renderDetail(container, decodeURIComponent(params.name));
    renderList(container);
  };

  /* ---------- 人物榜 ---------- */
  function renderList(container) {
    container.appendChild(Z.viewHead("人物",
      "按出現頻次排序。<em style='font-style:normal;color:#9e2b25'>名錄由程序自動提取，或有噪聲</em>，僅作索引起居注之助。"));
    var toolbar = Z.el("div", "person-toolbar");
    var input = Z.el("input");
    input.type = "search";
    input.placeholder = "檢索人名…";
    input.style.width = "240px";
    toolbar.appendChild(input);
    var countNote = Z.el("span", "muted small");
    toolbar.appendChild(countNote);
    container.appendChild(toolbar);
    var gridBox = Z.el("div");
    gridBox.appendChild(Z.loading());
    container.appendChild(gridBox);

    Promise.all([Z.fetchJSON("data/persons.json"), Z.fetchJSON("data/timeline.json")])
      .then(function (res) {
        var persons = res[0];
        gridBox.innerHTML = "";
        if (!persons.length) { gridBox.appendChild(Z.empty()); return; }
        countNote.textContent = "共收錄 " + persons.length + " 人";

        function drawGrid(filter) {
          gridBox.innerHTML = "";
          var list = persons.filter(function (p) {
            return !filter || p.name.indexOf(filter) >= 0;
          }).slice(0, 120);
          if (!list.length) { gridBox.appendChild(Z.empty("無匹配人物")); return; }
          var grid = Z.el("div", "person-grid");
          list.forEach(function (p) { grid.appendChild(personCard(p)); });
          gridBox.appendChild(grid);
        }
        input.addEventListener("input", function () { drawGrid(input.value.trim()); });
        drawGrid("");
      })
      .catch(function () {
        gridBox.innerHTML = "";
        gridBox.appendChild(Z.errorBox());
      });
  }

  function personCard(p) {
    var card = Z.el("div", "card person-card");
    var head = Z.el("div");
    head.appendChild(Z.el("span", "pname", Z.esc(p.name)));
    var cnt = Z.el("span", "pcount", Z.fmtNum(p.count));
    cnt.style.float = "right";
    head.appendChild(cnt);
    card.appendChild(head);
    card.appendChild(Z.el("div", "pmeta",
      "活躍：" + Z.esc(Z.fmtYear(p.first)) + " — " + Z.esc(Z.fmtYear(p.last)) +
      (p.titles && p.titles.length ? "　" + Z.esc(p.titles.slice(0, 2).join("、")) : "")));
    var spark = Z.el("div", "spark");
    card.appendChild(spark);
    drawSpark(spark, p);
    card.addEventListener("click", function () {
      location.hash = "#/persons/" + encodeURIComponent(p.name);
    });
    return card;
  }

  /* 迷你 sparkline：refs 年份直方圖 */
  function bucketize(refs, first, last, n) {
    var years = refs.map(function (r) { return r.year; })
      .filter(function (y) { return y !== null && y !== undefined; });
    if (!years.length || first === null || last === null || first >= last) return null;
    var buckets = new Array(n).fill(0);
    years.forEach(function (y) {
      var i = Math.min(Math.floor((y - first) / (last - first + 1) * n), n - 1);
      buckets[Math.max(i, 0)]++;
    });
    return buckets;
  }

  function drawSpark(box, p) {
    var buckets = bucketize(p.refs || [], p.first, p.last, 24);
    if (!buckets) { box.innerHTML = '<span class="muted small">年份數據不足</span>'; return; }
    var w = 260, h = 34;
    var svg = d3.select(box).append("svg")
      .attr("width", "100%").attr("height", h)
      .attr("viewBox", "0 0 " + w + " " + h)
      .attr("preserveAspectRatio", "none");
    var max = d3.max(buckets) || 1;
    var bw = w / buckets.length;
    svg.selectAll("rect").data(buckets).enter().append("rect")
      .attr("x", function (d, i) { return i * bw; })
      .attr("y", function (d) { return h - (d / max) * (h - 3); })
      .attr("width", Math.max(bw - 1, 1))
      .attr("height", function (d) { return Math.max((d / max) * (h - 3), d ? 2 : 0); })
      .attr("fill", "#9e2b25").attr("opacity", .7);
  }

  /* ---------- 人物詳情 ---------- */
  function renderDetail(container, name) {
    container.appendChild(Z.loading());
    Promise.all([
      Z.fetchJSON("data/persons.json"),
      Z.fetchJSON("data/graph.json")
    ]).then(function (res) {
      container.innerHTML = "";
      var p = null;
      res[0].forEach(function (x) { if (x.name === name) p = x; });
      if (!p) {
        container.appendChild(Z.el("a", "back-link", "← 返回人物榜")).href = "#/persons";
        container.appendChild(Z.empty("未找到人物「" + name + "」"));
        return;
      }
      var back = Z.el("a", "back-link", "← 返回人物榜");
      back.href = "#/persons";
      container.appendChild(back);

      container.appendChild(Z.viewHead(p.name,
        "出現 " + Z.fmtNum(p.count) + " 次　·　活躍於 " +
        Z.esc(Z.fmtYear(p.first)) + " — " + Z.esc(Z.fmtYear(p.last)) +
        "　·　<span style='color:#8a8478'>名錄自動提取，或有噪聲</span>"));

      /* 活躍年分布 */
      var panelA = Z.el("section", "panel");
      panelA.appendChild(Z.el("h2", null, '活躍年分布 <span class="en">ACTIVITY</span>'));
      var chartBox = Z.el("div", "card");
      panelA.appendChild(chartBox);
      container.appendChild(panelA);
      drawActivity(chartBox, p);

      /* 關聯人物 */
      var panelR = Z.el("section", "panel");
      panelR.appendChild(Z.el("h2", null, '關聯人物 <span class="en">NETWORK</span>'));
      panelR.appendChild(Z.el("p", "hint", "依同年共現次數排序；點擊查看該人物。"));
      var relBox = Z.el("div");
      panelR.appendChild(relBox);
      container.appendChild(panelR);
      drawRelated(relBox, name, res[1]);

      /* 原文段落 */
      var panelP = Z.el("section", "panel");
      panelP.appendChild(Z.el("h2", null, '原文段落 <span class="en">PASSAGES</span>'));
      panelP.appendChild(Z.el("p", "hint", "列出提及該人物的原文（含上下文），按卷年排序。"));
      var passBox = Z.el("div");
      passBox.appendChild(Z.loading());
      panelP.appendChild(passBox);
      container.appendChild(panelP);
      drawPassages(passBox, p, 0);
    }).catch(function () {
      container.innerHTML = "";
      container.appendChild(Z.errorBox());
    });
  }

  function drawActivity(box, p) {
    var buckets = bucketize(p.refs || [], p.first, p.last, 40);
    if (!buckets) { box.innerHTML = ""; box.appendChild(Z.empty("年份數據不足，無法繪製")); return; }
    var w = Math.max(box.clientWidth || 900, 320), h = 130, padB = 26, padL = 10, padR = 10;
    var svg = d3.select(box).append("svg")
      .attr("width", "100%").attr("height", h)
      .attr("viewBox", "0 0 " + w + " " + h);
    var max = d3.max(buckets) || 1;
    var bw = (w - padL - padR) / buckets.length;
    var span = (p.last - p.first + 1);
    svg.selectAll("rect").data(buckets).enter().append("rect")
      .attr("x", function (d, i) { return padL + i * bw; })
      .attr("y", function (d) { return h - padB - (d / max) * (h - padB - 8); })
      .attr("width", Math.max(bw - 1, 1))
      .attr("height", function (d) { return Math.max((d / max) * (h - padB - 8), d ? 2 : 0); })
      .attr("fill", "#57534b").attr("opacity", .8)
      .append("title")
      .text(function (d, i) {
        var y0 = Math.round(p.first + span * i / buckets.length);
        return "約 " + Z.fmtYear(y0) + " 年：" + d + " 次";
      });
    var axisG = svg.append("g").attr("class", "axis")
      .attr("transform", "translate(0," + (h - padB + 4) + ")");
    [0, .25, .5, .75, 1].forEach(function (f) {
      var yr = Math.round(p.first + span * f);
      axisG.append("text")
        .attr("x", padL + (w - padL - padR) * f)
        .attr("y", 14)
        .attr("text-anchor", f === 0 ? "start" : (f === 1 ? "end" : "middle"))
        .text(Z.fmtYear(yr));
    });
  }

  function drawRelated(box, name, graph) {
    box.innerHTML = "";
    var rels = [];
    (graph.links || []).forEach(function (l) {
      if (l.s === name) rels.push({ name: l.t, w: l.w });
      else if (l.t === name) rels.push({ name: l.s, w: l.w });
    });
    rels.sort(function (a, b) { return b.w - a.w; });
    if (!rels.length) { box.appendChild(Z.empty("暫無關聯數據")); return; }
    rels.slice(0, 40).forEach(function (r) {
      var chip = Z.el("span", "rel-chip",
        Z.esc(r.name) + '<span class="w">共現 ' + r.w + "</span>");
      chip.addEventListener("click", function () {
        location.hash = "#/persons/" + encodeURIComponent(r.name);
      });
      box.appendChild(chip);
    });
  }

  function drawPassages(box, p, page) {
    var PAGE = 12;
    // 去重（同卷同年只取一次），過濾無年份 refs 放到最後
    var seen = {}, refs = [];
    (p.refs || []).forEach(function (r) {
      var key = r.juan + "|" + (r.year === null ? "?" : r.year);
      if (!seen[key]) { seen[key] = 1; refs.push(r); }
    });
    var slice = refs.slice(page * PAGE, (page + 1) * PAGE);
    if (!slice.length && page === 0) {
      box.innerHTML = "";
      box.appendChild(Z.empty("無原文引用"));
      return;
    }
    // 按卷分組拉取
    var byJuan = {};
    slice.forEach(function (r) { (byJuan[r.juan] = byJuan[r.juan] || []).push(r); });

    Promise.all(Object.keys(byJuan).map(function (j) {
      return Z.fetchJSON(Z.juanURL(j)).then(function (data) { return { j: j, data: data }; })
        .catch(function () { return null; });
    })).then(function (loaded) {
      if (page === 0) box.innerHTML = "";
      else {
        var old = box.querySelector(".more-wrap");
        if (old) old.remove();
      }
      loaded.forEach(function (item) {
        if (!item) return;
        byJuan[item.j].forEach(function (r) {
          var matches = Z.findYear(item.data, r.year, r.label);
          var shown = 0;
          matches.forEach(function (m) {
            (m.year.blocks || []).forEach(function (b) {
              if ((b.text || "").indexOf(p.name) < 0) return;
              shown++;
              var meta = Z.esc(item.data.juan_label || ("卷" + item.j)) +
                (m.year.label ? "　" + Z.esc(m.year.label) : "") +
                (m.sec.king ? "　" + Z.esc(m.sec.king) : "");
              box.appendChild(Z.renderBlock(b, { meta: meta, highlightTerms: [p.name] }));
            });
          });
          if (!shown) {
            var lbl = r.label || (r.year !== null ? Z.fmtYearFull(r.year) : "");
            var note = Z.el("p", "muted small",
              "（" + Z.esc(item.data.juan_label || ("卷" + item.j)) +
              (lbl ? "　" + Z.esc(lbl) : "") + "：該條目未直接提及此名，或為異稱）");
            box.appendChild(note);
          }
        });
      });
      if ((page + 1) * PAGE < refs.length) {
        var moreWrap = Z.el("div", "more-wrap");
        moreWrap.style.textAlign = "center";
        var btn = Z.el("button", "btn ghost", "載入更多（餘 " + (refs.length - (page + 1) * PAGE) + " 處）");
        btn.addEventListener("click", function () { drawPassages(box, p, page + 1); });
        moreWrap.appendChild(btn);
        box.appendChild(moreWrap);
      }
    });
  }
})(window.ZZTJ);
