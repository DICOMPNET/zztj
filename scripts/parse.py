#!/usr/bin/env python3
"""解析《资治通鉴》294卷 wikitext → 结构化 JSON（兼容维基文库多种排版格式）。

已兼容格式：
  A. === 帝王年号（干支，公元X年）=== 标题 + '''N''' 编号事件 + :: 臣光曰
  B. == 年号{{*|干支，公元X年}}== 二级标题
  C. 缩进纯文本年份行「 孝獻皇帝辛建安十五年（庚寅，公元二一零年）」+ 无编号段落
  D. 【紀名】　起…盡…凡…年 卷首行
  E. ==跋== 等卷末附文（作为 commentary 收录）
  F. 无编号卷：每个空行分隔的段落即一个事件块（自动编号）

每卷输出 data/parsed/juan/NNN.json：
{ juan, juan_label, span, sections:[{king, years:[{label, year, ganzhi,
  blocks:[{type:event|commentary, n, text, notes[], speaker?}]}]}] }
另输出 data/parsed/index.json 并校验文本覆盖率。
"""
import glob, json, os, re, sys

BASE = os.path.join(os.path.dirname(__file__), "..", "data")
RAW, OUT = os.path.join(BASE, "raw"), "data/parsed"

CN_NUM = {"〇": 0, "零": 0, "○": 0, "一": 1, "二": 2, "三": 3, "四": 4,
          "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}

def cn2int(s):
    s = s.strip()
    if not s:
        return None
    if re.fullmatch(r"\d+", s):
        return int(s)
    if re.fullmatch(r"[〇○零一二三四五六七八九]+", s):
        return int("".join(str(CN_NUM[c]) for c in s))
    total, section, number = 0, 0, 0
    units = {"十": 10, "百": 100, "千": 1000, "万": 10000}
    for ch in s:
        if ch in CN_NUM:
            number = CN_NUM[ch]
        elif ch in units:
            u = units[ch]
            if u == 10000:
                section = (section + number) * u
                total += section
                section, number = 0, 0
            else:
                section += (number or 1) * u
                number = 0
        else:
            return None
    return total + section + number

SENT = "￰￱"

def clean(t):
    t = re.sub(r"-\{([^}]*)\}-", r"\1", t)          # -{豐}- 转换标记
    t = re.sub(r"<BR\s*/?>", "", t, flags=re.I)
    t = re.sub(r"</?(sub|sup|small|big|span|div|poem|nowiki)[^>]*>", "", t,
               flags=re.I)
    t = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[\[([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"'''?", "", t)
    t = re.sub(r"（（([^（）]+)））", r"（\1）", t)  # （（…））→（…）
    t = re.sub(r"￰\d+￱", "", t)                  # 注记哨兵
    prev = None
    while prev != t:
        prev = t
        t = re.sub(r"\{\{[^{}]*\}\}", "", t)
    return t.strip()

HEAD_RE = re.compile(r"^(=+)\s*(?P<label>.*?)\s*\1\s*$")
GZ_TOKEN = re.compile(r"[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]")
YEAR_PAREN = re.compile(
    r"（[^（）]*?(?:西元|公元)?(?P<bce>前)?"
    r"(?P<yr>[0-9〇○零一二三四五六七八九十百千]{1,6})年?[^（）]*?）")
ALT_YEAR = re.compile(
    r"^[\s　]*(?P<label>\S{1,30}年（[^（）]*(?:元|前)[^（）]*）)[\s　]*$")
ALT_PLAIN = re.compile(
    r"^[\s　◎]*(?P<label>\S{1,30}(?:元|年))"
    r"(?P<gz2>[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])?[，,、]?\s*"
    r"(?:西元|公元)(?P<bce>前)?"
    r"(?P<yr>[0-9〇○零一二三四五六七八九十百千]{1,6})年[\s　]*$")

def try_alt_year(line):
    """缩进/无括号年份行 → (label, year, ganzhi) 或 None。"""
    if line.lstrip().startswith(("'", ":")):
        return None
    exp = expand_star(line)
    m = ALT_YEAR.match(exp)
    if m:
        label = m.group("label")
        year, gz = parse_year_label(label)
        if year is not None:
            return label, year, gz
    m = ALT_PLAIN.match(line)
    if m:
        y = cn2int(m.group("yr"))
        if y is not None:
            if m.group("bce"):
                y = -y
            gz = m.group("gz2")
            core = re.sub(r"^[\s　◎]+", "", m.group("label"))
            bce = "前" if m.group("bce") else ""
            label = f"{core}（{gz + '，' if gz else ''}{bce}{m.group('yr')}年）"
            return label, y, gz
    return None

def expand_star(s):
    """展开 {{*|内容}}/{{YL|内容}} 与 -{字}- 转换标记；星注无括号时补括号。"""
    s = re.sub(r"-\{([^}]*)\}-", r"\1", s)
    s = re.sub(r"\{\{YL\|([^{}]*)\}\}", r"\1", s)

    def rep(m):
        c = m.group(1)
        return c if "（" in c else f"（{c}）"
    return re.sub(r"\{\{\*\|([^{}]*)\}\}", rep, s)

def parse_year_label(label):
    """从标题文本解析 (year, ganzhi)。失败返回 (None, None)。"""
    label = expand_star(label)
    m = YEAR_PAREN.search(label)
    if not m:
        return None, None
    if "年" not in m.group(0) and not m.group("bce") and "元" not in m.group(0):
        return None, None
    y = cn2int(m.group("yr"))
    if y is None:
        return None, None
    if m.group("bce"):
        y = -y
    gz = GZ_TOKEN.search(label)
    return y, (gz.group(0) if gz else None)

POSTFACE = ("跋", "後序", "后序", "附記", "附记")

# 底本（维基文库）漏掉年份标题的修补：卷号 → [(段落起始串, 标题, 公元年, 干支)]
SOURCE_YEAR_PATCHES = {
    226: [("春，正月，丁卯朔，改元", "建中元年（庚申，公元七八零年）", 780, "庚申")],
}

def parse_juan(path):
    d = json.load(open(path, encoding="utf-8"))
    t = d["wikitext"] if "wikitext" in d else d["parse"]["wikitext"]
    notes_buf = []

    def pull_notes(m):
        notes_buf.append(clean(m.group(1)))
        return f"￰{len(notes_buf) - 1}￱"

    t = re.sub(r"<ref[^>/]*/>", "", t)
    t = re.sub(r"<ref[^>]*>(.*?)</ref>", pull_notes, t, flags=re.S)
    SENT_RE = re.compile("￰(\\d+)￱")

    def take_notes(raw_txt, block):
        for m in SENT_RE.finditer(raw_txt):
            block["notes"].append(notes_buf[int(m.group(1))])

    m = re.search(r"\{\{header2(.*?)\n\}\}", t, flags=re.S)
    header = m.group(1) if m else ""
    sec = re.search(r"section\s*=\s*([^\n|]+)", header)
    sec = sec.group(1).strip() if sec else ""
    JI_RE = re.compile(
        r"(?:周|秦|漢|魏|晉|宋|齊|梁|陳|隋|唐|後梁|後唐|後晉|後漢|後周)紀"
        r"[〇零一二三四五六七八九十百千]+")
    jm = JI_RE.search(sec) or JI_RE.search(t[:500])
    juan_label = jm.group(0) if jm else ""
    span0 = ""
    nm = re.search(r"notes\s*=\s*([^\n|]+)", header)
    if nm and "起" in nm.group(1):
        span0 = clean(nm.group(1)).rstrip("}").strip()
        span0 = JI_RE.sub("", span0).lstrip("◎　 ").strip()

    has_numbered = bool(re.search(r"^'''\d+'''", t, flags=re.M))
    body_estimate = len(clean(re.sub(r"<ref[^>]*>.*?</ref>", "", t,
                                     flags=re.S)))

    juan = {"juan": int(re.search(r"j(\d+)\.json", path).group(1)),
            "juan_label": juan_label, "span": span0, "sections": []}
    cur_king, cur_year, cur_block = None, None, None
    postface = False
    skipped = False
    auto_n = 0

    def ensure_year():
        nonlocal cur_king, cur_year
        if cur_year is None:
            if cur_king is None:
                cur_king = {"king": "", "years": []}
                juan["sections"].append(cur_king)
            cur_year = {"label": "", "year": None, "ganzhi": None,
                        "blocks": []}
            cur_king["years"].append(cur_year)
        return cur_year

    def new_year(label, year, gz):
        nonlocal cur_king, cur_year, cur_block, auto_n, postface
        postface = False
        cur_block = None
        auto_n = 0
        if cur_king is None:
            cur_king = {"king": "", "years": []}
            juan["sections"].append(cur_king)
        cur_year = {"label": clean(label), "year": year, "ganzhi": gz,
                    "blocks": []}
        cur_king["years"].append(cur_year)

    def add_block(b):
        nonlocal cur_block
        cur_block = b
        ensure_year()["blocks"].append(b)

    for raw in t.split("\n"):
        s = raw.strip()
        if not s:
            continue
        if skipped:
            continue
        if s == "}}" or s.startswith("}}"):
            continue
        if re.fullmatch(r"<BR\s*/?>", s, flags=re.I):
            continue
        if re.fullmatch(r"卷?第?[〇零一二三四五六七八九十百千0-9]+[卷巻]", s):
            continue
        if s.startswith("{{") or s.startswith("|") or s.startswith("__") \
                or s.startswith("[[category") or s.startswith("[[分類"):
            continue
        if s.startswith("[[") and s.endswith("]]"):
            continue

        m1 = re.match(r"^=([^=]+)=$", s)
        if m1:
            if not juan["juan_label"]:
                jm2 = JI_RE.search(m1.group(1))
                juan["juan_label"] = jm2.group(0) if jm2 else clean(m1.group(1))
            continue

        hm = HEAD_RE.match(raw)
        if hm and len(hm.group(1)) >= 2:
            label = hm.group("label").strip()
            cur_block = None
            if "校刊" in label or "校勘" in label or "參考" in label \
                    or "校改" in label or "校注" in label:
                skipped = True
                continue
            label_exp = re.sub(r"-\{([^}]*)\}-", r"\1", label)
            label_exp = re.sub(r"\{\{\*\|([^{}]*)\}\}", r"（\1）", label_exp)
            year, gz = parse_year_label(label_exp)
            if year is not None:
                new_year(label_exp, year, gz)
            elif label in POSTFACE:
                cur_king = {"king": label, "years": []}
                juan["sections"].append(cur_king)
                cur_year = None
                postface = True
            else:
                cur_king = {"king": clean(label), "years": []}
                juan["sections"].append(cur_king)
                cur_year = None
                postface = False
            continue

        ay = try_alt_year(raw)
        if ay:
            new_year(*ay)
            continue

        if s.startswith("'''起") or (s.startswith("【") and "】" in s[:12]):
            mm = re.match(r"【(.*?)】[　\s]*(.*)", s)
            rest = mm.group(2) if mm else ""
            head = mm.group(1) if mm else ""
            if head and not juan["juan_label"]:
                jm3 = JI_RE.search(head)
                juan["juan_label"] = jm3.group(0) if jm3 else clean(head)
            if rest:
                if not juan["juan_label"]:
                    jm4 = JI_RE.search(rest)
                    if jm4:
                        juan["juan_label"] = jm4.group(0)
                        rest = rest[jm4.end():]
                rest = rest.lstrip("◎　 ")
                if rest:
                    juan["span"] = clean(rest)
            elif not mm:
                juan["span"] = clean(s)
            continue

        if raw.startswith(":"):
            txt = clean(raw.lstrip(": "))
            if not txt:
                continue
            if cur_block is not None and cur_block.get("type") == "commentary":
                cur_block["text"] += "\n" + txt
                take_notes(raw, cur_block)
            else:
                sp = re.match(r"^(.{1,8}?曰)：", txt)
                b = {"type": "commentary",
                     "speaker": sp.group(1) if sp else "",
                     "text": txt, "notes": []}
                take_notes(raw, b)
                add_block(b)
            continue

        em = re.match(r"^'''(\d+)'''[　\s]*(.*)$", raw)
        if em:
            b = {"type": "event", "n": int(em.group(1)),
                 "text": clean(em.group(2)), "notes": []}
            take_notes(em.group(2), b)
            add_block(b)
            auto_n = b["n"]
            continue

        # 臣光曰等评论段（无编号/无::前缀的卷）
        cm = re.match(r"^[\s　]*(臣光曰|史臣曰|考異曰)[:：](.*)$", raw,
                      flags=re.S)
        if cm:
            b = {"type": "commentary", "speaker": cm.group(1),
                 "text": cm.group(1) + "：" + clean(cm.group(2)),
                 "notes": []}
            take_notes(raw, b)
            add_block(b)
            continue

        # 普通段落
        txt = clean(raw)
        if not txt:
            continue
        if re.fullmatch(r"(資治通鑑\s*)?[卷巻]?第?[〇零一二三四五六七八九十百千0-9]+[卷巻]?", txt):
            continue
        if re.fullmatch(r"</?[a-zA-Z][^>]*>", txt):
            continue
        # 卷首平文 span 行（如「上章困敦，一年。」）
        if cur_year is None and cur_block is None \
                and len(txt) <= 40 and txt.endswith("。") \
                and (not juan["span"] or txt == juan["span"]) \
                and re.match(r"^(起|閼逢|旃蒙|柔兆|強圉|著雍|屠維|上章|重光|玄黓|昭陽)", txt):
            juan["span"] = txt
            continue
        # 源缺年份标题的定点修补（维基文库底本漏行）
        for ptn, lbl, yr, gz in SOURCE_YEAR_PATCHES.get(juan["juan"], []):
            if txt.startswith(ptn):
                new_year(lbl, yr, gz)
                break
        # 卷首平文帝王行（如「世祖光武皇帝上之上」「孝獻皇帝辛」）
        if cur_year is None and len(txt) <= 25 \
                and not re.search(r"[。，、；：「」『』]", txt) \
                and re.search(r"(皇帝|帝|王|公)([上中下](之[上中下])?)?[甲乙丙丁戊己庚辛壬癸]?$", txt):
            cur_king = {"king": txt, "years": []}
            juan["sections"].append(cur_king)
            cur_block = None
            postface = False
            continue
        if postface:
            b = {"type": "commentary", "speaker": "跋", "text": txt,
                 "notes": []}
            take_notes(raw, b)
            add_block(b)
        elif has_numbered and cur_block is not None:
            cur_block["text"] += "\n" + txt
            take_notes(raw, cur_block)
        else:
            auto_n += 1
            b = {"type": "event", "n": auto_n, "text": txt, "notes": []}
            take_notes(raw, b)
            add_block(b)

    # 后处理：无年份信息且无标签的年段继承前一年（如卷294恭帝附段）
    last_year = None
    for s in juan["sections"]:
        for y in s["years"]:
            if y["year"] is None and not y["label"] and last_year is not None:
                y["year"] = last_year
                y["inherit"] = True
            if y["year"] is not None:
                last_year = y["year"]

    juan["_notes_inline"] = notes_buf
    juan["_coverage"] = (sum(len(b["text"]) for s in juan["sections"]
                             for y in s["years"] for b in y["blocks"])
                         / max(body_estimate, 1))
    return juan

def int2cn(n):
    digs = "零一二三四五六七八九"
    if n < 10:
        return digs[n]
    if n < 20:
        return "十" + (digs[n % 10] if n % 10 else "")
    if n < 100:
        return digs[n // 10] + "十" + (digs[n % 10] if n % 10 else "")
    return str(n)

JI_FULL = re.compile(
    r"((?:周|秦|漢|魏|晉|宋|齊|梁|陳|隋|唐|後梁|後唐|後晉|後漢|後周)紀)"
    r"([〇零一二三四五六七八九十百千]+)$")

def fill_labels(index):
    """纪名缺失的卷按前一卷纪名递增推断（如卷4承周紀三→周紀四）。"""
    for i, rec in enumerate(index):
        if "紀" in rec["label"]:
            continue
        for back in range(i - 1, -1, -1):
            m = JI_FULL.search(index[back]["label"])
            if m:
                num = cn2int(m.group(2))
                if num is not None:
                    rec["label"] = m.group(1) + int2cn(num + (i - back))
                    rec["label_inferred"] = True
                break

def main():
    out_dir = os.path.join(OUT, "juan")
    os.makedirs(out_dir, exist_ok=True)
    files = sorted(glob.glob(os.path.join(RAW, "j*.json")))
    if len(files) < 294:
        print(f"WARN: only {len(files)} raw files", file=sys.stderr)
    index, bad = [], []
    for f in files:
        try:
            j = parse_juan(f)
        except Exception as e:
            bad.append((f, f"EXC {e}"))
            continue
        miss = [y["label"] for s in j["sections"] for y in s["years"]
                if y["year"] is None and y["label"]]
        if miss:
            bad.append((f, "unparsed years: " + ";".join(miss[:4])))
        if j["_coverage"] < 0.5:
            bad.append((f, f"LOW COVERAGE {j['_coverage']:.0%}"))
        nev = sum(len(y["blocks"]) for s in j["sections"] for y in s["years"])
        years = [y["year"] for s in j["sections"] for y in s["years"]
                 if y["year"] is not None]
        with open(os.path.join(out_dir, f"{j['juan']:03d}.json"), "w",
                  encoding="utf-8") as fh:
            json.dump(j, fh, ensure_ascii=False)
        index.append({"juan": j["juan"], "label": j["juan_label"],
                      "span": j["span"], "blocks": nev,
                      "coverage": round(j["_coverage"], 3),
                      "year_min": min(years) if years else None,
                      "year_max": max(years) if years else None})
    fill_labels(index)
    for rec in index:
        if rec.get("label_inferred"):
            fp = os.path.join(out_dir, f"{rec['juan']:03d}.json")
            jj = json.load(open(fp, encoding="utf-8"))
            jj["juan_label"] = rec["label"]
            jj["label_inferred"] = True
            with open(fp, "w", encoding="utf-8") as fh:
                json.dump(jj, fh, ensure_ascii=False)
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, indent=1)
    print(f"parsed {len(index)} 卷; problems: {len(bad)}")
    for f, e in bad[:60]:
        print(" -", os.path.basename(f), e)

if __name__ == "__main__":
    main()
