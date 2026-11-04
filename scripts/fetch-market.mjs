// fetch-market.mjs — 排程抓取 TWSE 公開資料 → market.json（盤後統計）
//   indices   ：mis.twse.com.tw 即時指數（tse_t00/o00/t17/t13/t31/t21/t02…）
//   breadth   ：MI_INDEX（漲跌家數、成交金額）
//   institutions：BFI82U 三大法人買賣超彙總（單位：元）＋近 5 日
//   instRank  ：fund/T86 各產業個股三大法人買賣超（單位：股；自營含避險）
//   industry  ：T86 依 selectType 彙總（單位：股）
//   industryEst：半導體／通信網路熱門成分股估算（T86 收不到的通訊類，改由成分股加總；單位：股）
//   daytrade  ：TWTB4U 當日沖銷統計（股數／金額）
// 前端一律以「張」（/1000）或「億」（/1e8，僅法人彙總為元）顯示，並標註「盤後估算」。
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const base = "https://www.twse.com.tw/";
const misBase = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp";
const fmt = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

async function get(url, ms = 20000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}
const twse = (path) => get(base + path + (path.includes("?") ? "&" : "?") + "response=json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 1. 指數（mis 即時，無 CORS 故由 server 端抓） ── */
async function fetchIndices() {
  const codes = ["tse_t00.tw", "tse_o00.tw", "tse_t17.tw", "tse_t13.tw", "tse_t31.tw", "tse_t21.tw", "tse_t02.tw"];
  const ms = new Map([["tse_t00.tw", "t00"], ["tse_o00.tw", "o00"], ["tse_t17.tw", "t17"], ["tse_t13.tw", "t13"], ["tse_t31.tw", "t31"], ["tse_t21.tw", "t21"], ["tse_t02.tw", "t02"]]);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const j = await get(`${misBase}?ex_ch=${codes.join("|")}&json=1`);
      return (j?.msgArray || []).map((x) => {
        const ch = x.ch, code = ms.get(ch) || ch, name = x.n || ch;
        return { code, name, price: x.z !== "-" ? parseFloat(x.z) : null, prev: x.y !== "-" ? parseFloat(x.y) : null, time: x.t ? `${x.d} ${x.t}` : null };
      }).filter((i) => i.price != null);
    } catch (e) { process.stdout.write(`✗ indices attempt ${attempt + 1} ${e.message}\n`); }
    await sleep(800);
  }
  return [];
}

/* ── 2. 漲跌家數 / 成交金額（MI_INDEX） ── */
async function fetchBreadth(date) {
  try {
    const j = await twse(`exchangeReport/MI_INDEX?date=${date}`);
    const tables = j?.tables || [];
    const amount = (() => {
      const t = tables.find((x) => String(x.title).includes("大盤統計資訊"));
      if (!t) return null;
      const row = t.data?.[0] || [];
      const head = t.fields || [];
      const i = head.indexOf("成交金額(元)");
      return i >= 0 ? parseFloat(String(row[i]).replace(/,/g, "")) : null;
    })();
    const b = tables.find((x) => x.title === "漲跌證券數合計");
    const data = b?.data || [];
    const toN = (s) => parseInt(String(s || "0").replace(/[^\d-]/g, ""), 10) || 0;
    const find = (label) => {
      const row = data.find((r) => String(r[0]).includes(label));
      if (!row) return null;
      const parse = (v) => { const m = String(v).match(/[\d,]+/); return m ? parseInt(m[0].replace(/,/g, ""), 10) : 0; };
      return { all: parse(row[1]), tw: parse(row[2]) };
    };
    const rise = find("上漲"), fall = find("下跌"), flat = find("持平");
    if (!rise || !fall) return null;
    return {
      date, amount,
      rise: rise.tw, fall: fall.tw, flat: flat?.tw || 0,
      riseAll: rise.all, fallAll: fall.all, flatAll: flat?.all || 0,
    };
  } catch (e) { process.stdout.write(`✗ breadth ${e.message}\n`); return null; }
}

/* ── 3. 三大法人彙總（BFI82U；單位 元） ── */
async function fetchInstitutions(day) {
  try {
    const j = await twse(`fund/BFI82U?dayDate=${day}&type=day`);
    const rows = j?.data || [];
    if (!rows.length) return null;
    const map = {};
    for (const r of rows) {
      const name = r[0], buy = parseFloat(String(r[1]).replace(/,/g, "")), sell = parseFloat(String(r[2]).replace(/,/g, "")), net = parseFloat(String(r[3]).replace(/,/g, ""));
      map[name] = { buy, sell, net };
    }
    const dealer = map["自營商(自行買賣)"] || { buy: 0, sell: 0, net: 0 };
    const hedge = map["自營商(避險)"] || { buy: 0, sell: 0, net: 0 };
    const trust = map["投信"] || { buy: 0, sell: 0, net: 0 };
    const foreign = map["外資及陸資(不含外資自營商)"] || { buy: 0, sell: 0, net: 0 };
    const total = map["合計"] || { buy: 0, sell: 0, net: 0 };
    return { date: day, total, foreign, trust, dealer: { buy: dealer.buy + hedge.buy, sell: dealer.sell + hedge.sell, net: dealer.net + hedge.net } };
  } catch (e) { process.stdout.write(`✗ institutions ${e.message}\n`); return null; }
}

