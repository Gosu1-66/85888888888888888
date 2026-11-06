// fetch-margin.mjs — 抓 TWSE 信用交易（融資融券）→ margin.json
// 產出：{ date, marginLots, marginLotsChg, shortLots, shortLotsChg, marginAmt, marginAmtChg }
// 單位：股 / 元。前端以「億」（金額）、「張」（/1000）顯示。
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const fmt = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const num = (v) => parseFloat(String(v == null ? "" : v).replace(/[,%]/g, "").trim()) || 0;

async function getJson(url, ms = 20000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

async function fetchMargin(date) {
  const url = `https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=${date}&selectType=MS&response=json`;
  const j = await getJson(url);
  const t = (j?.tables || []).find((x) => String(x.title || "").includes("信用交易")) || (j?.tables || [])[0];
  if (!t || !t.data) return null;
  const idx = (label) => t.data.findIndex((r) => String(r[0]).includes(label));
  const get = (label, col) => { const i = idx(label); return i < 0 ? null : num(t.data[i][col]); };
  // fields: 項目 / 買進 / 賣出 / 現金(券)償還 / 前日餘額 / 今日餘額
  const mL = get("融資(交易單位)", 5), mLp = get("融資(交易單位)", 4);
  const sL = get("融券(交易單位)", 5), sLp = get("融券(交易單位)", 4);
  const mA = get("融資金額(仟元)", 5), mAp = get("融資金額(仟元)", 4);
  if (mL == null && mA == null) return null;
  return {
    date,
    marginLots: mL == null ? null : mL * 1000,
    marginLotsChg: mL == null || mLp == null ? null : (mL - mLp) * 1000,
    shortLots: sL == null ? null : sL * 1000,
    shortLotsChg: sL == null || sLp == null ? null : (sL - sLp) * 1000,
    marginAmt: mA == null ? null : mA * 1000,
    marginAmtChg: mA == null || mAp == null ? null : (mA - mAp) * 1000,
    updated: new Date().toISOString(),
  };
}

async function main() {
  const today = new Date();
  const tried = [];
  for (let back = 0; back < 5; back++) {
    const d = new Date(today); d.setDate(d.getDate() - back);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const date = fmt(d);
    tried.push(date);
    try {
      const m = await fetchMargin(date);
      if (m) {
        writeFileSync(join(ROOT, "margin.json"), JSON.stringify(m));
        process.stdout.write(`done: margin.json date=${date} marginAmt=${m.marginAmt}\n`);
        return;
      }
    } catch (e) { process.stdout.write(`x ${date} ${e.message}\n`); }
  }
  process.stdout.write(`skip: no margin data tried=${tried.join(",")}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
