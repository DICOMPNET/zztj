/* 關係視圖：共現網絡（力導向圖）＋ 時序事件鏈（泳道＋多因素分析） */
(function (Z) {
  "use strict";

  Z.views = Z.views || {};

  var FOCUS_COLORS = ["#9e2b25", "#2b2926", "#b9975b", "#4f6d7a"];
  var MAX_FOCUS = 4;
  var SAMPLE_P = 200;   // 每條人物泳道最多繪製的事件數（超出均勻抽樣）
  var SAMPLE_J = 120;   // 交匯泳道最多繪製的事件數
  var MAX_SLOTS = 5;    // 同年事件垂直堆疊上限，超出聚合為 ＋n

  Z.views.graph = function (container, params) {
    var mode = params.mode === "tl" ? "tl" : "net";
    container.appendChild(Z.viewHead("關係", mode === "tl"
      ? "時序事件鏈：焦點人物的事件泳道與主線鏈；點擊事件節點做多因素上下游分析。人物名錄自動提取，或有跨代歧義。"
      : "人物同年共現網絡：節點大小＝出現頻次，連線粗細＝共現次數。可拖動節點，懸停高亮鄰居，點擊進入人物詳情。"));

    var tabs = Z.el("div", "mode-tabs");
    [["net", "共現網絡"], ["tl", "時序事件鏈"]].forEach(function (m) {
      var t = Z.el("button", "mode-tab" + (mode === m[0] ? " active" : ""), m[1]);
      t.addEventListener("click", function () {
        if (m[0] === mode) return;
        location.hash = m[0] === "tl" ? "#/graph?mode=tl" : "#/graph";
      });
      tabs.appendChild(t);
    });
    container.appendChild(tabs);

    var body = Z.el("div");
    container.appendChild(body);
    if (mode === "tl") renderTimeline(body, params);
    else renderNet(body);
  };

  /* ================================================================
   * 模式一：共現網絡（d3-force 力導向圖）
   * ================================================================ */
  function renderNet(wrap) {
    wrap.appendChild(Z.loading());
    Promise.all([
      Z.fetchJSON("data/graph.json"),
      Z.fetchJSON("data/persons.json")
    ]).then(function (res) {
      wrap.innerHTML = "";
      var graph = res[0];
      if (!graph.nodes || !graph.nodes.length || !graph.links || !graph.links.length) {
        wrap.appendChild(Z.empty("關係數據尚未生成，暫無可視化內容"));
        return;
      }
      var counts = {};
      res[1].forEach(function (p) { counts[p.name] = p.count; });
      var box = Z.el("div", "graph-wrap");
      wrap.appendChild(box);
      drawNet(box, graph, counts);
    }).catch(function () {
      wrap.innerHTML = "";
      wrap.appendChild(Z.errorBox());
    });
  }

  function drawNet(wrap, graph, counts) {
    var width = Math.max(wrap.clientWidth || 1100, 320);
    var height = Math.min(Math.max(width * .62, 380), 680);

    var nodes = graph.nodes.map(function (n) {
      return { id: n, count: counts[n] || 1 };
    });
    var links = graph.links.map(function (l) {
      return { source: l.s, target: l.t, w: l.w || 1 };
    });

    var maxW = d3.max(links, function (l) { return l.w; }) || 1;
    var maxC = d3.max(nodes, function (n) { return n.count; }) || 1;
    var rScale = d3.scaleSqrt().domain([1, maxC]).range([4, 20]);
    var wScale = d3.scaleSqrt().domain([1, maxW]).range([.5, 5]);

    var svg = d3.select(wrap).append("svg")
      .attr("width", "100%").attr("height", height)
      .attr("viewBox", "0 0 " + width + " " + height);

    var simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(function (d) { return d.id; })
        .distance(function (l) { return 60 + 40 / wScale(l.w); }))
      .force("charge", d3.forceManyBody().strength(-160))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(function (d) { return rScale(d.count) + 12; }));

    var link = svg.append("g").selectAll("line")
      .data(links).enter().append("line")
      .attr("stroke", "#57534b").attr("stroke-opacity", .28)
      .attr("stroke-width", function (l) { return wScale(l.w); });

    var node = svg.append("g").selectAll("g.g-node")
      .data(nodes).enter().append("g")
      .attr("class", "g-node")
      .call(d3.drag()
        .on("start", function (e, d) {
          if (!e.active) simulation.alphaTarget(.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", function (e, d) { d.fx = e.x; d.fy = e.y; })
        .on("end", function (e, d) {
          if (!e.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        }));

    node.append("circle")
      .attr("r", function (d) { return rScale(d.count); })
      .attr("fill", "#2b2926").attr("fill-opacity", .82)
      .attr("stroke", "#b9975b").attr("stroke-width", 1);

    node.append("text")
      .attr("class", "g-label")
      .attr("text-anchor", "middle")
      .attr("dy", function (d) { return -rScale(d.count) - 5; })
      .attr("font-size", function (d) { return d.count > maxC * .3 ? 14 : 11; })
      .text(function (d) { return d.id; });

    node.append("title").text(function (d) {
      return d.id + "　出現 " + d.count + " 次";
    });

    var neighbors = {};
    links.forEach(function (l) {
      var s = l.source.id || l.source, t = l.target.id || l.target;
      (neighbors[s] = neighbors[s] || {})[t] = 1;
      (neighbors[t] = neighbors[t] || {})[s] = 1;
    });
    node.on("mouseenter", function (e, d) {
      var nb = neighbors[d.id] || {};
      node.select("circle")
        .attr("fill", function (n) {
          return (n.id === d.id || nb[n.id]) ? "#9e2b25" : "#2b2926";
        })
        .attr("fill-opacity", function (n) {
          return (n.id === d.id || nb[n.id]) ? .95 : .12;
        });
      node.select("text").attr("opacity", function (n) {
        return (n.id === d.id || nb[n.id]) ? 1 : .15;
      });
      link.attr("stroke", function (l) {
        var s = l.source.id, t = l.target.id;
        return (s === d.id || t === d.id) ? "#9e2b25" : "#57534b";
      }).attr("stroke-opacity", function (l) {
        var s = l.source.id, t = l.target.id;
        return (s === d.id || t === d.id) ? .8 : .06;
      });
    }).on("mouseleave", function () {
      node.select("circle").attr("fill", "#2b2926").attr("fill-opacity", .82);
      node.select("text").attr("opacity", 1);
      link.attr("stroke", "#57534b").attr("stroke-opacity", .28);
    }).on("click", function (e, d) {
      location.hash = "#/persons/" + encodeURIComponent(d.id);
    });

    simulation.on("tick", function () {
      link
        .attr("x1", function (d) { return d.source.x; })
        .attr("y1", function (d) { return d.source.y; })
        .attr("x2", function (d) { return d.target.x; })
        .attr("y2", function (d) { return d.target.y; });
      node.attr("transform", function (d) {
        d.x = Math.max(20, Math.min(width - 20, d.x));
        d.y = Math.max(20, Math.min(height - 20, d.y));
        return "translate(" + d.x + "," + d.y + ")";
      });
    });
  }

  /* ================================================================
   * 模式二：時序事件鏈
   * ================================================================ */
  function renderTimeline(container, params) {
    container.appendChild(Z.loading("編排事件鏈…"));
    Z.fetchJSON("data/relations.json").then(function (data) {
      container.innerHTML = "";
      if (!data || !data.persons || !data.persons.length || !data.events || !data.events.length) {
        container.appendChild(Z.empty("時序數據尚未生成"));
        return;
      }
      var persons = data.persons.map(function (p, i) { return { id: i, name: p[0], count: p[1] }; });
      var byName = {};
      persons.forEach(function (p) { byName[p.name] = p; });
      var events = data.events.map(function (a) {
        return { eid: a[0], year: a[1], juan: a[2], label: a[3], king: a[4],
                 comm: a[5] === 1, summary: a[6], hits: a[7] };
      });
      var byEid = {};
      events.forEach(function (e) { byEid[e.eid] = e; });
      var byPerson = persons.map(function () { return []; });
      events.forEach(function (e) {
        e.hits.forEach(function (h) { byPerson[h].push(e); });
      });
      byPerson.forEach(function (list) {
        list.sort(function (a, b) { return a.year - b.year || a.eid - b.eid; });
      });

      var state = { focus: [], domain: null, fullDomain: null,
                    selected: null, aggr: null, notes: [] };

      // 初始焦點人物（URL 參數還原，默認曹操）
      (params.p || "").replace(/，/g, ",").split(",").map(function (s) { return s.trim(); })
        .filter(Boolean).forEach(function (n) {
          if (byName[n] && state.focus.length < MAX_FOCUS && state.focus.indexOf(byName[n].id) < 0) {
            state.focus.push(byName[n].id);
          }
        });
      if (!state.focus.length && byName["曹操"]) state.focus.push(byName["曹操"].id);
      if (params.e !== undefined && byEid[+params.e]) state.selected = +params.e;

      /* ---------- 焦點人物篩選器 ---------- */
      var filterBar = Z.el("div", "tl-filter");
      var chipBox = Z.el("div", "tl-chips");
      var acWrap = Z.el("div", "tl-ac-wrap");
      var input = Z.el("input");
      input.type = "search";
      input.placeholder = "添加焦點人物（至多 " + MAX_FOCUS + " 人）…";
      var acList = Z.el("div", "tl-ac-list");
      acList.style.display = "none";
      acWrap.appendChild(input);
      acWrap.appendChild(acList);
      filterBar.appendChild(chipBox);
      filterBar.appendChild(acWrap);
      container.appendChild(filterBar);

      function addFocus(fid) {
        if (state.focus.indexOf(fid) >= 0 || state.focus.length >= MAX_FOCUS) return;
        state.focus.push(fid);
        state.selected = null; state.aggr = null;
        resetDomain();
        refresh();
      }
      function removeFocus(fid) {
        state.focus = state.focus.filter(function (x) { return x !== fid; });
        state.selected = null; state.aggr = null;
        resetDomain();
        refresh();
      }
      function renderChips() {
        chipBox.innerHTML = "";
        state.focus.forEach(function (fid, i) {
          var p = persons[fid];
          var chip = Z.el("span", "focus-chip", Z.esc(p.name));
          chip.style.background = FOCUS_COLORS[i];
          var x = Z.el("button", "x", "×");
          x.title = "移除";
          x.addEventListener("click", function () { removeFocus(fid); });
          chip.appendChild(x);
          chipBox.appendChild(chip);
        });
      }
      input.addEventListener("input", function () {
        var q = input.value.trim();
        acList.innerHTML = "";
        if (!q) { acList.style.display = "none"; return; }
        var matches = persons.filter(function (p) {
          return p.name.indexOf(q) >= 0 && state.focus.indexOf(p.id) < 0;
        }).slice(0, 8);
        if (!matches.length) { acList.style.display = "none"; return; }
        matches.forEach(function (p) {
          var item = Z.el("div", "tl-ac-item",
            Z.esc(p.name) + ' <span class="muted small">' + p.count + " 次</span>");
          item.addEventListener("mousedown", function (e) {
            e.preventDefault();
            addFocus(p.id);
            input.value = "";
            acList.style.display = "none";
          });
          acList.appendChild(item);
        });
        acList.style.display = "block";
      });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && acList.firstChild) {
          acList.firstChild.dispatchEvent(new MouseEvent("mousedown"));
          e.preventDefault();
        }
      });
      input.addEventListener("blur", function () { acList.style.display = "none"; });

      /* ---------- 主體布局 ---------- */
      var layout = Z.el("div", "tl-layout");
      var chartSide = Z.el("div");
      var chartWrap = Z.el("div", "tl-chart card");
      var noteBox = Z.el("div", "tl-note");
      chartSide.appendChild(chartWrap);
      chartSide.appendChild(noteBox);
      var sidebar = Z.el("div", "tl-sidebar card");
      layout.appendChild(chartSide);
      layout.appendChild(sidebar);
      container.appendChild(layout);

      /* ---------- 狀態與繪製 ---------- */
      function focusEvents(fid) {
        return byPerson[fid].filter(function (e) {
          return e.year >= state.domain[0] && e.year <= state.domain[1];
        });
      }
      function resetDomain() {
        var ys = [];
        state.focus.forEach(function (fid) {
          byPerson[fid].forEach(function (e) { ys.push(e.year); });
        });
        if (!ys.length) { state.fullDomain = null; state.domain = null; return; }
        state.fullDomain = [Math.min.apply(null, ys) - 2, Math.max.apply(null, ys) + 2];
        state.domain = state.fullDomain.slice();
      }
      function syncHash() {
        var h = "#/graph?mode=tl&p=" + state.focus.map(function (fid) { return persons[fid].name; }).join(",");
        if (state.selected !== null) h += "&e=" + state.selected;
        history.replaceState(null, "", h);
      }
      function refresh() {
        renderChips();
        drawChart();
        drawSidebar();
        syncHash();
      }

      /* 計算可見數據：每條泳道事件 + 交匯事件（含抽樣與聚合） */
      function computeVisible() {
        state.notes = [];
        var laneEvents = state.focus.map(function (fid, i) {
          var list = focusEvents(fid);
          if (list.length > SAMPLE_P) {
            state.notes.push(persons[fid].name + "：事件過密（" + list.length + "），已均勻抽樣 " + SAMPLE_P + " 條");
            var step = list.length / SAMPLE_P, sampled = [];
            for (var k = 0; k < SAMPLE_P; k++) sampled.push(list[Math.floor(k * step)]);
            list = sampled;
          }
          return list;
        });
        var junMap = {};
        laneEvents.forEach(function (list) {
          list.forEach(function (e) {
            var cnt = 0;
            e.hits.forEach(function (h) { if (state.focus.indexOf(h) >= 0) cnt++; });
            if (cnt >= 2) junMap[e.eid] = e;
          });
        });
        var junction = Object.keys(junMap).map(function (k) { return junMap[k]; })
          .sort(function (a, b) { return a.year - b.year || a.eid - b.eid; });
        if (junction.length > SAMPLE_J) {
          state.notes.push("交匯事件過密（" + junction.length + "），已抽樣 " + SAMPLE_J + " 條");
          var step = junction.length / SAMPLE_J, sj = [];
          for (var k = 0; k < SAMPLE_J; k++) sj.push(junction[Math.floor(k * step)]);
          junction = sj;
        }
        return { laneEvents: laneEvents, junction: junction };
      }

      /* 泳道內同年堆疊；返回 {nodes:[{e,x slot}], aggr:[{year,events}]}（x 之後由比例尺算） */
      function stackLane(list) {
        var byYear = {};
        list.forEach(function (e) { (byYear[e.year] = byYear[e.year] || []).push(e); });
        var nodes = [], aggr = [];
        Object.keys(byYear).forEach(function (yk) {
          var group = byYear[yk];
          if (group.length <= MAX_SLOTS) {
            group.forEach(function (e, i) { nodes.push({ e: e, slot: i }); });
          } else {
            group.slice(0, MAX_SLOTS - 1).forEach(function (e, i) { nodes.push({ e: e, slot: i }); });
            var rest = group.slice(MAX_SLOTS - 1);
            aggr.push({ year: +yk, events: rest, slot: MAX_SLOTS - 1 });
          }
        });
        return { nodes: nodes, aggr: aggr };
      }

      var drawnPos = {};  // eid -> {x,y}
      var svgRefs = {};

      function drawChart() {
        chartWrap.innerHTML = "";
        drawnPos = {};
        if (!state.focus.length || !state.domain) {
          chartWrap.appendChild(Z.empty("請添加焦點人物"));
          noteBox.innerHTML = "";
          return;
        }
        var vis = computeVisible();
        var width = Math.max(chartWrap.clientWidth || 760, 320);
        var padL = 62, padR = 18, padT = 14, axisH = 32, laneH = 94, laneGap = 10;
        var slotH = (laneH - 24) / MAX_SLOTS;

        var lanes = [];
        if (state.focus.length >= 2) lanes.push({ key: "jun", label: "交匯", color: "#9e2b25", jun: true });
        state.focus.forEach(function (fid, i) {
          lanes.push({ key: "p" + fid, fid: fid, idx: i, label: persons[fid].name, color: FOCUS_COLORS[i] });
        });

        var height = padT + lanes.length * (laneH + laneGap) + axisH;
        var chartBottom = padT + lanes.length * (laneH + laneGap);
        var svg = d3.select(chartWrap).append("svg")
          .attr("width", "100%").attr("height", height)
          .attr("viewBox", "0 0 " + width + " " + height);
        var x = d3.scaleLinear().domain(state.domain).range([padL, width - padR]);

        // 箭頭 marker（每個焦點色一個）
        var defs = svg.append("defs");
        state.focus.forEach(function (fid, i) {
          defs.append("marker")
            .attr("id", "tl-arrow-" + i)
            .attr("viewBox", "0 0 8 8").attr("refX", 7).attr("refY", 4)
            .attr("markerWidth", 6).attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path").attr("d", "M0,0L8,4L0,8Z")
            .attr("fill", FOCUS_COLORS[i]);
        });

        // 泳道背景與豎排標籤
        lanes.forEach(function (lane, li) {
          var top = padT + li * (laneH + laneGap);
          lane.top = top; lane.mid = top + laneH / 2;
          svg.append("rect")
            .attr("x", padL).attr("y", top)
            .attr("width", width - padL - padR).attr("height", laneH)
            .attr("fill", li % 2 ? "rgba(185,151,91,.05)" : "rgba(185,151,91,.10)")
            .attr("stroke", "#e0d5bd").attr("stroke-width", .5);
          svg.append("text")
            .attr("x", padL - 22).attr("y", lane.mid)
            .attr("text-anchor", "middle")
            .attr("class", "lane-label")
            .style("writing-mode", "vertical-rl")
            .attr("font-size", 15).attr("letter-spacing", 6)
            .attr("fill", lane.color)
            .text(lane.label);
        });

        // brush（置於節點下層，空白處拖框縮放）
        var brushG = svg.append("g").attr("class", "brush");
        var brush = d3.brushX()
          .extent([[padL, padT], [width - padR, chartBottom]])
          .on("end", function (event) {
            if (!event.selection) return;
            var s = event.selection.map(x.invert);
            brushG.call(brush.move, null);
            if (s[1] - s[0] < 1) s[1] = s[0] + 1;
            state.domain = [Math.floor(s[0]), Math.ceil(s[1])];
            drawChart();
            drawSidebar();
          });
        brushG.call(brush);
        svg.on("dblclick", function () {
          if (!state.fullDomain) return;
          state.domain = state.fullDomain.slice();
          drawChart();
          drawSidebar();
        });

        // 節點位置計算
        var laneNodes = {};   // laneKey -> stackLane 結果
        lanes.forEach(function (lane) {
          var list = lane.jun ? vis.junction : vis.laneEvents[lane.idx];
          laneNodes[lane.key] = stackLane(list);
        });
        function nodeY(lane, slot) { return lane.top + 14 + slot * slotH + slotH / 2; }

        // 主線鏈（焦點人物事件按年序連線，含交匯節點）
        var chainG = svg.append("g");
        state.focus.forEach(function (fid, i) {
          var lane = lanes.filter(function (l) { return l.fid === fid; })[0];
          var junLane = lanes[0].jun ? lanes[0] : null;
          var pts = [];
          vis.laneEvents[i].forEach(function (e) {
            var inJun = junLane && laneNodes.jun.nodes.some(function (n) { return n.e.eid === e.eid; });
            var src = inJun ? laneNodes.jun.nodes : laneNodes[lane.key].nodes;
            for (var k = 0; k < src.length; k++) {
              if (src[k].e.eid === e.eid) {
                var ln = inJun ? junLane : lane;
                pts.push({ x: x(e.year), y: nodeY(ln, src[k].slot), eid: e.eid });
                break;
              }
            }
          });
          pts.sort(function (a, b) { return a.x - b.x; });
          for (var k = 0; k < pts.length - 1; k++) {
            chainG.append("line")
              .attr("x1", pts[k].x).attr("y1", pts[k].y)
              .attr("x2", pts[k + 1].x).attr("y2", pts[k + 1].y)
              .attr("stroke", FOCUS_COLORS[i])
              .attr("stroke-width", 1.4).attr("opacity", .5)
              .attr("marker-end", "url(#tl-arrow-" + i + ")");
          }
        });

        // 交匯事件的共享 tick 連線
        var tickG = svg.append("g");
        if (lanes[0].jun) {
          var junLane = lanes[0];
          laneNodes.jun.nodes.forEach(function (n) {
            var jx = x(n.e.year), jy = nodeY(junLane, n.slot);
            var involved = state.focus.filter(function (fid) { return n.e.hits.indexOf(fid) >= 0; });
            var laneTops = involved.map(function (fid) {
              return lanes.filter(function (l) { return l.fid === fid; })[0];
            });
            var deepest = d3.max(laneTops, function (l) { return l.top; });
            tickG.append("line")
              .attr("x1", jx).attr("y1", jy)
              .attr("x2", jx).attr("y2", deepest + 8)
              .attr("stroke", "#b9975b").attr("stroke-width", .8).attr("opacity", .45);
            laneTops.forEach(function (l) {
              tickG.append("line")
                .attr("x1", jx - 4).attr("y1", l.top + 8)
                .attr("x2", jx + 4).attr("y2", l.top + 8)
                .attr("stroke", l.color).attr("stroke-width", 2).attr("opacity", .6);
            });
          });
        }

        // 事件節點（圓＝事件，菱形＝評論）
        var nodeG = svg.append("g");
        lanes.forEach(function (lane) {
          var st = laneNodes[lane.key];
          st.nodes.forEach(function (n) {
            var cx = x(n.e.year), cy = nodeY(lane, n.slot);
            drawnPos[n.e.eid] = { x: cx, y: cy };
            var g = nodeG.append("g").attr("class", "tl-node").style("cursor", "pointer");
            if (n.e.comm) {
              g.append("rect")
                .attr("x", -4.5).attr("y", -4.5).attr("width", 9).attr("height", 9)
                .attr("transform", "translate(" + cx + "," + cy + ") rotate(45)")
                .attr("fill", "#faf6ec").attr("stroke", lane.color).attr("stroke-width", 1.6);
            } else {
              g.append("circle")
                .attr("cx", cx).attr("cy", cy).attr("r", 4)
                .attr("fill", lane.color).attr("fill-opacity", .85);
            }
            g.append("title").text(
              (n.e.label || Z.fmtYearFull(n.e.year)) + (n.e.comm ? "【評論】" : "") + "\n" + n.e.summary);
            g.on("click", function () { selectEvent(n.e.eid); });
          });
          // 聚合節點 ＋n
          st.aggr.forEach(function (a) {
            var cx = x(a.year), cy = nodeY(lane, a.slot);
            var g = nodeG.append("g").attr("class", "tl-aggr").style("cursor", "pointer");
            g.append("circle")
              .attr("cx", cx).attr("cy", cy).attr("r", 6.5)
              .attr("fill", "#faf6ec").attr("stroke", lane.color).attr("stroke-width", 1.2);
            g.append("text")
              .attr("x", cx).attr("y", cy + 3.5)
              .attr("text-anchor", "middle").attr("font-size", 9)
              .attr("fill", lane.color)
              .text("+" + a.events.length);
            g.append("title").text(Z.fmtYearFull(a.year) + "　另有 " + a.events.length + " 個事件");
            g.on("click", function () {
              state.aggr = { year: a.year, lane: lane.label, events: a.events };
              state.selected = null;
              drawChart(); drawSidebar();
            });
          });
          if (!st.nodes.length && !st.aggr.length) {
            svg.append("text")
              .attr("x", (padL + width - padR) / 2).attr("y", lane.mid)
              .attr("text-anchor", "middle").attr("font-size", 12)
              .attr("fill", "#b3a98f")
              .text("此範圍內無事件");
          }
        });

        // 因素分析層（選中事件時）
        var factorG = svg.append("g").attr("class", "factor-layer");
        svgRefs = { svg: svg, factorG: factorG, x: x, chartBottom: chartBottom, padT: padT, axisH: axisH, width: width, padR: padR, padL: padL };
        if (state.selected !== null && drawnPos[state.selected]) {
          drawFactors(byEid[state.selected]);
        } else if (state.selected !== null) {
          state.selected = null; // 縮放後選中事件已不可見
        }

        // X 軸
        var axis = d3.axisBottom(x)
          .ticks(Math.min(14, Math.floor(width / 70)))
          .tickFormat(function (v) { return v < 0 ? "前" + (-v) : String(v); });
        svg.append("g").attr("class", "axis")
          .attr("transform", "translate(0," + chartBottom + ")")
          .call(axis);

        // 圖例與抽樣說明
        var legend = "圓點＝事件　菱形＝評論　同色箭頭線＝人物事件鏈　金色細線＝交匯共享　拖框縮放・雙擊復位";
        noteBox.innerHTML = Z.esc(legend) +
          (state.notes.length ? '<br><span style="color:#9e2b25">' + state.notes.map(Z.esc).join("；") + "</span>" : "") +
          '<br><span class="muted">當前範圍：' + Z.esc(Z.fmtYear(Math.floor(state.domain[0]))) +
          " — " + Z.esc(Z.fmtYear(Math.ceil(state.domain[1]))) + "</span>";
      }

      /* ---------- 多因素分析 ---------- */
      function selectEvent(eid) {
        state.selected = eid;
        state.aggr = null;
        drawChart();
        drawSidebar();
        syncHash();
      }

      function drawFactors(e) {
        var factorG = svgRefs.factorG, x = svgRefs.x;
        var pos = drawnPos[e.eid];
        if (!pos) return;
        // 選中高亮環
        factorG.append("circle")
          .attr("cx", pos.x).attr("cy", pos.y).attr("r", 8.5)
          .attr("fill", "none").attr("stroke", "#9e2b25").attr("stroke-width", 1.8);

        var ghosts = {};   // eid -> {e, kinds:[{fid,kind}], gx, gy}
        e.hits.forEach(function (fid) {
          var seq = byPerson[fid];
          var idx = -1;
          for (var i = 0; i < seq.length; i++) if (seq[i].eid === e.eid) { idx = i; break; }
          if (idx < 0) return;
          function addGhost(ev, kind) {
            if (!ev || ev.eid === e.eid) return;
            if (!ghosts[ev.eid]) ghosts[ev.eid] = { e: ev, kinds: [] };
            ghosts[ev.eid].kinds.push({ fid: fid, kind: kind });
          }
          addGhost(seq[idx - 1], "上游");
          addGhost(seq[idx + 1], "下游");
          var parCount = 0;
          for (var i = 0; i < seq.length; i++) {
            if (seq[i].year === e.year && seq[i].eid !== e.eid && parCount < 3) {
              addGhost(seq[i], "平行"); parCount++;
            }
          }
        });

        var gids = Object.keys(ghosts);
        gids.forEach(function (gid, k) {
          var gh = ghosts[gid];
          var gx = x(gh.e.year);
          if (gx < svgRefs.padL || gx > svgRefs.width - svgRefs.padR) gx = Math.max(svgRefs.padL + 6, Math.min(svgRefs.width - svgRefs.padR - 6, gx));
          var isPar = gh.e.year === e.year;
          var dy = isPar
            ? (k % 2 ? 1 : -1) * (22 + Math.floor(k / 2) * 20)
            : (k % 2 ? -1 : 1) * (26 + Math.floor(k / 2) * 22);
          var gy = pos.y + dy;
          gy = Math.max(svgRefs.padT + 8, Math.min(svgRefs.chartBottom - 8, gy));
          gh.gx = gx; gh.gy = gy;

          var names = [], kindsTxt = [];
          gh.kinds.forEach(function (kk) {
            var nm = persons[kk.fid].name;
            if (names.indexOf(nm) < 0) names.push(nm);
            if (kindsTxt.indexOf(kk.kind) < 0) kindsTxt.push(kk.kind);
          });
          var focusIdx = state.focus.indexOf(gh.kinds[0].fid);
          var color = focusIdx >= 0 ? FOCUS_COLORS[focusIdx] : "#8a8478";

          factorG.append("line")
            .attr("x1", pos.x).attr("y1", pos.y)
            .attr("x2", gx).attr("y2", gy)
            .attr("stroke", color).attr("stroke-width", 1.1)
            .attr("stroke-dasharray", isPar ? "2,3" : "5,3")
            .attr("opacity", .75);
          var g = factorG.append("g").style("cursor", "pointer");
          if (gh.e.comm) {
            g.append("rect")
              .attr("x", -4).attr("y", -4).attr("width", 8).attr("height", 8)
              .attr("transform", "translate(" + gx + "," + gy + ") rotate(45)")
              .attr("fill", "none").attr("stroke", color).attr("stroke-width", 1.4)
              .attr("stroke-dasharray", "2,2");
          } else {
            g.append("circle")
              .attr("cx", gx).attr("cy", gy).attr("r", 4)
              .attr("fill", "none").attr("stroke", color).attr("stroke-width", 1.4)
              .attr("stroke-dasharray", "2,2");
          }
          // 標籤按關係類型分側擺放，減少重疊
          var kind = kindsTxt[0];
          var lx = gx, ly = gy - 8, anchor = "middle";
          if (kind === "上游") { lx = gx - 7; ly = gy + 3.5; anchor = "end"; }
          else if (kind === "下游") { lx = gx + 7; ly = gy + 3.5; anchor = "start"; }
          g.append("text")
            .attr("x", lx).attr("y", ly)
            .attr("text-anchor", anchor).attr("font-size", 10.5)
            .attr("fill", color)
            .text(names.join("·") + "（" + kindsTxt.join("·") + "）");
          g.append("title").text(gh.e.label + "\n" + gh.e.summary);
          g.on("click", function () { selectEvent(gh.e.eid); });
        });
      }

      /* ---------- 側欄 ---------- */
      function drawSidebar() {
        sidebar.innerHTML = "";
        if (state.aggr) {
          sidebar.appendChild(Z.el("h4", "tl-side-title",
            Z.esc(state.aggr.lane) + " · " + Z.esc(Z.fmtYearFull(state.aggr.year))));
          sidebar.appendChild(Z.el("p", "muted small", "該年另有 " + state.aggr.events.length + " 個事件，點擊查看分析："));
          state.aggr.events.forEach(function (ev) {
            var item = Z.el("div", "tl-aggr-item",
              (ev.comm ? '<span class="tag-type comm">評論</span> ' : "") + Z.esc(ev.summary));
            item.addEventListener("click", function () { selectEvent(ev.eid); });
            sidebar.appendChild(item);
          });
          return;
        }
        if (state.selected === null || !byEid[state.selected]) {
          sidebar.appendChild(Z.el("h4", "tl-side-title", "多因素分析"));
          sidebar.appendChild(Z.el("p", "muted small",
            "點擊圖中任一事件節點，查看其年份、摘要、所屬人物鏈，以及各「因素人物」與它的上下游／平行關係。"));
          return;
        }
        var e = byEid[state.selected];
        sidebar.appendChild(Z.el("h4", "tl-side-title", Z.esc(e.label || Z.fmtYearFull(e.year))));
        sidebar.appendChild(Z.el("p", "muted small",
          "卷" + e.juan + (e.king ? "　" + Z.esc(e.king) : "") +
          (e.comm ? '　<span style="color:#9e2b25">評論（臣光曰等）</span>' : "")));
        sidebar.appendChild(Z.el("p", "tl-summary", Z.esc(e.summary)));

        // 所屬人物鏈
        var chainNames = state.focus.filter(function (fid) { return e.hits.indexOf(fid) >= 0; });
        if (chainNames.length) {
          var chainBox = Z.el("div", "tl-chain-box");
          chainBox.appendChild(Z.el("span", "muted small", "所屬鏈："));
          chainNames.forEach(function (fid) {
            var i = state.focus.indexOf(fid);
            var c = Z.el("span", "tl-chain-name", Z.esc(persons[fid].name));
            c.style.color = FOCUS_COLORS[i];
            chainBox.appendChild(c);
          });
          sidebar.appendChild(chainBox);
        }

        // 因素人物
        sidebar.appendChild(Z.el("h4", "tl-side-title", "因素人物"));
        sidebar.appendChild(Z.el("p", "muted small", "虛線為該人物事件序列中與本事件相鄰的上游／下游事件，同年為平行；點擊可加入焦點。"));
        e.hits.forEach(function (fid) {
          var seq = byPerson[fid];
          var ups = 0, downs = 0, pars = 0;
          seq.forEach(function (ev) {
            if (ev.year < e.year) ups++;
            else if (ev.year > e.year) downs++;
            else if (ev.eid !== e.eid) pars++;
          });
          var isFocus = state.focus.indexOf(fid) >= 0;
          var chip = Z.el("div", "factor-chip" + (isFocus ? " is-focus" : ""));
          var fi = isFocus ? state.focus.indexOf(fid) : -1;
          var fname = Z.el("span", "fname", Z.esc(persons[fid].name));
          if (fi >= 0) fname.style.color = FOCUS_COLORS[fi];
          chip.appendChild(fname);
          chip.appendChild(Z.el("span", "fcounts",
            "上游" + ups + "／下游" + downs + "／平行" + pars));
          if (!isFocus && state.focus.length < MAX_FOCUS) {
            var add = Z.el("button", "fadd", "＋焦點");
            add.addEventListener("click", function () { addFocus(fid); });
            chip.appendChild(add);
          } else if (isFocus) {
            chip.appendChild(Z.el("span", "muted small", "已是焦點"));
          }
          sidebar.appendChild(chip);
        });

        var btn = Z.el("button", "btn", "閱讀原文");
        btn.style.marginTop = "12px";
        btn.addEventListener("click", function () {
          location.hash = "#/read/" + e.juan + "?y=" + e.year;
        });
        sidebar.appendChild(btn);
      }

      resetDomain();
      refresh();
    }).catch(function () {
      container.innerHTML = "";
      container.appendChild(Z.errorBox("時序數據載入失敗"));
    });
  }
})(window.ZZTJ);
