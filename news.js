// news.js — 新聞：讀 news.json（排程由 Google News RSS 抓取）；每則點開外部原文，沒有資料的區塊不顯示
import { esc, registerAction } from "./ui.js";
import { S } from "./state.js";

let NEWS = null;
export async function loadNews() {
  try {
    const r = await fetch(`news.json?t=${Date.now()}`, { cache: "no-cache" });
    NEWS = r.ok ? await r.json() : null;
  } catch { NEWS = null; }
}
const ago = (d) => {
  if (!d) return "";
  const m = Math.max(0, Math.round((Date.now() - d) / 60000));
  return m < 60 ? `${m || 1} 分鐘前` : m < 1440 ? `${Math.round(m / 60)} 小時前` : `${Math.round(m / 1440)} 天前`;
};
const okUrl = (u) => /^https:\/\/news\.cnyes\.com\//.test(u || "");
const hasArt = (x) => x.id && NEWS?.art?.[x.id];
function rows(list, n) {
  return list.filter((x) => okUrl(x.u) && hasArt(x)).slice(0, n).map((x) =>
    `<a class="nrow" href="#/news/${x.id}">
      <div class="nt">${esc(x.t)}</div>
      <div class="nm2">${esc(x.s || "新聞")}${x.d ? " · " + ago(x.d) : ""}</div>
    </a>`).join("");
}
const TABS = [["tw", "台股"], ["us", "美股"], ["crypto", "加密"]];
export function homeNewsCard() {
  const m = NEWS?.market; if (!m) return "";
  const tabs = TABS.filter(([k]) => (m[k] || []).some((x) => okUrl(x.u) && hasArt(x)));
  if (!tabs.length) return "";
  const cur = tabs.some(([k]) => k === S.newsTab) ? S.newsTab : tabs[0][0];
  return `<section class="xcard" id="news-card">
    <div class="sec-h"><span class="ico">📰</span><span class="tt">最新新聞</span><span class="sp"></span>
      <span class="rng-seg">${tabs.map(([k, l]) => `<button class="${k === cur ? "on" : ""}" data-act="news-tab" data-tab="${k}">${l}</button>`).join("")}</span></div>
    ${rows(m[cur], 8)}
    <p class="small muted" style="margin-top:8px">新聞來源：鉅亨網，點開前往原文。</p>
  </section>`;
}
export function stockNewsCard(key) {
  const l = NEWS?.stocks?.[key]; if (!l || !l.some((x) => okUrl(x.u) && hasArt(x))) return "";
  return `<section class="xcard"><div class="sec-h"><span class="ico">📰</span><span class="tt">相關新聞</span></div>${rows(l, 5)}</section>`;
}
export function marketNewsCard(n = 6) {
  const l = NEWS?.market?.tw; if (!l) return "";
  const r = rows(l, n); if (!r) return "";
  return `<section class="xcard"><div class="sec-h"><span class="ico">📰</span><span class="tt">相關新聞（鉅亨網）</span></div>${r}</section>`;
}
export function viewNews() {
  const id = decodeURIComponent((location.hash.split("/news/")[1] || "").split("?")[0]);
  const all = [...Object.values(NEWS?.market || {}).flat(), ...Object.values(NEWS?.stocks || {}).flat()];
  const x = all.find((y) => String(y.id) === id), body = NEWS?.art?.[id];
  if (!x || !body) return `<section class="xcard"><p class="small muted">這則新聞已不在清單中。</p><a class="more-link" href="#/">回首頁 ›</a></section>`;
  const paras = body.split("\n").filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");
  return `<section class="xcard news-art"><h2 class="na-t">${esc(x.t)}</h2>
    <div class="nm2">${esc(x.s || "新聞")}${x.d ? " · " + new Date(x.d).toLocaleString("zh-TW", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</div>
    <div class="na-b">${paras}</div>
    <a class="btn" href="${esc(x.u)}" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;margin-top:12px">到鉅亨網閱讀原文 ›</a>
    <p class="small muted" style="margin-top:8px">內文摘自鉅亨網，著作權屬原媒體。</p></section>`;
}
registerAction("news-tab", (el) => {
  S.newsTab = el.dataset.tab;
  const c = document.getElementById("news-card"); if (!c) return;
  const t = document.createElement("div"); t.innerHTML = homeNewsCard();
  if (t.firstElementChild) c.replaceWith(t.firstElementChild);
});
