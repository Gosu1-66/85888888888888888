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
import { companyDesc } from "./companies.js";

/* ── 搜尋頁：分類分頁 + 分批載入 ── */
const TAB_KEY = "gu1.searchTab";
const STEP = 30;
const TABS = [["hot", "熱門"], ["watch", "自選"], ["tw", "台股"], ["us", "美股"], ["crypto", "加密"], ["idx", "指數"]];
let limit = STEP;

const hasQuote = (x) => { const q = S.quotes[x.key]; return !!(q && typeof q.price === "number"); };
const hasBars = (x) => (S.file?.candles?.[x.key] || []).length >= 60;
const amtOfKey = (k) => { const q = S.quotes[k]; return q ? (q.vol || 0) * (q.price || 0) : 0; };

function tabLabel(tab) { const t = TABS.find(([k]) => k === tab); return t ? t[1] : "自選"; }

function curTab() {
  let t = S.searchTab;
  if (!t) { try { t = localStorage.getItem(TAB_KEY); } catch { t = null; } }
  return TABS.some(([k]) => k === t) ? t : "hot";
}

/** 某一分類要顯示的標的（美股與加密只留有報價且有日 K 的，避免點進空頁） */
function tabList(tab) {
  const u = uni();
  if (tab === "hot") return hotList().map((h) => h.x);
  if (tab === "watch") return S.set.watch.map((k) => u.find((x) => x.key === k)).filter(Boolean);
  if (tab === "tw") return u.filter((x) => x.market === "台股").slice().sort((a, b) => amtOfKey(b.key) - amtOfKey(a.key));
  if (tab === "us") return u.filter((x) => x.market === "美股" && hasQuote(x) && hasBars(x)).slice().sort((a, b) => amtOfKey(b.key) - amtOfKey(a.key));
  if (tab === "crypto") return u.filter((x) => x.market === "加密貨幣" && hasQuote(x));
  return u.filter((x) => x.market === "指數");
}

/* ── 熱門股票：台股依今日成交值排名，和前一交易日的成交值排名比較（^ 上升／v 下降／NEW 新進榜） ── */
const HOT_N = 300;
let hotCache = null;
function hotList() {
  const stamp = (S.file && S.file.updated) || "" ;
  if (hotCache && hotCache.stamp === stamp && hotCache.n === Object.keys(S.quotes).length) return hotCache.list;
  const tw = uni().filter((x) => x.market === "台股" && hasQuote(x) && hasBars(x));
  const today = tw.map((x) => ({ x, a: amtOfKey(x.key) })).filter((r) => r.a > 0).sort((a, b) => b.a - a.a);
  const prevAmt = (k) => { const c = S.file?.candles?.[k] || []; const r = c[c.length - 2]; return r ? (Array.isArray(r) ? r[4] * r[5] : r.c * r.v) : 0; };
  const prev = tw.map((x) => ({ k: x.key, a: prevAmt(x.key) })).filter((r) => r.a > 0).sort((a, b) => b.a - a.a);
  const prevRank = new Map(prev.map((r, i) => [r.k, i + 1]));
  const list = today.slice(0, HOT_N).map((r, i) => {
    const pr = prevRank.get(r.x.key);
    return { x: r.x, delta: pr ? pr - (i + 1) : null, isNew: !pr || pr > 100 };
  });
  hotCache = { stamp, n: Object.keys(S.quotes).length, list };
  return list;
}

// 產業小標籤顏色（同一產業固定同色）
const IND_COLOR = { "半導體": "#4f9cf9", "ETF": "#9aa2ad", "電子零組件": "#33c3a3", "金融保險": "#e0b25a", "電腦及週邊設備": "#7f8cff", "光電": "#c084fc", "通信網路": "#38bdf8", "航運": "#60a5fa", "紡織纖維": "#f472b6", "生技醫療": "#4ade80" };
function indChip(ind) {
  if (!ind) return "";
  let h = 0; for (const c of String(ind)) h = (h * 31 + c.charCodeAt(0)) % 360;
  const col = IND_COLOR[ind] || `hsl(${h} 65% 66%)`;
  return `<span class="hchip" style="color:${col};border-color:${col}55;background:${col}14">${esc(ind)}</span>`;
}

