/* 事件/評論塊的統一渲染（編年、事件、閱讀、人物詳情共用） */
(function (Z) {
  "use strict";

  /*
   * block: {type, n, text, notes, speaker}
   * opts: {meta: "卷次等說明文字", highlightTerms: []}
   */
  Z.renderBlock = function (block, opts) {
    opts = opts || {};
    var isComm = block.type === "commentary";
    var card = Z.el("article", "block" + (isComm ? " commentary" : ""));

    var head = Z.el("div", "block-head");
    if (isComm && block.speaker) {
      head.appendChild(Z.el("span", "speaker", Z.esc(block.speaker)));
    } else if (block.n !== null && block.n !== undefined) {
      head.appendChild(Z.el("span", "bno", "第" + Z.esc(block.n) + "條"));
    }
    if (opts.meta) head.appendChild(Z.el("span", "search-result-meta", opts.meta));
    card.appendChild(head);

    var body = Z.el("div", "btext");
    var text = block.text || "";
    var html = Z.highlight(text, opts.highlightTerms || []);
    html.split("\n").forEach(function (para) {
      if (!para.trim()) return;
      body.appendChild(Z.el("p", null, para));
    });
    card.appendChild(body);

    if (block.notes && block.notes.length) {
      var toggle = Z.el("button", "notes-toggle", "校記 " + block.notes.length + " 則");
      var list = Z.el("ul", "notes-list");
      block.notes.forEach(function (n) {
        list.appendChild(Z.el("li", null, Z.esc(n)));
      });
      toggle.addEventListener("click", function () {
        list.classList.toggle("open");
        toggle.textContent = (list.classList.contains("open") ? "收起校記" : "校記 " + block.notes.length + " 則");
      });
      card.appendChild(toggle);
      card.appendChild(list);
    }
    return card;
  };

  /* 渲染某一年的全部塊（含年份頭），返回 fragment */
  Z.renderYearBlocks = function (yearEntry, opts) {
    var frag = document.createDocumentFragment();
    (yearEntry.blocks || []).forEach(function (b) {
      frag.appendChild(Z.renderBlock(b, opts));
    });
    if (!(yearEntry.blocks || []).length) {
      frag.appendChild(Z.empty("該年無內容"));
    }
    return frag;
  };

  /* 在單卷數據中定位某一年（year 可能為 null，則按 label 匹配） */
  Z.findYear = function (juanData, year, label) {
    var found = [];
    (juanData.sections || []).forEach(function (sec) {
      (sec.years || []).forEach(function (y) {
        if (year !== null && year !== undefined && y.year === year) found.push({ sec: sec, year: y });
        else if ((year === null || year === undefined) && label && y.label === label) found.push({ sec: sec, year: y });
      });
    });
    return found;
  };
})(window.ZZTJ);
