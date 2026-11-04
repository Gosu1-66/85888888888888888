# 投資助手（台股看盤 PWA）

純前端 PWA：自選股、投資組合（多組合）、市場分析（指數／漲跌家數／三大法人／產業資金／貪婪指數／ETF 評分／技術面掃描）、個股技術分析、警報、AI 對話（規則式）、**Google／Yahoo 登入＋雲端同步**。資料存本機（localStorage），行情靠 GitHub 排程自動更新；雲端啟用後資料可在換機登入同一帳號時取回。**不含任何社群功能（依需求移除）。**

> 報價與市場數據皆為公開來源且**可能延遲**；資料缺漏處以「規則式估算」並明確標註。僅供個人看盤輔助，**不構成投資建議**。

---

## 一、功能達成程度

| 需求 | 達成狀態 |
|---|---|
| 底部 5 頁（首頁／行情／搜索／投資組合／個人中心）＋ `#/cloud` 雲端頁 | ✅ |
| 盤後資訊（偏多／偏空、三大法人、外資買超排行） | ✅ TWSE 盤後統計（延遲） |
| 標籤（夜盤／外資／投信） | ⚠️ 部分：外資／投信買超標籤有；夜盤因未接期交所即時源，以「台指期盤後參考加權指數」呈現 |
| 首頁功能入口 9 格 | ✅ 可自訂顯示（個人中心→自訂首頁入口） |
| 市場分析（指數／漲跌家數／貪婪指數／法人資金／產業資金／ETF／策略） | ✅ 全部以規則式估算與盤後資料實作 |
| 搜索熱門股＋個股詳情（K 線技術圖、法人、當沖） | ✅ |
| 多投資組合 | ✅ CRUD，刪組合自動併入預設組合 |
| 個人中心（AI 規則式／通知／警報／風險測驗） | ✅ |
| 純前端 PWA、localStorage、iPhone Safari 可加主畫面 | ✅ manifest + Service Worker |
| 真帳號登入＋雲端同步（Google／Yahoo OAuth、Google email 身分識別、換機可見） | ✅（Firebase Spark 免費；需依「三、雲端設定」完成一次外部設定） |
| 初次設定向導 | ✅ `#/cloud` 逐步導向 |
| 排除社群 | ✅ |

**資料缺漏的降級與標註**：
- 台指期／細分類指數：Yahoo 查無 → 以加權指數為「參考」並標註「未接期交所即時源」。
- 通信網路類法人資金：TWSE T86 該類常回傳空 → 以「熱門成分股估算」標註。
- ETF 規模／受益人數：TDCC 來源不可用 → 以成交量推估人氣並標註估算。
- 所有估算區塊皆有「估算／盤後」標籤；缺資料顯示「—」，不造假數字。

---

## 二、檔案結構（扁平根目錄，直接對齊 GitHub repo）

```
index.html / style.css / manifest.webmanifest / sw.js
app.js           應用入口：路由、渲染、啟動、雲端狀態 chip
ui.js / state.js 共用 UI 工具、全域狀態／儲存／警報評估
portfolio.js / catalog.js   持股計算（加權平均成本）、內建標的清單
quotes.js / marketdata.js   行情整合（幣安即時＋排程檔）、市場資料（TWSE 盤後＋估算）
charts.js / indicators.js / analysis.js   K 線／指標／分析（沿用舊版）
home.js / analysisview.js / search.js / portfolios.js / profile.js / cloud.js   五頁＋雲端模組
prices.json / market.json    排程產生的行情與市場資料（初次部署已含實際資料）
watchlist.json   排程抓取清單（67 檔：熱門股＋ETF＋美股＋加密貨幣＋加權指數）
scripts/fetch-prices.mjs     抓 Yahoo 行情＋K 線＋匯率 → prices.json
scripts/fetch-market.mjs     抓 TWSE（mis 指數／MI_INDEX／BFI82U／T86／TWTB4U）→ market.json
.github/workflows/pages.yml  每日 13:45／20:00（UTC+8）自動更新並 commit
SPEC.md         開發契約（含登入設計）
icon-*.png       應用圖示
```

---

## 三、上線步驟（GitHub Pages）

你的 repo `Gosu1-66/85888888888888888` 已啟用 **Pages 官方「分支自動部署」**（main 根目錄即為網站），所以：

