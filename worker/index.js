// 资治通鉴 · Cloudflare Worker
// 静态资源由 ASSETS binding 提供（web/ 目录）；
// 本脚本只处理 /health 与 /api/search（内存全文检索，首次请求时加载 search.json 并缓存于 isolate）。

let searchRows = null;
let searchMeta = null;

async function loadIndex(request, env) {
  if (searchRows) return;
  const url = new URL(request.url);
  const resp = await env.ASSETS.fetch(new URL("/data/search.json", url.origin));
  if (!resp.ok) throw new Error("search.json load failed: " + resp.status);
  searchRows = await resp.json();
  searchMeta = { count: searchRows.length, loadedAt: new Date().toISOString() };
}

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8",
               ...(init && init.headers) },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ status: "ok", searchLoaded: !!searchRows,
                    ...(searchMeta || {}) });
    }

    if (url.pathname === "/api/search") {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) return json({ q, count: 0, results: [] });
      try {
        await loadIndex(request, env);
      } catch (e) {
        return json({ error: String(e) }, { status: 503 });
      }
      const terms = q.split(/\s+/).filter(Boolean);
      const results = [];
      for (const [juan, juanLabel, dynasty, king, year, label, ganzhi,
                  isComm, n, speaker, text] of searchRows) {
        let ok = true, pos = Infinity;
        for (const t of terms) {
          const p = text.indexOf(t);
          if (p < 0) { ok = false; break; }
          if (p < pos) pos = p;
        }
        if (!ok) continue;
        const start = Math.max(0, pos - 40);
        const end = Math.min(text.length, pos + 120);
        results.push({
          juan, juan_label: juanLabel, dynasty, king, year, label, ganzhi,
          type: isComm ? "commentary" : "event", n, speaker,
          snippet: (start > 0 ? "…" : "") + text.slice(start, end) +
                   (end < text.length ? "…" : ""),
        });
        if (results.length >= 50) break;
      }
      return json({ q, count: results.length, results });
    }

    // 其余一律交给静态资源（/、/data/...、/css/...、/js/...）
    return env.ASSETS.fetch(request);
  },
};
