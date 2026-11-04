import { MARKETS, currencyOf, keyOf, computePosition, validateTrades, toHoldings, holdingStats, portfolioStats, toTWD } from "./portfolio.js";
import { CATALOG, universe } from "./catalog.js";
import { refreshQuotes, loadCandles, loadPricesFile } from "./quotes.js";
import { buildSeries } from "./indicators.js";
import { analyze } from "./analysis.js";
import { drawTechnical, drawDonut, palette } from "./charts.js";

/* ───────── 小工具 ───────── */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n, d = 0) => Number(n).toLocaleString("zh-TW", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const tone = (n) => (n > 0 ? "up" : n < 0 ? "down" : "");
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const money = (cur, n, d = 2) => `${cur === "USD" ? "$" : "NT$"} ${fmt(n, n >= 1000 ? Math.min(d, 2) : d)}`;
function ageText(ms) {
  if (!ms) return "—";
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? "剛剛" : m < 60 ? `${m} 分鐘前` : m < 1440 ? `${Math.round(m / 60)} 小時前` : `${Math.round(m / 1440)} 天前`;
}
let toastTimer;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 2600); }

/* ───────── 儲存 ───────── */
const DATA_KEY = "gosu-portfolio-v2", SET_KEY = "gosu-settings-v1";
function load(key, fallback) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch { return fallback; } }
let storageWarned = false;
function save() {
  try { localStorage.setItem(DATA_KEY, JSON.stringify(S.data)); localStorage.setItem(SET_KEY, JSON.stringify(S.set)); }
  catch { if (!storageWarned) { storageWarned = true; toast("⚠ 無法寫入瀏覽器儲存空間，資料可能不會保留（請檢查是否為無痕模式）"); } }
  try { navigator.storage?.persist?.(); } catch {}
}
function sanitizeData(d) {
  if (!d || !Array.isArray(d.assets) || !Array.isArray(d.trades)) return null;
  const assets = d.assets.filter((a) => a && a.id && MARKETS.includes(a.market) && a.symbol).map((a) => ({ id: String(a.id), market: a.market, symbol: String(a.symbol).toUpperCase(), name: String(a.name || a.symbol) }));
  const ids = new Set(assets.map((a) => a.id));
  const trades = d.trades.filter((t) => t && ids.has(t.assetId) && (t.type === "buy" || t.type === "sell") && Number.isFinite(+t.qty) && +t.qty > 0 && Number.isFinite(+t.price) && /^\d{4}-\d{2}-\d{2}$/.test(t.date))
    .map((t) => ({ id: String(t.id || uid()), assetId: t.assetId, type: t.type, date: t.date, qty: +t.qty, price: +t.price, fee: Math.max(0, +t.fee || 0) }));
  const out = { assets, trades };
  for (const a of assets) { if (validateTrades(trades.filter((t) => t.assetId === a.id))) return null; }
  return out;
}

/* ───────── 狀態 ───────── */
const DEFAULT_SET = { watch: ["台股:2330", "美股:NVDA", "加密貨幣:BTC"], custom: [], manual: {}, fxManual: null };
const S = {
  data: sanitizeData(load(DATA_KEY, null)) || { assets: [], trades: [] },
  set: { ...DEFAULT_SET, ...load(SET_KEY, {}) },
  quotes: {}, status: {}, file: null, fileAt: 0, lastRefresh: 0, refreshing: false,
  tab: "自選", q: "", open: new Set(),
  sel: null, tech: null, techReq: 0, hover: -1,
};
const fxRate = () => (Number.isFinite(+S.set.fxManual) && +S.set.fxManual > 0 ? +S.set.fxManual : S.status.fx || 32);
const fxSource = () => (S.set.fxManual ? "手動設定" : S.status.fx ? "自動（延遲）" : "預設值（尚未取得）");
const quoteOf = (h) => S.quotes[keyOf(h.market, h.symbol)] ?? null;
const holdings = () => toHoldings(S.data);
const uni = () => universe(S.set, S.data);

/* ───────── 行情更新 ───────── */
async function refresh() {
  if (S.refreshing) return;
  S.refreshing = true;
  try {
    const crypto = uni().filter((u) => u.market === "加密貨幣").map((u) => u.symbol);
    const useCache = S.file && Date.now() - S.fileAt < 5 * 60000;
    const r = await refreshQuotes({ cryptoSymbols: crypto, manual: S.set.manual, fileCache: useCache ? S.file : null });
    S.quotes = r.quotes;
    if (!useCache) { S.file = r.file; S.fileAt = Date.now(); S.status = r.status; } else S.status = { ...r.status, file: S.status.file, fileUpdated: S.status.fileUpdated, fx: S.status.fx };
    S.lastRefresh = Date.now();
    if (S.tech && !S.tech.loading && !S.tech.series) S.tech = null; // 先前讀不到 K 線，行情檔更新後重試
  } finally { S.refreshing = false; render(); }
}

/* ───────── 畫面：共用 ───────── */
const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>', wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1"/>',
  market: '<path d="M3 17l5-6 4 4 8-9"/><path d="M15 6h5v5"/>', tech: '<path d="M6 4v3M6 15v5M6 7h0M4 7h4v8H4zM16 3v4M16 14v5M14 7h4v7h-4z"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17v4M17 19h4"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
};
const NAV = [["#/", "投資總覽", "home"], ["#/holdings", "我的持股", "wallet"], ["#/market", "市場行情", "market"], ["#/technical", "技術分析", "tech"], ["#/analysis", "分析解讀", "spark"], ["#/settings", "個人設定", "gear"]];