/** 參考 App 風格的一列：logo｜名稱＋排名變化／代號＋上市櫃＋產業／一句話簡介｜價格＋漲跌 */
function hotRow(x, meta = {}) {
  if (x.market === "指數") return searchRow(x);
  const k = x.key, qq = S.quotes[k];
  const isCrypto = String(k).startsWith("加密貨幣:");
  const bars = (S.file?.candles?.[k] || []).length;
  const openable = !!(qq && typeof qq.price === "number" && (isCrypto || bars >= 60));
  if (!openable) return "";
  const prev = qq.prev || (qq.change != null && qq.price ? qq.price / (1 + qq.change / 100) : null);
  const chg = prev ? qq.price - prev : null;
  const chgPct = qq.change != null ? qq.change : prev ? (chg / prev) * 100 : null;
  const t = tone(chgPct);
  const dlt = meta.isNew ? `<span class="hrank new">NEW</span>`
    : meta.delta > 0 ? `<span class="hrank up">^${meta.delta}</span>`
    : meta.delta < 0 ? `<span class="hrank down">v${-meta.delta}</span>` : "";
  const board = x.market === "台股" ? (x.board || qq.board || "") : x.market === "美股" ? "美股" : "";
  const desc = companyDesc(k);
  const dp = (n) => (Math.abs(n) >= 1000 ? 0 : Math.abs(n) >= 100 ? 1 : 2);
  return `<a class="hrow" href="#/stock/${encodeURIComponent(k)}">
    <span class="hlogo">${stockLogo(k, x.name, x.symbol, "logo-in")}</span>
    <span class="hmid">
      <span class="hnm"><b>${esc(x.name)}</b>${dlt}</span>
      <span class="hsub"><span class="hcode">${esc(x.symbol)}</span>${board ? `<span class="hchip board">${esc(board)}</span>` : ""}${indChip(x.industry)}</span>
      ${desc ? `<span class="hdesc">${esc(desc)}</span>` : ""}
    </span>
    <span class="hpx ${t}">
      <b>${fmt(qq.price, dp(qq.price))}</b>
      <span>${chg != null ? `${chg > 0 ? "+" : ""}${fmt(chg, dp(qq.price))}` : ""}${chgPct != null ? ` | ${chgPct > 0 ? "+" : ""}${chgPct.toFixed(2)}%` : ""}</span>
    </span>
  </a>`;
}

function searchRow(x) {
  const k = x.key, qq = S.quotes[k];
  const w = S.set.watch.includes(k);
  const logo = stockLogo(k, x.name, x.symbol, "logo-in");
  const bars = (S.file?.candles?.[k] || []).length;
  const isCrypto = String(k).startsWith("加密貨幣:");
  const openable = !!(qq && typeof qq.price === "number" && (isCrypto || bars >= 60));
  return `<${openable ? `a href="#/stock/${encodeURIComponent(k)}"` : `div`} class="rrow side${openable ? "" : " static"}">
      <span class="logo">${logo}</span>
      <span class="rmid">
        <div class="nm">${esc(x.name)}</div>
        <div class="sub">${esc(x.symbol)}${x.industry ? `<span class="mini-chip">${esc(x.industry)}</span>` : ""}${w ? `<span class="mini-chip gold">自選</span>` : ""}${openable ? "" : `<span class="mini-chip">K 線建置中</span>`}</div>
      </span>
      <span class="rpx">
        <div class="p">${qq ? fmt(qq.price, 2) : "—"}</div>
        <div class="d ${qq ? tone(qq.change) : "muted"}">${qq ? pct(qq.change) : "—"}</div>
      </span>
      <span class="rside">${qq ? sparkLine(k, 64, 22) : ""}</span>
    </${openable ? "a" : "div"}>`;
}

