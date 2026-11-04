# 台股看盤 App（投資助手 v2）— 模組開發介面規格（Frozen Contract）

> **增補（登入/雲端同步）**：新增獨立模組 `cloud.js`（路由 `#/cloud`，登入與雲端設定向導頁），採用 **Firebase**（免費 Spark 方案，原生支援 Google 與 Yahoo OAuth；Supabase 不支援 Yahoo 故不採用）。`app.js` 品牌列顯示雲端狀態 chip（未登入→「登入」鈕 data-act="cloud-open"；已登入→email）。登入後 S.data（投資組合/持股/自選/個人設定）同步到 Firestore `users/{uid}`。本機模式（未設定雲端）完全照舊。**其他 view 模組不需要 import cloud.js**；`state.js` 的 `save()` 會透過 `S.__hooks.save` 通知 cloud 延遲推送（view 模組勿動此 hook）。`S.set.cloud = {enabled:false, config:null, lastSync:null, user:null}` 為保留欄位，view 模組不得覆寫。

本文件是所有功能區塊模組（Subagent 產物）的**唯⼀介面依據**。請嚴格遵守，不要自行發明 API 或改動資料形狀。
最終產物是「純前端 PWA」，全部資料放 localStorage，部署於 GitHub Pages（根目錄扁平結構）。

---

## 0. 整體架構

底部導航 5 頁（社群已排除）：
| 路由 | 頁面 | 負責檔案 |
|---|---|---|
| `#/home` | 首頁（行情總覽） | `home.js` |
| `#/analysis` | 市場分析 | `analysisview.js` |
| `#/search` | 搜索／個股 | `search.js` |
| `#/portfolio` | 投資組合（多組合） | `portfolios.js` |
| `#/profile` | 個人中心 | `profile.js` |

- 每個 view 檔案為 ES module，**export 兩個函數**：
  - `export function viewHome()`（對 search 是 `viewSearch()`，分析是 `viewAnalysis()`，投資組合是 `viewPortfolios()`，個人是 `viewProfile()`）→ 回傳 HTML 字串（放在 `<div class="inner">` 內）。
  - `export function afterHome()`（選填）→ 在 HTML 插入 DOM 後執行（繪圖 canvas、綁事件用）。
  - 需要讀取路由參數時，從 `./ui.js` import `parseRoute()`（回傳 `{ path, params }`，params 為 URLSearchParams）。
- 畫面資料更新：`app.js` 會在每次 `render()` 重新呼叫 view 函數，因此 **view 函數內不要直接取 DOM**；需在 `after*` 內取 DOM。
- **事件**：一律透過 `registerAction("名稱", fn)` 註冊全域委派動作（見 §3），`fn(el, e)` 的 `el` 是觸發元素（有 `data-act`），`e` 是事件。

## 1. 共用模組 API（只准用這些，不要自建）

### `./ui.js`
```js
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => ...;                 // HTML 跳脫
export const fmt = (n, d = 0) => ...;          // zh-TW 千分位
export const pct = (n) => ...;                 // "+12.34%"（含正號，2 位）
export const tone = (n) => ...;                // n>0→"up" n<0→"down" 否則 ""
export const money = (cur, n, d = 2) => ...;   // cur==="USD"→"$ 12.34" else "NT$ 12.34"
export const ageText = (ms) => ...;            // "3 分鐘前" / "2 小時前" / "5 天前"
export const toast = (msg) => ...;             // 底部提示
export const openSheet = (html) => ...;        // 底部彈窗（含 <div class="overlay"> 與 <div class="sheet">）
export const closeSheet = () => ...;
export const uid = () => ...;                  // 唯一 id
export const today = () => ...;                // "YYYY-MM-DD"
export const badge = (q) => ...;               // 回傳報價來源徽章 HTML（即時/延遲/手動/無報價）
export const statusBanner = () => ...;         // 回傳資料源異常提示 HTML（含 .banner/.banner.err）
export const registerAction = (name, fn) => ...;
export const parseRoute = () => ...;           // { path, params }
```
**不要在 view 模組內自己寫 toast / sheet / esc / 路由，一律 import 上述。**

