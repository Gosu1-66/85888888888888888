// profile.js — 個人中心：資產摘要、AI 對話（規則式）、通知中心、警報 CRUD、風險測驗、
//             匯率設定、備份匯出/匯入、範例資料、自訂首頁入口、手動報價、清除資料。
// 支援 ?f=entries 自動開啟入口編輯。
import { esc, fmt, pct, tone, money, ageText, toast, openSheet, closeSheet, uid, today, registerAction, copyText, parseRoute } from "./ui.js";
import { S, save, fxRate, fxSource, quoteOf, holdings, uni, riskScore } from "./state.js";
import { currencyOf, keyOf, holdingStats, toTWD } from "./portfolio.js";
import { universe } from "./catalog.js";
import { greedIndex } from "./marketdata.js";
import { loadCandles } from "./quotes.js";
import { analyze } from "./analysis.js";
import { buildSeries } from "./indicators.js";

/* ---------------- 工具 ---------------- */
const num = (x) => (typeof x === "number" && isFinite(x)) ? x : 0;

function defaultSet() {
  return {
    watch: [], custom: [], manual: {}, fxManual: null, alerts: [], notifications: [],
    entries: { order: ["radar", "inst", "daytrade", "scan", "tools", "watchlist", "index", "custom"], hidden: [] },
    risk: { q: {}, score: null },
  };
}

function uniList() {
  try { const u = uni && uni(); if (u && u.length) return u; } catch {}
  try { return universe(S.set, S.data) || []; } catch { return []; }
}
function keyOfItem(it) { return it ? (it.key || `${it.market}:${it.symbol}`) : ""; }
function findUni(sym) {
  sym = String(sym || "").trim().toUpperCase();
  const u = uniList();
  return u.find((x) => String(x.symbol || "").toUpperCase() === sym)
      || u.find((x) => String(x.symbol || "").toUpperCase().includes(sym));
}
function nameByKey(key) {
  const f = uniList().find((x) => keyOfItem(x) === key);
  return f ? (f.name || f.symbol || key) : key;
}

/* ---------------- 資產統計（透過 holdingStats 正確換算） ---------------- */
function assetStats() {
  const fx = fxRate();
  const hs = holdings();
  let mv = 0, cost = 0, unreal = 0;
  for (const h of hs) {
    const r = holdingStats(h, quoteOf(h), fx);
    mv += r.value; cost += r.cost; unreal += r.pnl;
  }
  const realized = hs.reduce((s, h) => s + toTWD(h.currency, h.realized, fx), 0);
  const total = mv + realized;
  const ret = cost > 0 ? ((unreal + realized) / cost) * 100 : 0;
  return { mv, cost, unreal, realized, total, ret };
}

/* ---------------- 風險測驗 ---------------- */
const RISK_Q = [
  { q: "你的投資年資？", opts: ["未滿 1 年", "1-3 年", "3-10 年", "10 年以上"] },
  { q: "可承受的單一持股最大虧損？", opts: ["10% 以內", "10-20%", "20-40%", "虧多少都沒差"] },
  { q: "你的投資目的？", opts: ["保守增值", "穩健成長", "積極獲利", "短期投機"] },
  { q: "資金可投入時間？", opts: ["1 年以內", "1-3 年", "3-5 年", "5 年以上"] },
  { q: "持股遇到大跌，你會？", opts: ["全部賣出", "部分減碼", "持有觀望", "逢低加碼"] },
];
const RISK_STRATEGY = {
  "保守": "以高股息 ETF、債券型商品為核心，搭配定期定額。著重保本與現金流，波段操作為輔，避開高波動個股。",
  "穩健": "以市值型 ETF 為核心持股（約 70%），搭配少量個股（約 30%）增進報酬。預先設定停利停損，定期檢視部位。",
  "積極": "可布局成長股、科技股與主題型商品，亦可運用槓桿商品。務必控制單一持股比例，嚴格執行停損，避免單押。",
};
function riskType(score) {
  if (score == null) return null;
  if (score < 40) return "保守";
  if (score <= 70) return "穩健";
  return "積極";
}

