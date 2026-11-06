// fetch-prices.mjs — 排程抓取全市場行情 + 重點標的日 K
//   1) quotes：TWSE STOCK_DAY_ALL（上市，含 ETF）＋ TPEx 上櫃日收 → 全市場約 2,400 檔
//   2) candles：排行榜／熱力圖／自選會出現的標的（成交值前段 + 三大法人排行 + 當沖 + ETF + 自選），
//      以 Yahoo Finance chart API 抓近 1 年日線；支援 SHARD 分片（GitHub Actions 分批跑，避免被限流）
//   3) fundamentals：TWSE BWIBBU_ALL（本益比／殖利率／股價淨值比）
//   產出：{ updated, asOf, quotes:{key:{price,prev,time,name,board,vol}}, candles:{key:[[t,o,h,l,c,v]…]}, fundamentals, fx }
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const YAHOO = (sym, range = "1y", interval = "1d") =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(800 * (i + 1));
    }
  }
}

const num = (v) => {
  const s = String(v == null ? "" : v).replace(/[,\s]/g, "").replace(/^\+/, "");
  if (!s || s === "-" || s === "--") return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

const isStockOrEtf = (c) => /^\d{4}$/.test(c) || /^00\d{3,4}[A-Z]?$/.test(c);

/* ── 1. 全市場日收（上市） ── */
async function fetchTwseAll() {
  try {
    const a = await fetchJson("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL");
    const rows = {};
    for (const x of a) {
      const code = String(x.Code || "").trim();
      if (!isStockOrEtf(code)) continue;
      const close = num(x.ClosingPrice);
      if (close == null) continue;
      const chg = num(x.Change);
      rows[code] = {
        name: String(x.Name || "").trim(),
        price: close,
        prev: chg == null ? null : close - chg,
        vol: num(x.TradeVolume) || 0,
        amount: num(x.TradeValue) || 0,
        board: "上市",
        date: String(x.Date || ""),
      };
    }
    return rows;
  } catch (e) {
    process.stdout.write(`✗ TWSE STOCK_DAY_ALL ${e.message}\n`);
    return {};
  }
}

/* ── 2. 全市場日收（上櫃） ── */
async function fetchTpexAll() {
  try {
    const a = await fetchJson("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes");
    const rows = {};
    for (const x of a) {
      const code = String(x.SecuritiesCompanyCode || "").trim();
      if (!isStockOrEtf(code)) continue;
      const close = num(x.Close);
      if (close == null) continue;
      const chg = num(x.Change);
      rows[code] = {
        name: String(x.CompanyName || "").trim(),
        price: close,
        prev: chg == null ? null : close - chg,
        vol: num(x.TradingShares) || 0,
        amount: num(x.TransactionAmount) || 0,
        board: "上櫃",
        date: String(x.Date || ""),
      };
    }
    return rows;
  } catch (e) {
    process.stdout.write(`✗ TPEx daily close ${e.message}\n`);
    return {};
  }
}

/* ── 3. 基本面（BWIBBU） ── */
async function fetchValuation() {
  try {
    const a = await fetchJson("https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL");
    const out = {};
    for (const x of a) {
      const code = String(x.Code || "").trim();
      if (!isStockOrEtf(code)) continue;
      const pe = num(x.PEratio), dy = num(x.DividendYield), pb = num(x.PBratio);
      if (pe == null && dy == null && pb == null) continue;
      out[code] = { pe, dy, pb };
    }
    return out;
  } catch (e) {
    process.stdout.write(`✗ BWIBBU_ALL ${e.message}\n`);
    return {};
  }
}

/* ── 4. Yahoo 日 K ── */
async function fetchChart(sym) {
  const j = await fetchJson(YAHOO(sym));
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error(`empty ${sym}`);
  const ts = res.timestamp || [];
  const q = res.indicators?.quote?.[0] || {};
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    out.push([ts[i], +o.toFixed(2), +h.toFixed(2), +l.toFixed(2), +c.toFixed(2), Math.round(v || 0)]);
  }
  if (!out.length) throw new Error(`no candles ${sym}`);
  return out;
}

const FUGLE_KEY = process.env.FUGLE_API_KEY || "";
async function fetchFugleQuote(sym) {
  const r = await fetch(`https://api.fugle.tw/marketdata/v1.0/stock/intraday/quote/${encodeURIComponent(sym)}`, {
    headers: { "X-API-KEY": FUGLE_KEY, Accept: "application/json", "User-Agent": UA },
  });
  if (!r.ok) throw new Error(`FUGLE HTTP ${r.status}`);
  const j = await r.json();
  const price = j.lastPrice ?? j.closePrice ?? j.lastTrade?.price;
  if (price == null) throw new Error("FUGLE no price");
  return { price, prev: j.previousClose ?? null, time: j.lastUpdated ? Math.round(j.lastUpdated / 1e6) : null };
}

/* ── 需要日 K 的標的清單（排行榜／熱力圖／自選會出現的） ── */
function needCodes(market, watch, allRows) {
  const set = new Set();
  const push = (c) => { const s = String(c || "").trim(); if (isStockOrEtf(s)) set.add(s); };

  for (const w of watch || []) if (w.market === "台股") push(w.symbol);
  const r = market?.instRank || {};
  for (const k of ["foreign", "trust", "dealer"]) for (const x of (r[k] || []).slice(0, 40)) push(x.code);
  for (const x of (market?.daytrade?.list || [])) push(x.code);

  // 成交值前段（熱力圖／雷達／漲跌排行會用到）
  const byAmt = Object.entries(allRows)
    .sort((a, b) => (b[1].amount || 0) - (a[1].amount || 0))
    .slice(0, 520)
    .map(([c]) => c);
  byAmt.forEach(push);

  // ETF（含 00 開頭主動式 ETF）
  Object.keys(allRows).filter((c) => /^00/.test(c)).slice(0, 140).forEach(push);

  return [...set];
}

