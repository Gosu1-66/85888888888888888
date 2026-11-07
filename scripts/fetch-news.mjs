// fetch-news.mjs — Google News RSS → news.json（大盤/美股/加密貨幣 + 成交值前 40 檔個股）
//   news.json = { updated, market:{tw:[],us:[],crypto:[]}, stocks:{"台股:2330":[{t,s,u,d}]} }  t 標題 s 來源 u 連結 d 時間(ms)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dec = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const tag = (x, n) => { const m = x.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`)); return m ? dec(m[1]) : ""; };

async function rss(q, n = 8) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:3d")}&hl=zh-TW&gl=TW&ceid=TW:zh-TW`;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const xml = await r.text();
  const out = [];
  for (const it of xml.split("<item>").slice(1)) {
    let t = tag(it, "title"), s = tag(it, "source"), u = tag(it, "link"), d = Date.parse(tag(it, "pubDate"));
    if (!t || !u) continue;
    if (s && t.endsWith(" - " + s)) t = t.slice(0, -(s.length + 3));
    out.push({ t, s, u, d: isNaN(d) ? 0 : d });
    if (out.length >= n) break;
  }
  return out.sort((a, b) => b.d - a.d);
}

let prev = {};
try { prev = JSON.parse(readFileSync(join(ROOT, "news.json"), "utf8")); } catch {}
const news = { updated: new Date().toISOString(), market: prev.market || {}, stocks: {} };
for (const [k, q] of [["tw", "台股 大盤"], ["us", "美股 華爾街"], ["crypto", "比特幣 加密貨幣"]]) {
  try { const l = await rss(q, 10); if (l.length) news.market[k] = l; } catch (e) { console.log("market", k, e.message); }
  await sleep(400);
}
let prices = { quotes: {} };
try { prices = JSON.parse(readFileSync(join(ROOT, "prices.json"), "utf8")); } catch {}
const top = Object.entries(prices.quotes || {}).filter(([k]) => k.startsWith("台股:")).map(([k, q]) => [k, (q.vol || 0) * (q.price || 0), q.name]).sort((a, b) => b[1] - a[1]).slice(0, 40);
const extra = [["美股:NVDA", "輝達 NVIDIA"], ["美股:AAPL", "蘋果 Apple 股價"], ["美股:TSLA", "特斯拉 Tesla"], ["加密貨幣:BTC", "比特幣"], ["加密貨幣:ETH", "以太幣"]];
let fails = 0;
for (const [k, , name] of top) {
  try { const sym = k.split(":")[1]; const l = await rss(`${String(name).trim()} ${sym}`, 6); if (l.length) news.stocks[k] = l; } catch { if (++fails > 8) break; }
  await sleep(400);
}
for (const [k, q] of extra) { try { const l = await rss(q, 6); if (l.length) news.stocks[k] = l; } catch {} await sleep(400); }
// 沒抓到新資料時保留舊的，避免整頁變空
for (const k of Object.keys(prev.stocks || {})) if (!news.stocks[k]) news.stocks[k] = prev.stocks[k];
writeFileSync(join(ROOT, "news.json"), JSON.stringify(news));
console.log("news:", Object.values(news.market).map((l) => l.length), "stocks:", Object.keys(news.stocks).length);
