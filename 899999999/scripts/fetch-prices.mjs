// 由 GitHub Actions 定時執行：抓取 data/watchlist.json 內標的的報價與日 K 線，寫入 data/prices.json。
// 無需金鑰、無第三方套件（Node 18+ 內建 fetch）。單一標的失敗時保留上次資料，不會整份清空。
import { readFile, writeFile } from "node:fs/promises";

const BASES = (process.env.YAHOO_BASE ? [process.env.YAHOO_BASE] : ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]);
const WATCHLIST = process.env.WATCHLIST_FILE || "data/watchlist.json";
const OUT = process.env.PRICES_FILE || "data/prices.json";
const DELAY_MS = Number(process.env.FETCH_DELAY_MS ?? 300);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r4 = (n) => (n == null ? null : Math.round(n * 1e4) / 1e4);

export function yahooCandidates(market, symbol) {
  const s = symbol.trim().toUpperCase();
  if (market === "台股") return [`${s}.TW`, `${s}.TWO`];
  if (market === "加密貨幣") return [`${s}-USD`];
  return [s.replace(/\./g, "-")];
}

export function parseChart(json) {
  const res = json?.chart?.result?.[0];
  if (!res?.timestamp) return null;
  const q = res.indicators?.quote?.[0];
  if (!q) return null;
  const candles = [];
  res.timestamp.forEach((t, i) => {
    if (q.close?.[i] == null || q.open?.[i] == null) return;
    candles.push([t, r4(q.open[i]), r4(q.high[i]), r4(q.low[i]), r4(q.close[i]), q.volume?.[i] ?? 0]);
  });
  if (!candles.length) return null;
  const last = candles[candles.length - 1];
  const price = res.meta?.regularMarketPrice ?? last[4];
  const prev = candles.length > 1 ? candles[candles.length - 2][4] : res.meta?.chartPreviousClose ?? null;
  return { price: r4(price), prev: r4(prev), time: res.meta?.regularMarketTime ?? last[0], candles: candles.slice(-130) };
}

async function fetchChart(ysym) {
  let lastErr;
  for (const base of BASES) {
    try {
      const r = await fetch(`${base}/v8/finance/chart/${encodeURIComponent(ysym)}?interval=1d&range=6mo`, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const p = parseChart(await r.json());
      if (!p) throw new Error("no data");
      return p;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function fetchSymbol(market, symbol) {
  let err;
  for (const y of yahooCandidates(market, symbol)) {
    try { return await fetchChart(y); } catch (e) { err = e; await sleep(DELAY_MS); }
  }
  throw err;
}

async function main() {
  const list = JSON.parse(await readFile(WATCHLIST, "utf8")).symbols ?? [];
  let old = { quotes: {}, candles: {}, fx: {} };
  try { old = { ...old, ...JSON.parse(await readFile(OUT, "utf8")) }; } catch {}
  const next = { updated: old.updated ?? null, fx: { ...old.fx }, quotes: { ...old.quotes }, candles: { ...old.candles } };
  let ok = 0, fail = 0;

  for (const { market, symbol } of list) {
    const key = `${market}:${String(symbol).toUpperCase()}`;
    try {
      const p = await fetchSymbol(market, symbol);
      next.quotes[key] = { price: p.price, prev: p.prev, time: p.time };
      next.candles[key] = p.candles;
      ok++;
    } catch (e) { fail++; console.log(`✗ ${key}: ${e.message}`); }
    await sleep(DELAY_MS);
  }
  try { const fx = await fetchChart("TWD=X"); next.fx.USDTWD = fx.price; } catch (e) { console.log(`✗ USD/TWD: ${e.message}`); }

  console.log(`完成：成功 ${ok}、失敗 ${fail}`);
  if (ok === 0) { console.log("沒有任何標的成功，保留原檔不更新。"); return; }
  next.updated = new Date().toISOString();
  await writeFile(OUT, JSON.stringify(next) + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
