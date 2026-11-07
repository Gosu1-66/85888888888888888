// app.js — 入口：路由、渲染、啟動流程、全域事件、頂部列與指數跑馬燈。
import { $, registerAction, fireAction, parseRoute, toast } from "./ui.js";
import { S, save, uni, evaluateAlerts } from "./state.js";
import { refreshQuotes, loadLogos, loadCryptoLogos } from "./quotes.js";
import { refreshMarket, indices } from "./marketdata.js";
import { initCloud, cloudStatus } from "./cloud.js";
import { viewHome, afterHome } from "./home.js";
import { viewAnalysis, afterAnalysis } from "./analysisview.js";
import { viewSearch, afterSearch } from "./search.js";
import { viewPortfolios, afterPortfolios } from "./portfolios.js";
import { viewProfile, afterProfile } from "./profile.js";
import { viewCloud } from "./cloud.js";
import { viewRadar, viewInst, viewDaytrade, viewScan, viewIndex, viewTools, viewHeat, viewValuation, viewCalc } from "./tools.js";
import { viewStock, afterStock, viewTvChart, afterTvChart } from "./stock.js";
import { viewIndexDetail, afterIndexDetail } from "./indexview.js";
import { loadCompanies } from "./companies.js";

const VIEWS = {
  home: { view: viewHome, after: afterHome },
  analysis: { view: viewAnalysis, after: afterAnalysis },
  search: { view: viewSearch, after: afterSearch },
  radar: { view: viewRadar, after: null },
  inst: { view: viewInst, after: null },
  daytrade: { view: viewDaytrade, after: null },
  scan: { view: viewScan, after: null },
  indexb: { view: viewIndex, after: null },
  tools: { view: viewTools, after: null },
  heat: { view: viewHeat, after: null },
  valuation: { view: viewValuation, after: null },
  calc: { view: viewCalc, after: null },
  stock: { view: viewStock, after: afterStock },
  tvchart: { view: viewTvChart, after: afterTvChart },
  indexv: { view: viewIndexDetail, after: afterIndexDetail },
  portfolio: { view: viewPortfolios, after: afterPortfolios },
  profile: { view: viewProfile, after: afterProfile },
  cloud: { view: viewCloud, after: null },
};
const NAV = { home: 0, analysis: 1, tools: 2, search: 3 };
const NAV_ITEM = [
  { tab: "home", label: "首頁", icon: "🏠" },
  { tab: "analysis", label: "行情", icon: "📊" },
  { tab: "tools", label: "智投", icon: "🎯" },
  { tab: "search", label: "搜尋", icon: "🔍" },
];
const TITLE = {
  home: "概覽", analysis: "行情", tools: "智投", search: "搜尋", radar: "市場雷達", inst: "外資買超",
  daytrade: "當沖排行", scan: "技術面選股", indexb: "指數總覽", heat: "市場熱力圖", valuation: "估值情境器", calc: "試算工具",
  portfolio: "投資組合", profile: "我的", cloud: "雲端同步", stock: "個股", indexv: "指數詳情", tvchart: "完整圖表",
};
const SUB_PAGE = new Set(["radar", "inst", "daytrade", "scan", "indexb", "indexv", "heat", "valuation", "calc", "portfolio", "profile", "cloud", "stock", "tvchart"]);

/* ── 指數跑馬燈 ── */
function fillTicker() {
  const el = $("#ticker-track");
  if (!el) return;
  const idxs = indices();
  if (!idxs.length) { el.innerHTML = `<span class="tk">指數資料更新中…</span>`; return; }
  const pri = (i) => (i.name || "").includes("加權") ? 0 : (i.name || "").includes("櫃買") ? 1 : 2;
  const narrow = (window.innerWidth || 0) < 520;
  const list = idxs.slice().sort((a, b) => pri(a) - pri(b)).slice(0, narrow ? 3 : 6);
  const items = list.map((i) => `<span class="tk">${i.name.replace("發行量加權股價指數", "加權指數")}<b>${Number(i.price).toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b><span class="${i.change >= 0 ? "up" : "down"}">${i.change >= 0 ? "+" : ""}${i.change.toFixed(2)} (${i.changePct >= 0 ? "+" : ""}${i.changePct.toFixed(2)}%)</span></span>`).join("");
  el.innerHTML = items + items;             // 兩份以無縫循環
  // 固定像素速度（約 52px/s），窄螢幕不會慢到像卡住
  const setSpeed = () => {
    const half = (el.scrollWidth || 0) / 2;
    if (half > 20) el.style.animationDuration = `${Math.max(9, Math.round(half / 68))}s`;
  };
  setSpeed();
  setTimeout(setSpeed, 300);
}

