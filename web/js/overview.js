/* 總覽視圖：定位語、統計卡片、朝代條帶圖、十六紀條形圖 */
(function (Z) {
  "use strict";

  Z.views = Z.views || {};
  Z.views.overview = function (container) {
    container.appendChild(Z.loading());
    Promise.all([
      Z.fetchJSON("data/stats.json"),
      Z.fetchJSON("data/index.json"),
      Z.fetchJSON("data/timeline.json")
    ]).then(function (res) {
      container.innerHTML = "";
      render(container, res[0], res[1], res[2]);
    }).catch(function () {
      container.innerHTML = "";
      container.appendChild(Z.errorBox());
    });
  };

  function render(container, stats, index, timeline) {
    /* ---------- Hero ---------- */
    var hero = Z.el("section", "hero");
    hero.appendChild(Z.el("h1", null, "資治通鑑"));
    hero.appendChild(Z.el(
      "p", "tagline",
      "起戰國，訖五代，<em>千三百六十二年</em>。" +
      (stats.juan ? "全書 " + Z.esc(stats.juan) + " 卷全文收錄，附御製序、進書表、臣光曰評論與校記。" : "")
    ));
    hero.appendChild(Z.el("div", "hero-rule"));
    container.appendChild(hero);

    /* ---------- 統計卡片 ---------- */
    var cards = [
      { num: stats.juan, label: "卷", unit: "卷" },
      { num: stats.years, label: "記事年數", unit: "年" },
      { num: stats.events, label: "事件", unit: "條" },
      { num: stats.commentaries, label: "臣光曰", unit: "則" },
      { num: stats.chars, label: "總字數", unit: "字" }
    ];
    var grid = Z.el("div", "stat-grid");
    cards.forEach(function (c) {
      var card = Z.el("div", "stat-card");
      card.appendChild(Z.el("div", "stat-num",
        Z.fmtNum(c.num) + '<span class="unit">' + Z.esc(c.unit) + "</span>"));
      card.appendChild(Z.el("div", "stat-label", Z.esc(c.label)));
      grid.appendChild(card);
    });
    container.appendChild(grid);

    /* ---------- 朝代條帶圖 ---------- */
    var bandPanel = Z.el("section", "panel");
    bandPanel.appendChild(Z.el("h2", null, '朝代沿革 <span class="en">DYNASTIES</span>'));
    bandPanel.appendChild(Z.el("p", "hint", "橫軸為年份（西元前為負），色塊寬度為朝代跨度；點擊進入編年視圖。"));
    var bandBox = Z.el("div");
    bandPanel.appendChild(bandBox);
    container.appendChild(bandPanel);
    drawDynastyBands(bandBox, timeline);

    /* ---------- 各紀條形圖 ---------- */
    var jiPanel = Z.el("section", "panel");
    jiPanel.appendChild(Z.el("h2", null, '十六紀 <span class="en">BOOKS</span>'));
    jiPanel.appendChild(Z.el("p", "hint", "各紀所轄卷數與事件條數；點擊進入閱讀。"));
    var jiBox = Z.el("div");
    jiPanel.appendChild(jiBox);
    container.appendChild(jiPanel);
    drawJiBars(jiBox, index);
  }

  function drawDynastyBands(box, timeline) {
    if (!timeline || !timeline.length) { box.appendChild(Z.empty()); return; }
    var bands = Z.dynastyBands(timeline);
    var ymin = timeline[0].y, ymax = timeline[timeline.length - 1].y;

    var width = Math.max(box.clientWidth || 900, 320);
    var height = 120, padL = 44, padR = 14, padT = 14, padB = 30;
    var svg = d3.select(box).append("svg")
      .attr("width", "100%").attr("height", height)
      .attr("viewBox", "0 0 " + width + " " + height);

    var x = d3.scaleLinear().domain([ymin, ymax + 1]).range([padL, width - padR]);
    var bandH = 40, bandY = padT + 8;

    svg.selectAll("rect.dyn-band")
      .data(bands).enter().append("rect")
      .attr("class", "dyn-band")
      .attr("x", function (d) { return x(d.ymin); })
      .attr("y", bandY)
      .attr("width", function (d) { return Math.max(x(d.ymax + 1) - x(d.ymin), 2); })
      .attr("height", bandH)
      .attr("rx", 2)
      .attr("fill", function (d) { return Z.colorFor(d.d); })
      .attr("opacity", .85)
      .on("click", function (e, d) {
        if (d.d) location.hash = "#/chronicle?d=" + encodeURIComponent(d.d);
      })
      .append("title")
      .text(function (d) {
        return (d.d || "朝代未標") + "　" + Z.fmtYear(d.ymin) + "—" + Z.fmtYear(d.ymax);
      });

    svg.selectAll("text.band-label")
      .data(bands.filter(function (d) { return x(d.ymax + 1) - x(d.ymin) > 34; }))
      .enter().append("text")
      .attr("class", "band-label")
      .attr("x", function (d) { return (x(d.ymin) + x(d.ymax + 1)) / 2; })
      .attr("y", bandY + bandH / 2 + 5)
      .attr("text-anchor", "middle")
      .attr("fill", "#f7efe2")
      .attr("font-size", 15)
      .text(function (d) { return d.d || "未標"; });

    var axis = d3.axisBottom(x).ticks(Math.min(14, Math.floor(width / 70)))
      .tickFormat(function (v) { return v < 0 ? "前" + (-v) : String(v); });
    svg.append("g").attr("class", "axis")
      .attr("transform", "translate(0," + (bandY + bandH + 6) + ")")
      .call(axis);
  }

  function drawJiBars(box, index) {
    if (!index || !index.length) { box.appendChild(Z.empty()); return; }
    var groups = {}, order = [];
    index.forEach(function (j) {
      var ji = Z.jiOf(j.label, j.d);
      if (!groups[ji]) {
        groups[ji] = { ji: ji, juan: 0, blocks: 0, comms: 0, first: j.j };
        order.push(ji);
      }
      groups[ji].juan += 1;
      groups[ji].blocks += j.blocks || 0;
      groups[ji].comms += j.comms || 0;
    });
    var data = order.map(function (k) { return groups[k]; });

    var width = Math.max(box.clientWidth || 900, 320);
    var rowH = 30, padL = 90, padR = 90, padT = 6;
    var height = padT * 2 + data.length * rowH;
    var svg = d3.select(box).append("svg")
      .attr("width", "100%").attr("height", height)
      .attr("viewBox", "0 0 " + width + " " + height);
    var x = d3.scaleLinear()
      .domain([0, d3.max(data, function (d) { return d.blocks; }) || 1])
      .range([0, width - padL - padR]);

    var row = svg.selectAll("g.ji").data(data).enter().append("g")
      .attr("transform", function (d, i) { return "translate(0," + (padT + i * rowH) + ")"; })
      .style("cursor", "pointer")
      .on("click", function (e, d) { location.hash = "#/read/" + d.first; });

    row.append("text")
      .attr("x", padL - 10).attr("y", rowH / 2 + 5)
      .attr("text-anchor", "end")
      .attr("class", "band-label").attr("font-size", 14)
      .text(function (d) { return d.ji; });

    row.append("rect")
      .attr("x", padL).attr("y", 5)
      .attr("height", rowH - 10).attr("rx", 2)
      .attr("fill", "#57534b").attr("opacity", .78)
      .attr("width", function (d) { return Math.max(x(d.blocks), 1); });

    // 臣光曰部分以朱砂色覆蓋
    row.append("rect")
      .attr("x", padL).attr("y", 5)
      .attr("height", rowH - 10).attr("rx", 2)
      .attr("fill", "#9e2b25")
      .attr("width", function (d) { return Math.max(x(d.comms), d.comms ? 2 : 0); });

    row.append("text")
      .attr("x", function (d) { return padL + Math.max(x(d.blocks), 1) + 8; })
      .attr("y", rowH / 2 + 4)
      .attr("class", "band-label").attr("fill", "#8a8478").attr("font-size", 12)
      .text(function (d) {
        return d.juan + " 卷 · " + d.blocks + " 條" + (d.comms ? " · 臣光曰 " + d.comms : "");
      });

    row.append("title")
      .text(function (d) { return d.ji + "：點擊閱讀第 " + d.first + " 卷起"; });
  }
})(window.ZZTJ);
