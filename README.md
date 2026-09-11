# 資治通鑑可視化

《資治通鑑》（司馬光編年體通史，294 卷，前 403 年—959 年）交互式可視化網站。全文 294 卷（約 310 萬字）收錄無遺漏，含臣光曰評論、校勘記/考異注、卷末跋文，以及御製序、胡三省新註序、司馬光進書表、獎諭詔書、校勘人姓名等附篇。數據源：維基文庫，由 `scripts/` 自動解析生成。

## 數據管線

```bash
python3 scripts/fetch.py        # 抓取 294 卷 + 附篇 wikitext → data/raw/
python3 scripts/parse.py        # 多格式兼容解析 → data/parsed/（含年份/帝王/事件/評論/校記，附覆蓋率校驗）
python3 scripts/persons.py      # 規則式人物提取 → data/parsed/persons_clean.json
python3 scripts/parse_extra.py  # 附篇 → web/data/extra.json
python3 scripts/build_web.py    # 構建 web/data/（卷全文、時間線、人物、共現圖、統計）
```

## 視圖（單頁應用，hash 路由）

- **總覽** `#/overview`：定位語、核心統計卡片、朝代條帶圖（點擊跳編年）、十六紀橫向條形圖（點擊跳閱讀）。
- **編年** `#/chronicle`：逐年事件密度時間軸（d3 brush 縮放、雙擊復位、帝王在位背景帶、臣光曰年份朱砂點），點年柱看該年全文；朝代過濾 chips。
- **人物** `#/persons` / `#/persons/<名>`：頻次人物榜（含活躍年 sparkline）；詳情含活躍年分布、關聯人物（graph.json）、原文段落（高亮本名）。
- **事件** `#/events`：全文檢索（`GET /api/search`，空格分詞 AND，上限 50 條）+ 按紀/卷瀏覽。
- **關係** `#/graph`：人物同年共現力導向圖（d3-force），拖動/懸停高亮鄰居/點擊跳人物。
- **閱讀** `#/read/<卷>?y=<年>`：卷選擇（按紀分組）、帝王/年號錨點目錄、全文（評論朱砂邊欄、校記角標展開）。

## 本地運行

```bash
python3 -m venv .venv
.venv/bin/pip install fastapi uvicorn
PORT=8080 .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}
```

- `GET /health` → `{"status":"ok"}`
- `GET /api/search?q=智伯` → 匹配塊列表（juan/year/label/type/摘要）
- 靜態文件由 `web/` 提供，`/` 即 `web/index.html`

## Docker 部署

```bash
docker build -t zztj .
docker run -e PORT=8080 -p 8080:8080 zztj
```

平台契約見 `vinyard.toml`（port 8080、health `/health`）。

## 寶塔面板 Docker 部署

單容器即可完整運行（FastAPI 同時提供前端靜態頁面與 `/api/search`），無數據庫、無外部依賴。

1. **安裝 Docker**：寶塔 → 軟件商店 → 安裝「Docker 管理器」。
2. **拉取代碼**：

```bash
cd /www/wwwroot
git clone https://github.com/DICOMPNET/zztj.git
cd zztj
```

3. **啟動容器**（倉庫已附 `docker-compose.yml`）：

```bash
docker compose up -d --build
```

4. **放行端口**：寶塔 → 安全 → 防火墻放行 `8080`；雲服務器安全組入站同樣放行 TCP `8080`。
5. **驗證**：`http://服務器IP:8080/health` 返回 `{"status":"ok"}`，`http://服務器IP:8080/` 為首頁。

**域名 + HTTPS（可選）**：將 `docker-compose.yml` 端口改為 `"127.0.0.1:8080:8080"` 後重新 `docker compose up -d`；寶塔添加站點（純靜態）→ 反向代理至 `http://127.0.0.1:8080` → SSL 申請 Let's Encrypt 證書並開啟強制 HTTPS。

**更新發布**：

```bash
cd /www/wwwroot/zztj
git pull origin main
docker compose up -d --build
```

服務器建議 1 核 1G 以上（啟動時載入 294 卷全文入內存）。

## 與上游同步（只更新內容，保留自有樣式）

本倉庫 fork 自 `https://github.com/firenzemc/zizhitongjian.git`，`upstream` 指向上游。數據層為 `data/`、`web/data/`；樣式層為 `web/index.html`、`web/css/`、`web/js/`，已通過 `.gitattributes`（`merge=ours`）保護。

新機器首次配置：

```bash
git remote add upstream https://github.com/firenzemc/zizhitongjian.git
git config merge.ours.driver true
```

只同步上游數據內容（不動樣式）：

```bash
git fetch upstream
git diff --stat HEAD upstream/main -- data web/data   # 預覽變更
git checkout upstream/main -- data web/data           # 僅取數據
git commit -m "chore: 同步上游原始數據"
git push origin main
```

需要上游其餘代碼改進時可 `git merge upstream/main`，樣式衝突會自動保留本方版本。

## Cloudflare Workers 部署

```bash
export CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=...
npx wrangler deploy
```

- `wrangler.toml`：Worker（`worker/index.js`）+ Static Assets（`web/`）+ 自定義域 `zztj.maxmizedchaos.com`（`custom_domain`，Cloudflare 自動簽證書與 DNS）
- Worker 提供 `/health` 與 `/api/search`（首次請求從 ASSETS 載入 `web/data/search.json` 全文索引到 isolate 內存，之後毫秒級檢索）；其餘一律靜態資源
- 線上：https://zztj.dicomp.net/
- Fork 自：https://github.com/firenzemc/zizhitongjian.git

## 目錄

- `app/main.py`：FastAPI 後端（靜態服務 + 全文檢索，啟動時載入 `web/data/juan/*.json` 全部塊入內存，數據目錄變化時自動重載）
- `web/`：前端（原生 JS + 本地 `vendor/d3.min.js`，無任何 CDN/外鏈）
  - `web/data/`：解析產出的數據（由 `scripts/` 生成，勿手改）
- `scripts/`、`data/`：數據管線（獨立維護）