### `./state.js`
```js
export const S;                    // 全域狀態物件（唯讀使用；寫入後務必 save()）
export const save = () => ...;
export const fxRate = () => ...;   // 目前美元匯率（number）
export const fxSource = () => ...; // 匯率來源說明字串
export const quoteOf = (h) => ...; // 依持有 {market,symbol} 取報價（S.quotes），無→null
export const holdings = () => ...; // 全部持有計算結果陣列（含 shares/avgCost/realized）
export const uni = () => ...;      // 可選標的宇宙（內建+自訂+持有，去重）
export const evaluateAlerts = (quotes) => ...; // 檢查警報→寫入 S.set.notifications（app.js 每次 refresh 後呼叫）
export const riskScore = () => ...; // 投資屬性測驗分數（0-100），未作答→null
```

S 內重要欄位（**形狀凍結**）：
```js
S.data = { portfolios: [{id, name}], assets: [{id, portfolioId, market, symbol, name}], trades: [{id, assetId, type, date, qty, price, fee}] }
S.set = { watch: ["台股:2330", ...], custom: [], manual: {}, fxManual: null,
          alerts: [{id, key, kind, threshold, active, lastFired}],       // kind: "price-above"|"price-below"|"day-above"|"day-below"
          notifications: [{id, time, text, read}],                         // 最多 50 筆
          entries: { order: ["radar","inst","daytrade","scan","tools","watchlist","index","custom"], hidden: [] }, // 首頁功能入口順序
          risk: { q: {0:1,1:2,...}, score: 60 } }                          // 投資屬性測驗
S.quotes = { "台股:2330": {price, change, time, source} }
S.status = { binance: "ok|fail|skip", file: "ok|empty|fail", fileUpdated: ms|null, fx: 32 }
S.market = null | { ...market.json 內容 }   // 由 marketdata.js 載入後填入
S.tab / S.q / S.sel / S.tech / S.open / S.hover 等 UI 狀態
```
**v2 舊資料遷移**：舊 KEY `gosu-portfolio-v2`（assets 無 portfolioId）→ 全部歸入自動建立的「預設投資組合」。由 state.js 處理，view 模組不用管。

### `./portfolio.js`（純計算）
```js
export const MARKETS = ["台股", "美股", "加密貨幣"];
export const currencyOf = (market) => ...;
export const keyOf = (market, symbol) => ...;
export const computePosition = (trades) => ...;   // {shares, cost, avgCost, realized}
export const validateTrades = (trades) => ...;
export const toHoldings = (data) => ...;          // assets+trades→含部位
export const holdingStats = (h, quote, fx) => ...; // {price, hasQuote, cost, value, pnl, ret, realized}
export const portfolioStats = (holdingsArr, quoteOf, fx) => ...; // {cost, value, pnl, ret, realized, missing}
export const toTWD = (currency, amount, fx) => ...;
```
（多組合 = 依 `portfolioId` 過濾 assets 即可，view 模組自行 filter。）

### `./catalog.js`
```js
export const CATALOG;   // [{market, symbol, name, key, industry, board, themes:[]}]
export const HOT_STOCKS; // 台股熱門清單 [{symbol, name, board:"上市|上櫃", industry, themes:[]}]（約 30 檔）
export const ETF_LIST;  // [{symbol, name, type:"市值型|高股息|債券|槓桿|國際"}]（約 10 檔）
export const INDUSTRIES; // [{code, name}] 產業資金區塊顯示用（含 半導體/通信網路 等「估算」項目）
export const universe = (settings, data) => ...;  // 全部可選標的（含 CATALOG+自訂+持有）
```

### `./quotes.js`
```js
export const refreshQuotes = async ({ cryptoSymbols, manual = {}, fileCache = null }) => ...;
// 回傳 { quotes, status, file }
export const loadPricesFile = async () => ...;
export const loadCandles = async (market, symbol, file) => ...; // 日 K [{t,o,h,l,c,v}]
export const SOURCE_LABEL = { binance: "即時", delayed: "延遲", manual: "手動" };
```

