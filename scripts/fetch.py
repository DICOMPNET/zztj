#!/usr/bin/env python3
"""抓取维基文库《资治通鉴》全部294卷 wikitext + 卷首进表等附页。"""
import json, os, sys, time, urllib.parse, urllib.request

PROXY = "http://100.109.44.79:7892"
API = "https://zh.wikisource.org/w/api.php"
RAW = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
os.makedirs(RAW, exist_ok=True)

opener = urllib.request.build_opener(
    urllib.request.ProxyHandler({"http": PROXY, "https": PROXY}))
opener.addheaders = [("User-Agent", "zztj-viz/0.1 (research; contact: local)")]

def fetch(title, out):
    if os.path.exists(out) and os.path.getsize(out) > 200:
        return "skip"
    q = urllib.parse.urlencode({
        "action": "parse", "page": title, "prop": "wikitext",
        "format": "json", "formatversion": "2", "redirects": "1"})
    for attempt in range(4):
        try:
            with opener.open(f"{API}?{q}", timeout=60) as r:
                d = json.load(r)
            if "error" in d:
                return f"ERR {d['error'].get('code')}"
            t = d["parse"]["wikitext"]
            with open(out, "w", encoding="utf-8") as f:
                json.dump({"title": d["parse"]["title"], "wikitext": t}, f,
                          ensure_ascii=False)
            return f"ok {len(t)}"
        except Exception as e:
            if attempt == 3:
                return f"FAIL {e}"
            time.sleep(3 * (attempt + 1))

def main():
    todo = []
    for i in range(1, 295):
        title = f"資治通鑑/卷{i:03d}"
        todo.append((title, os.path.join(RAW, f"j{i:03d}.json")))
    # 附页：目录、御制序、进书表、奖谕诏书等（如存在）
    for extra in ["資治通鑑", "宋神宗資治通鑑序", "新註資治通鑑序",
                  "進書表", "獎諭詔書", "校勘人姓名"]:
        todo.append((extra, os.path.join(RAW, "extra_" +
                     urllib.parse.quote(extra, safe="") + ".json")))
    fail = []
    for k, (title, out) in enumerate(todo):
        r = fetch(title, out)
        print(f"[{k+1}/{len(todo)}] {title}: {r}", flush=True)
        if r.startswith(("ERR", "FAIL")):
            fail.append(title)
        if r != "skip":
            time.sleep(1.5)
    print("FAILED:", fail)
    sys.exit(1 if any(f.startswith("資治通鑑/卷") for f in fail) else 0)

if __name__ == "__main__":
    main()
