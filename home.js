// home.js — 首頁：盤後總覽、功能入口 9 格、市場情緒、熱門股、自選股、持股摘要、警報。
import { $, esc, fmt, pct, tone, money, ageText, toast, badge, statusBanner, registerAction } from "./ui.js";
import { S, save, fxRate, quoteOf, holdings, uni } from "./state.js";
import { keyOf } from "./portfolio.js";
import { HOT_STOCKS } from "./catalog.js";
import { indices, institutions, instRank, greedIndex, marketTone } from "./marketdata.js";
import { palette, drawDonut } from "./charts.js";

const ENTRY_META = {
  radar: { label: "雷達", icon: "📡", href: "#/analysis" },
  inst: { label: "法人排名", icon: "🏦", href: "#/analysis" },
  daytrade: { label: "當沖", icon: "⚡", href: "#/analysis" },
  scan: { label: "選股", icon: "🔍", href: "#/analysis" },
  tools: { label: "工具", icon: "🧰", href: "#/portfolio" },
  watchlist: { label: "自選", icon: "⭐", act: "scroll-to", target: "watchlist" },
  index: { label: "大盤", icon: "📈", href: "#/analysis" },
  custom: { label: "自訂", icon: "🎛️", href: "#/profile?f=entries" },
  cloud: { label: "雲端同步", icon: "☁️", href: "#/cloud" },
};

/* ── 漲跌色與單位 ── */
const yi = (n) => (n == null || isNaN(n)) ? "—" : fmt(Math.round(n / 1e8), 0) + "億";

/* ── 盤後總覽（指數 + 多空 + 法人） ── */
function heroCards() {
  const idxs = indices();
  const top = (idxs.find((i) => i.code === "t00") || idxs[0]);
  const two = idxs.find((i) => i.code === "o00");
  const cards = [];
  const card = (name, price, chg, p) => `<div class="idx-card compact">
    <div class="small muted">${esc(name)}</div>
    <div class="row" style="justify-content:space-between;align-items:baseline;gap:8px">
      <span class="num">${price != null ? fmt(price, 2) : "—"}</span>
      <span class="num small ${tone(p)}">${p != null ? pct(p) : "—"}</span>
    </div>
  </div>`;
  if (top) cards.push(card(top.name || "加權指數", top.price, top.change, top.changePct));
  if (two) cards.push(card(two.name || "櫃買指數", two.price, two.change, two.changePct));
  const toneT = marketTone();
  const toneHtml = toneT
    ? `<span class="chip ${toneT.score >= 2 ? "bull" : toneT.score <= -2 ? "bear" : "mid"}">盤後 ${toneT.label}</span>`
    : `<span class="chip mid">盤後資料尚未更新</span>`;
  return `<section class="hero">
    <div class="index-cards">${cards.length ? cards.join("") : `<div class="idx-card"><div class="small muted">指數</div><div class="num">—</div><div class="small muted">尚未載入 market.json</div></div>`}</div>
    <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center">${toneHtml}
      <span class="small muted">三大法人 <span class="num ${tone(instNet())}">${yi(instNet())}</span></span>
      <span class="small muted">外資 <span class="num ${tone(instNet("foreign"))}">${yi(instNet("foreign"))}</span></span>
    </div>
  </section>`;
}
function instNet(kind) {
  const i = institutions();
  if (!i) return null;
  if (kind) return i[kind]?.net ?? null;
  return i.total?.net ?? null;
}

/* ── 外資/投信/自營買超前 3 ── */
function instTop() {
  const r = instRank() || {};
  const u = uni();
  const sec = (type, label) => {
    const arr = (r[type] || []).filter((x) => x.net > 0).slice(0, 3);
    if (!arr.length) return "";
    return `<div class="chips"><span class="chip">${label}</span>${arr.map((x) => {
      const key = keyOf("台股", x.code);
      const name = u.find((y) => y.key === key)?.name || x.name || x.code;
      return `<a class="chip link" href="#/search?s=${encodeURIComponent(key)}">${esc(name)} <b>${(x.net / 1000).toFixed(0)}張</b></a>`;
    }).join("")}</div>`;
  };
  return sec("foreign", "外資買超") + sec("trust", "投信買超") + sec("dealer", "自營買超");
}

/* ── 功能入口 ── */
function entryGrid() {
  const order = S.set.entries?.order || Object.keys(ENTRY_META);
  const hidden = S.set.entries?.hidden || [];
  const items = order.filter((k) => !hidden.includes(k) && ENTRY_META[k]).map((k) => {
    const e = ENTRY_META[k];
    const inner = `${e.icon}<span class="small">${e.label}</span>`;
    return e.href ? `<a class="entry" href="${e.href}">${inner}</a>`
      : `<button type="button" class="entry" data-act="${e.act}" data-target="${e.target}">${inner}</button>`;
  }).join("");
  return `<section class="card">
    <h2 class="h2">功能入口</h2>
    <div class="entry-grid">${items}</div>
  </section>`;
}

