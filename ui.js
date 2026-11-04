// ui.js — 共用 UI 工具：DOM、格式、彈窗、事件註冊。所有 view 模組唯一的 UI 依賴。
import { S } from "./state.js";

/* ── DOM ── */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ── 格式 ── */
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmt = (n, d = 0) => Number(n).toLocaleString("zh-TW", { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (n) => `${n >= 0 ? "+" : ""}${Number(n).toFixed(2)}%`;
export const tone = (n) => (n > 0 ? "up" : n < 0 ? "down" : "");
export const money = (cur, n, d = 2) => `${cur === "USD" ? "$" : "NT$"} ${fmt(n, n >= 1000 ? Math.min(d, 2) : d)}`;
export function ageText(ms) {
  if (!ms) return "—";
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? "剛剛" : m < 60 ? `${m} 分鐘前` : m < 1440 ? `${Math.round(m / 60)} 小時前` : `${Math.round(m / 1440)} 天前`;
}
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const fmtDate = (t) => { const d = new Date(t); return isNaN(d) ? "—" : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; };

/* ── 提示 ── */
let toastTimer;
export function toast(msg) { const t = $("#toast"); if (!t) return; t.textContent = msg; t.classList.remove("hidden"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 2600); }

/* ── 彈窗 ── */
export function openSheet(html) { const o = $("#modal"); if (!o) return; o.innerHTML = `<div class="overlay" data-act="close-sheet"><div class="sheet" role="dialog">${html}</div></div>`; $(".sheet", o)?.addEventListener("click", (e) => e.stopPropagation()); }
export function closeSheet() { const o = $("#modal"); if (o) o.innerHTML = ""; }

/* ── 報價徽章 ── */
export function badge(q) {
  if (!q) return '<span class="badge none">無報價</span>';
  if (q.source === "binance") return '<span class="badge live">即時</span>';
  if (q.source === "manual") return '<span class="badge">手動</span>';
  return `<span class="badge delay" title="市場報價時間">延遲 · ${ageText(q.time)}</span>`;
}

/* ── 資料源異常提示 ── */
export function statusBanner() {
  const st = S.status, parts = [];
  if (st.binance === "fail") parts.push('<div class="banner err">加密貨幣即時行情暫時連不上（可能是網路或所在地區限制），目前顯示的價格可能不是最新。</div>');
  if (st.file !== undefined) {
    if (st.file === "fail") parts.push('<div class="banner">讀不到台股／美股行情檔（離線或尚未部署）。持股暫以成本價計算。</div>');
    else if (st.file === "empty") parts.push('<div class="banner">台股／美股報價還沒有資料：網站剛建立時需等第一次自動更新（通常幾分鐘內）。</div>');
    else if (st.fileUpdated && Date.now() - st.fileUpdated > 3 * 86400000) parts.push(`<div class="banner">台股／美股行情已 ${Math.floor((Date.now() - st.fileUpdated) / 86400000)} 天沒有更新。請到 GitHub 專案的 Actions 頁面重新啟用自動更新（詳見說明文件）。</div>`);
  }
  return parts.join("");
}

/* ── 事件註冊（全域委派） ── */
const ACTIONS = {};
export function registerAction(name, fn) { ACTIONS[name] = fn; }
export function fireAction(el, e) {
  const fn = el && ACTIONS[el.dataset?.act];
  if (!fn) return false;
  e?.preventDefault?.();
  fn(el, e);
  return true;
}

/* ── 路由 ── */
export function parseRoute() {
  const [path, qs] = (location.hash || "#/").slice(1).split("?");
  return { path: path || "/", params: new URLSearchParams(qs || "") };
}

/* ── 複製文字（含 fallback） ── */
export async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch {
    const ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta); ta.select(); let ok = false;
    try { ok = document.execCommand("copy"); } catch {}
    ta.remove(); toast(ok ? okMsg : "複製失敗，請手動選取文字");
  }
}
