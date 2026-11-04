// marketdata.js — 市場資料（market.json）讀取與規則式估算：
//   貪婪指數、盤後多空、精選個股、ETF 評分、技術面掃描器、高週轉估算。
// 資料來源：GitHub 排程抓取的 TWSE 公開資料（盤後/延遲），估算值一律在畫面標註。
import { S } from "./state.js";
import { keyOf } from "./portfolio.js";
import { uni } from "./state.js";
import { loadCandles } from "./quotes.js";
import { buildSeries, rsi } from "./indicators.js";

export const STALE_MSG = "市場資料（指數／法人／產業／當沖／漲跌家數）來自 TWSE 公開資訊，由 GitHub 排程於盤後抓取；未開盤或假日時顯示前一交易日。";

/* ── 載入 market.json ── */
export async function refreshMarket() {
  try {
    const r = await fetch(`market.json?t=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    S.market = j && typeof j === "object" ? j : null;
    S.marketAt = Date.now();
  } catch { S.market = null; }
}

/* ── 存取器（缺資料一律回 null/[]，view 自行降級） ── */
export const indices = () => (S.market?.indices || []).filter((i) => i && i.price != null)
  .map((i) => { const prev = i.prev || 0; return { ...i, change: prev ? i.price - prev : 0, changePct: prev ? ((i.price - prev) / prev) * 100 : 0 }; });
export const breadth = () => S.market?.breadth || null;
export const institutions = () => S.market?.institutions || null;
export const instRank = () => S.market?.instRank || null;
export const industryFlow = () => S.market?.industry || [];
export const industryEst = () => S.market?.industryEst || {};
export const daytrade = () => S.market?.daytrade || null;
// K 線統一為物件（prices.json 內存陣列 [t,o,h,l,c,v]）
const candleRows = (key) => (S.file?.candles?.[key] || []).map((r) => (Array.isArray(r) ? { t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] } : r));
export const indexCandles = () => candleRows(keyOf("指數", "^TWII"));

/* ── 盤後整理：偏多／偏空（規則式計分） ── */
export function marketTone() {
  const inst = institutions(), b = breadth();
  const idx = indices().find((i) => i.code === "t00");
  if (!inst && !b && !idx) return null;
  let score = 0; const parts = [];
  if (idx) {
    score += idx.changePct >= 0 ? 1 : -1;
    parts.push({ label: "加權指數", text: `今日 ${idx.changePct >= 0 ? "+" : ""}${idx.changePct.toFixed(2)}%，${idx.changePct >= 0 ? "多方" : "空方"}主導。` });
  }
  if (b) {
    score += b.rise > b.fall ? 1 : -1;
    parts.push({ label: "漲跌家數", text: `上市上漲 ${b.rise}／下跌 ${b.fall}。` });
  }
  if (inst?.total?.net != null) {
    const e = inst.total.net / 1e8;
    score += e >= 0 ? 1 : -1;
    parts.push({ label: "三大法人", text: `合計買賣超 ${e >= 0 ? "+" : ""}${e.toFixed(0)} 億（${e >= 0 ? "買超" : "賣超"}）。` });
  }
  const label = score >= 2 ? "偏多" : score <= -2 ? "偏空" : "中性";
  return { label, score, parts };
}

/* ── 精選個股（盤後：法人買超排行中買超最多的標的） ── */
export function hotPicks() {
  const rank = instRank();
  if (!rank) return [];
  const u = uni();
  const picks = [];
  for (const type of ["foreign", "trust", "dealer"]) {
    const arr = (rank[type] || []).filter((x) => x.net > 0).slice(0, 2);
    for (const x of arr) {
      const key = keyOf("台股", x.code);
      const name = u.find((y) => y.key === key)?.name || x.name || x.code;
      const reason = { foreign: "外資買超", trust: "投信買超", dealer: "自營買超" }[type];
      picks.push({ key, name, reason: `${reason} ${(x.net / 1000).toFixed(0)} 張`, net: x.net * 10000 /* 以元為單位之近似量：張×1000股 的資金不準，故以股數計並標註 */ });
      if (picks.length >= 3) return picks;
    }
  }
  return picks;
}

/* ── 貪婪指數 0-100（規則式估算） ── */
export function greedIndex() {
  const b = breadth(), inst = institutions();
  const candles = indexCandles();
  if (!b && !inst && !candles) return null;
  const parts = [];
  let score = 0, weight = 0;
  const add = (w, v, label, text) => { score += w * v; weight += w; parts.push({ label, text }); };

  if (b) {
    const r = b.rise + b.fall > 0 ? b.rise / (b.rise + b.fall) : 0.5;
    add(30, r * 100, "漲跌家數", `上漲 ${b.rise}／下跌 ${b.fall}，多空比 ${(r * 100).toFixed(0)}%。`);
  }
  if (inst && Array.isArray(inst.days) && inst.days.length) {
    const sum5 = inst.days.reduce((s, d) => s + (d.foreignNet || 0), 0) / 1e8;
    const v = Math.max(0, Math.min(100, 50 + (sum5 / 200) * 100));
    add(25, v, "外資近 5 日", `外資近 5 日合計 ${sum5 >= 0 ? "+" : ""}${sum5.toFixed(0)} 億。`);
  }
  if (candles && candles.length >= 20) {
    const closes = candles.map((c) => c.c);
    const ret20 = (closes[closes.length - 1] - closes[closes.length - 21]) / closes[closes.length - 21] * 100;
    const v = Math.max(0, Math.min(100, 50 + (ret20 / 10) * 100));
    add(25, v, "指數近 20 日", `加權指數近 20 日漲跌幅 ${ret20 >= 0 ? "+" : ""}${ret20.toFixed(1)}%。`);
    const r = rsi(closes);
    const last = r[r.length - 1];
    if (last != null) add(20, last, "指數 RSI", `加權指數 RSI(14) ${last.toFixed(0)}。`);
  }
  if (!weight) return null;
  const s = Math.max(0, Math.min(100, Math.round(score / weight)));
  const label = s < 20 ? "極度恐慌" : s < 40 ? "恐慌" : s < 60 ? "中性" : s < 80 ? "貪婪" : "極度貪婪";
  return { score: s, label, parts };
}

/* ── ETF 報酬與風險評分 ── */
export function etfMetrics(candles) {
  if (!candles || candles.length < 60) return null;
  const closes = candles.map((c) => c.c);
  const n = closes.length;
  const ret = (k) => (n > k && closes[n - 1 - k] ? (closes[n - 1] / closes[n - 1 - k] - 1) * 100 : null);
  const ret3m = ret(63), ret6m = ret(126), ret1y = ret(250);
  const rets = [];
  for (let i = 1; i < n; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1));
  const vol = sd * Math.sqrt(250) * 100;
  let peak = closes[0], mdd = 0;
  for (const c of closes) { peak = Math.max(peak, c); mdd = Math.min(mdd, (c - peak) / peak); }
  mdd *= 100;
  let score = 50 + (ret6m ?? 0) * 3 - vol * 0.8 - Math.abs(mdd) * 0.5;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { ret3m, ret6m, ret1y, vol, mdd, score };
}

/* ── 技術面選股（掃描 uni 內有 K 線的標的，規則式） ── */
export function scanner() {
  const out = [];
  const u = uni();
  for (const x of u) {
    const candles = candleRows(x.key);
    if (candles.length < 30) continue;
    const closes = candles.map((c) => c.c);
    const series = buildSeries(candles);
    const last = series[series.length - 1], prev = series[series.length - 2];
    const chg20 = ((closes[closes.length - 1] - closes[closes.length - 21]) / closes[closes.length - 21]) * 100;
    const reasons = [];
    let signal = "watch";
    if (last.ma5 != null && last.ma20 != null && last.ma60 != null) {
      if (last.ma5 > last.ma20 && last.ma20 > last.ma60) { reasons.push("多頭排列"); signal = "bull"; }
      else if (last.ma5 < last.ma20 && last.ma20 < last.ma60) { reasons.push("空頭排列"); signal = "bear"; }
    }
    if (last.rsi != null) {
      if (last.rsi < 30) { reasons.push(`RSI ${last.rsi.toFixed(0)} 超賣`); if (signal === "watch") signal = "bull"; }
      else if (last.rsi > 70) { reasons.push(`RSI ${last.rsi.toFixed(0)} 超買`); if (signal === "watch") signal = "bear"; }
    }
    if (prev?.dif != null && last.dif != null && prev.dif <= prev.dea && last.dif > last.dea) { reasons.push("MACD 黃金交叉"); if (signal === "watch") signal = "bull"; }
    const v20 = candles.slice(-20).reduce((s, c) => s + c.v, 0) / 20;
    if (v20 > 0 && candles[candles.length - 1].v > v20 * 1.5 && closes[closes.length - 1] >= closes[closes.length - 2]) { reasons.push("量價齊揚"); signal = "bull"; }
    if (!reasons.length) continue;
    out.push({ key: x.key, name: x.name, reason: reasons.join("、"), signal, pct: chg20 });
    if (out.length >= 15) break;
  }
  return out;
}

/* ── 高資產週轉估算：以台股標的最近一根日 K 成交量推估（標註估算） ── */
export function turnoverTop(limit = 5) {
  const rows = [];
  const u = uni();
  for (const x of u) {
    if (x.market !== "台股") continue;
    const c = candleRows(x.key);
    if (!c.length) continue;
    const v = c[c.length - 1].v;
    if (!v) continue;
    rows.push({ key: x.key, name: x.name, symbol: x.symbol, vol: v });
  }
  return rows.sort((a, b) => b.vol - a.vol).slice(0, limit);
}