function badge(q) {
  if (!q) return '<span class="badge none">無報價</span>';
  if (q.source === "binance") return '<span class="badge live">即時</span>';
  if (q.source === "manual") return '<span class="badge">手動</span>';
  return `<span class="badge delay" title="市場報價時間">延遲 · ${ageText(q.time)}</span>`;
}

function statusBanner() {
  const st = S.status, parts = [];
  const hasStocks = holdings().some((h) => h.shares > 0 && h.market !== "加密貨幣") || S.set.watch.some((k) => !k.startsWith("加密貨幣"));
  if (st.binance === "fail") parts.push('<div class="banner err">加密貨幣即時行情暫時連不上（可能是網路或所在地區限制），目前顯示的價格可能不是最新。</div>');
  if (hasStocks && st.file !== undefined) {
    if (st.file === "fail") parts.push('<div class="banner">讀不到台股／美股行情檔（離線或尚未部署）。持股暫以成本價計算，可在「我的持股」手動輸入現價。</div>');
    else if (st.file === "empty") parts.push('<div class="banner">台股／美股報價還沒有資料：網站剛建立時需等第一次自動更新（通常幾分鐘內）。在那之前可手動輸入現價。</div>');
    else if (st.fileUpdated && Date.now() - st.fileUpdated > 3 * 86400000) parts.push(`<div class="banner">台股／美股行情已 ${Math.floor((Date.now() - st.fileUpdated) / 86400000)} 天沒有更新。若超過一週，請到 GitHub 專案的 Actions 頁面重新啟用自動更新（詳見說明文件）。</div>`);
  }
  return parts.join("");
}

