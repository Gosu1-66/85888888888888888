// app.js — 應用程式入口：路由、渲染、啟動流程、全域事件、品牌列雲端狀態。
import { $, registerAction, fireAction, parseRoute, toast } from "./ui.js";
import { S, save, uni, evaluateAlerts } from "./state.js";
import { refreshQuotes, loadLogos } from "./quotes.js";
import { refreshMarket } from "./marketdata.js";
import { initCloud, cloudStatus } from "./cloud.js";
import { viewHome, afterHome } from "./home.js";
import { viewAnalysis, afterAnalysis } from "./analysisview.js";
import { viewSearch, afterSearch } from "./search.js";
import { viewPortfolios, afterPortfolios } from "./portfolios.js";
import { viewProfile, afterProfile } from "./profile.js";
import { viewCloud } from "./cloud.js";

const VIEWS = {
  home: { view: viewHome, after: afterHome },
  analysis: { view: viewAnalysis, after: afterAnalysis },
  search: { view: viewSearch, after: afterSearch },
  portfolio: { view: viewPortfolios, after: afterPortfolios },
  profile: { view: viewProfile, after: afterProfile },
  cloud: { view: viewCloud, after: null },
};
const NAV = { home: 0, analysis: 1, search: 2, portfolio: 3, profile: 4 };
const NAV_LABEL = ["首頁", "行情", "搜索", "組合", "我的"];

/* ── 渲染 ── */
function render() {
  try {
    const { path, params } = parseRoute();
    const name = String(path || "/").replace(/^\/+/, "").split("/")[0] || "home";
    if (!VIEWS[name]) { location.hash = "#/home"; return; }
    const hashNow = location.hash || "#/home";
    const sameView = S.__renderHash === hashNow;   // 同一頁重繪（例如按 +自選）→ 保留捲動位置
    const keepY = window.scrollY || 0;
    S.tab = name;
    const sp = params.get("s");
    S.q = sp && !String(sp).includes(":") ? sp : "";
    const app = $("#app");
    if (!app) return;
    app.innerHTML = VIEWS[name].view();
    if (VIEWS[name].after) VIEWS[name].after();
    updateNav(name);
    updateCloudChip();
    if (sameView) {
      const restore = () => window.scrollTo(0, keepY);
      restore();
      requestAnimationFrame(restore);        // 重繪後 body 高度變動，iOS 會偷偷歸零，補兩次
      setTimeout(restore, 80);
    } else window.scrollTo(0, 0);
    S.__renderHash = hashNow;
  } catch (e) {
    console.error("[render]", e);
    const app = $("#app");
    if (app) app.innerHTML = `<div class="card"><p>頁面載入發生錯誤：${(e && e.message) || e}</p></div>`;
  }
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
  const chip = $("#cloudchip");
  if (!chip) return;
  const st = cloudStatus();
  const map = {
    off: { cls: "", label: "本機模式" },
    setup: { cls: "warn", label: "雲端待登入" },
    online: { cls: "ok", label: `已同步${st.user ? " · " + (st.user.email || "").split("@")[0] : ""}` },
  };
  const m = map[st.state] || map.off;
  chip.textContent = m.label;
  chip.className = "cloudchip " + m.cls;
  chip.title = "雲端同步狀態（點擊進入設定）";
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

/* ── 基礎 action（既有模組共用） ── */
registerAction("close-sheet", () => import("./ui.js").then(({ closeSheet }) => closeSheet()));
registerAction("refresh-all", () => refreshAll());
registerAction("go-cloud", () => { location.hash = "#/cloud"; });

/* ── details 開合狀態 ── */
document.addEventListener("click", (e) => {
  const d = e.target.closest?.("details.asset");
  if (!d) return;
  const id = d.dataset.id;
  if (id) {
    if (d.open) S.open.add(id); else S.open.delete(id);
  }
});

/* ── 首頁索引卡（#/home 內嵌於 app.js 渲染由 home.js 負責；這裡只處理品牌列） ── */
function brandRow() {
  const chip = `<span class="cloudchip" id="cloudchip" data-act="go-cloud">本機模式</span>`;
  return `<header class="brand">
    <div class="brand-title">GU1</div>
    ${chip}
  </header>`;
}

function init() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  const root = $("#root");
  root.innerHTML = `${brandRow()}
    <main id="app"></main>
    <nav class="bottom-nav">
      ${NAV_LABEL.map((l, i) => `<button type="button" class="nav-btn" data-tab="${Object.keys(NAV)[i]}" aria-selected="false">${l}</button>`).join("")}
    </nav>`;
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.addEventListener("click", () => { location.hash = "#/" + b.dataset.tab; });
  });
  boot();
}

document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