/* ---------------- 警報 ---------------- */
const ALERT_KINDS = { "price-above": "價格高於", "price-below": "價格低於", "day-above": "單日漲跌高於", "day-below": "單日漲跌低於" };

/* ---------------- AI 助理（規則式） ---------------- */
async function analyzeStock(sym) {
  const u = findUni(sym);
  if (!u) return `找不到標的「${esc(sym)}」`;
  const key = keyOfItem(u);
  try {
    const candles = await loadCandles(u.market, u.symbol, S.file);
    if (!candles || !candles.length) return `「${esc(u.name || sym)}」目前沒有 K 線資料可分析（需等行情檔排程更新）。`;
    const series = buildSeries(candles);
    const res = analyze(series);
    const label = res && (res.label || res.tag || "");
    const trend = res && (res.trend || res.summary || res.desc || "");
    const parts = [];
    if (label) parts.push(`方向：${esc(label)}`);
    if (trend) parts.push(`摘要：${esc(String(trend).slice(0, 120))}`);
    return `分析 ${esc(u.name || sym)}（${esc(key)}）<br>${parts.join("<br>") || "無摘要"}`;
  } catch (e) {
    return `分析「${esc(u.name || sym)}」失敗：${esc((e && e.message) || "")}`;
  }
}
function quoteText(sym) {
  const u = findUni(sym);
  if (!u) return `找不到標的「${esc(sym)}」`;
  const key = keyOfItem(u);
  const q = S.quotes[key];
  if (!q) return `「${esc(u.name || sym)}」目前無報價資料。`;
  const chg = num(q.change);
  return `${esc(u.name || sym)}（${esc(key)}）現價 ${fmt(num(q.price), 2)}，${chg >= 0 ? '<span class="up">' : '<span class="down">'}${chg >= 0 ? "+" : ""}${fmt(chg, 2)}%</span>`;
}
function aiAssetText() {
  const st = assetStats();
  return `庫存市值 ${money("TWD", st.mv, 0)}<br>` +
    `未實現損益 <span class="num ${tone(st.unreal)}">${st.unreal >= 0 ? "+" : ""}${money("TWD", st.unreal, 0)}</span><br>` +
    `已實現損益 <span class="num ${tone(st.realized)}">${st.realized >= 0 ? "+" : ""}${money("TWD", st.realized, 0)}</span><br>` +
    `資產總額（市值＋已實現） ${money("TWD", st.total, 0)}<br>` +
    `報酬率 <span class="num ${tone(st.ret)}">${pct(st.ret)}</span>`;
}
function aiAlertsText() {
  const al = S.set.alerts || [];
  if (!al.length) return "目前沒有設定警報。";
  return al.map((a) => {
    const nm = nameByKey(a.key);
    const kind = ALERT_KINDS[String(a.kind).replace(/_/g, "-")] || a.kind;
    return `・${esc(nm)}：${esc(kind)} ${fmt(num(a.threshold), 2)} ${a.active ? "（啟用）" : "（關閉）"}`;
  }).join("<br>");
}
async function aiReply(text) {
  const t = String(text || "").trim();
  if (!t) return "我可以幫你：分析個股、查報價、看匯率、我的資產、貪婪指數、警報。";
  const low = t.toLowerCase();
  if (/^(你好|hi|hello|哈囉|安安|嗨)/i.test(low)) return "你好！我是台股助理。試試：「分析 2330」「報價 2330」「匯率」「我的資產」「貪婪指數」「警報」";
  let m = t.match(/分析\s*(\w+)/);
  if (m) return await analyzeStock(m[1]);
  m = t.match(/報價\s*(\w+)/);
  if (m) return quoteText(m[1]);
  if (/匯率|換匯|美金|美元/.test(t)) return `美元匯率：${fmt(fxRate(), 2)}（${esc(fxSource() || "自動")}）`;
  if (/我的資產|資產|總資產/.test(t)) return aiAssetText();
  if (/貪婪|恐懼|greed/i.test(t)) {
    try {
      const g = greedIndex();
      if (!g) return "目前無貪婪指數資料。";
      return `貪婪指數：${num(g.score).toFixed(0)}（${esc(g.label || "")}）`;
    } catch { return "貪婪指數資料取得失敗。"; }
  }
  if (/警報|提醒|alert/.test(low)) return aiAlertsText();
  return "我還不會這個指令。可用：「分析 2330」「報價 2330」「匯率」「我的資產」「貪婪指數」「警報」。";
}

