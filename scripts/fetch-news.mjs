// fetch-news.mjs — 鉅亨網 API → news.json（大盤/美股/加密貨幣 + 成交值前 40 檔個股）
//   news.json = { updated, market:{tw:[],us:[],crypto:[]}, stocks:{"台股:2330":[{t,s,u,d}]} }  t 標題 s 來源 u 連結 d 時間(ms)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dec = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const tag = (x, n) => { const m = x.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`)); return m ? dec(m[1]) : ""; };

// 鉅亨網公開新聞 API；每則連結為 https://news.cnyes.com/news/id/<newsId>（真實原文頁）
const strip = (x) => String(x || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
const ART = {};   // newsId → 內文純文字（站內閱讀用）
const unent = (t) => t.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
// content 常是實體編碼的 HTML：先還原實體、再去標籤（兩輪以防雙重編碼）
const toText = (h) => { let t = String(h || ""); for (let i = 0; i < 2; i++) t = unent(t).replace(/<\/(p|div|h\d|li)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""); return t.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim(); };
// 只留導言（前幾段、約 300 字）+ 原文連結，不全文轉載
const lead = (t) => { const out = []; let n = 0; for (const p of t.split("\n").map((x) => x.trim()).filter(Boolean)) { out.push(p); n += p.length; if (n >= 220 || out.length >= 3) break; } return out.join("\n").slice(0, 420); };
const cover = (cs) => { const o = cs && (cs.m || cs.l || cs.s || cs.xs || Object.values(cs)[0]); return o && o.src ? o.src : ""; };
function pick(j) {
  const it = j?.items ?? j?.data ?? j;
  const arr = Array.isArray(it) ? it : Array.isArray(it?.data) ? it.data : [];
  return arr.filter((x) => x && x.newsId && x.title).map((x) => {
    const c = lead(toText(x.content) || toText(x.summary));
    if (c && !ART[x.newsId]) ART[x.newsId] = c;
    return { id: x.newsId, img: cover(x.coverSrc), t: strip(x.title), s: "鉅亨網", u: `https://news.cnyes.com/news/id/${x.newsId}`, d: (x.publishAt || 0) * 1000 };
  });
}
async function api(url, n) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return pick(await r.json()).slice(0, n).sort((a, b) => b.d - a.d);
}
const cat = (c, n = 10) => api(`https://api.cnyes.com/media/api/v1/newslist/category/${c}?limit=${Math.max(n, 12)}`, n);
const rss = (q, n = 8) => api(`https://api.cnyes.com/media/api/v1/search?q=${encodeURIComponent(q)}&limit=${Math.max(n, 12)}`, n);

let prev = {};
try { prev = JSON.parse(readFileSync(join(ROOT, "news.json"), "utf8")); } catch {}
const news = { updated: new Date().toISOString(), art: {}, market: Object.fromEntries(Object.entries(prev.market || {}).map(([k, l]) => [k, l.filter((x) => x.u?.startsWith("https://news.cnyes.com/"))])), stocks: {} };
for (const [k, f] of [["tw", () => cat("tw_stock")], ["us", () => cat("us_stock")], ["crypto", () => rss("加密貨幣 比特幣", 10)]]) {
  try { const l = await f(); if (l.length) news.market[k] = l; } catch (e) { console.log("market", k, e.message); }
  await sleep(400);
}
let prices = { quotes: {} };
try { prices = JSON.parse(readFileSync(join(ROOT, "prices.json"), "utf8")); } catch {}
const top = Object.entries(prices.quotes || {}).filter(([k]) => k.startsWith("台股:")).map(([k, q]) => [k, (q.vol || 0) * (q.price || 0), q.name]).sort((a, b) => b[1] - a[1]).slice(0, 40);
const extra = [["美股:NVDA", "輝達"], ["美股:AAPL", "蘋果"], ["美股:TSLA", "特斯拉"], ["加密貨幣:BTC", "比特幣"], ["加密貨幣:ETH", "以太幣"]];
let fails = 0;
for (const [k, , name] of top) {
  try { const sym = k.split(":")[1]; const l = await rss(`${String(name).trim()}`, 6); if (l.length) news.stocks[k] = l; } catch { if (++fails > 8) break; }
  await sleep(400);
}
for (const [k, q] of extra) { try { const l = await rss(q, 6); if (l.length) news.stocks[k] = l; } catch {} await sleep(400); }
// 沒抓到新資料時保留舊的，避免整頁變空
for (const k of Object.keys(prev.stocks || {})) { const old = (prev.stocks[k] || []).filter((x) => x.u?.startsWith("https://news.cnyes.com/")); if (!news.stocks[k] && old.length) news.stocks[k] = old; }
const used = new Set([...Object.values(news.market).flat(), ...Object.values(news.stocks).flat()].map((x) => x.id).filter(Boolean));
for (const id of used) if (ART[id]) news.art[id] = ART[id];
writeFileSync(join(ROOT, "news.json"), JSON.stringify(news));
console.log("news:", Object.values(news.market).map((l) => l.length), "stocks:", Object.keys(news.stocks).length);
