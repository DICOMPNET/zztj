#!/usr/bin/env python3
"""把解析结果构建成 web/data/ 下的站点数据（前端/后端的唯一数据契约）。

输出：
  web/data/index.json     卷索引（含朝代、起止年、块数）
  web/data/timeline.json  逐年条目 {year, juan, king, label, ne, nc, heads}
  web/data/juan/NNN.json  单卷全文（sections>years>blocks，含 notes）
  web/data/persons.json   人物索引 {name, count, titles, first, last, refs}
  web/data/graph.json     人物共现边 {nodes:[name], links:[{s,t,w}]}
  web/data/stats.json     全局统计
"""
import glob, json, os, re, shutil
from collections import defaultdict

BASE = os.path.join(os.path.dirname(__file__), "..")
PARSED = os.path.join(BASE, "data", "parsed")
WEB = os.path.join(BASE, "web", "data")

DYNASTY = [
    ("周紀", "周"), ("秦紀", "秦"), ("漢紀", "漢"), ("魏紀", "魏"),
    ("晉紀", "晉"), ("宋紀", "宋"), ("齊紀", "齊"), ("梁紀", "梁"),
    ("陳紀", "陳"), ("隋紀", "隋"), ("唐紀", "唐"), ("後梁紀", "後梁"),
    ("後唐紀", "後唐"), ("後晉紀", "後晉"), ("後漢紀", "後漢"),
    ("後周紀", "後周"),
]

def dynasty_of(label):
    for k, v in DYNASTY:
        if label.startswith(k):
            return v
    return ""

def summarize(text, n=42):
    t = re.sub(r"\s+", "", text)
    return t[:n] + ("…" if len(t) > n else "")