### `./marketdata.js`（市場資料 + 規則式估算）
```js
export const refreshMarket = async () => ...;   // 載入 market.json → 填入 S.market，失敗→S.market=null
export const indices = () => ...;   // [{code,name,price,prev,change,changePct,time}]（含 加權/櫃買/類股）
export const breadth = () => ...;   // {rise, fall, flat, total, riseAll, fallAll, flatAll, amount, volume}
export const institutions = () => ...; // {date, total:{buy,sell,net}, foreign, trust, dealer, days:[{date,totalNet,foreignNet}]}
export const instRank = () => ...;  // {foreign:[{code,name,net}], trust:[], dealer:[]}（各前 30）
export const industryFlow = () => ...; // [{code,name,foreignNet,trustNet,dealerNet,totalNet}]
export const industryEst = () => ...; // {半導體:{totalNet,stocks}, 通信網路:{...}}（熱門成分股估算）
export const daytrade = () => ...;  // {total:{shares,buyAmt,pct}, list:[{code,name,shares,buy,sell}]（前20）}
export const greedIndex = () => ...; // {score:0-100, label, parts:[{label,text}]}
export const marketTone = () => ...; // {label:"偏多|偏空|中性", score, parts:[{label,text}]}
export const hotPicks = () => ...;  // 盤後精選個股 [{key,name,reason,net}]（規則式：法人買超+收紅）
export const etfMetrics = (candles) => ...; // {ret3m, ret6m, ret1y, vol, mdd, score} 依日K算（無→null）
export const scanner = () => ...;   // 技術面選股結果 [{key,name,reason,signal:"bull|bear",pct}]（規則式：多頭排列/RSI超賣/MACD金叉/量價齊揚）
export const STALE_MSG;             // market.json 過舊提示字串（常數）
```

### 其它（`./indicators.js`、`./charts.js`、`./analysis.js`）
```js
// indicators.js（現有，勿改）
export const sma/ema/rsi/macd/buildSeries;  // buildSeries(candles)→[{t,o,h,l,c,v,ma5,ma20,ma60,rsi,dif,dea,hist}]
// charts.js（現有）
export const palette/drawTechnical/drawDonut;
// analysis.js（現有，規則式文字解讀）
export const analyze = (series) => ...; // {label, score, trend[], indicator[], risk[], volatility, asOf}
```

## 2. 資料來源與延遲標示（寫在畫面上）

| 資料 | 來源 | 標示 |
|---|---|---|
| 加密貨幣 | Binance 直連 | 「即時」 |
| 台股／美股／ETF／指數報價 | `prices.json`（GitHub 排程，Yahoo） | 「延遲」 |
| 指數／法人／產業／當沖／漲跌家數 | `market.json`（GitHub 排程，TWSE 公開 API） | 「盤後／延遲」 |
| 貪婪指數、盤後多空、ETF 評分、掃描器 | 規則式估算 | 「估算」 |
- **台灣慣例：紅漲綠跌**（`up`＝紅、`down`＝綠，CSS 變數已設定）。
- 畫面務必標註資料時效與「非投資建議」警語。

## 3. 事件註冊慣例（重要）

view 模組頂層 import 後立即註冊自己的動作：
```js
registerAction("my-action", (el, e) => { ... });
```
`app.js` 的 document click 委派會查 `data-act="my-action"`。注意：
- 不要在 view 模組裡自己 `document.addEventListener`（除了 `after*` 內的 canvas pointer 事件）。
- 表單：彈窗表單的「儲存」按鈕用 `<button type="button" class="btn primary" data-act="submit-xxx">`，在 action 內用 `$("#id")` 讀值。
- 需要 `confirm` 的破壞性動作直接 `confirm(...)`（現有 App 同款）。

## 4. 可用的 CSS class（style.css 已提供；不夠用時優先組合，確需新樣式→用 inline style 或提報）