/* ───────── 畫面：投資總覽 ───────── */
function viewOverview() {
  const hs = holdings().filter((h) => h.shares > 0), fx = fxRate();
  const s = portfolioStats(hs, quoteOf, fx);
  const COLORS = { 台股: "var(--primary)", 美股: "var(--blue)", 加密貨幣: "var(--warn)" };
  const byMarket = MARKETS.map((m) => ({ label: m, color: COLORS[m], value: hs.filter((h) => h.market === m).reduce((a, h) => a + holdingStats(h, quoteOf(h), fx).value, 0) })).filter((d) => d.value > 0);
  const stats = [["總資產", `NT$ ${fmt(s.value)}`, ""], ["投入成本", `NT$ ${fmt(s.cost)}`, ""], ["未實現損益", `NT$ ${fmt(s.pnl)}`, tone(s.pnl)], ["報酬率", pct(s.ret), tone(s.ret)], ["已實現損益", `NT$ ${fmt(s.realized)}`, tone(s.realized)]];
  if (!S.data.assets.length) return `<h1>投資總覽</h1><p class="sub">台股、美股、加密貨幣一次看</p>${statusBanner()}
    <div class="card empty"><p style="font-size:17px;color:var(--fg);margin:0 0 6px">還沒有任何持股</p><p style="margin:0 0 16px">從「我的持股」新增第一筆交易，總覽就會自動計算。</p>
    <button class="btn primary" data-act="add-trade">＋ 新增交易</button> <button class="btn" data-act="demo">載入範例（假資料，試用）</button></div>`;
  return `<h1>投資總覽</h1><p class="sub">以新台幣計算 · 美元匯率 ${fx.toFixed(3)}（${fxSource()}）</p>${statusBanner()}
  ${s.missing ? `<div class="banner">有 ${s.missing} 檔持股目前沒有報價，暫以成本價計算，損益可能不準。</div>` : ""}
  <div class="grid g4 g2" style="grid-template-columns:repeat(2,1fr)">${stats.map(([l, v, c]) => `<div class="card stat" style="margin:0"><div class="label">${l}</div><div class="value num ${c}">${v}</div></div>`).join("")}</div>
  <div class="grid split" style="margin-top:12px"><div class="card" style="margin:0"><h2>資產配置</h2><canvas id="donut"></canvas>
    <div class="list" style="margin-top:8px">${byMarket.map((d) => `<div class="row small item" style="padding:6px 0"><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${d.color};margin-right:8px"></i>${d.label}</span><span class="num">${s.value ? ((d.value / s.value) * 100).toFixed(1) : 0}%</span></div>`).join("")}</div></div>
  <div class="card" style="margin:0"><h2>持股表現</h2><div class="list">${hs.map((h) => { const r = holdingStats(h, quoteOf(h), fx); return `<div class="item row"><div><div style="font-weight:600">${esc(h.name)} <span class="muted small">${esc(h.symbol)}</span></div><div class="small muted">${h.market} ${badge(quoteOf(h))}</div></div><div class="right"><div class="num">NT$ ${fmt(r.value)}</div><div class="num small ${tone(r.ret)}">${pct(r.ret)}</div></div></div>`; }).join("")}</div></div></div>`;
}
function afterOverview() {
  const hs = holdings().filter((h) => h.shares > 0), fx = fxRate(), c = $("#donut"); if (!c) return;
  const P = palette(), col = { 台股: P.primary, 美股: P.blue, 加密貨幣: P.warn };
  drawDonut(c, MARKETS.map((m) => ({ label: m, color: col[m], value: hs.filter((h) => h.market === m).reduce((a, h) => a + holdingStats(h, quoteOf(h), fx).value, 0) })).filter((d) => d.value > 0));
}

/* ───────── 畫面：我的持股 ───────── */
function assetRow(h) {
  const q = quoteOf(h), r = holdingStats(h, q, fxRate()), id = h.id, trades = S.data.trades.filter((t) => t.assetId === id).sort((a, b) => b.date.localeCompare(a.date));
  const key = keyOf(h.market, h.symbol), manual = S.set.manual[key];
  return `<details class="asset" data-id="${id}" ${S.open.has(id) ? "open" : ""}>
  <summary><div class="row"><div><div style="font-weight:600">${esc(h.name)} <span class="muted small">${esc(h.symbol)}</span></div><div class="small muted">${h.market} · ${fmt(h.shares, h.market === "加密貨幣" ? 6 : 4).replace(/\.?0+$/, "")} ${h.market === "台股" ? "股" : h.market === "美股" ? "股" : "顆"} ${badge(q)}</div></div>
  <div class="right"><div class="num">NT$ ${fmt(r.value)}</div><div class="num small ${h.shares ? tone(r.ret) : ""}">${h.shares ? `${r.pnl >= 0 ? "+" : ""}${fmt(r.pnl)} (${pct(r.ret)})` : "已出清"}</div></div></div></summary>
  <div class="small" style="padding:0 0 12px">
    <div class="grid g2" style="gap:6px 12px;margin-bottom:10px">
      <div class="muted">現價</div><div class="num right">${q ? money(h.currency, q.price) : "—"}</div>
      <div class="muted">平均成本</div><div class="num right">${h.shares ? money(h.currency, h.avgCost) : "—"}</div>
      <div class="muted">已實現損益（${h.currency}）</div><div class="num right ${tone(h.realized)}">${fmt(h.realized, 2)}</div></div>
    ${!q || q.source === "manual" ? `<div class="row" style="gap:8px;margin-bottom:10px"><input id="mp-${id}" inputmode="decimal" placeholder="手動輸入現價（${h.currency}）" value="${manual ? manual.price : ""}"><button class="btn sm" data-act="set-manual" data-key="${esc(key)}" data-id="${id}">儲存</button>${manual ? `<button class="btn sm" data-act="clear-manual" data-key="${esc(key)}">清除</button>` : ""}</div>` : ""}
    <div class="row" style="gap:8px;margin-bottom:6px"><button class="btn sm primary" data-act="add-trade" data-asset="${id}">＋ 新增交易</button><button class="btn sm danger" data-act="del-asset" data-asset="${id}">刪除此標的</button></div>
    ${trades.map((t) => `<div class="trade"><div><b class="${t.type === "buy" ? "up" : "down"}">${t.type === "buy" ? "買進" : "賣出"}</b> <span class="num">${fmt(t.qty, 6).replace(/\.?0+$/, "")}</span> @ <span class="num">${fmt(t.price, 4).replace(/\.?0+$/, "")}</span>${t.fee ? ` · 手續費 ${fmt(t.fee, 2)}` : ""}<div class="muted">${t.date}</div></div>
      <div style="display:flex;gap:6px;align-items:center"><button class="btn sm" data-act="edit-trade" data-trade="${t.id}">修改</button><button class="btn sm danger" data-act="del-trade" data-trade="${t.id}">刪除</button></div></div>`).join("")}
  </div></details>`;
}
function viewHoldings() {
  const hs = holdings(), act = hs.filter((h) => h.shares > 0), closed = hs.filter((h) => h.shares === 0);
  return `<div class="row"><div><h1>我的持股</h1><p class="sub">以交易紀錄自動計算（加權平均成本）</p></div><button class="btn primary" data-act="add-trade">＋ 新增交易</button></div>${statusBanner()}
  ${!hs.length ? '<div class="card empty">還沒有持股，點右上角「＋ 新增交易」。</div>' : ""}
  ${act.length ? `<div class="card">${act.map(assetRow).join("")}</div>` : ""}
  ${closed.length ? `<h2 style="margin-top:18px">已出清</h2><div class="card">${closed.map(assetRow).join("")}</div>` : ""}`;
}

/* ───────── 畫面：市場行情 ───────── */
function marketCards() {
  const watch = new Set(S.set.watch), q = S.q.trim().toLowerCase();
  const list = uni().filter((u) => (S.tab === "自選" ? watch.has(u.key) : S.tab === "全部" || u.market === S.tab)).filter((u) => !q || u.symbol.toLowerCase().includes(q) || u.name.toLowerCase().includes(q));
  if (!list.length) return `<div class="card empty" style="grid-column:1/-1">${S.tab === "自選" && !q ? "自選清單是空的，點任一標的的星號加入。" : "沒有符合的標的"}</div>`;
  return list.map((u) => { const qt = S.quotes[u.key], cur = currencyOf(u.market); return `<div class="card quote" style="margin:0"><a class="quote" style="flex:1;min-width:0" href="#/technical?s=${encodeURIComponent(u.key)}"><div style="min-width:0"><div class="nm">${esc(u.name)}</div><div class="small muted">${esc(u.symbol)} · ${u.market} ${badge(qt)}</div></div>
    <div class="right"><div class="num" style="font-size:17px;font-weight:700">${qt ? money(cur, qt.price) : "—"}</div><div class="num small ${qt && qt.source !== "manual" ? tone(qt.change) : "muted"}">${qt && qt.source !== "manual" ? pct(qt.change) : ""}</div></div></a>
    <button class="star ${watch.has(u.key) ? "on" : ""}" data-act="toggle-watch" data-key="${esc(u.key)}" aria-label="加入自選">${watch.has(u.key) ? "★" : "☆"}</button></div>`; }).join("");
}
function viewMarket() {
  return `<div class="row"><div><h1>市場行情</h1><p class="sub">點星號加入自選，點標的看技術分析</p></div><button class="btn sm" data-act="add-custom">＋ 新增標的</button></div>${statusBanner()}
  <div class="seg">${["自選", "全部", "台股", "美股", "加密貨幣"].map((t) => `<button class="${S.tab === t ? "on" : ""}" data-act="set-tab" data-tab="${t}">${t}</button>`).join("")}</div>
  <input id="mq" type="search" placeholder="搜尋代號或名稱" value="${esc(S.q)}" style="margin-bottom:12px"><div class="grid g3" id="mlist" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">${marketCards()}</div>
  <p class="small muted" style="margin-top:14px">「即時」＝加密貨幣直連 Binance；「延遲」＝台股／美股由自動排程取得，括號為該筆報價的市場時間，可能晚於實際行情數分鐘至數十分鐘，請勿用於下單判斷。</p>`;
}

/* ───────── 技術分析／分析解讀 ───────── */
function pickDefaultSel() {
  if (S.sel && uni().some((u) => u.key === S.sel)) return S.sel;
  const h = holdings().find((x) => x.shares > 0);
  S.sel = h ? keyOf(h.market, h.symbol) : "台股:2330";
  return S.sel;
}
function selector() {
  const u = uni(), cur = pickDefaultSel();
  return `<select id="sym" aria-label="選擇標的">${MARKETS.map((m) => `<optgroup label="${m}">${u.filter((x) => x.market === m).map((x) => `<option value="${esc(x.key)}" ${x.key === cur ? "selected" : ""}>${esc(x.symbol)} ${esc(x.name)}</option>`).join("")}</optgroup>`).join("")}</select>`;
}
async function loadTech(key) {
  const req = ++S.techReq;
  S.tech = { key, loading: true };
  const [market, ...rest] = key.split(":"), symbol = rest.join(":");
  let candles = null, err = null;
  if (market !== "加密貨幣" && !S.file) { const f = await loadPricesFile(); if (f) { S.file = f; S.fileAt = Date.now(); } }
  try { candles = await loadCandles(market, symbol, S.file); } catch (e) { err = e.message; }
  if (req !== S.techReq) return;
  S.tech = { key, loading: false, err, series: candles ? buildSeries(candles) : null, source: market === "加密貨幣" ? "Binance 日 K 線" : `排程更新的日 K 線（${S.status.fileUpdated ? ageText(S.status.fileUpdated) + "更新" : "尚未更新"}）` };
  render();
}
function techEmpty(key) {
  const market = key.split(":")[0];
  return `<div class="card empty">${market === "加密貨幣" ? "暫時讀不到這檔的 K 線（可能是代號在 Binance 沒有對應的 USDT 交易對，或網路問題）。" : "這檔目前沒有 K 線資料。<br>台股／美股的 K 線來自自動排程；網站剛建立時需等第一次更新，或這個代號還沒加進自動更新清單（見「個人設定」）。"}</div>`;
}
function viewTechnical() {
  const key = pickDefaultSel();
  if (!S.tech || S.tech.key !== key) loadTech(key);
  const t = S.tech, u = uni().find((x) => x.key === key), q = S.quotes[key];
  let body;
  if (!t || t.loading) body = '<div class="card empty">載入 K 線中…</div>';
  else if (!t.series || t.series.length < 5) body = techEmpty(key);
  else body = `<div class="card"><div class="ohlc num" id="ohlc"></div><canvas id="tech"></canvas>
    <div class="legend"><span><i style="background:var(--warn)"></i>MA5</span><span><i style="background:var(--blue)"></i>MA20</span><span><i style="background:var(--pink)"></i>MA60</span><span>紅漲綠跌</span></div></div>
    <p class="small muted">資料來源：${esc(t.source)}。技術指標由日 K 收盤價計算，僅供參考，非投資建議。</p>`;
  return `<h1>技術分析</h1><p class="sub">K 線、均線、成交量、RSI、MACD</p>${statusBanner()}<div class="row" style="gap:12px;margin-bottom:12px"><div style="flex:1;min-width:0">${selector()}</div>${q ? `<div class="right"><div class="num" style="font-weight:700;font-size:17px">${money(currencyOf(u.market), q.price)}</div><div class="small">${badge(q)}</div></div>` : ""}</div>${body}`;
}
function afterTechnical() {
  const t = S.tech, c = $("#tech"); if (!t?.series || !c) return;
  const data = t.series.slice(-90), last = data.length - 1, cur = currencyOf(t.key.split(":")[0]);
  const show = (i) => { const d = data[i], dt = new Date(d.t); $("#ohlc").innerHTML = `<span>${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}</span><span>開 ${fmt(d.o, 2)}</span><span>高 ${fmt(d.h, 2)}</span><span>低 ${fmt(d.l, 2)}</span><span class="${d.c >= d.o ? "up" : "down"}">收 ${fmt(d.c, 2)}</span><span>量 ${fmt(d.v)}</span>${d.rsi != null ? `<span>RSI ${d.rsi.toFixed(1)}</span>` : ""}`; };
  let chart = drawTechnical(c, data, -1); show(last);
  const move = (e) => { const i = chart.indexAt(e.clientX); chart = drawTechnical(c, data, i); show(i); };
  c.onpointermove = move; c.onpointerdown = move;
  c.onpointerleave = () => { chart = drawTechnical(c, data, -1); show(last); };
  c.onpointerup = (e) => { if (e.pointerType !== "mouse") c.onpointerleave(); };
  void cur;
}
function viewAnalysis() {
  const key = pickDefaultSel();
  if (!S.tech || S.tech.key !== key) loadTech(key);
  const t = S.tech, u = uni().find((x) => x.key === key);
  let body;
  if (!t || t.loading) body = '<div class="card empty">分析中…</div>';
  else if (!t.series) body = techEmpty(key);
  else {
    const a = analyze(t.series);
    if (!a) body = '<div class="card empty">K 線資料不足（至少需要 30 根日線）。</div>';
    else {
      const cls = a.label === "偏多" ? "bull" : a.label === "偏空" ? "bear" : "mid";
      const sec = (title, arr) => `<div class="card"><h2>${title}</h2><ul class="bul">${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
      body = `<div class="card row"><div><div class="muted small">綜合傾向（依技術指標規則計分）</div><div style="margin-top:6px"><span class="tag ${cls}">${a.label}</span></div></div><div class="right small muted">資料至<br>${new Date(a.asOf).toLocaleDateString("zh-TW")}</div></div>${sec("趨勢摘要", a.trend)}${sec("技術指標解讀", a.indicator)}${sec("風險分析", a.risk)}
      <div class="banner">這是依固定規則把指標轉成文字的自動解讀，<b>不是 AI 模型，也不會預測未來</b>，不構成任何投資建議。投資有風險，請自行判斷。</div>`;
    }
  }
  return `<h1>分析解讀</h1><p class="sub">把技術指標轉成白話文字（規則式）</p>${statusBanner()}<div style="margin-bottom:12px">${selector()}</div>${body}`;
}

