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
import { viewStock, afterStock } from "./stock.js";
import { viewIndexDetail, afterIndexDetail } from "./indexview.js";

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
  portfolio: "投資組合", profile: "我的", cloud: "雲端同步", stock: "個股", indexv: "指數詳情",
};
const SUB_PAGE = new Set(["radar", "inst", "daytrade", "scan", "indexb", "indexv", "heat", "valuation", "calc", "portfolio", "profile", "cloud", "stock"]);

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
function render() {
  try {
    const { path, params } = parseRoute();
    const name = String(path || "/").replace(/^\/+/, "").split("/")[0] || "home";
    if (!VIEWS[name]) { location.hash = "#/home"; return; }
    const hashNow = location.hash || "#/home";
    const sameView = S.__renderHash === hashNow;
    const keepY = window.scrollY || 0;
    S.tab = name;
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

document.addEventListener("click", (e) => {
  const d = e.target.closest?.("details.asset");
  if (!d) return;
  const id = d.dataset.id;
  if (id) { if (d.open) S.open.add(id); else S.open.delete(id); }
});

/* ── 版面骨架（頂部列 + 跑馬燈 + 內容 + 四頁導覽） ── */
function init() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
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