1. 把本資料夾**全部檔案**推到 repo 的 **main 分支根目錄**（保持扁平；`.github/`、`scripts/`、`prices.json`、`market.json` 也都放根目錄下，不影響部署）。
2. 推送後 GitHub 自動部署，約 1–2 分鐘上線：`https://gosu1-66.github.io/85888888888888888/`。
3. **啟用自動更新**：到 repo 的 **Actions** 頁，第一次需手動跑一次 `Update Market Data` workflow（點進去 → Run workflow），之後每天 13:45／20:00 自動抓 Yahoo＋TWSE 並 commit 回 main。
4. 舊 repo 根目錄那支 `pages.yml` 是 GitHub 不會執行的死檔（排程從未跑過，所以舊站行情一直是空的），可刪除或無視；正確的 workflow 在 `.github/workflows/pages.yml`。

沒有 git 的話：可直接在 GitHub 網頁上傳檔案（Add file → Upload files），或安裝 [GitHub Desktop](https://desktop.github.com) 後照一般流程推送。

---

## 四、雲端設定（Firebase 免費方案，一次約 10 分鐘）

App 內也有逐步導向（個人中心 → 雲端同步，或首頁「雲端同步」入口）。外部設定只有以下步驟：

1. **建立專案**：到 [console.firebase.google.com](https://console.firebase.google.com) 用 Google 帳號登入 → 「建立專案」（名稱隨意）→ 選擇 **Spark 免費方案**（不需信用卡）。
2. **啟用登入**：左側 **Authentication → Sign-in method** → 啟用 **Google**（直接「啟用」儲存）與 **Yahoo**（需先取得 Client ID／Secret，見下方）。
   - Yahoo：到 [developer.yahoo.com/apps](https://developer.yahoo.com/apps) 建立 App；**Redirect URI** 填 Firebase 顯示的那一組（格式 `https://{你的專案}.firebaseapp.com/__/auth/handler`）；把 Client ID／Secret 貼回 Firebase 的 Yahoo 設定。只想要 Google 登入可以完全跳過 Yahoo。
3. **建立資料庫**：左側 **Firestore Database → 建立資料庫** → 位置選 **asia-east1（台灣）** → 安全規則選 **production mode** → 建立後把規則換成（僅允許本人讀寫自己那筆資料，最安全）：

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

4. **取得設定**：**專案設定 → 一般 → 你的應用程式 → `</>`（網頁）** → 註冊應用程式 → 複製畫面上那整段 `firebaseConfig` JSON。
5. **貼回 App**：開啟網站 → 雲端同步頁 → 貼上 → 儲存 → 用 Google 或 Yahoo 登入。之後本機任何變更會自動上傳，換機登入同一帳號即可取回。

**免費額度（以 Firebase 官方定價頁為準）**：Spark 方案每月約 1 GiB 儲存、每日數萬次讀取／數千至兩萬次寫入（各年版本略有差異）。本 App 只在「設定變更後」上傳 1 筆文件，個人使用遠低於額度；超過免費額度會暫停服務直到下個計費週期，**不會自動扣款**。

---

## 五、資料來源與更新機制

| 資料 | 來源 | 時效 |
|---|---|---|
| 加密貨幣 | Binance 公開行情（瀏覽器直連） | 即時 |
| 台股／美股／ETF／加權指數報價與日 K | Yahoo Finance，排程寫入 `prices.json` | 每次排程（每日 2 次） |
| 指數／漲跌家數／法人／產業／當沖 | TWSE 公開 API，排程寫入 `market.json` | 盤後 |
| 美元匯率 | Yahoo `USDTWD=X` | 隨行情檔更新 |

排程檔在任何未開盤時段為前一日資料；「延遲」徽章顯示資料時間。離線時 Service Worker 快取外殼，行情走快取。

---

## 六、備份與注意事項

- 個人中心可**匯出／複製／還原**備份（JSON），換瀏覽器或還原前請先匯出。
- 雲端同步是「最後寫入者勝」：兩台裝置同時改動時，以較晚儲存的一方覆蓋（同步頁會先確認）。
- 清除瀏覽器資料會清掉本機記錄（雲端資料不受影響，重新登入可取回）。
- 已知限制：台指期無即時源；ETF 規模/受益人數無公開即時來源；通信網路產業資金為成分股估算；TWSE 資料非即時且可能因盤中變動而有延遲。