/* ───────── 個人設定 ───────── */
function exportPayload() { return JSON.stringify({ app: "gosu-invest", version: 2, exported: new Date().toISOString(), data: S.data, settings: S.set }, null, 1); }
function watchlistJSON() {
  const seen = new Set(), symbols = [];
  [...CATALOG, ...(S.set.custom || []), ...S.data.assets].forEach((x) => { const k = keyOf(x.market, x.symbol); if (!seen.has(k)) { seen.add(k); symbols.push({ market: x.market, symbol: String(x.symbol).toUpperCase() }); } });
  return JSON.stringify({ symbols }, null, 1);
}
function viewSettings() {
  return `<h1>個人設定</h1><p class="sub">資料只存在這支手機的瀏覽器裡，不會上傳到任何伺服器</p>
  <div class="card"><h2>美元匯率（USD→TWD）</h2><p class="small muted" style="margin-top:0">目前使用 ${fxRate().toFixed(3)}（${fxSource()}）。持有美股／加密貨幣換算新台幣時使用。</p>
    <div class="row" style="gap:8px"><input id="fx" inputmode="decimal" placeholder="例如 32.1" value="${S.set.fxManual ?? ""}"><button class="btn" data-act="fx-save">設定</button><button class="btn" data-act="fx-auto">改回自動</button></div></div>
  <div class="card"><h2>備份與還原</h2><p class="small muted" style="margin-top:0">iPhone 若長時間沒開啟，Safari 有可能清除網頁資料。建議定期備份，並存到「檔案」或傳給自己。</p>
    <div class="row" style="gap:8px;flex-wrap:wrap;justify-content:flex-start"><button class="btn primary" data-act="export">匯出備份檔</button><button class="btn" data-act="copy">複製備份文字</button></div>
    <label for="imp">還原：貼上備份文字，或選擇備份檔</label><textarea id="imp" rows="4" placeholder='貼上以 { "app": "gosu-invest" ... 開頭的備份文字'></textarea>
    <div class="row" style="gap:8px;margin-top:8px;justify-content:flex-start"><button class="btn" data-act="import">還原（會覆蓋目前資料）</button><input id="impfile" type="file" accept=".json,application/json" style="display:none"><button class="btn" data-act="pick-file">選擇備份檔…</button></div></div>
  <div class="card"><h2>自動更新的標的清單</h2><p class="small muted" style="margin-top:0">台股／美股的行情由 GitHub 定時抓取，只會更新清單內的標的。若你持有清單以外的代號，請把下面這段文字貼到專案的 <b>data/watchlist.json</b>（整份取代）。</p>
    <textarea readonly rows="5" id="wl" style="font-family:var(--mono);font-size:12px">${esc(watchlistJSON())}</textarea><button class="btn sm" style="margin-top:8px" data-act="copy-wl">複製</button></div>
  <div class="card"><h2>資料狀態</h2><div class="small muted">持股 ${S.data.assets.length} 檔、交易 ${S.data.trades.length} 筆<br>加密貨幣行情：${{ ok: "正常", fail: "連線失敗", skip: "—" }[S.status.binance] ?? "—"}<br>台股／美股行情檔：${{ ok: `正常（${ageText(S.status.fileUpdated)}更新）`, empty: "尚無資料", fail: "讀取失敗" }[S.status.file] ?? "—"}</div></div>
  <div class="card"><h2>危險區</h2><button class="btn danger" data-act="wipe">清除所有資料</button></div>
  <p class="small muted">本工具僅供個人記錄與參考，報價可能延遲或有誤，不構成任何投資建議。</p>`;
}