/* ── 雷達（貪婪指數） ── */
function radar() {
  const g = greedIndex();
  if (!g) return `<section class="card" id="radar"><h2 class="h2">市場情緒雷達</h2><p class="muted small">尚未取得市場資料（需 GitHub 排程更新 market.json）。</p></section>`;
  const deg = Math.max(0, Math.min(100, g.score)) / 100 * 360;
  return `<section class="card" id="radar">
    <h2 class="h2">市場情緒雷達 <span class="tag ${g.score < 40 ? "bear" : g.score < 60 ? "mid" : "bull"}">${esc(g.label)}</span></h2>
    <div class="row" style="align-items:center;gap:16px">
      <div class="gauge-ring" style="background:conic-gradient(from -90deg, #ef4444 0deg, #f59e0b ${Math.max(deg / 2, 1)}deg, #16a34a ${deg}deg, #e5e7eb ${deg}deg 360deg)">
        <div class="gauge-num">${g.score}</div>
      </div>
      <div class="small muted" style="flex:1">由漲跌家數、外資近 5 日、指數近 20 日與 RSI 規則式估算（0-100）。${esc(g.parts?.map((p) => p.text).join("；") || "")}</div>
    </div>
  </section>`;
}

/* ── 熱門股（一行一檔：公司圖示 / 代號名稱 / 價格漲跌 / 迷你走勢） ── */
function stockLogo(key, name, sym) {
  let h = 0;
  for (const c of String(sym)) h = (h * 31 + c.charCodeAt(0)) % 360;
  const clean = String(name || sym).replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "");
  const ch = clean.slice(0, 1) || String(sym).slice(0, 1);
  const fallback = `<span class="lg-char" style="color:hsl(${h} 72% 74%)">${esc(ch)}</span>`;
  const id = S.logos?.[key];
  if (id) {
    return `<span class="qrow-logo" style="background:#fff">
      <img src="https://s3-symbol-logo.tradingview.com/${encodeURIComponent(id)}--big.svg" alt="" loading="lazy" onerror="this.remove()">
      ${fallback}
    </span>`;
  }
  return `<span class="qrow-logo" style="background:hsl(${h} 38% 20%);border-color:hsl(${h} 45% 34%)">${fallback}</span>`;
}

function sparkLine(key) {
  const rows = S.file?.candles?.[key];
  if (!rows || rows.length < 2) return `<svg class="spark" viewBox="0 0 64 26" preserveAspectRatio="none"></svg>`;
  const cs = rows.slice(-40).map((r) => r[4]);
  const min = Math.min(...cs), max = Math.max(...cs), rng = (max - min) || 1;
  const pts = cs.map((c, i) => `${((i / (cs.length - 1)) * 62 + 1).toFixed(1)},${(24 - ((c - min) / rng) * 22).toFixed(1)}`).join(" ");
  const up = cs[cs.length - 1] >= cs[0];
  return `<svg class="spark" viewBox="0 0 64 26" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${up ? "var(--up)" : "var(--down)"}" stroke-width="1.5" stroke-linecap="round"/></svg>`;
}

function hotStocks() {
  return `<section class="card">
    <h2 class="h2">熱門股</h2>
    <div class="qrows">${HOT_STOCKS.map((h) => {
      const key = keyOf("台股", h.symbol);
      const q = S.quotes[key];
      const w = S.set.watch.includes(key);
      return `<a class="qrow" href="#/search?s=${encodeURIComponent(key)}">
        ${stockLogo(key, h.name, h.symbol)}
        <div class="qrow-id">
          <span class="qrow-sym">${esc(h.symbol)}${w ? `<span class="dot"></span>` : ""}</span>
          <span class="muted small">${esc(h.name)}</span>
        </div>
        <div class="qrow-px">
          <span class="num ${q ? tone(q.change) : ""}">${q ? fmt(q.price, 2) : "—"}</span>
          <span class="small ${q ? tone(q.change) : "muted"}">${q ? pct(q.change) : "無報價"}</span>
        </div>
        <div class="qrow-spark">${sparkLine(key)}</div>
      </a>`;
    }).join("")}</div>
  </section>`;
}

