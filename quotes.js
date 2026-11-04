// quotes.js — 行情：每筆報價標示來源與時間，不假裝即時。
//   加密貨幣 → Binance 公開行情（免金鑰，瀏覽器直連，即時）
//   台股 / 美股 / 指數 / ETF → data/prices.json（GitHub 排程自動更新，延遲報價）
//   以上都沒有 → 使用者手動輸入的價格；再沒有 → 無報價
import { keyOf } from "./portfolio.js";

const BINANCE_HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"];

async function getJSON(url, ms = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

export const binanceSymbol = (symbol) => `${symbol.toUpperCase()}USDT`;

/** 讀取排程產生的行情檔；失敗回傳 null */
export async function loadPricesFile() {
  try {
    const d = await getJSON(`prices.json?t=${Date.now()}`);
    return d && typeof d === "object" ? d : null;
  } catch { return null; }
}

async function binanceGet(path) {
  let lastErr;
  for (const host of BINANCE_HOSTS) {
    try { return await getJSON(host + path); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

const parseTicker = (t) => ({ price: parseFloat(t.lastPrice), change: parseFloat(t.priceChangePercent), time: t.closeTime, source: "binance" });

/** 回傳 { "加密貨幣:BTC": quote }。整批失敗時改逐一查詢，避免一個無效代號拖垮全部。 */
export async function loadBinanceQuotes(symbols) {
  const out = {};
  if (!symbols.length) return out;
  const names = symbols.map(binanceSymbol);
  try {
    const arr = await binanceGet(`/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(names))}`);
    for (const t of arr) out[keyOf("加密貨幣", t.symbol.replace(/USDT$/, ""))] = parseTicker(t);
    return out;
  } catch {
    const res = await Promise.allSettled(names.map((n) => binanceGet(`/api/v3/ticker/24hr?symbol=${n}`)));
    res.forEach((r, i) => { if (r.status === "fulfilled") out[keyOf("加密貨幣", symbols[i])] = parseTicker(r.value); });
    return out;
  }
}

/** 由排程檔組出報價（change = 漲跌幅百分比） */
export function quotesFromFile(file) {
  const out = {};
  if (!file?.quotes) return out;
  for (const [key, q] of Object.entries(file.quotes)) {
    if (typeof q?.price !== "number") continue;
    const change = q.prev ? ((q.price - q.prev) / q.prev) * 100 : 0;
    out[key] = { price: q.price, change, time: (q.time || 0) * 1000, source: "delayed" };
  }
  return out;
}

/**
 * 整合所有來源。優先順序：Binance 即時 > 排程檔 > 手動價格。
 * 回傳 { quotes, status, file }；status 供畫面顯示各來源是否正常。
 */
export async function refreshQuotes({ cryptoSymbols, manual = {}, fileCache = null }) {
  const status = { binance: "skip", file: "fail", fileUpdated: null, fx: null };
  const [file, bn] = await Promise.all([
    fileCache ? Promise.resolve(fileCache) : loadPricesFile(),
    cryptoSymbols.length
      ? loadBinanceQuotes(cryptoSymbols).then((r) => { status.binance = Object.keys(r).length ? "ok" : "fail"; return r; }).catch(() => { status.binance = "fail"; return {}; })
      : Promise.resolve({}),
  ]);
  const fromFile = quotesFromFile(file);
  if (file) { status.file = Object.keys(fromFile).length ? "ok" : "empty"; status.fileUpdated = file.updated ? Date.parse(file.updated) : null; status.fx = file.fx?.USDTWD ?? null; }
  const quotes = { ...fromFile, ...bn };
  for (const [key, m] of Object.entries(manual)) {
    if (!quotes[key] && typeof m?.price === "number") quotes[key] = { price: m.price, change: 0, time: m.time || 0, source: "manual" };
  }
  return { quotes, status, file };
}

/** 取 K 線：加密貨幣直連 Binance（失敗改用排程檔），其他用排程檔。回傳 [{t,o,h,l,c,v}] 或 null */
export async function loadCandles(market, symbol, file) {
  if (market === "加密貨幣") {
    try {
      const rows = await binanceGet(`/api/v3/klines?symbol=${binanceSymbol(symbol)}&interval=1d&limit=200`);
      return rows.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
    } catch { /* 改用備援 */ }
  }
  const rows = file?.candles?.[keyOf(market, symbol)];
  if (!rows?.length) return null;
  return rows.map(([t, o, h, l, c, v]) => ({ t: t * 1000, o, h, l, c, v }));
}

export const SOURCE_LABEL = { binance: "即時", delayed: "延遲", manual: "手動" };
