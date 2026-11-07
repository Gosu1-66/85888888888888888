// fetch-logos.mjs — 以 TradingView 符號搜尋取得 logoid，寫入 logos.json（只補沒有的；每次最多 LIMIT 檔）
//   key 例：台股:2330 → "taiwan-semiconductor"；圖片網址 https://s3-symbol-logo.tradingview.com/<id>--big.svg
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIMIT = Number(process.env.LOGO_LIMIT || 500);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (f, d) => { try { return JSON.parse(readFileSync(join(ROOT, f), "utf8")); } catch { return d; } };

const logos = read("logos.json", {});
const miss = read("logos-miss.json", {});          // 查過但沒有 logo 的，7 天內不重查
const prices = read("prices.json", { quotes: {} });
const now = Date.now(), WEEK = 7 * 864e5;

// 候選：台股依成交值由大到小（含 ETF），再加美股
const cand = Object.entries(prices.quotes || {})
  .filter(([k]) => k.startsWith("台股:") || k.startsWith("美股:"))
  .map(([k, q]) => [k, (q.vol || 0) * (q.price || 0)])
  .sort((a, b) => b[1] - a[1])
  .map(([k]) => k)
  .filter((k) => !logos[k] && !(miss[k] && now - miss[k] < WEEK));

async function lookup(key) {
  const [mk, sym] = key.split(":");
  const ex = mk === "台股" ? (prices.quotes[key]?.board === "上櫃" ? "TPEX" : "TWSE") : "";
  const url = `https://symbol-search.tradingview.com/symbol_search/v3/?text=${encodeURIComponent(sym)}${ex ? `&exchange=${ex}` : ""}&hl=0&lang=en&start=0`;
  const r = await fetch(url, { headers: { "User-Agent": UA, Origin: "https://www.tradingview.com", Referer: "https://www.tradingview.com/", Accept: "application/json" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  const hit = (j.symbols || []).find((s) => String(s.symbol).replace(/<\/?em>/g, "") === sym && (!ex || s.exchange === ex || s.prefix === ex));
  if (!hit) return null;
  return hit.logoid || hit.source_logoid || (hit.provider_id && hit.provider_id !== "ice" ? null : null) || null;
}

let n = 0, ok = 0, fails = 0;
for (const k of cand.slice(0, LIMIT)) {
  try {
    const id = await lookup(k);
    if (id) { logos[k] = id; ok++; } else miss[k] = now;
  } catch (e) { if (++fails > 15) { console.log("太多錯誤，提前結束：", e.message); break; } }
  if (++n % 50 === 0) console.log(`${n} 查詢，${ok} 取得`);
  await sleep(250);
}
writeFileSync(join(ROOT, "logos.json"), JSON.stringify(logos));
writeFileSync(join(ROOT, "logos-miss.json"), JSON.stringify(miss));
console.log(`完成：查 ${n}，新增 ${ok}，logos 共 ${Object.keys(logos).length}`);