/* ── 自選股 ── */
function watchTab() {
  const g = S.set.watch;
  const all = uni();
  const groups = ["全部", "台股", "美股", "加密貨幣", "指數"];
  const tab = S.watchTab || "全部";
  const list = g
    .map((key) => ({ key, u: all.find((x) => x.key === key) }))
    .filter((x) => x.u)
    .filter((x) => tab === "全部" || x.u.market === tab);
  const rows = list.length ? list.map(({ key, u }) => {
    const q = S.quotes[key];
    return `<div class="list-item">
      ${stockLogo(key, u.name, u.symbol)}
      <a href="#/search?s=${encodeURIComponent(key)}" style="text-decoration:none;color:inherit;flex:1;min-width:0">
        <strong>${esc(u.symbol)}</strong> <span class="muted small">${esc(u.name)}</span>
        ${u.board ? `<span class="tag mid">${esc(u.board)}</span>` : ""}
      </a>
      <span class="num">${q ? fmt(q.price, 2) : "—"}</span>
      <span class="num ${q ? tone(q.change) : ""}">${q ? pct(q.change) : "—"}</span>
      ${q ? badge(q) : `<span class="badge none">無報價</span>`}
      <button type="button" class="btn sm" data-act="toggle-watch" data-key="${esc(key)}">移除</button>
    </div>`;
  }).join("") : `<div class="muted small empty">自選清單是空的。可在「熱門股」按 ＋ 或到搜索頁加入。</div>`;
  return `<section class="card" id="watchlist">
    <h2 class="h2">自選股</h2>
    <div class="chips">${groups.map((t) => `<button type="button" class="chip ${tab === t ? "on" : ""}" data-act="watch-tab" data-tab="${esc(t)}">${t}</button>`).join("")}</div>
    <div class="list">${rows}</div>
  </section>`;
}

/* ── 持股摘要 ── */
function holdingSummary() {
  const hs = holdings().filter((h) => h.shares > 0).sort((a, b) => {
    const fx = fxRate();
    return (b.shares * b.avgCost * (b.currency === "TWD" ? 1 : fx)) - (a.shares * a.avgCost * (a.currency === "TWD" ? 1 : fx));
  }).slice(0, 3);
  if (!hs.length) return "";
  const fx = fxRate();
  return `<section class="card">
    <h2 class="h2">持股摘要 <a class="small" href="#/portfolio">全部 →</a></h2>
    <div class="list">${hs.map((h) => {
      const q = quoteOf(h);
      const val = h.shares * (q ? q.price : h.avgCost) * (h.currency === "TWD" ? 1 : fx);
      const cost = h.shares * h.avgCost * (h.currency === "TWD" ? 1 : fx);
      const pnl = val - cost, ret = cost ? (pnl / cost) * 100 : 0;
      return `<div class="list-item">
        <span style="flex:1;min-width:0"><strong>${esc(h.name)}</strong> <span class="muted small">${esc(h.symbol)}</span></span>
        <span class="num">NT$ ${fmt(val)}</span>
        <span class="num ${tone(ret)}">${pnl >= 0 ? "+" : ""}${fmt(pnl)} (${pct(ret)})</span>
      </div>`;
    }).join("")}</div>
  </section>`;
}

/* ── 警報摘要 ── */
function alertSummary() {
  const alerts = (S.set.alerts || []).filter((a) => a.active);
  const unread = (S.set.notifications || []).filter((n) => !n.read).length;
  if (!alerts.length && !unread) return "";
  return `<section class="card">
    <h2 class="h2">警報 ${unread ? `<span class="badge live">${unread}</span>` : ""} <a class="small" href="#/profile">管理 →</a></h2>
    <div class="list">${alerts.slice(0, 3).map((a) => {
      const u = uni().find((x) => x.key === a.key);
      const kind = { "price-above": "價格高於", "price-below": "價格低於", "day-above": "漲跌高於", "day-below": "漲跌低於" }[String(a.kind).replace(/_/g, "-")] || a.kind;
      return `<div class="list-item"><span style="flex:1">${esc(u?.name || a.key)}</span><span class="muted small">${kind} ${a.threshold}</span></div>`;
    }).join("")}</div>
  </section>`;
}

/* ── 主視圖 ── */
export function viewHome() {
  return `${statusBanner()}
    ${heroCards()}
    ${entryGrid()}
    ${instTop() ? `<section class="card"><h2 class="h2">盤後法人動向</h2>${instTop()}</section>` : ""}
    ${hotStocks()}
    ${watchTab()}
    ${holdingSummary()}
    ${alertSummary()}
    <p class="muted small" style="text-align:center;margin-top:16px">報價與市場資料來自公開來源（幣安即時／TWSE 盤後），可能有延遲或誤差，僅供參考，不構成投資建議。</p>`;
}

export function afterHome() {
  const c = $("#home-donut"); if (c) { /* 保留擴充點 */ }
}

/* ── actions ── */
registerAction("toggle-watch", (el) => {
  const key = el.dataset.key;
  const i = S.set.watch.indexOf(key);
  if (i >= 0) { S.set.watch.splice(i, 1); toast("已移出自選"); }
  else { S.set.watch.push(key); toast("已加入自選"); }
  save(); window.dispatchEvent(new CustomEvent("portfolios:changed"));
});
registerAction("add-hot", (el) => {
  const key = el.dataset.key;
  if (!S.set.watch.includes(key)) { S.set.watch.push(key); toast("已加入自選"); save(); }
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
});
registerAction("watch-tab", (el) => {
  S.watchTab = el.dataset.tab;
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
});
registerAction("scroll-to", (el) => {
  const t = document.getElementById(el.dataset.target);
  if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
});
