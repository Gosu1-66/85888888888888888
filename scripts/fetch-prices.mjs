// fetch-prices.mjs — 排程抓取行情：讀 watchlist.json → Yahoo Finance chart API → 寫 prices.json
//   台股/ETF: 代號.TW（Yahoo）｜美股: 代號｜加密貨幣: 代號-USD｜指數: ^TWII / ^TWOII（原樣）
//   產出：{ updated, quotes:{key:{price,prev,time}}, candles:{key:[[t,o,h,l,c,v]…]}, fx:{USDTWD} }
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const YAHOO = (sym, range = "1y", interval = "1d") =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}`;

async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}

async function fetchChart(sym) {
  const j = await fetchJson(YAHOO(sym));
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error(`empty result ${sym}`);
  const ts = res.timestamp || [];
  const q = res.indicators?.quote?.[0] || {};
  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
    if (o == null || h == null || l == null || c == null || v == null) continue;
    candles.push([ts[i], o, h, l, c, v]);
  }
  if (!candles.length) throw new Error(`no candles ${sym}`);
  return candles;
}

const yahooSym = (w) => {
  const { market: m, symbol: s } = w;
  if (m === "台股") return w.board === "上櫃" ? `${s}.TWO` : `${s}.TW`;
  if (m === "加密貨幣") return `${s}-USD`;
  return s; // 美股/指數原樣
};

async function main() {
  const watch = JSON.parse(readFileSync(join(ROOT, "watchlist.json"), "utf8"));
  const quotes = {}, candles = {};
  let fail = 0;
  for (const w of watch) {
    const key = `${w.market}:${w.symbol.toUpperCase()}`;
    try {
      const cs = await fetchChart(yahooSym(w));
      candles[key] = cs;
      const last = cs[cs.length - 1], prev = cs[cs.length - 2] || cs[cs.length - 1];
      quotes[key] = { price: last[4], prev: prev[4], time: last[0] };
      process.stdout.write(`✓ ${key} ${last[4]}\n`);
    } catch (e) { fail++; process.stdout.write(`✗ ${key} ${e.message}\n`); }
    await new Promise((r) => setTimeout(r, 120));
  }
  // 美元匯率（Yahoo 匯率符號 USDTWD=X）
  let fx = { USDTWD: null };
  try {
    const cs = await fetchChart("USDTWD=X");
    fx.USDTWD = cs[cs.length - 1][4];
  } catch (e) { process.stdout.write(`✗ USDTWD=X ${e.message}\n`); }
  const out = { updated: new Date().toISOString(), quotes, candles, fx };
  writeFileSync(join(ROOT, "prices.json"), JSON.stringify(out));
  process.stdout.write(`done: ${Object.keys(quotes).length} quotes, ${fail} failed, fx=${fx.USDTWD}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
