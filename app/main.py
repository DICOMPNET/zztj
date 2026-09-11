"""資治通鑑可視化網站後端：靜態文件服務 + 全文檢索 API。"""
import json
import re
from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = BASE_DIR / "web"
JUAN_DIR = WEB_DIR / "data" / "juan"

app = FastAPI(title="資治通鑑")

_blocks: list[dict] = []
_files_sig: tuple | None = None


def _load_blocks() -> None:
    """把 web/data/juan/*.json 的全部塊載入內存（數據重建後自動重載）。"""
    global _blocks, _files_sig
    files = sorted(JUAN_DIR.glob("*.json"))
    blocks: list[dict] = []
    for f in files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        juan = data.get("juan")
        juan_label = data.get("juan_label") or f"卷{juan}"
        dynasty = data.get("dynasty") or ""
        for sec in data.get("sections", []):
            king = sec.get("king") or ""
            for year in sec.get("years", []):
                for b in year.get("blocks", []):
                    text = b.get("text") or ""
                    if not text:
                        continue
                    blocks.append(
                        {
                            "juan": juan,
                            "juan_label": juan_label,
                            "dynasty": dynasty,
                            "king": king,
                            "year": year.get("year"),
                            "label": year.get("label") or "",
                            "ganzhi": year.get("ganzhi") or "",
                            "type": b.get("type") or "event",
                            "n": b.get("n"),
                            "speaker": b.get("speaker") or "",
                            "text": text,
                            "has_notes": bool(b.get("notes")),
                        }
                    )
    _blocks = blocks
    _files_sig = (
        len(files),
        max((f.stat().st_mtime for f in files), default=0),
    )


def _ensure_loaded() -> None:
    """數據目錄有變化（卷數增加/重建）時自動重載。"""
    try:
        files = list(JUAN_DIR.glob("*.json"))
        sig = (len(files), max((f.stat().st_mtime for f in files), default=0))
    except Exception:
        sig = None
    if sig != _files_sig:
        _load_blocks()


@app.on_event("startup")
def _startup() -> None:
    _load_blocks()


@app.get("/health")
def health() -> JSONResponse:
    return JSONResponse({"status": "ok"})


@app.get("/api/search")
def search(q: str = Query(default="")) -> JSONResponse:
    _ensure_loaded()
    terms = [t for t in re.split(r"\s+", q.strip()) if t]
    if not terms:
        return JSONResponse({"q": q, "count": 0, "results": []})
    results = []
    for b in _blocks:
        text = b["text"]
        if all(t in text for t in terms):
            positions = [text.find(t) for t in terms if text.find(t) >= 0]
            pos = min(positions) if positions else 0
            start = max(0, pos - 40)
            end = min(len(text), pos + 120)
            snippet = ("…" if start > 0 else "") + text[start:end] + (
                "…" if end < len(text) else ""
            )
            results.append(
                {
                    "juan": b["juan"],
                    "juan_label": b["juan_label"],
                    "dynasty": b["dynasty"],
                    "king": b["king"],
                    "year": b["year"],
                    "label": b["label"],
                    "ganzhi": b["ganzhi"],
                    "type": b["type"],
                    "n": b["n"],
                    "speaker": b["speaker"],
                    "has_notes": b["has_notes"],
                    "snippet": snippet,
                }
            )
            if len(results) >= 50:
                break
    return JSONResponse({"q": q, "count": len(results), "results": results})


# 靜態文件（web/ 目錄，index.html 作為 / 的默認頁）
app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="web")