/* ───────── 彈出視窗 ───────── */
function openSheet(html) { const o = $("#modal"); o.innerHTML = `<div class="overlay" data-act="close-sheet"><div class="sheet" role="dialog">${html}</div></div>`; }
function closeSheet() { $("#modal").innerHTML = ""; }
function tradeForm({ assetId, tradeId } = {}) {
  const asset = assetId ? S.data.assets.find((a) => a.id === assetId) : null;
  const tr = tradeId ? S.data.trades.find((t) => t.id === tradeId) : null;
  const a = tr ? S.data.assets.find((x) => x.id === tr.assetId) : asset;
  const market = a?.market || "台股", locked = !!a;
  openSheet(`<h2>${tr ? "修改交易" : "新增交易"}</h2><form id="tf" autocomplete="off" data-trade="${tr?.id || ""}" data-asset="${a?.id || ""}">
  <div class="formgrid"><div><label>市場</label><select id="tf-market" ${locked ? "disabled" : ""}>${MARKETS.map((m) => `<option ${m === market ? "selected" : ""}>${m}</option>`).join("")}</select></div>
  <div><label>代號</label><input id="tf-symbol" list="tf-list" value="${esc(a?.symbol || "")}" ${locked ? "disabled" : ""} placeholder="${market === "加密貨幣" ? "BTC" : market === "美股" ? "AAPL" : "2330"}" autocapitalize="characters"></div></div>
  <datalist id="tf-list"></datalist>
  <label>名稱</label><input id="tf-name" value="${esc(a?.name || "")}" ${locked ? "disabled" : ""} placeholder="例如 台積電">
  <div class="formgrid"><div><label>買／賣</label><select id="tf-type"><option value="buy" ${tr?.type !== "sell" ? "selected" : ""}>買進</option><option value="sell" ${tr?.type === "sell" ? "selected" : ""}>賣出</option></select></div>
  <div><label>日期</label><input id="tf-date" type="date" value="${tr?.date || today()}"></div>
  <div><label>數量</label><input id="tf-qty" inputmode="decimal" value="${tr ? tr.qty : ""}" placeholder="股數／顆數"></div>
  <div><label>單價（<span id="tf-cur">${currencyOf(market)}</span>）</label><input id="tf-price" inputmode="decimal" value="${tr ? tr.price : ""}"></div></div>
  <label>手續費／稅（選填，同幣別）</label><input id="tf-fee" inputmode="decimal" value="${tr ? tr.fee : ""}" placeholder="0">
  <div class="err-text" id="tf-err"></div>
  <div class="row" style="gap:8px;margin-top:10px"><button type="button" class="btn" data-act="close-sheet-btn" style="flex:1">取消</button><button class="btn primary" style="flex:1">儲存</button></div></form>`);
  fillDatalist();
}
function fillDatalist() {
  const m = $("#tf-market")?.value, dl = $("#tf-list"); if (!dl) return;
  dl.innerHTML = uni().filter((u) => u.market === m).map((u) => `<option value="${esc(u.symbol)}">${esc(u.name)}</option>`).join("");
  const cur = $("#tf-cur"); if (cur) cur.textContent = currencyOf(m);
}
function submitTrade(form) {
  const err = (m) => { $("#tf-err").textContent = m; };
  const num = (id) => { const v = $(id).value.trim().replace(/,/g, ""); return v === "" ? NaN : Number(v); };
  const tradeId = form.dataset.trade, assetId = form.dataset.asset;
  const market = $("#tf-market").value, symbol = ($("#tf-symbol").value || "").trim().toUpperCase();
  const type = $("#tf-type").value, date = $("#tf-date").value, qty = num("#tf-qty"), price = num("#tf-price"), fee = $("#tf-fee").value.trim() === "" ? 0 : num("#tf-fee");
  if (!symbol) return err("請輸入代號");
  if (!/^[A-Z0-9.\-]{1,15}$/.test(symbol)) return err("代號格式不正確（只能是英數字，例如 2330、AAPL、BTC）");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err("請選擇日期");
  if (!(qty > 0)) return err("數量必須大於 0");
  if (!(price > 0)) return err("單價必須大於 0");
  if (!(fee >= 0)) return err("手續費不可為負數");
  const data = { assets: S.data.assets.map((a) => ({ ...a })), trades: S.data.trades.map((t) => ({ ...t })) };
  let asset = assetId ? data.assets.find((a) => a.id === assetId) : data.assets.find((a) => keyOf(a.market, a.symbol) === keyOf(market, symbol));
  let isNew = false;
  if (!asset) { const known = uni().find((u) => u.key === keyOf(market, symbol)); asset = { id: uid(), market, symbol, name: ($("#tf-name").value || "").trim() || known?.name || symbol }; data.assets.push(asset); isNew = true; }
  if (tradeId) { const i = data.trades.findIndex((t) => t.id === tradeId); data.trades[i] = { ...data.trades[i], type, date, qty, price, fee }; }
  else data.trades.push({ id: uid(), assetId: asset.id, type, date, qty, price, fee });
  const bad = validateTrades(data.trades.filter((t) => t.assetId === asset.id));
  if (bad) return err(bad.replace("賣出數量", "賣出數量") + "，請檢查數量與日期");
  S.data = data; save(); closeSheet(); toast(tradeId ? "已更新交易" : "已新增交易"); render(); if (isNew) refresh();
}
function customForm() {
  openSheet(`<h2>新增標的</h2><form id="cf" autocomplete="off"><p class="small muted" style="margin-top:0">加入後會出現在「全部」清單，並可加入自選。台股請輸入純數字代號（上櫃也一樣），美股輸入股票代號，加密貨幣輸入如 BTC（以 USDT 交易對報價）。</p>
  <label>市場</label><select id="cf-market">${MARKETS.map((m) => `<option>${m}</option>`).join("")}</select><label>代號</label><input id="cf-symbol" autocapitalize="characters" placeholder="例如 2330">
  <label>名稱（選填）</label><input id="cf-name"><div class="err-text" id="cf-err"></div>
  <div class="row" style="gap:8px;margin-top:10px"><button type="button" class="btn" data-act="close-sheet-btn" style="flex:1">取消</button><button class="btn primary" style="flex:1">加入</button></div></form>`);
}
function submitCustom() {
  const market = $("#cf-market").value, symbol = $("#cf-symbol").value.trim().toUpperCase(), name = $("#cf-name").value.trim();
  if (!/^[A-Z0-9.\-]{1,15}$/.test(symbol)) { $("#cf-err").textContent = "代號格式不正確"; return; }
  const key = keyOf(market, symbol);
  if (!uni().some((u) => u.key === key)) S.set.custom = [...S.set.custom, { market, symbol, name: name || symbol }];
  if (!S.set.watch.includes(key)) S.set.watch = [...S.set.watch, key];
  save(); closeSheet(); toast("已加入自選"); render(); refresh();
}

