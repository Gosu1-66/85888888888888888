// state.js — 全域狀態、儲存、遷移、警報評估。view 模組修改 S 後呼叫 save()。
import { keyOf, MARKETS, validateTrades, toHoldings } from "./portfolio.js";
import { universe } from "./catalog.js";

const DATA_KEY = "gosu-data-v3", SET_KEY = "gosu-settings-v2", OLD_DATA_KEY = "gosu-portfolio-v2", OLD_SET_KEY = "gosu-settings-v1";

const DEFAULT_SET = {
  watch: ["台股:2330", "台股:0050", "美股:NVDA", "加密貨幣:BTC"],
  custom: [], manual: {}, fxManual: null,
  alerts: [], notifications: [],
  entries: { order: ["radar", "inst", "daytrade", "scan", "tools", "watchlist", "index", "custom"], hidden: [] },
  risk: { q: {}, score: null },
  cloud: { enabled: false, config: null, lastSync: null, user: null },
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
function load(key, fallback) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch { return fallback; } }

/* ── 資料清洗（v3 形狀：{portfolios, assets, trades}） ── */
function sanitizeData(d) {
  if (!d || !Array.isArray(d.assets) || !Array.isArray(d.trades)) return null;
  const portfolios = (Array.isArray(d.portfolios) ? d.portfolios : []).filter((p) => p && p.id && p.name).map((p) => ({ id: String(p.id), name: String(p.name) }));
  if (!portfolios.length) portfolios.push({ id: "default", name: "預設投資組合" });
  const ids = new Set(portfolios.map((p) => p.id));
  const assets = d.assets.filter((a) => a && a.id && MARKETS.includes(a.market) && a.symbol)
    .map((a) => ({ id: String(a.id), portfolioId: ids.has(a.portfolioId) ? String(a.portfolioId) : "default", market: a.market, symbol: String(a.symbol).toUpperCase(), name: String(a.name || a.symbol) }));
  const assetIds = new Set(assets.map((a) => a.id));
  const trades = d.trades.filter((t) => t && assetIds.has(t.assetId) && (t.type === "buy" || t.type === "sell") && Number.isFinite(+t.qty) && +t.qty > 0 && Number.isFinite(+t.price) && /^\d{4}-\d{2}-\d{2}$/.test(t.date))
    .map((t) => ({ id: String(t.id || uid()), assetId: t.assetId, type: t.type, date: t.date, qty: +t.qty, price: +t.price, fee: Math.max(0, +t.fee || 0) }));
  const out = { portfolios, assets, trades };
  for (const a of assets) { if (validateTrades(trades.filter((t) => t.assetId === a.id))) return null; }
  return out;
}

/* ── 舊版遷移：v2 的 assets 沒有 portfolioId → 全部歸入「預設投資組合」 ── */
function migrateRaw(raw) {
  if (sanitizeData(raw)) return sanitizeData(raw);
  const assets = (raw?.assets || []).filter((a) => a && MARKETS.includes(a.market) && a.symbol)
    .map((a) => ({ id: String(a.id), portfolioId: "default", market: a.market, symbol: String(a.symbol).toUpperCase(), name: String(a.name || a.symbol) }));
  const assetIds = new Set(assets.map((a) => a.id));
  const trades = (raw?.trades || []).filter((t) => t && assetIds.has(t.assetId) && (t.type === "buy" || t.type === "sell") && Number.isFinite(+t.qty) && +t.qty > 0 && Number.isFinite(+t.price) && /^\d{4}-\d{2}-\d{2}$/.test(t.date))
    .map((t) => ({ id: String(t.id || uid()), assetId: t.assetId, type: t.type, date: t.date, qty: +t.qty, price: +t.price, fee: Math.max(0, +t.fee || 0) }));
  return { portfolios: [{ id: "default", name: "預設投資組合" }], assets, trades };
}