/* ---------------- 備份 ---------------- */
function backupObj() { return { app: "gosu-invest", version: 3, exported: Date.now(), data: S.data, settings: S.set }; }
function sanitizeBackup(obj) {
  if (!obj || obj.app !== "gosu-invest") throw new Error("備份格式錯誤：app 欄位不符");
  const v = obj.version || 1;
  const data = obj.data || {};
  const settings = obj.settings || {};
  data.portfolios = Array.isArray(data.portfolios) ? data.portfolios : [];
  data.assets = Array.isArray(data.assets) ? data.assets : [];
  data.trades = Array.isArray(data.trades) ? data.trades : [];
  if (v < 3) {
    let def = data.portfolios.find((p) => p.name === "預設投資組合");
    if (!def) { def = { id: uid(), name: "預設投資組合" }; data.portfolios.push(def); }
    for (const a of data.assets) if (!a.portfolioId) a.portfolioId = def.id;
  }
  return { data, settings };
}

/* ---------------- Sheet ---------------- */
function openAI() {
  openSheet(`<h2>AI 助理</h2>
    <div id="ai-box" class="chatbox">
      <div class="msg sys">你好！我是台股助理。可用指令：分析 2330、報價 2330、匯率、我的資產、貪婪指數、警報</div>
    </div>
    <div class="formrow">
      <input id="ai-input" placeholder="試：分析 2330">
      <button class="btn primary" data-act="ai-send">送出</button>
    </div>`);
}
function openNotices() {
  const ns = S.set.notifications || [];
  const body = ns.length
    ? ns.slice().sort((a, b) => num(b.time) - num(a.time)).map((n) => `
        <div class="item row ${n.read ? "" : "unread"}">
          <span class="dot ${n.read ? "" : "red"}"></span>
          <div style="flex:1">
            <div>${esc(n.text || "")}</div>
            <div class="muted small">${esc(ageText(num(n.time)))}</div>
          </div>
        </div>`).join("")
    : '<div class="empty card">尚無通知（價格警報觸發時會出現在這裡）</div>';
  openSheet(`<h2>通知中心</h2>${body}<button class="btn" data-act="notices-read">全部已讀</button>`);
}
function openNewAlert() {
  const opts = uniList().map((u) => `<option value="${esc(keyOfItem(u))}">${esc(u.name || u.symbol)}（${esc(keyOfItem(u))}）</option>`).join("");
  openSheet(`<h2>新增警報</h2>
    <div class="formgrid">
      <label>標的<select id="na-key">${opts}</select></label>
      <label>類型<select id="na-kind">
        <option value="price-above">價格高於</option>
        <option value="price-below">價格低於</option>
        <option value="day-above">單日漲跌高於</option>
        <option value="day-below">單日漲跌低於</option>
      </select></label>
      <label>門檻<input id="na-th" type="number" step="0.01"></label>
    </div>
    <button class="btn primary" data-act="submit-alert">儲存</button>`);
}
function openRiskQuiz() {
  const html = RISK_Q.map((q, i) => `
    <div class="card">
      <div class="h2">${i + 1}. ${esc(q.q)}</div>
      ${q.opts.map((o, j) => `<label class="row small" style="justify-content:flex-start"><input type="radio" name="rq${i}" value="${j}"> ${esc(o)}</label>`).join("")}
    </div>`).join("");
  openSheet(`<h2>投資屬性測驗</h2>${html}<button class="btn primary" data-act="submit-risk">送出</button>`);
}
const ENTRY_LABELS = { radar: "雷達", inst: "法人排名", daytrade: "當沖", scan: "選股", tools: "工具", watchlist: "自選", index: "大盤", custom: "自訂", cloud: "雲端同步" };
function openEntries() {
  const entries = S.set.entries || { order: ["radar", "inst", "daytrade", "scan", "tools", "watchlist", "index", "custom"], hidden: [] };
  const hidden = entries.hidden || [];
  const html = (entries.order || []).map((k) => `
    <label class="item row">
      <span>${esc(ENTRY_LABELS[k] || k)}</span>
      <input type="checkbox" data-entr="${esc(k)}" ${hidden.includes(k) ? "" : "checked"}>
    </label>`).join("");
  openSheet(`<h2>自訂首頁入口</h2>
    <p class="muted small">勾選＝顯示在首頁，取消＝隱藏。儲存後跳回首頁。</p>${html}
    <button class="btn primary" data-act="save-entries">儲存</button>`);
}
function openImport() {
  openSheet(`<h2>還原備份</h2>
    <textarea id="import-text" rows="8" placeholder="貼上備份 JSON 文字"></textarea>
    <input type="file" id="import-file" accept="application/json" style="display:none">
    <div class="row">
      <button class="btn" data-act="pick-file">選擇檔案</button>
      <button class="btn primary" data-act="import">還原</button>
    </div>`);
}
function openManual() {
  openSheet(`<h2>設定手動報價</h2>
    <div class="formgrid">
      <label>標的 key（如 台股:2330）<input id="m-key" placeholder="台股:2330"></label>
      <label>價格<input id="m-price" type="number" step="0.01"></label>
    </div>
    <button class="btn primary" data-act="save-manual">儲存</button>`);
}