/* ───────── 事件 ───────── */
async function doExport() {
  const text = exportPayload(), name = `投資助手備份-${today()}.json`;
  try { const file = new File([text], name, { type: "application/json" }); if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; } } catch (e) { if (e?.name === "AbortError") return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "application/json" })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); toast("已下載備份檔");
}
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch { const ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch {} ta.remove(); toast(ok ? okMsg : "複製失敗，請手動選取文字"); }
}
function doImport(text) {
  let obj; try { obj = JSON.parse(text); } catch { return toast("內容不是有效的備份文字"); }
  const data = sanitizeData(obj.data ?? obj); if (!data) return toast("備份內容有誤或交易紀錄不合法，未還原");
  if (!confirm(`將以備份覆蓋目前資料：${data.assets.length} 檔持股、${data.trades.length} 筆交易。確定嗎？`)) return;
  S.data = data;
  if (obj.settings && typeof obj.settings === "object") S.set = { ...DEFAULT_SET, ...obj.settings, manual: obj.settings.manual && typeof obj.settings.manual === "object" ? obj.settings.manual : {}, custom: Array.isArray(obj.settings.custom) ? obj.settings.custom : [], watch: Array.isArray(obj.settings.watch) ? obj.settings.watch : DEFAULT_SET.watch };
  save(); toast("已還原"); render(); refresh();
}
const DEMO = { assets: [["台股", "2330", "台積電"], ["台股", "0050", "元大台灣50"], ["美股", "NVDA", "輝達"], ["加密貨幣", "BTC", "比特幣"]], trades: [[0, "buy", "2026-01-05", 1000, 780], [1, "buy", "2026-02-10", 2500, 165], [1, "sell", "2026-06-18", 500, 182], [2, "buy", "2026-03-02", 50, 95], [3, "buy", "2026-05-20", 0.15, 52000]] };
function loadDemo() {
  const assets = DEMO.assets.map(([market, symbol, name]) => ({ id: uid(), market, symbol, name }));
  S.data = { assets, trades: DEMO.trades.map(([i, type, date, qty, price]) => ({ id: uid(), assetId: assets[i].id, type, date, qty, price, fee: 0 })) };
  save(); render(); refresh(); toast("已載入範例資料（假交易，可到設定清除）");
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const act = el.dataset.act;
  if (act === "close-sheet") { if (e.target === el) closeSheet(); return; }
  if (act === "close-sheet-btn") return closeSheet();
  e.preventDefault?.();
  switch (act) {
    case "add-trade": return tradeForm({ assetId: el.dataset.asset });
    case "edit-trade": return tradeForm({ tradeId: el.dataset.trade });
    case "del-trade": {
      if (!confirm("刪除這筆交易？")) return;
      const rest = S.data.trades.filter((t) => t.id !== el.dataset.trade), tr = S.data.trades.find((t) => t.id === el.dataset.trade);
      const bad = validateTrades(rest.filter((t) => t.assetId === tr.assetId)); if (bad) return alert(`無法刪除：刪除後 ${bad}。請先處理後面的賣出紀錄。`);
      S.data = { ...S.data, trades: rest }; save(); return render();
    }
    case "del-asset": { const a = S.data.assets.find((x) => x.id === el.dataset.asset); if (!confirm(`刪除「${a.name}」及其所有交易紀錄？`)) return; S.data = { assets: S.data.assets.filter((x) => x.id !== a.id), trades: S.data.trades.filter((t) => t.assetId !== a.id) }; save(); return render(); }
    case "toggle-watch": { const k = el.dataset.key; S.set.watch = S.set.watch.includes(k) ? S.set.watch.filter((x) => x !== k) : [...S.set.watch, k]; save(); return render(); }
    case "set-tab": S.tab = el.dataset.tab; return render();
    case "add-custom": return customForm();
    case "set-manual": { const v = Number($(`#mp-${el.dataset.id}`).value.replace(/,/g, "")); if (!(v > 0)) return toast("請輸入大於 0 的價格"); S.set.manual = { ...S.set.manual, [el.dataset.key]: { price: v, time: Date.now() } }; save(); toast("已儲存現價"); return refresh(); }
    case "clear-manual": { const m = { ...S.set.manual }; delete m[el.dataset.key]; S.set.manual = m; save(); return refresh(); }
    case "fx-save": { const v = Number($("#fx").value); if (!(v > 5 && v < 100)) return toast("請輸入合理的匯率，例如 32.1"); S.set.fxManual = v; save(); toast("已設定匯率"); return render(); }
    case "fx-auto": S.set.fxManual = null; save(); toast("已改回自動匯率"); return render();
    case "export": return doExport();
    case "copy": return copyText(exportPayload(), "已複製備份文字");
    case "copy-wl": return copyText(watchlistJSON(), "已複製");
    case "import": return doImport($("#imp").value.trim());
    case "pick-file": return $("#impfile").click();
    case "wipe": if (confirm("確定清除所有持股、交易與設定？此動作無法復原。\n（建議先匯出備份）") && confirm("再次確認：真的要全部清除嗎？")) { S.data = { assets: [], trades: [] }; S.set = { ...DEFAULT_SET }; save(); toast("已清除"); render(); } return;
    case "demo": return loadDemo();
  }
});
document.addEventListener("submit", (e) => { e.preventDefault(); if (e.target.id === "tf") submitTrade(e.target); else if (e.target.id === "cf") submitCustom(); });
document.addEventListener("change", (e) => {
  if (e.target.id === "tf-market") fillDatalist();
  else if (e.target.id === "sym") { S.sel = e.target.value; location.replace(`#${parseRoute().path}?s=${encodeURIComponent(S.sel)}`); }
  else if (e.target.id === "impfile") { const f = e.target.files[0]; if (f) f.text().then((t) => { $("#imp").value = t; doImport(t.trim()); }); }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "mq") { S.q = e.target.value; $("#mlist").innerHTML = marketCards(); }
  else if (e.target.id === "tf-symbol") {
    const m = $("#tf-market").value, u = uni().find((x) => x.key === keyOf(m, e.target.value || "~")), nm = $("#tf-name");
    if (u && !nm.disabled && (!nm.value || nm.dataset.auto === "1")) { nm.value = u.name; nm.dataset.auto = "1"; }
  } else if (e.target.id === "tf-name") e.target.dataset.auto = "0";
});
document.addEventListener("toggle", (e) => { const d = e.target; if (d.matches?.("details.asset")) { d.open ? S.open.add(d.dataset.id) : S.open.delete(d.dataset.id); } }, true);

