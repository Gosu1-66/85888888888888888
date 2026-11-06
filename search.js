// search.js — 搜索：熱門股列表／搜尋過濾／個股詳情（報價、盤後、技術圖、警報、交易）。
import { $, esc, fmt, pct, tone, money, ageText, toast, badge, statusBanner, registerAction, parseRoute, uid, openSheet, closeSheet } from "./ui.js";
import { S, save, fxRate, uni } from "./state.js";
import { keyOf } from "./portfolio.js";
import { CATALOG, HOT_STOCKS, ETF_LIST } from "./catalog.js";
import { loadCandles } from "./quotes.js";
import { instRank, daytrade } from "./marketdata.js";
import { buildSeries } from "./indicators.js";
import { drawTechnical } from "./charts.js";
import { stockLogo, sparkLine } from "./home.js";

function searchGroups() {
  const q = (S.q || "").trim().toUpperCase();
  const u = uni();
  const hits = q ? u.filter((x) => x.symbol.includes(q) || x.name.includes(q) || (x.industry || "").includes(q)) : u;
  const all = [
    ["自選", S.set.watch.map((k) => u.find((x) => x.key === k)).filter(Boolean)],
    ["台股", hits.filter((x) => x.market === "台股")],
    ["美股", hits.filter((x) => x.market === "美股")],
    ["加密貨幣", hits.filter((x) => x.market === "加密貨幣")],
    ["指數", hits.filter((x) => x.market === "指數")],
  ].filter(([, arr]) => arr.length);
  // 有搜尋詞時只按市場分組，避免命中結果同時出現在「自選」而重複
  const groups = q ? all.filter(([label]) => label !== "自選") : all;
  return { q, u, hits, groups };
}

function searchRow(x) {
  const k = x.key, qq = S.quotes[k];
  const w = S.set.watch.includes(k);
  const logo = stockLogo(k, x.name, x.symbol, "logo-in");
  return `<a class="rrow side" href="#/stock/${encodeURIComponent(k)}">
      <span class="logo">${logo}</span>
      <span class="rmid">
        <div class="nm">${esc(x.name)}</div>
        <div class="sub">${esc(x.symbol)}${x.industry ? `<span class="mini-chip">${esc(x.industry)}</span>` : ""}${w ? `<span class="mini-chip gold">自選</span>` : ""}</div>
      </span>
      <span class="rpx">
        <div class="p">${qq ? fmt(qq.price, 2) : "—"}</div>
        <div class="d ${qq ? tone(qq.change) : "muted"}">${qq ? pct(qq.change) : "—"}</div>
      </span>
      <span class="rside">${qq ? sparkLine(k, 64, 22) : ""}</span>
    </a>`;
}

/** 搜尋結果區塊（可獨立重繪，輸入時不重建整個頁面） */
export function searchBody() {
  const { q, groups } = searchGroups();
  return groups.length ? groups.map(([label, arr]) => `<section class="xcard">
    <div class="sec-h"><span class="tt">${label}</span><span class="sp"></span><span class="meta">${arr.length}</span></div>
    ${arr.slice(0, 20).map(searchRow).join("")}
  </section>`).join("") : `<section class="xcard"><p class="small muted" style="padding:6px 0">找不到「${esc(q)}」，換個代號或名稱試試。</p></section>`;
}

/** 搜尋範圍與命中數文字 */
export function searchCount() {
  const { q, u, hits } = searchGroups();
  return `搜尋範圍：${u.length} 檔內建與自訂標的${q ? `，「${esc(q)}」找到 ${hits.length} 檔` : ""}`;
}

/* ── 列表視圖 ── */
function viewList() {
  return `<section class="xcard" style="padding:12px 14px">
    <div class="search-box"><span class="muted">🔍</span><input id="search-in" placeholder="搜尋股票、產業、題材、功能" value="${esc(S.q || "")}" autocomplete="off"></div>
    <div class="small muted" id="s-count" style="margin-top:8px">${searchCount()}</div>
  </section>
  <div id="s-results">${searchBody()}</div>`;
}

/* ── 個股詳情 ── */
function fmtT(t) { try { return new Date(t).toLocaleString("zh-TW", { hour12: false }); } catch { return "—"; } }

