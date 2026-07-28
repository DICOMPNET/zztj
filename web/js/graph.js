/* 關係視圖：人物共現力導向圖（d3-force） */
(function (Z) {
  "use strict";

  Z.views = Z.views || {};

  Z.views.graph = function (container) {
    container.appendChild(Z.viewHead("關係",
      "人物同年共現網絡：節點大小＝出現頻次，連線粗細＝共現次數。可拖動節點，懸停高亮鄰居，點擊進入人物詳情。"));
    var wrap = Z.el("div", "graph-wrap");
    wrap.appendChild(Z.loading());
    container.appendChild(wrap);

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
      draw(wrap, graph, counts);
    }).catch(function () {
      wrap.innerHTML = "";
      wrap.appendChild(Z.errorBox());
    });
  };

  function draw(wrap, graph, counts) {
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

    // 鄰居高亮
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
})(window.ZZTJ);