/* ── 渲染 ── */
const MIN_STOCK_BARS = 60;
let lastSafeHash = location.hash || "#/home";

/* 防守：任何入口（含舊連結、搜尋、自選）進到日 K 不足 60 根的個股頁都會被擋下，
   避免出現「有報價但無 K 線」的空白頁 */
function guardStockRoute() {
  const m = location.hash.match(/^#\/stock\/(.+)$/);
  if (!m) return true;
  if (!S.file) return true;                     // 資料還沒載完，先放行
  const key = decodeURIComponent(m[1]);
  const MARKETS_OK = ["台股", "美股", "加密貨幣", "指數"];
  const mk = key.split(":")[0];
  if (!key.includes(":") || !MARKETS_OK.includes(mk)) {
    // key 格式錯誤（例如直接打 #/stock/TRX）→ 不進空白頁
    toast("這個標的代號格式不正確");
    return false;
  }
  // 加密貨幣的 K 線由前端直連 Binance 取得，不看排程檔
  if (key.startsWith("加密貨幣:")) return !!(S.quotes?.[key] && typeof S.quotes[key].price === "number");
  const bars = (S.file?.candles?.[key] || []).length;
  const q = S.quotes?.[key];
  if (bars >= MIN_STOCK_BARS) return true;
  if (q && typeof q.price === "number") {
    toast(`這檔的日 K 還在補抓（目前 ${bars} 根，需 ${MIN_STOCK_BARS} 根）`);
    return false;
  }
  toast(`這檔還沒有報價與日 K（${key.split(":").pop()}）`);
  return false;
}

function render() {
  try {
    if (!guardStockRoute()) { location.hash = lastSafeHash; return; }
    lastSafeHash = location.hash || "#/home";
    const { path, params } = parseRoute();
    const name = String(path || "/").replace(/^\/+/, "").split("/")[0] || "home";
    if (!VIEWS[name]) { location.hash = "#/home"; return; }
    const hashNow = location.hash || "#/home";
    const sameView = S.__renderHash === hashNow;
    const keepY = window.scrollY || 0;
    S.tab = name;
    document.body.dataset.route = name;
    const sp = params.get("s");
    S.q = sp && !String(sp).includes(":") ? sp : "";
    const app = $("#app");
    if (!app) return;
    app.innerHTML = VIEWS[name].view();
    if (VIEWS[name].after) VIEWS[name].after();
    updateNav(name);
    updateTop(name);
    fillTicker();
    updateCloudChip();
    if (sameView) {
      const restore = () => window.scrollTo(0, keepY);
      restore();
      requestAnimationFrame(restore);
      setTimeout(restore, 80);
    } else window.scrollTo(0, 0);
    S.__renderHash = hashNow;
  } catch (e) {
    console.error("[render]", e);
    const app = $("#app");
    if (app) app.innerHTML = `<div class="xcard"><p>頁面載入發生錯誤：${(e && e.message) || e}</p></div>`;
  }
}

function updateTop(name) {
  const t = $("#tb-title");
  if (t) t.innerHTML = `<span>${esc(TITLE[name] || "GU1")}</span>${name === "home" ? '<span class="tb-dot"></span>' : ""}`;
  const back = $("#tb-back");
  if (back) back.style.display = SUB_PAGE.has(name) ? "block" : "none";
  const ttl = $("#tb-title");
  if (ttl) ttl.classList.toggle("center", SUB_PAGE.has(name));
}

function updateNav(name) {
  const i = NAV[name];
  document.querySelectorAll(".nav-btn").forEach((b, k) => {
    const active = k === i;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function updateCloudChip() {
  const chip = $("#tb-user");
  if (!chip) return;
  const st = cloudStatus();
  const map = {
    off: { label: "G" },
    setup: { label: "G" },
    online: { label: "G" },
  };
  const m = map[st.state] || map.off;
  chip.textContent = m.label;
  chip.title = st.state === "online" ? `已同步${st.user ? " · " + (st.user.email || "").split("@")[0] : ""}` : "登入與雲端同步";
}

/* ── 啟動流程 ── */
let booting = false;
export async function refreshAll(silent = false) {
  if (booting) return; booting = true;
  try {
    const crypto = uni().filter((u) => u.market === "加密貨幣").map((u) => u.symbol);
    const r = await refreshQuotes({ cryptoSymbols: crypto, manual: S.set.manual, fileCache: null });
    S.quotes = r.quotes;
    S.status = r.status;
    S.logos = await loadLogos();
    S.cryptoLogos = await loadCryptoLogos();
    if (r.file) { S.file = r.file; S.fileAt = Date.now(); }
    S.lastRefresh = Date.now();
    evaluateAlerts(r.quotes);
    await refreshMarket();
    if (!silent) toast(`已更新行情（幣安 ${r.status.binance === "ok" ? "即時" : "—"} · 台股檔案 ${r.status.file === "ok" ? "有" : "無"}）`);
  } finally { booting = false; }
  render();
}

async function boot() {
  render();
  loadCompanies();
  try { await refreshAll(true); } catch (e) { console.error("[boot]", e); }
  initCloud();
}

/* ── 全域事件接線 ── */
window.addEventListener("hashchange", render);
window.addEventListener("portfolios:changed", () => render());
window.addEventListener("portfolios:refresh-quotes", () => refreshAll());
document.addEventListener("click", (e) => {
  const el = e.target.closest?.("[data-act]");
  if (el) fireAction(el, e);
});

registerAction("close-sheet", () => import("./ui.js").then(({ closeSheet }) => closeSheet()));
registerAction("refresh-all", () => refreshAll());
registerAction("go-cloud", () => { location.hash = "#/cloud"; });
registerAction("go-back", () => { history.length > 1 ? history.back() : (location.hash = "#/home"); });
registerAction("go-home", () => { location.hash = "#/home"; });

/* 加入主畫面教學（iPhone Safari／Android Chrome） */
registerAction("pwa-help", () => {
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const body = iOS
    ? `<ol class="steps">
        <li>用 <b>Safari</b> 開啟這個網站（一定要 Safari，Chrome 不行）。</li>
        <li>點下方工具列的 <b>分享</b> 圖示（方框加箭頭 ⬆）。</li>
        <li>在選單往下滑，選 <b>「加入主畫面」</b>。</li>
        <li>按右上角 <b>「加入」</b>，桌面就會出現 GU1 圖示。</li>
      </ol>
      <p class="small muted">之後從主畫面開啟就是全螢幕、沒有網址列，也會有離線畫面。</p>`
    : `<ol class="steps">
        <li>用 <b>Chrome</b>（Android）或電腦版 Chrome／Edge 開啟這個網站。</li>
        <li>Android：右上角 <b>⋮ 選單</b> → <b>「安裝應用程式」</b>或「加到主畫面」。</li>
        <li>電腦：網址列右側的 <b>安裝圖示</b>，或選單 →「安裝 GU1」。</li>
      </ol>
      <p class="small muted">安裝後可離線開啟，圖示為 GU1。</p>`;
  import("./ui.js").then(({ openSheet }) => openSheet(`<h2>加入主畫面</h2>${body}<button class="btn primary" data-act="close-sheet" style="margin-top:12px">知道了</button>`));
});

/* 有新版本時提示重新整理 */
function showUpdateBar(reg) {
  if ($("#update-bar")) return;
  const bar = document.createElement("div");
  bar.id = "update-bar";
  bar.innerHTML = `<span>GU1 有新版本</span><button type="button" id="update-go">重新整理</button>`;
  document.body.appendChild(bar);
  $("#update-go").addEventListener("click", () => {
    try { reg && reg.waiting && reg.waiting.postMessage({ type: "SKIP_WAITING" }); } catch { /* 忽略 */ }
    setTimeout(() => location.reload(), 300);
  });
}

document.addEventListener("click", (e) => {
  const d = e.target.closest?.("details.asset");
  if (!d) return;
  const id = d.dataset.id;
  if (id) { if (d.open) S.open.add(id); else S.open.delete(id); }
});

/* ── 版面骨架（頂部列 + 跑馬燈 + 內容 + 四頁導覽） ── */
function init() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar(reg);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) showUpdateBar(reg);
        });
      });
    }).catch(() => {});
    // 回到前景時檢查一次是否有新版（PWA 常被留在背景很久）
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
    });
  }
  document.documentElement.setAttribute("data-updown", S.set?.updown === "us" ? "us" : "tw");
  const root = $("#root");
  root.innerHTML = `<header class="topbar">
      <button type="button" class="back" id="tb-back" data-act="go-back" style="display:none">‹</button>
      <a class="tb-brand" href="#/home">GU1</a>
      <span class="tb-sep"></span>
      <div class="tb-title" id="tb-title"><span>概覽</span></div>
      <span class="tb-sp"></span>
      <button type="button" class="tb-ico g" id="tb-user" data-act="goto" data-href="#/profile">G</button>
    </header>
    <div class="ticker"><div class="ticker-track" id="ticker-track"></div></div>
    <main id="app"></main>
    <nav class="bottom-nav">
      ${NAV_ITEM.map((n) => `<button type="button" class="nav-btn" data-tab="${n.tab}" aria-selected="false"><span class="ni">${n.icon}</span><span>${n.label}</span></button>`).join("")}
    </nav>`;
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.addEventListener("click", () => { location.hash = "#/" + b.dataset.tab; });
  });
  boot();
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