def main():
    os.makedirs(os.path.join(WEB, "juan"), exist_ok=True)
    index, timeline = [], []
    total_chars = total_events = total_comms = 0
    dyn_stats = defaultdict(lambda: {"juan": 0, "events": 0, "comms": 0,
                                     "chars": 0, "ymin": None, "ymax": None})
    for f in sorted(glob.glob(os.path.join(PARSED, "juan", "*.json"))):
        j = json.load(open(f, encoding="utf-8"))
        j.pop("_notes_inline", None)
        dyn = dynasty_of(j["juan_label"])
        j["dynasty"] = dyn
        with open(os.path.join(WEB, "juan", f"{j['juan']:03d}.json"), "w",
                  encoding="utf-8") as fh:
            json.dump(j, fh, ensure_ascii=False)
        years = []
        ne = sum(len(y["blocks"]) for s in j["sections"] for y in s["years"])
        nc = sum(1 for s in j["sections"] for y in s["years"]
                 for b in y["blocks"] if b["type"] == "commentary")
        chars = sum(len(b["text"]) for s in j["sections"] for y in s["years"]
                    for b in y["blocks"])
        total_events += ne
        total_comms += nc
        total_chars += chars
        for s in j["sections"]:
            for y in s["years"]:
                if y["year"] is None:
                    continue
                years.append(y["year"])
                heads = [summarize(b["text"]) for b in y["blocks"]
                         if b["type"] == "event"][:3]
                timeline.append({
                    "y": y["year"], "j": j["juan"], "k": s["king"],
                    "l": y["label"], "g": y["ganzhi"], "d": dyn,
                    "ne": sum(1 for b in y["blocks"] if b["type"] == "event"),
                    "nc": sum(1 for b in y["blocks"]
                              if b["type"] == "commentary"),
                    "h": heads})
        ds = dyn_stats[dyn]
        ds["juan"] += 1
        ds["events"] += ne
        ds["comms"] += nc
        ds["chars"] += chars
        if years:
            ds["ymin"] = min(years) if ds["ymin"] is None else min(ds["ymin"], min(years))
            ds["ymax"] = max(years) if ds["ymax"] is None else max(ds["ymax"], max(years))
        index.append({"j": j["juan"], "label": j["juan_label"], "d": dyn,
                      "span": j["span"], "blocks": ne, "comms": nc,
                      "ymin": min(years) if years else None,
                      "ymax": max(years) if years else None})
    timeline.sort(key=lambda t: t["y"])
    with open(os.path.join(WEB, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False)
    with open(os.path.join(WEB, "timeline.json"), "w", encoding="utf-8") as fh:
        json.dump(timeline, fh, ensure_ascii=False)

    # 人物索引（优先清洗版）
    pf = os.path.join(PARSED, "persons_clean.json")
    if not os.path.exists(pf):
        pf = os.path.join(PARSED, "persons_raw.json")
    persons = json.load(open(pf, encoding="utf-8"))

    # 人工审定的同名归并：短名（名）→ 全名。仅收高置信、全书语境唯一的。
    ALIAS = {
        "全忠": "朱全忠", "克用": "李克用", "世充": "王世充",
        "子儀": "郭子儀", "光弼": "李光弼", "道成": "蕭道成",
        "德裕": "李德裕", "行密": "楊行密", "崇韜": "郭崇韜",
        "茂貞": "李茂貞", "嗣源": "李嗣源", "德威": "周德威",
        "玄齡": "房玄齡", "世勣": "李世勣", "林甫": "李林甫",
        "思明": "史思明", "敬瑭": "石敬瑭", "建德": "竇建德",
        "希烈": "李希烈", "懷光": "李懷光", "重誨": "安重誨",
        "仙芝": "高仙芝", "黑闥": "劉黑闥", "玄感": "楊玄感",
        "蒙遜": "沮渠蒙遜", "辱檀": "禿髮辱檀", "乾歸": "乞伏乾歸",
        "僧辯": "王僧辯", "懷恩": "僕固懷恩", "存勗": "李存勗",
    }
    for short, full in ALIAS.items():
        if short in persons and full in persons:
            a, b = persons[short], persons[full]
            seen = {(r["juan"], r["year"], r["label"]) for r in b["refs"]}
            for r in a["refs"]:
                key = (r["juan"], r["year"], r["label"])
                if key not in seen:
                    b["refs"].append(r)
                    seen.add(key)
            b["count"] += a["count"]
            del persons[short]
    persons = dict(sorted(persons.items(), key=lambda kv: -kv[1]["count"]))

    pidx = []
    for name, v in persons.items():
        ys = [r["year"] for r in v["refs"] if r.get("year") is not None]
        pidx.append({"name": name, "count": v["count"],
                     "titles": v.get("titles", []),
                     "first": min(ys) if ys else None,
                     "last": max(ys) if ys else None,
                     "refs": v["refs"]})
    with open(os.path.join(WEB, "persons.json"), "w", encoding="utf-8") as fh:
        json.dump(pidx, fh, ensure_ascii=False)

    # 共现图：top 人物按“同年出现”连边
    TOP = 80
    top = [p["name"] for p in pidx[:TOP]]
    edges = defaultdict(int)
    by_year = defaultdict(set)
    for p in pidx[:TOP]:
        seen = set()
        for r in p["refs"]:
            if r.get("year") is not None:
                seen.add(r["year"])
        for yr in seen:
            by_year[yr].add(p["name"])
    for yr, names in by_year.items():
        names = sorted(names)
        for i in range(len(names)):
            for k in range(i + 1, len(names)):
                edges[(names[i], names[k])] += 1
    # 降噪：w>=3，且每节点只保留最强的 8 条边
    cand = sorted((({"s": a, "t": b, "w": w} for (a, b), w in edges.items()
                    if w >= 3)), key=lambda e: -e["w"])
    deg = defaultdict(int)
    links = []
    for e in cand:
        if deg[e["s"]] < 8 and deg[e["t"]] < 8:
            links.append(e)
            deg[e["s"]] += 1
            deg[e["t"]] += 1
    used = sorted({e["s"] for e in links} | {e["t"] for e in links})
    with open(os.path.join(WEB, "graph.json"), "w", encoding="utf-8") as fh:
        json.dump({"nodes": used or top, "links": links}, fh, ensure_ascii=False)

    # 时序事件链数据：top 人物 × 逐事件提及（供关系页时序视图）
    REL_TOP = 200
    rel_persons = [[p["name"], p["count"]] for p in pidx[:REL_TOP]]
    rel_names = [n for n, _ in rel_persons]
    rel_events = []
    eid = 0
    for f in sorted(glob.glob(os.path.join(WEB, "juan", "*.json"))):
        j = json.load(open(f, encoding="utf-8"))
        for s in j.get("sections", []):
            for y in s.get("years", []):
                if y.get("year") is None:
                    continue
                for b in y.get("blocks", []):
                    hits = [i for i, nm in enumerate(rel_names)
                            if nm in b["text"]]
                    if not hits:
                        continue
                    rel_events.append(
                        [eid, y["year"], j["juan"], y["label"],
                         s["king"], 1 if b["type"] == "commentary" else 0,
                         summarize(b["text"], 60), hits])
                    eid += 1
    with open(os.path.join(WEB, "relations.json"), "w",
              encoding="utf-8") as fh:
        json.dump({"persons": rel_persons, "events": rel_events}, fh,
                  ensure_ascii=False)

    stats = {"juan": len(index), "years": len(timeline),
             "events": total_events, "commentaries": total_comms,
             "chars": total_chars,
             "ymin": timeline[0]["y"] if timeline else None,
             "ymax": timeline[-1]["y"] if timeline else None,
             "dynasties": [{"name": k, **v} for k, v in
                           (dyn_stats.items())]}
    with open(os.path.join(WEB, "stats.json"), "w", encoding="utf-8") as fh:
        json.dump(stats, fh, ensure_ascii=False, indent=1)
    print(json.dumps({k: stats[k] for k in
                      ["juan", "years", "events", "commentaries", "chars",
                       "ymin", "ymax"]}, ensure_ascii=False))
    print("persons:", len(pidx), "graph links:", len(links),
          "rel events:", len(rel_events))

if __name__ == "__main__":
    main()