/* ── 狀態 ── */
const savedSet = load(SET_KEY, {}) || {};
export const S = {
  data: migrateRaw(load(DATA_KEY, null) || load(OLD_DATA_KEY, null)),
  set: { ...DEFAULT_SET, ...savedSet, entries: { ...DEFAULT_SET.entries, ...(savedSet.entries || {}) }, risk: { ...DEFAULT_SET.risk, ...(savedSet.risk || {}) }, cloud: { ...DEFAULT_SET.cloud, ...(savedSet.cloud || {}) } },
  quotes: {}, status: { binance: "skip", file: "fail", fileUpdated: null, fx: null }, file: null, fileAt: 0,
  market: null, marketAt: 0,
  lastRefresh: 0, refreshing: false,
  tab: "首頁", q: "", sel: null, tech: null, techReq: 0, hover: -1, open: new Set(),
  __localAt: Date.now(), __hooks: { save: [] },
};

/* ── 儲存 ── */
let storageWarned = false;
export function save() {
  S.__localAt = Date.now();
  try { localStorage.setItem(DATA_KEY, JSON.stringify(S.data)); localStorage.setItem(SET_KEY, JSON.stringify(S.set)); }
  catch { if (!storageWarned) { storageWarned = true; import("./ui.js").then(({ toast }) => toast("⚠ 無法寫入瀏覽器儲存空間，資料可能不會保留（請檢查是否為無痕模式）")); } }
  try { navigator.storage?.persist?.(); } catch {}
  (S.__hooks.save || []).forEach((f) => { try { f(); } catch {} });
}

/* ── 存取器 ── */
export const fxRate = () => (Number.isFinite(+S.set.fxManual) && +S.set.fxManual > 0 ? +S.set.fxManual : S.status.fx || 32);
export const fxSource = () => (S.set.fxManual ? "手動設定" : S.status.fx ? "自動（延遲）" : "預設值（尚未取得）");
export const quoteOf = (h) => S.quotes[keyOf(h.market, h.symbol)] ?? null;
export const holdings = () => toHoldings(S.data);
export const uni = () => universe(S.set, S.data);

/* ── 投資屬性測驗（規則式計分 0-100） ── */
export function riskScore() {
  const q = S.set.risk?.q || {};
  if (Object.keys(q).length < 5) return null;
  let sum = 0;
  for (const k of Object.keys(q)) { const v = Number(q[k]); if (Number.isFinite(v) && v >= 0 && v <= 3) sum += v; }
  return Math.round((sum / 15) * 100);
}
export function riskType(score) { return score == null ? null : score < 40 ? "保守型" : score <= 70 ? "穩健型" : "積極型"; }

/* ── 警報評估：refresh 後呼叫；觸發 → 寫入通知中心 ── */
const KIND_LABEL = { "price-above": "價格高於", "price-below": "價格低於", "day-above": "單日漲跌幅高於", "day-below": "單日漲跌幅低於" };
const normKind = (k) => String(k || "").replace(/_/g, "-").replace(/^pct-/, "day-");
export function evaluateAlerts(quotes) {
  const alerts = S.set.alerts || [], now = Date.now();
  const names = new Map(uni().map((u) => [u.key, u.name]));
  let added = 0;
  for (const a of alerts) {
    if (!a.active) continue;
    const q = quotes && quotes[a.key];
    if (!q || typeof q.price !== "number") continue;
    const kind = normKind(a.kind);
    const hit = kind === "price-above" ? q.price > a.threshold
      : kind === "price-below" ? q.price < a.threshold
      : kind === "day-above" ? (q.change ?? -999) > a.threshold
      : kind === "day-below" ? (q.change ?? 999) < a.threshold
      : false;
    if (!hit) continue;
    if (a.lastFired && now - a.lastFired < 6 * 3600000) continue; // 每 6 小時最多觸發一次
    a.lastFired = now;
    const label = KIND_LABEL[kind] || kind;
    S.set.notifications = S.set.notifications || [];
    S.set.notifications.unshift({ id: uid(), time: now, text: `${names.get(a.key) || a.key} ${label} ${a.threshold} 已觸發（現價 ${q.price}，${q.change != null ? (q.change >= 0 ? "+" : "") + q.change.toFixed(2) + "%" : "—"}）`, read: false });
    if (S.set.notifications.length > 50) S.set.notifications.length = 50;
    added++;
  }
  if (added) save();
}