async function main() {
  const watch = existsSync(join(ROOT, "watchlist.json"))
    ? JSON.parse(readFileSync(join(ROOT, "watchlist.json"), "utf8"))
    : [];
  let prevMarket = null;
  try { prevMarket = JSON.parse(readFileSync(join(ROOT, "market.json"), "utf8")); } catch { /* ignore */ }
  let prevPrices = null;
  try { prevPrices = JSON.parse(readFileSync(join(ROOT, "prices.json"), "utf8")); } catch { /* ignore */ }

  const [tw, tpex, val] = await Promise.all([fetchTwseAll(), fetchTpexAll(), fetchValuation()]);
  const allRows = { ...tw };
  for (const [k, v] of Object.entries(tpex)) if (!allRows[k]) allRows[k] = v;

  const quotes = {};
  const nowSec = Math.round(Date.now() / 1000);
  for (const [code, r] of Object.entries(allRows)) {
    quotes[`台股:${code}`] = {
      price: r.price,
      prev: r.prev,
      time: nowSec,
      name: r.name,
      board: r.board,
      vol: r.vol,
    };
  }
  process.stdout.write(`全市場報價：上市 ${Object.keys(tw).length} + 上櫃 ${Object.keys(tpex).length} → ${Object.keys(quotes).length}\n`);

  // 富果即時報價覆蓋（有金鑰時）
  if (FUGLE_KEY) {
    for (const w of (watch || []).filter((x) => x.market === "台股")) {
      const key = `台股:${w.symbol.toUpperCase()}`;
      try {
        const q = await fetchFugleQuote(w.symbol.toUpperCase());
        if (quotes[key]) { quotes[key].price = q.price; quotes[key].prev = q.prev ?? quotes[key].prev; quotes[key].time = q.time || nowSec; }
      } catch (e) { /* ignore */ }
      await sleep(100);
    }
  }

  const codes = needCodes(prevMarket, watch, allRows);
  // 分片：SHARD="1/4" 只處理第 1 片（GitHub Actions 分批抓，降低被限流風險）
  let shardIdx = 0, shardAll = 1;
  const shardEnv = process.env.SHARD || "";
  if (/\d+\/\d+/.test(shardEnv)) {
    const [a, b] = shardEnv.split("/").map((n) => parseInt(n, 10));
    shardIdx = Math.max(0, a - 1); shardAll = Math.max(1, b);
  }
  const mine = codes.filter((_, i) => i % shardAll === shardIdx);
  process.stdout.write(`日 K 清單 ${codes.length} 檔，本次分片 ${shardIdx + 1}/${shardAll} → ${mine.length} 檔\n`);

  const candleMap = new Map(mine.map((c) => [c, null]));
  let ok = 0, fail = 0;
  const skipCandles = process.env.SKIP_CANDLES === "1";
  if (skipCandles) process.stdout.write("SKIP_CANDLES=1 → 只更新報價，日 K 沿用舊檔\n");
  for (const code of skipCandles ? [] : mine) {
    const board = allRows[code]?.board || "上市";
    const sym = board === "上櫃" ? `${code}.TWO` : `${code}.TW`;
    try {
      const cs = await fetchChart(sym);
      candleMap.set(code, cs);
      ok++;
      if (ok % 20 === 0) process.stdout.write(`  …已抓 ${ok}/${mine.length}\n`);
    } catch (e) {
      fail++;
      candleMap.set(code, null);
    }
    await sleep(120);
  }
  process.stdout.write(`日 K 完成：成功 ${ok}、失敗 ${fail}\n`);

  // 合併 K 線：本次抓到的覆蓋，沒抓到的沿用舊檔（避免分片執行互相清空）
  const candles = {};
  const prevCandles = prevPrices?.candles || {};
  // 先放入舊資料（只保留台股）
  for (const [k, v] of Object.entries(prevCandles)) {
    const parts = String(k).split(":");
    if (parts[0] !== "台股") { candles[k] = v; continue; }
    candles[k] = v;
  }
  for (const [code, cs] of candleMap) {
    if (cs) candles[`台股:${code}`] = cs;
  }
  // 非台股（美股／指數／加密）沿用舊檔
  for (const [k, v] of Object.entries(prevCandles)) {
    if (!String(k).startsWith("台股:")) candles[k] = v;
  }

  // 匯率
  let fx = prevPrices?.fx || { USDTWD: null };
  try {
    const cs = await fetchChart("USDTWD=X");
    fx = { USDTWD: cs[cs.length - 1][4] };
  } catch (e) { process.stdout.write(`✗ USDTWD=X ${e.message}\n`); }

  const out = {
    updated: new Date().toISOString(),
    asOf: Object.values(allRows)[0]?.date || null,
    quotes,
    candles,
    fundamentals: Object.keys(val).length ? val : (prevPrices?.fundamentals || {}),
    fx,
    shard: shardAll > 1 ? `${shardIdx + 1}/${shardAll}` : null,
  };
  writeFileSync(join(ROOT, "prices.json"), JSON.stringify(out));
  const by = Buffer.byteLength(JSON.stringify(out));
  process.stdout.write(`done: quotes=${Object.keys(quotes).length} candles=${Object.keys(candles).length} fundamentals=${Object.keys(out.fundamentals).length} size=${(by / 1024).toFixed(0)}KB\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
