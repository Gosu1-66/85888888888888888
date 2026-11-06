// 抓 TWSE 各類指數的日收盤序列，寫入 index-history.json（供指數詳情頁畫圖）。
// 來源：https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?type=IND
import fs from "node:fs";
import path from "node:path";

const DAYS = Number(process.env.IDX_DAYS || 120);
const OUT = path.join(process.cwd(), "index-history.json");
const TARGETS = {
  "發行量加權股價指數": "t00",
  "半導體類指數": "t24",
  "金融保險類指數": "t17",
  "電子工業類指數": "t13",
};

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

async function one(date) {
  const url = `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${date}&type=IND&response=json`;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Referer: "https://www.twse.com.tw/" },
      });
      const t = await r.text();
      if (!t.trim().startsWith("{")) throw new Error("not json");
      const j = JSON.parse(t);
      if (j.stat !== "OK") return null;
      return { rows: j.tables?.[0]?.data || [], date: j.date };
    } catch (e) {
      await new Promise((res) => setTimeout(res, 600 * (i + 1)));
    }
  }
  return null;
}

const out = { updated: new Date().toISOString(), series: {} };
for (const code of Object.values(TARGETS)) out.series[code] = [];

let cursor = new Date();
cursor.setHours(12, 0, 0, 0);
cursor.setDate(cursor.getDate() + 1);   // 從今天開始往回（今天未發布會自動跳過）
let got = 0, tries = 0;
while (got < DAYS && tries < DAYS * 3) {
  tries++;
  cursor.setDate(cursor.getDate() - 1);
  if (cursor.getDay() === 0 || cursor.getDay() === 6) continue;
  const date = ymd(cursor);
  const res = await one(date);
  if (!res) continue;
  const t = Math.floor(cursor.getTime() / 1000);
  let hit = 0;
  for (const [name, code] of Object.entries(TARGETS)) {
    const row = res.rows.find((r) => r[0] === name);
    if (!row) continue;
    const px = Number(String(row[1]).replace(/,/g, ""));
    if (!isFinite(px) || px <= 0) continue;
    out.series[code].unshift([t, px]);
    hit++;
  }
  if (hit === 0) continue;
  got++;
  process.stdout.write(`\r${date} ${got}/${DAYS}   `);
  await new Promise((r) => setTimeout(r, 200));
}

out.count = got;
fs.writeFileSync(OUT, JSON.stringify(out));
console.log("\nindex-history.json:", got, "交易日", "bytes", fs.statSync(OUT).size);
for (const [code, arr] of Object.entries(out.series)) console.log(code, arr.length, arr.length ? arr[arr.length - 1][1] : "-");
