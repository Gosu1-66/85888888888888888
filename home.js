// home.js — 首頁（對齊參考 App「股市智投」概覽頁）：每日盤勢 AI 卡、橫滑功能卡、投資組合、自選股、熱門股。
import { $, esc, fmt, pct, tone, toast, statusBanner, registerAction } from "./ui.js";
import { S, save, holdings, uni } from "./state.js";
import { keyOf } from "./portfolio.js";
import { HOT_STOCKS } from "./catalog.js";
import { indices, institutions, breadth, industryFlow, daytrade, marketTone } from "./marketdata.js";

const yi = (n) => (n == null || isNaN(n)) ? "—" : fmt(Math.round(n / 1e8), 0) + "億";

/* ── 公司圖示（三級降級：幣種圖示 → TradingView logo → 字首） ── */
export function stockLogo(key, name, sym, cls = "qrow-logo") {
  let h = 0;
  for (const c of String(sym)) h = (h * 31 + c.charCodeAt(0)) % 360;
  const clean = String(name || sym).replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "");
  const ch = clean.slice(0, 1) || String(sym).slice(0, 1);
  const fallback = `<span class="lg-char" style="color:#20262e">${esc(ch)}</span>`;
  const cid = S.cryptoLogos?.[String(sym).toUpperCase()];
  if (cid) return `<span class="${cls}" style="background:#fff"><i class="logo-bg" style="background-image:url('${cid}')"></i>${fallback}</span>`;
  const id = S.logos?.[key];
  if (id) return `<span class="${cls}" style="background:#fff"><i class="logo-bg" style="background-image:url('https://s3-symbol-logo.tradingview.com/${encodeURIComponent(id)}--big.svg')"></i>${fallback}</span>`;
  return `<span class="${cls}" style="background:hsl(${h} 38% 20%);border-color:hsl(${h} 45% 34%)">${fallback}</span>`;
}