function instRow(code) {
  const r = instRank() || {};
  const f = (r.foreign || []).find((x) => x.code === code);
  const t = (r.trust || []).find((x) => x.code === code);
  const d = (r.dealer || []).find((x) => x.code === code);
  if (!f && !t && !d) return `<div class="muted small">無盤後法人資料（排程未更新）</div>`;
  const cells = [];
  if (f) cells.push(`外資 <b class="${tone(f.net)}">${(f.net / 1000).toFixed(0)}張</b>`);
  if (t) cells.push(`投信 <b class="${tone(t.net)}">${(t.net / 1000).toFixed(0)}張</b>`);
  if (d) cells.push(`自營 <b class="${tone(d.net)}">${(d.net / 1000).toFixed(0)}張</b>`);
  return `<div class="small">${cells.join(" ｜ ")}</div>`;
}
function daytradeRow(code) {
  const dt = daytrade();
  const row = (dt?.list || []).find((x) => x.code === code);
  if (!row) return "";
  return `<div class="small">當沖股數 ${fmt(row.shares, 0)} 股${row.pct != null ? `（${pct(row.pct)}）` : ""}</div>`;
}

function viewDetail(key) {
  const u = uni().find((x) => x.key === key);
  if (!u) return `<h1>搜索</h1><div class="card empty">找不到「${esc(key)}」。</div>`;
  const q = S.quotes[key];
  const w = S.set.watch.includes(key);
  const market = u.market;

  return `<h1>${esc(u.name)} <span class="muted small">${esc(u.symbol)}</span></h1>
  ${statusBanner()}
  <div class="card">
    <div class="row" style="align-items:center;gap:12px;flex-wrap:wrap">
      <div>
        <div style="font-size:30px;font-weight:700">${q ? money(u.market === "台股" ? "TWD" : "USD", q.price) : "—"}</div>
        <div class="num ${q ? tone(q.change) : ""}">${q ? `${q.change >= 0 ? "+" : ""}${q.change.toFixed(2)}%（${pct(q.change)}）` : "—"}</div>
      </div>
      <div style="flex:1;min-width:160px">
        <div class="small muted">${u.board ? `板別：${esc(u.board)}` : ""}${u.industry ? `｜產業：${esc(u.industry)}` : ""}</div>
        ${u.themes?.length ? `<div class="small muted">題材：${u.themes.map((t) => `#${esc(t)}`).join(" ")}</div>` : ""}
        <div class="small muted">${q ? `報價時間：${fmtT(q.time)}` : "目前無報價（行情檔需排程更新）"}</div>
      </div>
      <div class="row" style="gap:6px">
        ${q ? badge(q) : `<span class="badge none">無報價</span>`}
        <button type="button" class="btn sm ${w ? "" : "primary"}" data-act="toggle-watch" data-key="${esc(key)}">${w ? "已加自選" : "＋自選"}</button>
        <button type="button" class="btn sm" data-act="new-alert-s" data-key="${esc(key)}" data-name="${esc(u.name)}">設定警報</button>
        <button type="button" class="btn sm primary" data-act="add-trade" data-key="${esc(key)}">＋ 交易</button>
      </div>
    </div>
    ${q?.source === "manual" ? `<div class="banner warn">此價格為手動輸入（可能過期），可到個人中心或投資組合清除。</div>` : ""}
    ${market === "指數" ? `<div class="banner info">${key.includes("TWII") ? "加權指數" : "指數"}為延遲報價。台指期等期貨標的目前未接期交所即時源，請以加權指數為參考。</div>` : ""}
  </div>

  <div class="card">
    <h2 class="h2">技術分析（日 K）</h2>
    <canvas id="tech" height="220"></canvas>
    <div class="small muted" id="tech-hover" style="margin-top:4px">點按／拖移圖表可查看各日 OHLC 與指標。</div>
    <div class="small muted" id="tech-note">載入 K 線中…</div>
  </div>

  <div class="card">
    <h2 class="h2">盤後資訊（${market === "台股" ? "TWSE 公開資料，延遲" : "非台股標的無此資料"}）</h2>
    ${market === "台股" ? `${instRow(u.symbol)}${daytradeRow(u.symbol)}<div class="small muted" style="margin-top:6px">三大法人買賣超以「張」計，為最近交易日盤後統計；資料由 GitHub 排程抓取，可能尚未更新。</div>` : `<div class="muted small">「${esc(u.name)}」非台股標的；盤後法人／當沖資訊僅適用台股。</div>`}
  </div>

  <p class="muted small" style="text-align:center;margin-top:14px">技術指標由本機依歷史 K 線計算；報價可能延遲，僅供參考，不構成投資建議。</p>`;
}

/* ── 主視圖 ── */
export function viewSearch() {
  const key = parseRoute().params.get("s");
  if (key) {
    // 舊連結（?s=）一律導到新的個股頁
    const target = "#/stock/" + encodeURIComponent(key);
    if (!location.hash.includes("/stock/")) setTimeout(() => { location.hash = target; }, 0);
    return `<section class="xcard"><p class="small muted">正在開啟 ${esc(key)} 個股頁…</p></section>`;
  }
  return viewList();
}

