#!/usr/bin/env python3
"""解析附篇（御制序/新注序/进书表/奖谕诏书/校勘人姓名）→ web/data/extra.json"""
import glob, json, os, re, urllib.parse

BASE = os.path.join(os.path.dirname(__file__), "..")
RAW = os.path.join(BASE, "data", "raw")
OUT = os.path.join(BASE, "web", "data", "extra.json")

META = {
    "宋神宗資治通鑑序": ("序", "御製資治通鑑序", "宋神宗"),
    "新註資治通鑑序": ("注序", "新註資治通鑑序", "胡三省"),
    "進書表": ("進書表", "進資治通鑑表", "司馬光"),
    "獎諭詔書": ("獎諭詔書", "獎諭詔書", "宋神宗"),
    "資治通鑑/校勘人姓名": ("校勘", "校勘人姓名", ""),
}

def clean(t):
    t = re.sub(r"-\{([^}]*)\}-", r"\1", t)
    t = re.sub(r"<BR\s*/?>", "\n", t, flags=re.I)
    t = re.sub(r"</?[a-zA-Z][^>]*>", "", t)
    t = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[\[([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"'''?", "", t)
    prev = None
    while prev != t:
        prev = t
        t = re.sub(r"\{\{[^{}|]*\|([^{}|]*)\}\}", r"\1", t)  # {{a|b}}→b
        t = re.sub(r"\{\{[^{}]*\}\}", "", t)
    return t.strip()

def main():
    entries = []
    for f in sorted(glob.glob(os.path.join(RAW, "extra_*.json"))):
        d = json.load(open(f, encoding="utf-8"))
        title = d["title"]
        if title == "資治通鑑":
            continue
        key = title if title in META else f"資治通鑑/{title}" if \
            f"資治通鑑/{title}" in META else title
        if key not in META:
            continue
        slug, disp, author = META[key]
        paras = []
        for line in d["wikitext"].split("\n"):
            s = line.strip()
            if not s or s.startswith(("{{", "|", "}}", "[[category", "__",
                                      "<")):
                continue
            txt = clean(s.lstrip(": "))
            if txt and txt not in (title, disp, "資治通鑑"):
                paras.append(txt)
        entries.append({"slug": slug, "title": disp, "author": author,
                        "paragraphs": paras})
        print(disp, len(paras), "段")
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(entries, fh, ensure_ascii=False)
    print("→", OUT)

if __name__ == "__main__":
    main()