/** 搜尋結果區塊（可獨立重繪，輸入時不重建整個頁面） */
export function searchBody() {
  const q = (S.q || "").trim();
  if (q) {
    const Q = q.toUpperCase();
    const hits = uni().filter((x) =>
      String(x.symbol || "").toUpperCase().includes(Q) ||
      String(x.name || "").includes(q) ||
      String(x.industry || "").includes(q) ||
      (x.themes || []).some((t) => String(t).includes(q)) ||
      String(x.market || "").includes(q)
    );
    // 沒報價的一律不顯示（美股等資料未就緒者不列）
    const list = hits.filter((x) => hotRow(x)).slice(0, STEP);
    return list.length
      ? `<section class="xcard">
          <div class="sec-h"><span class="tt">搜尋結果</span><span class="sp"></span><span class="meta">${list.length}${hits.length > list.length ? `／${hits.length}` : ""}</span></div>
          ${list.map((x) => hotRow(x)).join("")}
        </section>`
      : `<section class="xcard"><p class="small muted" style="padding:6px 0">找不到「${esc(q)}」，換個代號或名稱試試。</p></section>`;
  }
  const tab = curTab();
  const all = tabList(tab);
  const shown = all.slice(0, limit);
  const label = tabLabel(tab);
  const hm = tab === "hot" ? new Map(hotList().map((h) => [h.x.key, h])) : null;
  const rows = shown.map((x) => hotRow(x, hm ? hm.get(x.key) : {})).join("");
  const body = rows ? rows
    : `<p class="small muted" style="padding:10px 0">${tab === "watch" ? "自選清單是空的，到個股頁按「＋自選」加入。" : "這個分類目前沒有可顯示的標的（報價或日 K 尚未就緒）。"}</p>`;
  return `<div class="hsec-h">${tab === "hot" ? "🔥 熱門股票" : esc(label)}</div>
    <div class="hlist">${body}</div>
    ${all.length > shown.length ? `<button type="button" class="hmore" data-act="search-more">載入更多</button>` : ""}`;
}

/** 搜尋範圍與命中數文字 */
export function searchCount() {
  const q = (S.q || "").trim();
  if (q) {
    const Q = q.toUpperCase();
    const hits = uni().filter((x) => String(x.symbol || "").toUpperCase().includes(Q) || String(x.name || "").includes(q) || String(x.industry || "").includes(q) || String(x.market || "").includes(q));
    return `「${esc(q)}」找到 ${hits.length} 檔，顯示前 ${Math.min(hits.length, STEP)} 筆`;
  }
  const tab = curTab();
  const n = tabList(tab).length;
  return `${tabLabel(tab)}共 ${n} 檔${n > limit ? `，已顯示 ${limit} 檔` : ""}`;
}

/* ── 列表視圖 ── */
function viewList() {
  const tab = curTab();
  return `<div class="hsearch">
    <div class="hbox"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="search-in" placeholder="搜尋股票、產業、題材、功能或頁面" value="${esc(S.q || "")}" autocomplete="off" enterkeyhint="search"></div>
    <div class="htabs">${TABS.map(([k, l]) => `<button type="button" class="${tab === k ? "on" : ""}" data-act="search-tab" data-tab="${k}">${esc(l)}</button>`).join("")}</div>
  </div>
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
  limit = STEP;                                  // 每次進搜尋頁回到第一頁
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
    const wasSearching = !!(S.q || "").trim();
    S.q = inp.value.trim();
    if (wasSearching && !S.q) limit = STEP;       // 清空 → 回到分頁列表第一頁
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

/* 切換分類：記住上次選的分頁，重置分批 */
registerAction("search-tab", (el) => {
  const tab = el.dataset.tab;
  S.searchTab = tab;
  try { localStorage.setItem(TAB_KEY, tab); } catch { /* 私密模式忽略 */ }
  limit = STEP;
  S.q = "";
  const inp = $("#search-in");
  if (inp) inp.value = "";
  document.querySelectorAll('[data-act="search-tab"]').forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  const box = $("#s-results");
  if (box) box.innerHTML = searchBody();
  const cnt = $("#s-count");
  if (cnt) cnt.textContent = searchCount();
});

/* 載入更多：每次再加 30 檔 */
registerAction("search-more", () => {
  limit += STEP;
  const box = $("#s-results");
  if (box) box.innerHTML = searchBody();
  const cnt = $("#s-count");
  if (cnt) cnt.textContent = searchCount();
});