/* ── after：技術圖 ── */
export function afterSearch() {
  const key = parseRoute().params.get("s");
  if (!key) { bindSearchInput(); return; }
  const cv = $("#tech");
  if (!key || !cv) return;
  const u = uni().find((x) => x.key === key);
  if (!u) return;
  const note = $("#tech-note");
  if (!S.file) { if (note) note.textContent = "尚無 K 線檔案（GitHub 排程未產生），技術分析無法顯示。"; return; }
  loadCandles(u.market, u.symbol, S.file).then((candles) => {
    if (!cv.isConnected) return;
    if (!candles?.length) {
      if (note) note.textContent = "此標的暫無 K 線（排程未收錄）。";
      return;
    }
    const series = buildSeries(candles);
    drawTechnical(cv, series, -1);
    if (note) note.textContent = `近 ${candles.length} 日 K 線 · MA5/MA20/MA60 · RSI · MACD（依排程行情檔計算）`;
    const hover = $("#tech-hover");
    cv.addEventListener("pointermove", (e) => {
      const rect = cv.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const i = Math.max(0, Math.min(series.length - 1, Math.floor(x * series.length)));
      if (S.hover === i) return;
      S.hover = i;
      drawTechnical(cv, series, i);
      const d = series[i];
      if (hover && d) {
        const date = new Date(d.t).toISOString().slice(0, 10);
        hover.innerHTML = `${date}　開 ${fmt(d.o, 2)} 高 ${fmt(d.h, 2)} 低 ${fmt(d.l, 2)} 收 ${fmt(d.c, 2)}` +
          `${d.rsi != null ? `　RSI ${d.rsi.toFixed(0)}` : ""}` +
          `${d.dif != null ? `　MACD ${d.dif.toFixed(2)} / ${d.dea.toFixed(2)}` : ""}` +
          `　量 ${fmt(d.v ?? 0, 0)}`;
      }
    });
    cv.addEventListener("pointerleave", () => { S.hover = -1; drawTechnical(cv, series, -1); if (hover) hover.textContent = "點按／拖移圖表可查看各日 OHLC 與指標。"; });
  }).catch(() => { if (note) note.textContent = "K 線載入失敗。"; });
}

/* ── actions ── */
registerAction("new-alert-s", (el) => {
  const key = el.dataset.key, name = el.dataset.name || key;
  const q = S.quotes[key];
  openSheet(`<h2>設定警報：${esc(name)}</h2>
    <form autocomplete="off">
      <div class="formgrid">
        <label>標的<input value="${esc(key)}" disabled></label>
        <label>類型<select id="al-kind">
          <option value="price-above">價格高於</option>
          <option value="price-below">價格低於</option>
          <option value="day-above">單日漲跌幅高於（%）</option>
          <option value="day-below">單日漲跌幅低於（%）</option>
        </select></label>
        <label>門檻<input id="al-th" type="number" step="0.01" value="${q ? q.price : ""}" placeholder="${q ? `目前 ${q.price}` : ""}"></label>
      </div>
      <div class="err-text" id="al-err"></div>
      <div class="row" style="gap:8px;margin-top:10px">
        <button type="button" class="btn" data-act="close-sheet-btn" style="flex:1">取消</button>
        <button type="button" class="btn primary" data-act="submit-alert-s" style="flex:1">儲存警報</button>
      </div>
    </form>`);
  setTimeout(() => $("#al-th")?.focus(), 50);
});
registerAction("submit-alert-s", () => {
  const th = parseFloat($("#al-th").value);
  const kind = $("#al-kind").value;
  if (!isFinite(th)) { $("#al-err").textContent = "請輸入有效門檻"; return; }
  const key = $("#al-err")?.closest("form")?.querySelector("input[disabled]")?.value;
  if (!key) return;
  S.set.alerts = S.set.alerts || [];
  S.set.alerts.push({ id: uid(), key, kind, threshold: th, active: true, lastFired: 0 });
  save(); closeSheet(); toast("已新增警報");
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
});

/* 列表頁輸入：即時過濾（不重建整頁，避免輸入時失焦） */
export function bindSearchInput() {
  const inp = $("#search-in");
  if (!inp) return;
  let timer = null;
  const refresh = () => {
    S.q = inp.value.trim();
    const box = $("#s-results");
    const cnt = $("#s-count");
    if (box) box.innerHTML = searchBody();
    if (cnt) cnt.textContent = searchCount();
  };
  inp.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(refresh, 160); });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); clearTimeout(timer); refresh(); inp.blur(); }
  });
}