/* ── 迷你走勢 ── */
export function sparkLine(key, w = 60, h = 24) {
  const rows = S.file?.candles?.[key];
  if (!rows || rows.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"></svg>`;
  const cs = rows.slice(-40).map((r) => r[4]);
  const min = Math.min(...cs), max = Math.max(...cs), rng = (max - min) || 1;
  const pts = cs.map((c, i) => `${((i / (cs.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((c - min) / rng) * (h - 4)).toFixed(1)}`).join(" ");
  const up = cs[cs.length - 1] >= cs[0];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${up ? "var(--up)" : "var(--down)"}" stroke-width="1.4" stroke-linecap="round"/></svg>`;
}

/* ── 每日盤勢 AI 卡 ── */
function aiCard() {
  const t = marketTone();
  const b = breadth();
  const inst = institutions();
  const inds = industryFlow();
  if (!t) {
    return `<section class="ai-card"><div class="ai-top"><span class="ai-tag mid">資料更新中</span><span class="sp"></span><span class="when">—</span></div>
      <h1 class="ai-title">市場資料尚未更新</h1>
      <p class="ai-body">市場指數與法人資料由 GitHub 排程於盤後更新，稍後會自動補上。</p>
      <div class="ai-foot">整合指數、新聞與台股事件</div></section>`;
  }
  const idx = indices().find((i) => i.code === "t00");
  const best = inds.slice().sort((a, c) => (c.totalNet || 0) - (a.totalNet || 0));
  const strong = best[0], weak = best[best.length - 1];
  const dir = t.score >= 2 ? "盤中走強" : t.score <= -2 ? "盤中重挫" : "盤中震盪";
  const title = `${esc((idx?.name || "台股").replace("發行量加權股價指數", "台股"))}${dir}${strong ? `，${esc(strong.name)}與${esc(weak?.name || "")}類股分歧` : ""}`;
  const nl = inst?.total?.net != null ? `外資今日${inst.total.net >= 0 ? "轉買" : "賣超"} ${yi(Math.abs(inst.total.net))}` : "";
  const body = [
    b ? `上市上漲 ${b.rise} 檔、下跌 ${b.fall} 檔，成交金額 ${yi(b.amount)}。` : "",
    strong ? `${strong.name}資金淨流入 ${yi(strong.totalNet)}，${weak?.name || ""}淨流出 ${yi(Math.abs(weak?.totalNet || 0))}。` : "",
    nl ? `${nl}，籌碼面${inst.total.net >= 0 ? "偏多" : "偏空"}。` : "",
  ].filter(Boolean).join("");
  const date = S.market?.date ? `${S.market.date.slice(4, 6)}/${S.market.date.slice(6, 8)}` : "";
  const labelCls = t.score >= 2 ? "bull" : t.score <= -2 ? "" : "mid";
  return `<section class="ai-card" data-act="goto" data-href="#/market">
    <div class="ai-top">
      <span class="ai-tag ${labelCls}">${esc(t.label)}</span>
      <span class="sp"></span>
      <span class="when">${date} ${new Date().toTimeString().slice(0, 5)}</span>
      <span class="chev" style="color:#7d858f">›</span>
    </div>
    <h1 class="ai-title">${title}</h1>
    <p class="ai-body">${body}</p>
    <div class="ai-chips"><span class="ai-chip">加權指數</span><span class="ai-chip">台指期</span><span class="ai-chip">外資</span></div>
    <div class="ai-foot"><span>整合指數、新聞與台股事件</span><span class="sp"></span><span style="color:var(--gold)">AI ›</span></div>
  </section>`;
}

/* ── 功能入口（可橫滑） ── */
const FNS = [
  { k: "radar", lb: "市場雷達", ic: "📡", href: "#/radar" },
  { k: "inst", lb: "法人買超", ic: "🏦", href: "#/inst" },
  { k: "daytrade", lb: "當沖排行", ic: "⚡", href: "#/daytrade" },
  { k: "scan", lb: "技術面選股", ic: "📈", href: "#/scan" },
  { k: "heat", lb: "市場熱力圖", ic: "🔥", href: "#/heat", hot: 1 },
  { k: "tools", lb: "工具箱", ic: "🧰", href: "#/tools" },
  { k: "watch", lb: "我的自選", ic: "⭐", act: "scroll-to", target: "watchlist" },
  { k: "index", lb: "指數總覽", ic: "🧭", href: "#/indexb" },
  { k: "custom", lb: "自訂", ic: "＋", href: "#/profile?f=entries" },
];
function fnRow() {
  return `<div class="fn-row">${FNS.map((f) => {
    const inner = `<span class="fic">${f.ic}</span><span class="flb">${esc(f.lb)}</span>`;
    return f.href
      ? `<a class="fncard ${f.hot ? "hot" : ""}" href="${f.href}">${inner}</a>`
      : `<button type="button" class="fncard" data-act="${f.act}" data-target="${f.target}">${inner}</button>`;
  }).join("")}</div>`;
}

/* ── 投資組合卡 ── */
function portfolioCard() {
  const hs = holdings().filter((h) => h.shares > 0);
  if (!hs.length) {
    return `<section class="empty-card">
      <div class="eico">💼</div>
      <h3>尚無投資組合</h3>
      <p>建立投資組合，開始追蹤你的投資績效。</p>
      <button type="button" class="goldbtn" data-act="goto" data-href="#/portfolio">建立投資組合</button>
    </section>`;
  }
  return `<section class="xcard" data-act="goto" data-href="#/portfolio">
    <div class="sec-h"><span class="ico">💼</span><span class="tt">我的投資組合</span><span class="sp"></span><span class="chev">›</span></div>
    <div class="muted small">共 ${hs.length} 筆持股，點擊查看績效。</div>
  </section>`;
}

/* ── 自選股卡 ── */
function watchCard() {
  const keys = S.set.watch || [];
  if (!keys.length) {
    return `<section class="empty-card" id="watchlist">
      <div class="eico">🔍</div>
      <h3>還沒有自選股</h3>
      <p>把關注的股票加入自選，隨時掌握價格變化。</p>
      <button type="button" class="ghostbtn" data-act="goto" data-href="#/search">＋ 新增自選股</button>
    </section>`;
  }
  const all = uni();
  const rows = keys.map((key) => ({ key, u: all.find((x) => x.key === key) })).filter((x) => x.u).map(({ key, u }) => {
    const q = S.quotes[key];
    return `<a class="rrow side" href="#/stock/${encodeURIComponent(key)}">
      ${stockLogo(key, u.name, u.symbol)}
      <div class="rmid"><div class="nm">${esc(u.name)}</div><div class="sub">${esc(u.symbol)} · ${esc(u.board || (q?.source === "binance" ? "即時" : "延遲"))}</div></div>
      <div class="rpx"><div class="p ${q ? tone(q.change) : ""}">${q ? fmt(q.price, 2) : "—"}</div><div class="d ${q ? tone(q.change) : "muted"}">${q ? pct(q.change) : "無報價"}</div></div>
      <div class="rside">${sparkLine(key)}</div>
    </a>`;
  }).join("");
  return `<section class="xcard" id="watchlist">
    <div class="sec-h"><span class="ico">⭐</span><span class="tt">我的自選</span><span class="sp"></span><a class="small" style="color:var(--muted);text-decoration:none" href="#/search">編輯</a></div>
    ${rows || `<div class="muted small empty">自選清單是空的。</div>`}
  </section>`;
}

/* ── 熱門股（一行一檔） ── */
function hotCard() {
  const top = HOT_STOCKS.slice(0, 3);
  return `<section class="xcard">
    <div class="sec-h"><span class="ico">🔥</span><span class="tt">熱門股</span><span class="sp"></span><a class="small" style="color:var(--muted);text-decoration:none" href="#/search">看更多 ›</a></div>
    ${top.map((h) => {
      const key = keyOf("台股", h.symbol);
      const q = S.quotes[key];
      return `<a class="rrow side" href="#/stock/${encodeURIComponent(key)}">
        ${stockLogo(key, h.name, h.symbol)}
        <div class="rmid"><div class="nm">${esc(h.name)}</div><div class="sub">${esc(h.symbol)} · 上市</div></div>
        <div class="rpx"><div class="p ${q ? tone(q.change) : ""}">${q ? fmt(q.price, 2) : "—"}</div><div class="d ${q ? tone(q.change) : "muted"}">${q ? pct(q.change) : "無報價"}</div></div>
        <div class="rside">${sparkLine(key)}</div>
      </a>`;
    }).join("")}
  </section>`;
}

/* ── 盤後法人／當沖快覽 ── */
function afterHoursCard() {
  const inst = institutions(), dt = daytrade();
  if (!inst && !dt) return "";
  const rows = [];
  if (inst?.total?.net != null) rows.push(`<div class="row" style="padding:6px 0"><span class="small muted">三大法人合計</span><span class="num small ${tone(inst.total.net)}">${yi(inst.total.net)}</span></div>`);
  if (inst?.foreign?.net != null) rows.push(`<div class="row" style="padding:6px 0"><span class="small muted">外資</span><span class="num small ${tone(inst.foreign.net)}">${yi(inst.foreign.net)}</span></div>`);
  if (inst?.trust?.net != null) rows.push(`<div class="row" style="padding:6px 0"><span class="small muted">投信</span><span class="num small ${tone(inst.trust.net)}">${yi(inst.trust.net)}</span></div>`);
  if (dt?.total != null) { const v = dt.total.shares || 0; rows.push(`<div class="row" style="padding:6px 0"><span class="small muted">當沖成交量</span><span class="num small">${v > 1e10 ? yi(v) : fmt(Math.round(v / 1000)) + "張"}</span></div>`); }
  return `<section class="xcard">
    <div class="sec-h"><span class="ico">🏦</span><span class="tt">盤後籌碼</span><span class="sp"></span><span class="meta">${S.market?.date ? S.market.date.slice(4, 6) + "/" + S.market.date.slice(6, 8) : ""}</span></div>
    ${rows.join("") || `<div class="muted small">尚無資料</div>`}
    <a class="more-link" href="#/inst">看完整法人買超排行 ›</a>
  </section>`;
}

export function viewHome() {
  return `${statusBanner()}
    ${aiCard()}
    ${fnRow()}
    ${portfolioCard()}
    ${watchCard()}
    ${afterHoursCard()}
    ${hotCard()}
    <p class="muted small" style="text-align:center;margin-top:14px;font-size:11px">報價與市場資料來自公開來源（幣安即時／TWSE 盤後），可能有延遲或誤差，僅供參考，不構成投資建議。</p>`;
}

export function afterHome() { /* 預留 */ }

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
registerAction("goto", (el) => { location.hash = el.dataset.href || "#/home"; });