/* ── 4. T86 產業個股（單位：股） ── */
const INDUSTRIES = [
  ["01", "水泥"], ["02", "食品"], ["03", "塑膠"], ["04", "紡織"], ["05", "電機"],
  ["06", "電器電纜"], ["10", "鋼鐵"], ["12", "汽車"], ["13", "電子"], ["15", "運輸"],
  ["16", "觀光"], ["17", "金融保險"], ["19", "油電燃氣"], ["20", "其他"], ["22", "生技醫療"],
];
async function fetchT86(date, selectType) {
  const j = await twse(`fund/T86?date=${date}&selectType=${selectType}`);
  const rows = j?.data || [];
  const out = [];
  for (const r of rows) {
    const n = (v) => parseFloat(String(v).replace(/,/g, "")) || 0;
    out.push({
      code: r[0], name: r[1],
      foreignNet: n(r[4]) + n(r[7]),
      trustNet: n(r[10]),
      dealerNet: n(r[13]),
      totalNet: n(r[13]) + n(r[10]) + n(r[4]) + n(r[7]),
    });
  }
  return out;
}

async function fetchAllT86(date) {
  const all = [], byIndustry = [];
  for (const [code, name] of INDUSTRIES) {
    try {
      const rows = await fetchT86(date, code);
      let foreignNet = 0, trustNet = 0, dealerNet = 0, totalNet = 0;
      for (const r of rows) { foreignNet += r.foreignNet; trustNet += r.trustNet; dealerNet += r.dealerNet; totalNet += r.totalNet; all.push({ ...r, industry: name }); }
      byIndustry.push({ code, name, foreignNet, trustNet, dealerNet, totalNet, stocks: rows.length });
    } catch (e) { process.stdout.write(`✗ T86 ${code} ${e.message}\n`); }
    await sleep(150);
  }
  return { all, byIndustry };
}

/* ── 5. 半導體／通信網路估算（成分股加總） ── */
const SUB_STOCKS = {
  "半導體": ["2330", "2454", "2303", "2337", "2408", "3711", "6770", "5347", "6488"],
  "通信網路": ["2412", "3045", "4904", "2345", "6285"],
};
function estSub(all) {
  const est = {};
  for (const [name, codes] of Object.entries(SUB_STOCKS)) {
    const rows = all.filter((r) => codes.includes(r.code));
    est[name] = { totalNet: rows.reduce((s, r) => s + r.totalNet, 0), stocks: rows.length };
  }
  return est;
}

/* ── 6. 當日沖銷（TWTB4U） ── */
async function fetchDaytrade(date) {
  try {
    const j = await twse(`exchangeReport/TWTB4U?date=${date}`);
    const tables = j?.tables || [];
    const totalRow = tables[0]?.data?.[0] || [];
    const totalShares = parseFloat(String(totalRow[2] || 0).replace(/,/g, ""));
    const list = (tables[1]?.data || []).map((r) => ({
      code: r[0], name: r[1],
      shares: parseFloat(String(r[3]).replace(/,/g, "")) || 0,
      buy: parseFloat(String(r[4]).replace(/,/g, "")) || 0,
      sell: parseFloat(String(r[5]).replace(/,/g, "")) || 0,
    }));
    return { date, total: { shares: totalShares }, list: list.slice(0, 20) };
  } catch (e) { process.stdout.write(`✗ daytrade ${e.message}\n`); return null; }
}

/* ── 近 5 個交易日法人（回推最多 12 個日曆日） ── */
async function fetchInstitutionDays() {
  const days = [];
  for (let back = 0; back < 12 && days.length < 5; back++) {
    const d = new Date(); d.setDate(d.getDate() - back);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const inst = await fetchInstitutions(fmt(d));
    if (inst) days.push({ date: inst.date, totalNet: inst.total.net, foreignNet: inst.foreign.net });
    await sleep(150);
  }
  return days;
}

/* ── main ── */
async function main() {
  const today = fmt(new Date());
  let date = today;
  const breadth = await fetchBreadth(today);
  if (!breadth) {
    const y = new Date(); y.setDate(y.getDate() - 1); date = fmt(y);
    const b2 = await fetchBreadth(date);
    if (!b2) { process.stdout.write("✗ MI_INDEX 兩日皆失敗\n"); }
  }
  const useDate = breadth ? today : date;

  const [indices, instDays, t86] = await Promise.all([
    fetchIndices(),
    fetchInstitutionDays(),
    fetchAllT86(useDate),
  ]);
  const instToday = instDays.length ? await fetchInstitutions(instDays[0].date) : null;
  const rank = { foreign: [], trust: [], dealer: [] };
  for (const r of t86.all) {
    if (r.foreignNet > 0) rank.foreign.push({ code: r.code, name: r.name, net: r.foreignNet });
    if (r.trustNet > 0) rank.trust.push({ code: r.code, name: r.name, net: r.trustNet });
    if (r.dealerNet > 0) rank.dealer.push({ code: r.code, name: r.name, net: r.dealerNet });
  }
  for (const k of ["foreign", "trust", "dealer"]) rank[k].sort((a, b) => b.net - a.net);

  const out = {
    updated: new Date().toISOString(), date: useDate,
    indices,
    breadth: breadth || (await fetchBreadth(useDate)) || null,
    institutions: instToday ? { ...instToday, days: instDays } : null,
    instRank: rank,
    industry: t86.byIndustry.map((x) => ({ code: x.code, name: x.name, foreignNet: x.foreignNet, trustNet: x.trustNet, dealerNet: x.dealerNet, totalNet: x.totalNet })),
    industryEst: estSub(t86.all),
    daytrade: await fetchDaytrade(useDate),
  };
  writeFileSync(join(ROOT, "market.json"), JSON.stringify(out));
  process.stdout.write(`done: market.json updated=${out.updated} indices=${indices.length} industries=${out.industry.length}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
