/* 編年視圖：逐年事件密度時間軸（brush 縮放）+ 年份詳情 */
(function (Z) {
  "use strict";

  Z.views = Z.views || {};
  Z.views.chronicle = function (container, params) {
    container.appendChild(Z.viewHead("編年", "逐年事件密度時間軸：拖框縮放、雙擊復位；朱砂點為「臣光曰」所在年；點擊年柱查看該年全文。"));
    var chipBox = Z.el("div", "chip-row");
    var chartWrap = Z.el("div", "chronicle-chart-wrap");
    var note = Z.el("div", "chart-note");
    var detail = Z.el("div", "year-detail");
    container.appendChild(chipBox);
    container.appendChild(chartWrap);
    container.appendChild(note);
    container.appendChild(detail);
    chartWrap.appendChild(Z.loading());

    Z.fetchJSON("data/timeline.json").then(function (timeline) {
      chartWrap.innerHTML = "";
      if (!timeline.length) { chartWrap.appendChild(Z.empty()); return; }
      var state = {
        data: timeline,
        fullDomain: [timeline[0].y, timeline[timeline.length - 1].y + 1],
        domain: null,
        selectedYear: null,
        dynasty: params.d || ""
      };
      state.domain = state.fullDomain.slice();

      renderChips(chipBox, timeline, state, function () { draw(chartWrap, state, detail, note); });
      draw(chartWrap, state, detail, note);

      // 初始朝代過濾（從總覽跳入）
      if (state.dynasty) {
        var bands = Z.dynastyBands(timeline);
        var b = null;
        bands.forEach(function (x) { if (x.d === state.dynasty) b = x; });
        if (b) {
          state.domain = [b.ymin, b.ymax + 1];
          draw(chartWrap, state, detail, note);
          syncChips(chipBox, state.dynasty);
        }
      }
    }).catch(function () {
      chartWrap.innerHTML = "";
      chartWrap.appendChild(Z.errorBox());
    });
  };

  function renderChips(box, timeline, state, redraw) {
    box.innerHTML = "";
    var seen = [], i;
    Z.dynastyBands(timeline).forEach(function (b) {
      if (b.d && seen.indexOf(b.d) < 0) seen.push(b.d);
    });
    var all = Z.el("button", "chip" + (state.dynasty ? "" : " active"), "全部");
    all.addEventListener("click", function () {
      state.dynasty = "";
      state.domain = state.fullDomain.slice();
      syncChips(box, "");
      redraw();
    });
    box.appendChild(all);
    seen.forEach(function (d) {
      var c = Z.el("button", "chip" + (state.dynasty === d ? " active" : ""), Z.esc(d));
      c.dataset.d = d;
      c.addEventListener("click", function () {
        state.dynasty = d;
        var bands = Z.dynastyBands(state.data);
        for (i = 0; i < bands.length; i++) {
          if (bands[i].d === d) { state.domain = [bands[i].ymin, bands[i].ymax + 1]; break; }
        }
        syncChips(box, d);
        redraw();
      });
      box.appendChild(c);
    });
  }

  function syncChips(box, d) {
    Array.prototype.forEach.call(box.children, function (c, idx) {
      var cd = idx === 0 ? "" : (c.dataset.d || "");
      c.classList.toggle("active", cd === d);
    });
  }

  function draw(wrap, state, detail, note) {
    wrap.innerHTML = "";
    var width = Math.max(wrap.clientWidth || 1100, 320);
    var height = 210, padL = 8, padR = 8, padT = 18, padB = 34;
    var innerW = width - padL - padR, innerH = height - padT - padB;

    var svg = d3.select(wrap).append("svg")
      .attr("width", "100%").attr("height", height)
      .attr("viewBox", "0 0 " + width + " " + height);

    var x = d3.scaleLinear().domain(state.domain).range([padL, width - padR]);
    var visible = state.data.filter(function (t) {
      return t.y >= state.domain[0] && t.y < state.domain[1];
    });
    var maxN = d3.max(state.data, function (t) { return t.ne; }) || 1;
    var y = d3.scaleLinear().domain([0, maxN]).range([padT + innerH, padT + 12]);

    // 帝王在位背景帶
    var kings = Z.kingBands(state.data).filter(function (k) {
      return k.ymax >= state.domain[0] && k.ymin < state.domain[1];
    });
    var kg = svg.append("g");
    kings.forEach(function (k, i) {
      var x0 = Math.max(x(k.ymin), padL), x1 = Math.min(x(k.ymax + 1), width - padR);
      if (x1 <= x0) return;
      kg.append("rect")
        .attr("x", x0).attr("y", padT).attr("width", x1 - x0).attr("height", innerH)
        .attr("fill", i % 2 ? "rgba(185,151,91,.07)" : "rgba(185,151,91,.14)");
      if (x1 - x0 > 42) {
        kg.append("text")
          .attr("class", "band-label")
          .attr("x", (x0 + x1) / 2).attr("y", padT + innerH - 6)
          .attr("text-anchor", "middle").attr("font-size", 11.5)
          .attr("fill", "#a89a7c")
          .text(k.k || "");
      }
    });

    // 事件密度柱
    var bw = Math.max(innerW / Math.max(visible.length, 1), 1);
    svg.append("g").selectAll("rect.bar")
      .data(visible).enter().append("rect")
      .attr("class", "bar")
      .attr("x", function (t) { return x(t.y); })
      .attr("y", function (t) { return y(t.ne); })
      .attr("width", Math.max(bw - .5, .8))
      .attr("height", function (t) { return padT + innerH - y(t.ne); })
      .attr("fill", function (t) { return t.y === state.selectedYear ? "#9e2b25" : "#57534b"; })
      .attr("opacity", .85)
      .style("cursor", "pointer")
      .on("click", function (e, t) { selectYear(t, state, detail, wrap, note); })
      .append("title")
      .text(function (t) {
        return (t.l || Z.fmtYearFull(t.y)) + "\n事件 " + t.ne + (t.nc ? "　臣光曰 " + t.nc : "");
      });

    // 臣光曰年份朱砂點
    svg.append("g").selectAll("circle.comm")
      .data(visible.filter(function (t) { return t.nc > 0; }))
      .enter().append("circle")
      .attr("cx", function (t) { return x(t.y) + bw / 2; })
      .attr("cy", padT - 6)
      .attr("r", 3.2)
      .attr("fill", "#9e2b25")
      .style("cursor", "pointer")
      .on("click", function (e, t) { selectYear(t, state, detail, wrap, note); })
      .append("title")
      .text(function (t) { return (t.l || Z.fmtYearFull(t.y)) + "　臣光曰 " + t.nc + " 則"; });

    // X 軸
    var axis = d3.axisBottom(x)
      .ticks(Math.min(16, Math.floor(width / 64)))
      .tickFormat(function (v) { return v < 0 ? "前" + (-v) : String(v); });
    var gx = svg.append("g").attr("class", "axis")
      .attr("transform", "translate(0," + (padT + innerH) + ")")
      .call(axis);

    // brush 縮放
    var brush = d3.brushX()
      .extent([[padL, padT], [width - padR, padT + innerH]])
      .on("end", function (event) {
        if (!event.selection) return;
        var s = event.selection.map(x.invert);
        svg.select(".brush").call(brush.move, null);
        if (s[1] - s[0] < 1) s[1] = s[0] + 1;
        state.domain = [Math.floor(s[0]), Math.ceil(s[1])];
        draw(wrap, state, detail, note);
      });
    svg.append("g").attr("class", "brush").call(brush);
    svg.select(".brush .overlay").style("cursor", "crosshair");
    svg.on("dblclick", function () {
      state.domain = state.fullDomain.slice();
      draw(wrap, state, detail, note);
    });

    note.innerHTML =
      '<span class="dot-key">朱砂點＝該年有「臣光曰」</span>' +
      "<span>當前範圍：" + Z.esc(Z.fmtYear(Math.floor(state.domain[0]))) + " — " +
      Z.esc(Z.fmtYear(Math.ceil(state.domain[1]) - 1)) +
      "　（拖框縮放，雙擊復位，點柱看全文）</span>";
  }

  function selectYear(t, state, detail, wrap, note) {
    state.selectedYear = t.y;
    // 重繪以高亮（保持當前 domain）
    draw(wrap, state, detail, note);
    detail.innerHTML = "";
    detail.appendChild(Z.loading());

    Z.fetchJSON(Z.juanURL(t.j)).then(function (juan) {
      detail.innerHTML = "";
      var meta = Z.el("div", "year-meta");
      meta.appendChild(Z.el("div", "yl", Z.esc(t.l || Z.fmtYearFull(t.y))));
      meta.appendChild(Z.el("div", "ym",
        Z.esc(juan.juan_label || ("卷" + t.j)) +
        (t.k ? "　" + Z.esc(t.k) : "") +
        (t.g ? "　干支 " + Z.esc(t.g) : "") +
        (t.d ? "　" + Z.esc(t.d) + "朝" : "") +
        "　事件 " + t.ne + (t.nc ? "　臣光曰 " + t.nc : "")
      ));
      detail.appendChild(meta);

      var matches = Z.findYear(juan, t.y, t.l);
      if (!matches.length) {
        detail.appendChild(Z.empty("該年內容尚未整理入卷"));
        return;
      }
      matches.forEach(function (m) {
        detail.appendChild(Z.renderYearBlocks(m.year, {}));
      });
      detail.scrollIntoView({ behavior: "smooth", block: "start" });
    }).catch(function () {
      detail.innerHTML = "";
      detail.appendChild(Z.errorBox("卷 " + t.j + " 數據載入失敗"));
    });
  }
})(window.ZZTJ);