/* ───────── 路由 / 繪製 ───────── */
function parseRoute() {
  const [path, qs] = (location.hash || "#/").slice(1).split("?");
  return { path: path || "/", params: new URLSearchParams(qs || "") };
}
const VIEWS = { "/": [viewOverview, afterOverview], "/holdings": [viewHoldings], "/market": [viewMarket], "/technical": [viewTechnical, afterTechnical], "/analysis": [viewAnalysis], "/settings": [viewSettings] };
function render() {
  const { path, params } = parseRoute();
  if (params.get("s")) S.sel = params.get("s");
  const [view, after] = VIEWS[path] || VIEWS["/"];
  const keepScroll = window.scrollY;
  $("#tabs").innerHTML = `<div class="brand">📈 我的投資助手</div>` + NAV.map(([h, l, i]) => `<a href="${h}" class="${(h.slice(1) || "/") === (VIEWS[path] ? path : "/") ? "active" : ""}"><svg viewBox="0 0 24 24">${ICONS[i]}</svg>${l}</a>`).join("");
  $("#view").innerHTML = `<div class="inner">${view()}</div>`;
  after?.();
  window.scrollTo(0, keepScroll);
}
window.addEventListener("hashchange", () => { window.scrollTo(0, 0); render(); });
let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { const p = parseRoute().path; if (p === "/" || p === "/technical") render(); }, 150); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - S.lastRefresh > 20000) refresh(); });
setInterval(() => { if (!document.hidden) refresh(); }, 30000);

render();
refresh();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
window.__app = S; // 供除錯與自動測試使用