/* ---------------- 動作註冊 ---------------- */
registerAction("ai-open", () => openAI());
registerAction("ai-send", async (el) => {
  const inp = $("#ai-input"), box = $("#ai-box");
  if (!inp || !box) return;
  const text = inp.value.trim();
  if (!text) return;
  inp.value = "";
  box.insertAdjacentHTML("beforeend", `<div class="msg user">${esc(text)}</div>`);
  const reply = await aiReply(text);
  box.insertAdjacentHTML("beforeend", `<div class="msg sys">${reply}</div>`);
  box.scrollTop = box.scrollHeight;
});
registerAction("open-notices", () => openNotices());
registerAction("notices-read", () => {
  (S.set.notifications || []).forEach((n) => (n.read = true));
  save(); closeSheet(); toast("已全部標為已讀");
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
});
registerAction("toggle-alert", (el) => {
  const a = (S.set.alerts || []).find((x) => x.id === el.dataset.id);
  if (!a) return;
  a.active = !a.active; save(); toast(a.active ? "警報已開啟" : "警報已關閉");
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
});
registerAction("del-alert", (el) => {
  if (!confirm("確定要刪除這個警報？")) return;
  S.set.alerts = (S.set.alerts || []).filter((x) => x.id !== el.dataset.id);
  save(); toast("已刪除警報");
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
});
registerAction("new-alert", () => openNewAlert());
registerAction("submit-alert", () => {
  const key = $("#na-key").value, kind = $("#na-kind").value;
  const th = parseFloat($("#na-th").value);
  if (!key || !kind || !isFinite(th)) { toast("請填寫完整"); return; }
  S.set.alerts = S.set.alerts || [];
  S.set.alerts.push({ id: uid(), key, kind, threshold: th, active: true, lastFired: 0 });
  save(); closeSheet(); toast("已新增警報");
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
});
registerAction("risk-quiz", () => openRiskQuiz());
registerAction("submit-risk", () => {
  const q = {};
  for (let i = 0; i < RISK_Q.length; i++) {
    const v = document.querySelector(`input[name="rq${i}"]:checked`);
    if (v) q[i] = parseInt(v.value, 10);
  }
  if (Object.keys(q).length < 5) { toast("請回答全部 5 題"); return; }
  S.set.risk = S.set.risk || {};
  S.set.risk.q = q;
  save(); closeSheet(); toast("已儲存投資屬性");
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
});
registerAction("edit-entries", () => openEntries());
registerAction("save-entries", () => {
  const hidden = [];
  document.querySelectorAll("[data-entr]").forEach((c) => { if (!c.checked) hidden.push(c.dataset.entr); });
  S.set.entries = S.set.entries || { order: ["radar", "inst", "daytrade", "scan", "tools", "watchlist", "index", "custom", "cloud"], hidden: [] };
  S.set.entries.hidden = hidden;
  save(); closeSheet(); toast("已儲存首頁入口設定");
  location.hash = "#/home";
});
/* 漲跌配色切換：tw=紅漲綠跌、us=綠漲紅跌 */
function setUpDown(mode) {
  S.set.updown = mode;
  save();
  document.documentElement.setAttribute("data-updown", mode === "us" ? "us" : "tw");
  toast(mode === "us" ? "已切換為綠漲紅跌（美股慣例）" : "已切換為紅漲綠跌（台股慣例）");
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
}
registerAction("updown-tw", () => setUpDown("tw"));
registerAction("updown-us", () => setUpDown("us"));
registerAction("fx-save", () => {
  const v = parseFloat($("#fx-in").value);
  if (!isFinite(v) || v <= 0) { toast("請輸入有效匯率"); return; }
  S.set.fxManual = v; save(); toast("已設定手動匯率");
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
});
registerAction("fx-auto", () => {
  S.set.fxManual = null; save(); toast("已改回自動匯率");
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
});
registerAction("export", () => {
  const blob = new Blob([JSON.stringify(backupObj(), null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "gosu-invest-backup-" + today() + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url); toast("已匯出備份檔");
});
registerAction("copy", () => copyText(JSON.stringify(backupObj(), null, 1), "備份文字已複製"));
registerAction("import", () => {
  const t = $("#import-text");
  if (!t || !t.value.trim()) { toast("請貼上備份文字或選擇檔案"); return; }
  let obj;
  try { obj = JSON.parse(t.value); } catch { toast("JSON 格式錯誤"); return; }
  try {
    const { data, settings } = sanitizeBackup(obj);
    if (!confirm("還原將覆蓋目前所有資料，確定？")) return;
    S.data = data;
    S.set = Object.assign(defaultSet(), settings, { cloud: settings.cloud || S.set.cloud });
    save(); closeSheet(); toast("還原完成");
    window.dispatchEvent(new CustomEvent("portfolios:changed"));
  } catch (e) { toast((e && e.message) || "還原失敗"); }
});
registerAction("pick-file", () => {
  const f = $("#import-file");
  if (!f) return;
  f.onchange = () => {
    const file = f.files && f.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { const t = $("#import-text"); if (t) t.value = reader.result; };
    reader.readAsText(file);
  };
  f.click();
});
registerAction("wipe", () => {
  if (!confirm("確定要清除所有資料？這個動作無法復原。")) return;
  if (!confirm("再次確認：真的要刪除所有持股、交易、警報與設定嗎？")) return;
  S.data = { portfolios: [], assets: [], trades: [] };
  S.set = Object.assign(defaultSet(), { cloud: S.set.cloud });
  save(); toast("已清除所有資料");
  location.hash = "#/home";
});
registerAction("demo", () => {
  const pid = uid();
  S.data.portfolios.push({ id: pid, name: "範例組合（假資料）" });
  const samples = [
    { market: "台股", symbol: "2330", name: "台積電", qty: 1000, price: 950, fee: 20 },
    { market: "台股", symbol: "0050", name: "元大台灣50", qty: 2000, price: 190, fee: 20 },
    { market: "美股", symbol: "NVDA", name: "輝達", qty: 10, price: 130, fee: 1 },
  ];
  for (const s of samples) {
    const aid = uid();
    S.data.assets.push({ id: aid, portfolioId: pid, market: s.market, symbol: s.symbol, name: s.name });
    S.data.trades.push({ id: uid(), assetId: aid, type: "buy", date: today(), qty: s.qty, price: s.price, fee: s.fee });
  }
  save(); toast("已載入範例資料（假資料）");
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
});
registerAction("manual-open", () => openManual());
registerAction("save-manual", () => {
  const k = $("#m-key").value.trim();
  const p = parseFloat($("#m-price").value);
  if (!k || !isFinite(p)) { toast("請輸入標的 key 與價格"); return; }
  S.set.manual = S.set.manual || {};
  S.set.manual[k] = { price: p, time: Date.now() };
  save(); closeSheet(); toast("已設定手動報價");
  window.dispatchEvent(new CustomEvent("portfolios:refresh-quotes"));
});

/* ---------------- 主視圖 ---------------- */
export function viewProfile() {
  const st = assetStats();
  const alerts = S.set.alerts || [];
  const unread = (S.set.notifications || []).filter((n) => !n.read).length;
  const score = riskScore();
  const rType = riskType(score);
  const fxManual = S.set.fxManual;
  const status = S.status || {};
  const manualKeys = Object.keys(S.set.manual || {});
  const cloudUser = S.set.cloud?.user;
  const updown = S.set.updown === "us" ? "us" : "tw";

  const alertRows = alerts.length ? alerts.map((a) => {
    const nm = nameByKey(a.key);
    const kind = ALERT_KINDS[String(a.kind).replace(/_/g, "-")] || a.kind;
    return `
      <div class="item row">
        <div style="flex:1">
          <div class="h2">${esc(nm)}</div>
          <div class="muted small">${esc(kind)} ${fmt(num(a.threshold), 2)}</div>
        </div>
        <button class="btn sm" data-act="toggle-alert" data-id="${esc(a.id)}">${a.active ? "關閉" : "開啟"}</button>
        <button class="btn sm danger" data-act="del-alert" data-id="${esc(a.id)}">刪除</button>
      </div>`;
  }).join("") : '<div class="empty card">尚未設定警報。點「＋ 新增警報」開始。</div>';

  const riskBlock = (score == null) ? `
      <div class="card">
        <div class="h2">投資屬性測驗</div>
        <p class="muted small">回答 5 題，協助你檢視自己的風險屬性與策略方向。</p>
        <button class="btn primary" data-act="risk-quiz">開始測驗</button>
      </div>`
    : `
      <div class="card">
        <div class="h2">你的風險屬性：<span class="tag ${rType === "保守" ? "mid" : rType === "積極" ? "bull" : "bear"}">${esc(rType)}</span></div>
        <div class="muted small">評分 ${fmt(num(score), 0)} / 100</div>
        <p>${esc(RISK_STRATEGY[rType] || "")}</p>
        <button class="btn" data-act="risk-quiz">重新測驗</button>
      </div>`;

  const manualRows = manualKeys.length ? manualKeys.map((k) => `
      <div class="item row">
        <div style="flex:1"><div>${esc(nameByKey(k))}</div><div class="muted small">${esc(k)} = ${fmt(num(S.set.manual[k].price), 2)}</div></div>
        <button class="btn sm danger" data-act="clear-manual" data-key="${esc(k)}">移除</button>
      </div>`).join("") : '<div class="empty small muted">目前無手動報價覆蓋。</div>';

  return `
  <h1>個人中心</h1>

  <div class="card">
    <div class="h2">資產摘要</div>
    <div class="grid g3">
      <div class="stat">
        <div class="muted small">庫存市值</div>
        <div class="num h2">${money("TWD", st.mv, 0)}</div>
      </div>
      <div class="stat">
        <div class="muted small">資產總額（市值＋已實現）</div>
        <div class="num h2">${money("TWD", st.total, 0)}</div>
        <div class="muted small">已實現 ${money("TWD", st.realized, 0)}</div>
      </div>
      <div class="stat">
        <div class="muted small">報酬率</div>
        <div class="num h2 ${tone(st.ret)}">${pct(st.ret)}</div>
      </div>
    </div>
    <div class="muted small">計算方式：庫存市值＝所有持股現值換算新台幣加總；資產總額＝庫存市值＋已實現損益；報酬率＝（未實現＋已實現）／成本。</div>
  </div>

  <div class="grid g2">
    <div class="card" data-act="ai-open" style="cursor:pointer"><div class="h2">AI 對話</div><div class="muted small">分析個股、查報價、看資產</div></div>
    <div class="card" data-act="open-notices" style="cursor:pointer"><div class="h2">通知中心 ${unread ? `<span class="badge live">${unread}</span>` : ""}</div><div class="muted small">警報觸發紀錄</div></div>
    <a class="card" href="#/cloud" style="text-decoration:none;color:inherit"><div class="h2">雲端同步 ${cloudUser ? `<span class="badge live">已登入</span>` : ""}</div><div class="muted small">Google／Yahoo 登入，換機可見</div></a>
    <a class="card" href="#/home" style="text-decoration:none;color:inherit"><div class="h2">自選股</div><div class="muted small">管理我的關注標的</div></a>
    <a class="card" href="#/portfolio" style="text-decoration:none;color:inherit"><div class="h2">投資組合</div><div class="muted small">持股與損益明細</div></a>
  </div>

  <div class="card">
    <div class="row">
      <div class="h2" style="flex:1">提醒管理（我的警報）</div>
      <button class="btn primary" data-act="new-alert">＋ 新增警報</button>
    </div>
    ${alertRows}
    <div class="muted small">每次行情更新自動檢查：price-above / price-below 用現價；day-above / day-below 用當日漲跌幅。觸發後進入通知中心。</div>
  </div>

  ${riskBlock}

  <div class="card">
    <div class="h2">個人設定</div>
    <div class="row" style="align-items:center">
      <div style="flex:1">
        <div>美元匯率</div>
        <div class="muted small">目前：${fmt(fxRate(), 2)}（${esc(fxSource() || "自動")}）${fxManual ? `｜手動 ${fmt(fxManual, 2)}` : ""}</div>
      </div>
      <input id="fx-in" type="number" step="0.0001" placeholder="手動匯率" style="width:120px">
      <button class="btn sm" data-act="fx-save">設定</button>
      <button class="btn sm" data-act="fx-auto">自動</button>
    </div>

    <div class="h2" style="margin-top:16px">漲跌配色</div>
    <div class="row" style="justify-content:flex-start;flex-wrap:wrap;gap:8px">
      <button class="btn sm ${updown === "tw" ? "primary" : ""}" data-act="updown-tw">紅漲綠跌（台股）</button>
      <button class="btn sm ${updown === "us" ? "primary" : ""}" data-act="updown-us">綠漲紅跌（美股）</button>
    </div>
    <div class="muted small" style="margin-top:6px">目前：${updown === "us" ? "綠漲紅跌" : "紅漲綠跌"}，套用到全站報價、熱力圖與走勢圖。</div>

    <div class="h2" style="margin-top:16px">備份與還原</div>
    <div class="row" style="justify-content:flex-start;flex-wrap:wrap">
      <button class="btn" data-act="export">匯出備份檔</button>
      <button class="btn" data-act="copy">複製備份文字</button>
      <button class="btn" data-act="import">貼上 / 還原</button>
    </div>

    <div class="h2" style="margin-top:16px">資料狀態</div>
    <div class="muted small">
      投資組合 ${(S.data.portfolios || []).length} 個｜持股 ${(S.data.assets || []).length} 筆｜交易 ${(S.data.trades || []).length} 筆<br>
      行情：幣安 ${esc(status.binance || "—")}｜台股檔案 ${esc(status.file || "—")}${status.fileUpdated ? `｜更新於 ${esc(ageText(status.fileUpdated))}` : ""}
    </div>

    <div class="h2" style="margin-top:16px">手動報價覆蓋</div>
    ${manualRows}
    <button class="btn sm" data-act="manual-open">＋ 設定手動報價</button>

    <div class="h2" style="margin-top:16px">範例資料</div>
    <p class="muted small">載入 3 筆假資料到「範例組合」，方便快速體驗功能。</p>
    <button class="btn" data-act="demo">載入範例資料</button>

    <div class="h2" style="margin-top:16px">自訂首頁入口</div>
    <button class="btn" data-act="edit-entries">編輯首頁顯示</button>

    <div class="h2 warn" style="margin-top:16px">危險區</div>
    <button class="btn danger" data-act="wipe">清除所有資料</button>
  </div>

  <p class="muted small" style="text-align:center;margin-top:24px">資料僅供個人記錄與參考，報價可能延遲或有誤，不構成投資建議。</p>
  `;
}

export function afterProfile() {
  try {
    const r = parseRoute();
    if (r && r.params && r.params.f === "entries") setTimeout(openEntries, 120);
  } catch {}
}