`card` `empty` `grid g2 g3 g4` `seg` `btn [primary|sm|danger]` `badge [live|delay|none]` `stat` `row` `right` `small` `muted` `num` `up` `down` `warn` `list item` `banner [info|err]` `tag [bull|bear|mid]` `overlay` `sheet` `formgrid` `err-text` `star [on]` `quote` `legend` `ohlc` `tabs` `brand` `hero` `index-cards` `idx-card` `chips` `chip` `entry-grid` `entry` `gauge-ring` `gauge-num` `kpi-grid` `mini-tbl` `sub` `h1 h2` `details.asset summary trade`（沿用）

## 5. 各模組職責與必備內容

### `home.js`（首頁）
1. 指數英雄卡：加權、櫃買、金融保險、電子（`indices()`，只取這 4 檔）— 價格、漲跌、漲跌幅、`data-act="go-index"` 跳指數總覽。
2. 盤後整理卡：`marketTone()` 偏多/偏空標籤＋`institutions().total.net` 三大法人合計買賣超（億元）＋`foreign.net` 外資單日＋`hotPicks()` 精選個股 2~3 檔（名稱＋買超＋原因）。
3. 標籤列（chips）：`夜盤`（跳 #/analysis?f=futures 或顯示說明）、`外資`（跳 #/analysis?f=inst）、`投信`（跳 #/analysis?f=inst）。無資料時 chip 顯示「—」但仍可點。
4. 功能入口網格（9 格，依 `S.set.entries.order` 排序、hidden 過濾；「自訂」格固定最後）：市場雷達(#/analysis?f=strategy)、法人買超(#/analysis?f=inst)、當沖排行(#/analysis?f=daytrade)、技術面選股(#/analysis?f=scan)、掃描器(#/analysis?f=scan)、工具箱(#/profile?f=tools)、我的自選(錨點到本頁自選區)、指數總覽(#/analysis?f=index)、自訂(#/profile?f=entries)。每格：圖示（emoji 可）+ 名稱 + 一句說明。
5. 我的自選：`uni()` 過濾 `S.set.watch` → 報價卡（沿用 `.card.quote` 樣式、星號、點擊進 `#/search?s=KEY`）。
6. 資料時效說明（market.json / prices.json 更新時間）。

### `analysisview.js`（市場分析）— 本頁區塊多，全部要做，區塊可用 `<details>` 折疊
1. 指數全覽：`indices()` 全部（加權/櫃買/各類股）列表 + 台指期盤後（`market.json.futures` 通常為 null → 顯示「以加權指數為參考（本工具未接期交所即時源）」+ 加權數值）。
2. 漲跌家數：`breadth()` 上漲/下跌/平盤 + 上市/全體切換（簡單兩個數字即可）＋成交金額（億元）。
3. 貪婪指數：`greedIndex()` 0-100 大刻度 + 標籤 + 分項說明（`parts`）。CSS 圓環（`.gauge-ring`，用 conic-gradient inline style）。
4. 法人資金動向：`institutions()` 合計/外資/投信/自營 買賣超（億元，正負色）+ 近 5 日趨勢（小表格）+「買超排行」按鈕展開 `instRank()`（外資/投信/自營 各前 10 列表）。
5. 法人產業資金：`industryFlow()` 各產業 買賣超（外資/投信/自營/合計 四欄小表格，正負色）+ `industryEst()` 半導體/通信網路（標註「熱門成分股估算」）。
6. ETF 區塊：`ETF_LIST` × `quotes.js` 報價（行情與成交）+ `etfMetrics(candles)` 報酬與風險評分（3M/6M/1Y 報酬、波動、最大回檔、評分星等 1-5）+ 規模/人氣（標「—」或依成交量估算並標註估算）。點 ETF → `#/search?s=台股:0050`。
7. 策略區：`scanner()` 技術面選股結果 + 籌碼集中（`instRank().foreign` 前 5 標註「法人加碼」）+ 注意股熱度（`daytrade().list` 前 5 標註）+ 高資產週轉（依報價成交量推估，標註估算）。

### `search.js`（搜索／個股）
1. 搜尋框（`#/search`）：輸入過濾 `uni()`（代號/名稱/產業/題材，`u.industry`、`u.themes` 皆可命中）。
2. 熱門股票列表：`HOT_STOCKS` × 報價（名稱、代碼、上市/上櫃、產業、現價、漲跌、漲跌幅）。可與搜尋結果合併顯示（搜尋時顯示結果，否則顯示熱門）。
3. 個股頁 `#/search?s=KEY`（params 有 `s` 時）：
   - 報價頭部（名稱/代碼/市場/現價/漲跌幅/來源徽章）。
   - 技術分析：`loadCandles` + `buildSeries` → `drawTechnical` canvas（沿用 charts.js 的寫法，afterView 內綁 pointer）。
   - 分析解讀：`analyze(series)` 結果卡。
   - 加入自選星號、新增交易（跳 #/portfolio 或直接開 tradeForm——直接複用 `portfolios.js` 註冊的 `add-trade` action 即可，`data-asset` 帶標的 key）。
   - 我的警報：從此頁可新增價格警報（`registerAction` 自己的 `add-alert`，寫入 `S.set.alerts`）。

### `portfolios.js`（投資組合）
1. 組合總覽：全部組合 + 合計（`portfolioStats`）→ 總資產/成本/未實現損益/報酬率/已實現 + 資產配置 donut（`drawDonut`）。
2. 多組合 CRUD：建立組合（名稱）、刪除（空組合才可刪或警告）、切換 `#/portfolio?p=ID`。
3. 單一組合頁 `?p=ID`：持倉列表（沿用 `details.asset` 樣式與交易明細）+ 新增交易（沿用現有 tradeForm 邏輯，但 `asset.portfolioId` 綁目前組合）+ 資產配置。
4. 績效追蹤：依 `computePosition` 計算的 已實現/未實現 損益、報酬率（現有邏輯直接沿用）。
5. 舊資料遷移後顯示「預設投資組合」。

### `profile.js`（個人中心）
1. 資產摘要卡：庫存市值（現值合計）、資產總額（含已實現？→ 顯示 總資產+已實現損益 兩數即可）。
2. 快捷功能：AI 對話（`data-act="ai-open"`，規則式問答 sheet）、通知中心（`notifications` 列表 + 全部已讀）、我的留言（簡化：改顯示「通知紀錄」即可）、自選股（跳 #/home）、投資組合（跳 #/portfolio）。
3. 提醒管理（我的警報）：警報列表（啟用/停用/刪除）＋新增（選擇標的 + 類型[價格高於/低於、單日漲跌幅高於/低於] + 門檻）。說明：於每次行情更新時檢查，觸發後寫入通知中心。
4. 風險與策略：投資屬性測驗（5 題選擇，作答→`riskScore()` 規則式計分）→ 顯示風險類型（保守/穩健/積極）＋策略推薦說明（文字卡）。
5. 個人設定（沿用）：匯率、備份/匯出/還原、自訂首頁入口（`S.set.entries` 排序/隱藏 UI）、清除資料。
6. AI 對話規則式回覆 `aiReply(text)` 至少支援：`分析 2330`（K線+規則解讀）、`報價 2330`、`匯率`、`我的資產`、`貪婪指數`、`警報`（列出目前警報）、問候、預設說明。

## 6. 交付要求
- 每檔輸出**完整可用、可直接貼上的 ES module 程式碼**（不要省略號、不要「略」、不要註解掉重要邏輯）。
- 全域唯一命名：不要重複定義 `S`、`refresh` 等名稱。
- 所有字串用繁體中文（台灣），介面用語專業：加權指數、櫃買、買賣超（億元）、偏多/偏空、貪婪指數、法人、投信、自營商。
- 數字一律 `fmt()` 千分位；金額顯示億單位時自行除 1e8 後 `fmt(n, 0)` 並加「億」。
- 報價與計算務必正確：**只讀 S.quotes / marketdata 提供的數值，不要自己造資料**；來源缺失時顯示「—」並用 `.empty` 卡說明，禁止顯示錯誤數字。
- 交付時附：檔案名、可運行的 self-check 說明（哪些 action 註冊了、哪些區塊在資料缺失時如何顯示）。
